/* ============================================================
 * album.js —— 05/06 册详情 · 六段叙事（接 GET /api/albums/:slug）
 * 一次给全：册 + 六段 + 每段照片。布局按张数与方向自动选型：
 *   前四段（晨袍/出门/仪式/敬酒）走 shot 体系：1 full(off) · 2 duo · ≥3 full+duo
 *   face / headdress 走 mg 体系：1 moon · 2–4 行填充拼版（mrow，满行优先/尾行留白）· ≥5 横滑
 * 主题由 album.style 决定（视图返回 ViewOverride 切根 class）。
 * ============================================================ */
// @ts-check

import { getAlbum, getAlbumsByStyle } from '../api.js';
import { ICON_EYE, ICON_HEART } from '../components/icons.js';
import { registerGroup } from '../components/viewer.js';
import { isLiked, likeAlbum, trackView } from '../components/interact.js';

/** @typedef {import('../api.js').Album} Album */
/** @typedef {import('../api.js').AlbumSection} AlbumSection */
/** @typedef {import('../api.js').Photo} Photo */

/* ============================================================
 * 序号字：罗马（西式）/ 汉字（新中式）
 * ------------------------------------------------------------
 * 2026-10-03 用户拍板：「最终展示是根据用户实际配置多少段落展示序号」
 * ⇒ 不再是写死 6 项的常量数组，改为**按 n 实时换算**：
 * 配 6 段出 Ⅰ–Ⅵ，配 7 段出 Ⅰ–Ⅶ，配 12 段出 Ⅰ–Ⅻ —— 永不空白、永不重号。
 * 汉字同理（壹…拾、拾壹…）。
 * ============================================================ */

/** 罗马数字个位表（1–9）。十位走 ROMAN_TEN2，不进此表。 */
const ROMAN_ONES = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ'];
/** 罗马十位基数：0→空 1→Ⅹ 2→ⅩⅩ 3→Ⅽ 4→ⅭⅩ（≥40 走阿拉伯数字兜底，用不到 Ⅼ） */
const ROMAN_TEN2 = ['', 'Ⅹ', 'ⅩⅩ', 'Ⅽ', 'ⅭⅩ'];

/** 汉字数字个位 / 十位表（1–9 / 10–90） */
const HAN_ONES = ['', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const HAN_TENS = ['', '拾', '贰拾', '叁拾', '肆拾', '伍拾', '陆拾', '柒拾', '捌拾', '玖拾'];

/**
 * 罗马数字序号（西式）。n 从 1 起。
 * 1–39 按「十位 + 个位」逐位拼（标准写法，非查表）；40+ 或非法值回落阿拉伯数字，
 * **绝不返回空串**（空串会让章节头缺序号，比阿拉伯数字难看得多）。
 * @param {number} n
 * @returns {string}
 */
function romanNum(n) {
  if (!Number.isFinite(n) || n < 1) return '';
  const i = Math.floor(n);
  if (i >= 40) return String(i);
  const tens = Math.floor(i / 10);
  const ones = i % 10;
  /* 30–39 用标准减法记法：Ⅽ 直接 + 个位（ⅭⅢ=33、ⅭⅤ=35、ⅭⅧ=38）。
     **任何情况下都不额外补 Ⅴ** —— 个位 5/6 本身已含 Ⅴ，补了会重复（ⅭⅤⅤ）。 */
  return ROMAN_TEN2[tens] + ROMAN_ONES[ones];
}

/**
 * 汉字数字序号（新中式）。n 从 1 起。1–99 走字表，超出回落阿拉伯数字。
 * 十位字「拾」在 10–19 也要带（拾 / 拾壹 / 拾贰…），
 * 只有「壹拾」这种读法不出现 —— 不会出现，因为十位表第 1 项就是「拾」而不是「壹拾」。
 * @param {number} n
 * @returns {string}
 */
function hanNum(n) {
  if (!Number.isFinite(n) || n < 1) return '';
  const i = Math.floor(n);
  if (i < HAN_ONES.length) return HAN_ONES[i];
  if (i < 100) {
    const t = Math.floor(i / 10);
    const o = i % 10;
    return (t >= 1 ? HAN_TENS[t] : '') + HAN_ONES[o];
  }
  return String(i);
}

/**
 * 补零两位（照片角标「造型 01」）。≥100 原样输出，不做无意义补零。
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  const i = Number.isFinite(n) ? Math.floor(n) : 0;
  return i < 10 ? `0${i}` : String(i);
}

/**
 * 段落短名（玻璃角标 / 拼版 alt / 章节头锚点小签统一用名）。
 * 2026-10-03 起不再硬编码 SHORT 常量 —— 读后端下发的 kindNameCn（section_kind 配置表，
 * 后台「段落类型」页可改名）。回落链：kindNameCn → titleCn → 空串。
 * @param {AlbumSection} sec
 * @returns {string}
 */
function kindName(sec) {
  return sec.kindNameCn || sec.titleCn || '';
}

/** 风格中文名（尾部「下一册」展示用） */
const STYLE_CN = { western: '西式婚礼', chinese: '新中式婚礼', engagement: '订婚宴跟妆', maternity: '孕妈照', family: '亲子照' };
/** 风格 → 根主题（V7：更多时刻三系列走中性 ms，无专属氛围皮肤） */
const THEME_BY_STYLE = /** @type {Record<string, 'ms'|'twe'|'tcn'>} */ ({
  western: 'twe', chinese: 'tcn', engagement: 'ms', maternity: 'ms', family: 'ms',
});
/**
 * 尾部「下一册」展示名：西式按拍板口径显示「西式婚礼 NO.N」（编号取自 titleEn 的 No.N），
 * 其余风格维持中文册名原样。
 * @param {Album} next
 * @param {Album} cur
 */
function nextLabel(next, cur) {
  if (!next) return '';
  if (cur.style === 'western') {
    const m = /No\.(\d+)/i.exec(next.titleEn || '');
    if (m) return `${STYLE_CN.western} NO.${m[1]}`;
  }
  return next.titleCn;
}

/**
 * 照片的固有 width/height 属性（解码前占位，见 figImg 注释）。
 * 缺 w/h 的历史数据退化为空串，不写脏属性。
 * @param {Photo} p
 */
const whAttr = (p) => (!p || typeof p === 'string' || !p.w || !p.h
  ? '' : ` width="${p.w}" height="${p.h}"`);

/**
 * 拱门揭示的图片包裹（2026-10-03 动效 A 方案）：
 * 外层 .rv-fig 承担 clip-path 揭开（1s），内层 img 承担 scale 1.06→1 回落（1.4s）。
 * 两层分时不同 → 图片「先揭开、再落定」，比整体淡入有质感。
 * wide=true 的横图跳过裁剪（横图本身是开面构图，裁剪像没做完）。
 *
 * ⚠ width/height 属性不是冗余（2026-10-03 修「动画不跟滚动」）：
 *   .wfall figure 无 aspect-ratio，高度全靠 img 固有尺寸。loading=lazy 的图
 *   在 bindReveals 执行时尚未解码 → 整页塌成一屏 → 12 张全落进视口 → IO 一次性
 *   全亮，等图加载完页面长到 3.5 倍高，动画早已播完。写上固有宽高，
 *   浏览器解码前就按比例占位，布局在 bindReveals 时已稳定。
 * @param {Photo|string} p 照片对象（带 w/h）或纯 src
 * @param {string} [alt]
 * @param {boolean} [wide]
 */
const figImg = (p, alt = '', wide = false) => {
  const src = typeof p === 'string' ? p : p.cosKey;
  return `<span class="rv-fig${wide ? ' wide' : ''}"><img src="${src}" alt="${alt}"${whAttr(p)} loading="lazy" decoding="async" /></span>`;
};

/**
 * 标题逐字化（2026-10-03）：把文本切成 .ln>span 序列，配合 quality.css
 * 的 overflow:hidden 遮罩实现「逐字升起」。
 * 每个字写 --i（序号），CSS 用 calc(var(--d) + var(--i) * 40ms) 算 delay ——
 * 变量继承拿到容器的 --d，逐字只额外加序号偏移，不在 JS 里算总时长。
 * 用 calc() 是安全的：X5 禁的是 keyframes 内 calc，transition-delay 不受影响。
 * @param {string} text
 */
const lineChars = (text) =>
  `<span class="ln">${Array.from(text).map((c, i) =>
    `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</span>`;

/** 计数缩写（≥1w 显示 x.xw） */
const numFmt = (/** @type {number} */ n) => (n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n));

/**
 * 文末互动区（方案一拍板 2026-10-03：素字互动行；同日修订：转发退役，
 * 单行排布 —— 浏览居左、点赞居右，与 ab-foot 同语言；Dock 为全站唯一 Bar）。
 * #hb-views 供 trackViewAndPaint 回写；.op .n 供点赞计数回写。
 * sectioned 与 flat 册共用。
 */
const actrowHtml = (/** @type {Album} */ a) => `
  <div class="actrow reveal" role="toolbar" aria-label="互动">
    <span class="vrow">
      ${ICON_EYE}<b id="hb-views">${numFmt(a.stats.views)}</b><span>次浏览</span>
    </span>
    <button class="op like ${isLiked(a.slug) ? 'on' : ''}" type="button" data-op="like">
      ${ICON_HEART}<span>点赞</span><b class="n">${numFmt(a.stats.likes)}</b>
    </button>
  </div>`;

/**
 * 绑定互动行为（口径 2026-10-02：点赞不可逆累加，重复点击继续 +1；
 * 计数一律以服务端响应的最新两计数为准，回写互动行展示位；转发已退役）。
 * @param {HTMLElement} el
 * @param {Album} a
 */
function bindInteract(el, a) {
  const likeBtn = /** @type {HTMLElement | null} */ (el.querySelector('.actrow .op.like'));

  likeBtn?.addEventListener('click', async () => {
    const st = await likeAlbum(a.slug);
    if (!st) return; // 上报失败：计数与点亮态都不动
    likeBtn.classList.add('on');
    likeBtn.classList.remove('pop');
    void likeBtn.offsetWidth; // 重排后重播微弹
    likeBtn.classList.add('pop');
    // 稿屏4：「+1」上浮气泡（每次点赞成功都弹，播完自摘）
    const pop = document.createElement('span');
    pop.className = 'plusone';
    pop.textContent = '+1';
    likeBtn.appendChild(pop);
    pop.addEventListener('animationend', () => pop.remove());
    // KPI 同步：服务端权威计数回写互动行
    const n = likeBtn.querySelector('.n');
    if (n) n.textContent = String(st.likes);
  });
}

/** 浏览上报（session 去重），回写互动卡浏览段（#hb-views） */
function trackViewAndPaint(el, slug) {
  void trackView(slug).then((st) => {
    if (st) {
      const hb = /** @type {HTMLElement | null} */ (el.querySelector('#hb-views'));
      if (hb) hb.textContent = numFmt(st.views);
    }
  });
}

/** 带查看器属性的图（点击进暗房）—— 走拱门揭示包裹。
 *  wide：跳过 clip-path 裁剪。duo 并排小图必须 wide ——
 *  它的圆角 + 投影按 views.css 挂在包裹层上，clip-path 会把自身 box-shadow 一起裁掉。 */
const vimg = (p, gid, i, alt = '', wide = true) =>
  `<span class="rv-fig${wide ? ' wide' : ''}" data-vgroup="${gid}" data-vi="${i}"><img src="${p.cosKey}" alt="${alt}"${whAttr(p)} loading="lazy" decoding="async" /></span>`;

/* ---------- 前四段：shot 体系 ---------- */
/**
 * @param {Photo[]} photos
 * @param {AlbumSection} sec 整段（取 kind 判版式、取 kindNameCn 角标）
 * @param {string} gid 查看器照片组 id
 */
function shotFlow(photos, sec, gid) {
  const kind = sec.kind;
  const nm = kindName(sec);
  const cap = (p) =>
    `<span class="glass cap">造型 ${pad2(p.sort)} · ${nm}</span>`;
  /* 空段兜底：后台新建的段还没挂照片时直接取 photos[0] 会抛
     "Cannot read properties of undefined (reading 'captionCn')"，
     整页 render 失败退回首页 —— 一段没配图不该让整册打不开。 */
  if (!photos.length) return '';
  if (photos.length === 1) {
    // v6 05/06 屏：敬酒段单张走 off（66% 右偏位），晨袍/仪式/出门单张走 full
    const shape = kind === 'toast' ? 'off' : 'full';
    return `<div class="shot ${shape} reveal" data-vgroup="${gid}" data-vi="0">${figImg(photos[0], photos[0].captionCn || '')}${cap(photos[0])}</div>`;
  }
  if (photos.length === 2) {
    return `<div class="shot duo reveal">${photos.map((p, i) => vimg(p, gid, i)).join('')}</div>`;
  }
  // ≥3：首图 full，其余两两 duo
  const rest = photos.slice(1);
  const pairs = [];
  for (let i = 0; i < rest.length; i += 2) {
    pairs.push(`<div class="shot duo reveal">${rest.slice(i, i + 2).map((p, j) => vimg(p, gid, i + 1 + j)).join('')}</div>`);
  }
  return `<div class="shot full reveal" data-vgroup="${gid}" data-vi="0">${figImg(photos[0], photos[0].captionCn || '')}${cap(photos[0])}</div>${pairs.join('')}`;
}

/* ---------- face / headdress：mg 体系（1–N 张） ---------- */
/**
 * 行填充拼版（瀑布式，用户拍板口径）：
 *   竖图两两一行、横图独占一行；不满的行只允许出现在末尾（尾行可留白），
 *   前面的行必须塞满。竖图凑对**跨横图积累**（[竖,横,竖] → 横行 + 双竖满行，
 *   而非三行各半留白）。行序 = 结算时机（横图行天然在前，对齐 v6 mix 口径）。
 * 查看器 data-vi 按照片原索引标注，DOM 重排不影响暗房开图定位。
 * @param {Photo[]} photos
 * @param {AlbumSection} sec
 * @param {string} gid
 */
function multiGrid(photos, sec, gid) {
  const kind = sec.kind;
  const nm = kindName(sec);
  const n = photos.length;
  const fig = (/** @type {Photo} */ p, /** @type {number} */ i) =>
    `<figure class="reveal" data-vgroup="${gid}" data-vi="${i}">${figImg(p, nm || '细节', p.orientation === 'landscape')}</figure>`;

  /* 空段兜底：同shotFlow —— 没有照片就只出章节头，不产出空壳容器 */
  if (n === 0) return '';
  if (n === 1) {
    // v6 05/06 屏：face 单张 = 月牙形特写（twe 正圆 / tcn 月牙），dtag 标「特写 / 头饰」
    return `<div class="shot moon reveal" data-vgroup="${gid}" data-vi="0">${figImg(photos[0], nm || '特写')}<span class="glass dtag">${nm || '特写'}</span></div>`;
  }
  // ≥5 张：横滑（v6 拍板口径，不参与拼版）；2–4 张：行填充拼版
  if (n >= 5) return stripFlow(photos, sec, gid);

  /** @type {{t:'two'|'land', tail?:boolean, items:{p:Photo, i:number}[]}[]} */
  const rows = [];
  /** @type {{p:Photo, i:number}[]} */
  let pair = [];
  photos.forEach((p, i) => {
    if (p.orientation === 'landscape') {
      rows.push({ t: 'land', items: [{ p, i }] });
    } else {
      pair.push({ p, i });
      if (pair.length === 2) { rows.push({ t: 'two', items: pair }); pair = []; }
    }
  });
  if (pair.length) rows.push({ t: 'two', tail: true, items: pair });

  const html = rows.map((r) =>
    `<div class="mrow ${r.t}${r.tail ? ' tail' : ''}">${r.items.map((x) => fig(x.p, x.i)).join('')}</div>`).join('');
  return `<div class="mg">${html}</div>`;
}

/** ≥5 张：横滑（scroll-snap），尾格「共 N 张」（v6 拍板口径，不参与拼版） */
function stripFlow(photos, sec, gid) {
  const nm = kindName(sec);
  const figs = photos.map((p, i) =>
    `<figure class="reveal" data-vgroup="${gid}" data-vi="${i}">${figImg(p, nm || '细节', p.orientation === 'landscape')}</figure>`).join('');
  return `
    <div class="mstrip">${figs}<span class="morecap">滑动查看<br/>共 ${photos.length} 张</span></div>
    <div class="mhint"><span class="d">${photos.slice(0, 5).map((_, i) =>
      `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</span>
      <span class="n">1 / ${photos.length} · 左右滑动</span></div>`;
}

/**
 * @param {AlbumSection} sec
 * @param {'western'|'chinese'} style
 * @param {string} gid
 * @param {number} pos 该段在册内的位置（0 起，由调用方 map 的下标给出）
 */
function renderSection(sec, style, gid, pos) {
  const isMulti = sec.kind === 'face' || sec.kind === 'headdress';
  /* 序号以**位置**为准（权威），sort 仅在位置缺失时兜底 ——
     这样即使某册sort 残缺/错位，也不会出现两个「Ⅰ」。
     1 起算后交给 romanNum / hanNum 按实际段数实时换算（配 7 段就有Ⅶ）。 */
  const n = (Number.isFinite(pos) ? pos : Math.max(0, (sec.sort || 1) - 1)) + 1;
  const num = style === 'western' ? romanNum(n) : hanNum(n);
  const media = isMulti ? multiGrid(sec.photos, sec, gid) : shotFlow(sec.photos, sec, gid);

  // v6 第 11 屏：走 mg 体系（多张）的段落头升级为「章节落款」形态 ——
  // 大序号 + 段名 + 英文 + 右端竖排三字印（全站唯一繁体「予時妍」落款，
  // 放在章节开头而非结尾，避免与「下一册」分页器打架）。
  // 单张 moon 段保留普通章节头（对齐 v6 05/06 屏）。
  // 2026-10-03：序号与中文段名改逐字上浮（.ln），英文副行走整体快起 —— 快慢两层错位。
  const headHtml = isMulti && sec.photos.length >= 2 ? `
    <div class="secmark">
      <span class="l">
        <span class="no">${lineChars(num)}</span>
        <span class="tx">
          <span class="t">${lineChars(sec.titleCn)}</span>
          <span class="en">${sec.titleEn} · ${sec.photos.length} photos</span>
        </span>
      </span>
      <span class="sealv" aria-hidden="true">予<br/>時<br/>妍</span>
    </div>`
    : `
    <div class="crow"><span class="cnum">${lineChars(num)}</span><span class="bar"></span><span class="en">${sec.titleEn}</span></div>
    <div class="cd">${lineChars(sec.titleCn)}</div>`;

  return `
    <section class="chapter reveal" id="sec-${sec.kind}">
      ${headHtml}
      ${sec.descCn ? `<div class="desc reveal t-tight">${sec.descCn}</div>` : ''}
      ${media}
    </section>`;
}

/**
 * 横滑条指示器联动：滚动时点亮对应圆点 + 更新「k / N」计数。
 * 判位方式：取「左缘最接近当前 scrollLeft」的 figure（与 scroll-snap: start 对齐），
 * rAF 节流避免 iOS 上 scroll 事件高频触发。
 * @param {HTMLElement} root 视图根元素（本视图内可能有多条 mstrip：face / headdress 各一）
 */
function bindStrips(root) {
  root.querySelectorAll('.mstrip').forEach((strip) => {
    const hint = /** @type {HTMLElement | null} */ (strip.nextElementSibling);
    if (!hint || !hint.classList.contains('mhint')) return;
    const dots = Array.from(hint.querySelectorAll('.d i'));
    const num = hint.querySelector('.n');
    const figs = Array.from(strip.querySelectorAll('figure'));
    const total = figs.length;
    if (!dots.length || !total) return;

    let raf = 0;
    const paint = () => {
      raf = 0;
      const base = strip.getBoundingClientRect().left;
      let best = 0;
      let bd = Infinity;
      // rect.left 已是视口相对坐标（含滚动量），与 strip 左缘的差即该图距对齐位的偏移；
      // 取偏移最小者 = scroll-snap 对齐中的当前张。不可再减 scrollLeft（会双重扣减、恒偏一档）
      figs.forEach((c, i) => {
        const d = Math.abs(c.getBoundingClientRect().left - base);
        if (d < bd) { bd = d; best = i; }
      });
      dots.forEach((dot, i) => dot.classList.toggle('on', i === Math.min(best, dots.length - 1)));
      if (num) num.textContent = `${Math.min(best + 1, total)} / ${total} · 左右滑动`;
    };
    strip.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  });
}

/**
 * 瀑布流 HTML（2026-10-03 重做：CSS columns → JS 贪心双列）
 * 旧实现 columns:2 + column-span:all 会在横图处打断列流，造成中部大段留白；
 * 新实现：竖图按「估算高度放入较矮列」贪心分配（两列始终齐头并进），
 * 横图独立成全宽行（不再切断竖图流）。除末列尾差外无留白。
 * data-vi 恒等于 photos 原始下标 —— 查看器分组序号不受布局影响。
 * @param {import('../api.js').Album['sections'][0]['photos']} photos
 * @param {string} vgroup 查看器分组名
 * @returns {string}
 */
function wfallHtml(photos, vgroup) {
  const fig = (p, idx) => `
    <figure class="reveal ${p.orientation === 'landscape' ? 'land' : ''}"
            data-vgroup="${vgroup}" data-vi="${idx}">
      ${figImg(p, '', p.orientation === 'landscape')}
      ${p.captionCn ? `<span class="cap">${p.captionCn}</span>` : ''}
    </figure>`;

  /** @type {string[][]} */
  const cols = [[], []];
  const colH = [0, 0];
  /** @type {string[]} */
  const blocks = [];
  const flush = () => {
    if (!cols[0].length && !cols[1].length) return;
    blocks.push(`<div class="wfall"><div class="col">${cols[0].join('')}</div><div class="col">${cols[1].join('')}</div></div>`);
    cols[0] = []; cols[1] = []; colH[0] = 0; colH[1] = 0;
  };

  photos.forEach((p, idx) => {
    if (p.orientation === 'landscape') {
      flush(); // 横图独立全宽行：先结清双列，再落横图
      blocks.push(`<div class="wland">${fig(p, idx)}</div>`);
    } else {
      const i = colH[0] <= colH[1] ? 0 : 1; // 贪心：放较矮列
      cols[i].push(fig(p, idx));
      colH[i] += 1.4; // 竖图估算高（2:3 / 3:4 混排均值，按列宽归一）
    }
  });
  flush();
  return blocks.join('');
}

/**
 * flat 册：瀑布流详情（design-v7 屏3/4）——
 * 矮 hero → 2 列错落图墙（横图全宽行）→ 文末互动卡（浏览/点赞/分享三段）→ 下一册。
 * 照片来自唯一 flat 段（迁移 005 口径），查看器整册注册为一组。
 * @param {HTMLElement} el
 * @param {Album} a
 * @param {AlbumCard[]} siblings 同系列册卡（下一册用）
 */
function renderFlat(el, a, siblings) {
  const photos = a.sections.flatMap((s) => s.photos);
  const i = siblings.findIndex((x) => x.slug === a.slug);
  const next = i >= 0 && i + 1 < siblings.length ? siblings[i + 1] : null;

  registerGroup('flat', photos, a.titleCn);
  trackViewAndPaint(el, a.slug);

  el.innerHTML = `
    <div class="ab-hero short">
      <img src="${a.coverKey}" alt="${a.titleCn}" />
      <div class="fade"></div>
      <div class="t">
        <div class="cd">${a.titleCn}</div>
        <div class="en">${a.titleEn} · 共 ${photos.length} 张</div>
      </div>
    </div>

    ${wfallHtml(photos, 'flat')}

    ${actrowHtml(a)}

    ${next ? `
    <a class="ab-foot reveal" href="/album/${next.slug}">
      <span><span class="cd">下一册 · ${next.titleCn}</span><br/>
        <span class="en">${next.titleEn}</span></span>
      <span class="arw">→</span>
    </a>` : ''}
  `;

  bindInteract(el, a);

  return { theme: THEME_BY_STYLE[a.style] || 'ms', title: `${a.titleCn} · 予时妍 YUÉ ATELIER` };
}

/**
 * @param {HTMLElement} el
 * @param {Record<string, string>} params
 */
export async function album(el, params) {
  el.innerHTML = `<div class="stub"><span class="no">…</span></div>`;
  /** @type {Album | null} */
  const a = await getAlbum(params.slug || '').catch(() => null);
  if (!a) {
    /* 404 = slug 无效或所属系列在后台被禁用（enabled=0），统一口径 */
    el.innerHTML = `<div class="stub"><span class="no">404</span><h1>内容暂未开放</h1>
      <a class="back" href="/collection">返回系列</a></div>`;
    return { theme: 'ms', title: '内容暂未开放 · 予时妍 YUÉ ATELIER' };
  }
  const theme = THEME_BY_STYLE[a.style] || 'ms';

  // 下一册（同风格列表序；flat 分支自己渲染）
  const siblings = await getAlbumsByStyle(a.style).catch(() => []);
  if (a.layout === 'flat') return renderFlat(el, a, siblings);

  const i = siblings.findIndex((x) => x.slug === a.slug);
  const next = i >= 0 && i + 1 < siblings.length ? siblings[i + 1] : null;

  const chips = a.sections.map((s) =>
    `<a class="glass" href="#sec-${s.kind}">${kindName(s)}</a>`).join('');

  // 注册暗房照片组：每段一组，标题 =「册名 · 段名」
  a.sections.forEach((s) => registerGroup(`s${s.sort}`, s.photos, `${a.titleCn} · ${s.titleCn}`));

  // 章节进度轨（六点）：固定在视口右侧中线，滚动时随当前段点亮。
  // 由 reveal.bindRail 接管判定与状态，纯 HTML 无 JS 逻辑。
  const rail = `<div class="chapter-rail" aria-hidden="true">${
    a.sections.map(() => '<i></i>').join('')}</div>`;

  el.innerHTML = `
    <div class="ab-hero">
      <img src="${a.coverKey}" alt="${a.titleCn}" />
      <div class="fade"></div>
      <div class="t">
        <div class="cd">${a.titleCn}</div>
        <div class="en">${a.titleEn} · Chapter ${a.ordinalLabel}</div>
        <div class="fl">${chips}</div>
      </div>
    </div>
    ${a.sections.map((s, i) => renderSection(s, a.style, `s${s.sort}`, i)).join('')}
    ${actrowHtml(a)}
    <a class="ab-foot reveal" href="${next ? `/album/${next.slug}` : `/style/${a.style}`}">
      <span><span class="cd">${next ? `下一册 · ${nextLabel(next, a)}` : '回到册页'}</span><br/>
        <span class="en">${next ? 'Next Album' : 'Albums'}</span></span>
      <span class="arw">→</span>
    </a>
    ${rail}
  `;
  bindStrips(el);
  bindInteract(el, a);
  trackViewAndPaint(el, a.slug);

  return { theme, title: `${a.titleCn} · 予时妍 YUÉ ATELIER` };
}
