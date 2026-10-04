/* ============================================================
 * home.js —— 01 首页（M4 接 GET /api/home；2026-10-03 首页改版）
 * 结构逐屏：brandlock 导航 → hero 双玻璃签 → 向下浏览 cue →
 * 署名条（头像 + 双行 + 印章）→ **精选瀑布流**（替代原「作品系列」横条）→
 * **时光影像视频画框**（≤2 个）→ 走马灯（页面收尾）。
 * 改版口径（用户拍板 A+A；020 起精选 ≤20 张、视频 ≤2 个）：
 *   · 瀑布流 = 2 列错落单图（≤20 张，独立于相册），A 静观：纯图零文字，
 *     点按走暗房查看器（registerGroup + data-vgroup 全局委托）；
 *   · 0 张时整块隐藏（不留空区）；视频 0 个时显示占位画框（COMING SOON）；
 *   · hero 图 / 走马灯词 / 署名条来自 site_setting；API 不可用降级兜底，不白屏。
 * ============================================================ */
// @ts-check

import { symbolSVG } from '../components/brandMark.js?v=20261005g';
import { registerGroup } from '../components/viewer.js';
import { getHome } from '../api.js';

/** 兜底常量 —— featured/video 留空：降级时不虚构精选内容 */
const FALLBACK = /** @type {const} */ ({
  heroKey: '/img/hero.webp',
  heroTagCn: '2026 婚礼季',
  marquee: ['婚礼跟妆', '订婚宴', '出阁宴', '孕妇照', '亲子照', '日常妆'],
  entries: [],
  featured: [],
  videos: [],
  byline: { nameCn: '甜茉', roleCn: '化妆师个人作品集' },
  subCn: '婚礼 与 日常',
  portraitKey: '/img/portrait.webp',
});

/**
 * 瀑布流分列：按「累计高度」贪心放入较矮的一列（保持原顺序）。
 * 高度按 h/w 折算——列宽相等，h/w 即该图占的相对高度。
 * @param {import('../api.js').FeaturedItem[]} items
 * @returns {Array<Array<{ p: import('../api.js').FeaturedItem, i: number }>>} 两列
 */
function splitColumns(items) {
  /** @type {Array<Array<{ p: import('../api.js').FeaturedItem, i: number }>>} */
  const cols = [[], []];
  const heights = [0, 0];
  items.forEach((p, i) => {
    const k = heights[0] <= heights[1] ? 0 : 1;
    cols[k].push({ p, i });
    heights[k] += (p.h || 1) / (p.w || 1);
  });
  return cols;
}

/**
 * @param {HTMLElement} el
 */
export async function home(el) {
  /** @type {import('../api.js').HomePayload | typeof FALLBACK} */
  let data = FALLBACK;
  try {
    data = await getHome();
  } catch {
    /* 降级：用兜底常量渲染 */
  }
  const byline = data.byline || FALLBACK.byline;
  const featured = data.featured || [];
  const videos = data.videos || [];
  /* 主理人头像（023 起后台可上传，首页右上角 + 联系页圆形图同源） */
  const portrait = data.portraitKey || FALLBACK.portraitKey;

  const marqueeHtml = data.marquee.length > 0 ? `
    <div class="marquee" aria-hidden="true"><div>
      ${[0, 1].map(() => data.marquee
        .map((w, i) => `<span><i>${['壹', '贰', '叁', '肆', '伍', '陆'][i] || '·'}</i>${w}</span>`)
        .join('')).join('')}
    </div></div>` : '';

  /* 瀑布流（0 张整块隐藏）。rv-fig 复用册页揭示动效；width/height 属性
     让解码前占位（gallery 同款纪律，防 IO 一次性全亮）。 */
  const wfHtml = featured.length > 0 ? `
    <div class="sec-head">
      <div><span class="en">Selected Works</span><span class="cd">精选作品</span></div>
    </div>
    <nav class="wf" aria-label="精选作品">
      ${splitColumns(featured).map((col) => `
      <div class="wf-col">
        ${col.map(({ p, i }) => `
        <figure class="wf-it reveal" data-vgroup="wf" data-vi="${i}">
          <span class="rv-fig ph"><img src="${p.cosKey}" alt="" width="${p.w}" height="${p.h}" loading="lazy" decoding="async" /></span>
        </figure>`).join('')}
      </div>`).join('')}
    </nav>` : '';
  if (featured.length > 0) {
    registerGroup('wf', featured.map((f, i) => ({
      id: i, sectionId: 0, cosKey: f.cosKey, w: f.w, h: f.h, ratio: f.ratio,
      orientation: f.orientation, captionCn: f.captionCn, captionEn: f.captionEn, sort: i,
    })), '精选作品');
  }

  /* 播放器容器比例（022 起）：API 已下发宽高时，首帧直接内联真实 aspect-ratio，
     不再用 CSS 默认的 9:16 把横视频封面裁成竖框；未下发（老数据）时返回空串，
     仍由 loadedmetadata 兜底。clamp 口径 9:16～16:9，与下方元数据回调一致。 */
  const vinnerStyle = (v) => {
    if (!v || !v.w || !v.h) return '';
    const ar = v.w / v.h;
    const c = Math.min(Math.max(ar, 9 / 16), 16 / 9);
    return ` style="aspect-ratio:${c === ar ? `${v.w} / ${v.h}` : String(+c.toFixed(4))}"`;
  };
  /* 时光影像画框：≤2 个，各自独立播放器（可拖进度 / 全屏 / 时间码）；
     0 个 → 占位画框。区块命名 2026-10-03 拍板：「时光影像 / Time in Motion」。 */
  const frameHtml = (v) => `
    <figure class="vframe">
      <span class="corner tl" aria-hidden="true"></span><span class="corner tr" aria-hidden="true"></span>
      <span class="corner bl" aria-hidden="true"></span><span class="corner br" aria-hidden="true"></span>
      <div class="vinner"${vinnerStyle(v)}>
        <video src="${v.key}" ${v.posterKey ? `poster="${v.posterKey}"` : ''} playsinline preload="metadata"></video>
        <button class="vplay" type="button" aria-label="播放">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
        </button>
        <div class="vctl">
          <span class="vspacer" aria-hidden="true"></span>
          <span class="vtime" role="timer">00:00 / 00:00</span>
          <button class="vskip vfs" type="button" aria-label="全屏播放">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>
          </button>
        </div>
        <span class="vbar" aria-hidden="true"><i class="vfill"></i></span>
      </div>
    </figure>`;
  const videoHtml = `
    <section class="vsec reveal">
      <div class="sec-head">
        <div><span class="en">Time in Motion</span><span class="cd">时光影像</span></div>
      </div>
      ${videos.length > 0 ? videos.map(frameHtml).join('') : `
      <figure class="vframe">
        <span class="corner tl" aria-hidden="true"></span><span class="corner tr" aria-hidden="true"></span>
        <span class="corner bl" aria-hidden="true"></span><span class="corner br" aria-hidden="true"></span>
        <div class="vinner">
          <div class="vph">
            ${symbolSVG()}
            <span class="ph-cn">视频即将上线</span>
            <span class="ph-en">COMING SOON</span>
          </div>
        </div>
      </figure>`}
    </section>`;

  el.innerHTML = `
    <header class="topnav">
      <a class="brandlock" href="/" aria-label="茉與妝 MO·BEAUTÉ">
        ${symbolSVG()}
      </a>
      <span class="right">
        <a class="whoami" href="/collection" aria-label="浏览作品系列">
          <span class="pt"><img src="${portrait}" alt="甜茉" /></span>
          <span class="n">${byline.nameCn}</span>
        </a>
        <span class="menu" aria-hidden="true"><span></span><span></span></span>
      </span>
    </header>

    <section class="hero">
      <p class="en">MO·BEAUTÉ · Est. 2019</p>
      <h1 class="lead">茉與<span class="rose">妝</span></h1>
      <div class="sub"><span class="cn">${data.taglineCn || FALLBACK.subCn}</span></div>
      <p class="en enline">Makeup &amp; Hair · Bridal &amp; Daily</p>
      ${data.heroKey ? `
      <div class="shot hero-shot ph">
        <img src="${data.heroKey}" alt="作品精选" />
        <span class="glass dtag">Nº 01</span>
        <span class="glass hero-tag">${data.heroTagCn || FALLBACK.heroTagCn}</span>
      </div>` : ''}
      <div class="cue"><i></i><span>向下浏览</span></div>
      <a class="byline glass light" href="/collection">
        <span class="scrim"></span>
        <span class="pt"><img src="${portrait}" alt="甜茉" /></span>
        <span class="tx">
          <span class="n">${byline.nameCn} · ${byline.roleCn}</span>
          <span class="en">Tianmo · Personal Portfolio</span>
        </span>
        <span class="seal-mini" aria-hidden="true">茉</span>
      </a>
    </section>

    ${wfHtml}

    ${videoHtml}

    ${marqueeHtml}
  `;

  bindVideo(el);
}

/**
 * 视频播放器交互（020 起每帧独立绑定，占位画框自动跳过）：
 *  - 点环/点画面切换播放；ended 后一次点击即重播（play() 自动回头，见 toggle 注释）；
 *  - 进度条可点可拖（Pointer Events + setPointerCapture，拖动中实时 scrub）；
 *  - loadedmetadata 读真实宽高写 aspect-ratio（clamp 9:16 ～ 16:9，横竖构图自适应），
 *    并把总时长刷进时间码（未播放即可见）；
 *  - 全屏：容器 Fullscreen API（安卓/桌面）→ iPhone 回退 webkitEnterFullscreen；
 *  - timeupdate 单向写进度（transform scaleX，X5 纪律：JS 只写 transform，不动布局属性）。
 * @param {HTMLElement} el
 */
function bindVideo(el) {
  el.querySelectorAll('.vframe').forEach((frame) => bindOneFrame(/** @type {HTMLElement} */ (frame)));
}

/**
 * 单个画框的事件绑定（所有查询都限定在 frame 内，≤2 个画框互不串扰）
 * @param {HTMLElement} frame
 */
function bindOneFrame(frame) {
  const vid = /** @type {HTMLVideoElement | null} */ (frame.querySelector('.vinner video'));
  if (!vid) return; // 占位画框
  const inner = /** @type {HTMLElement | null} */ (frame.querySelector('.vinner'));
  const fill = /** @type {HTMLElement | null} */ (frame.querySelector('.vfill'));
  const bar = /** @type {HTMLElement | null} */ (frame.querySelector('.vbar'));
  const time = /** @type {HTMLElement | null} */ (frame.querySelector('.vtime'));

  const fmt = (s) => {
    const t = Math.max(0, Math.floor(s || 0));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  /* 时间码：元数据就绪即展示总时长（没播放也能看到）；timeupdate 单向刷写 */
  const paintTime = () => {
    if (time) time.textContent = `${fmt(vid.currentTime)} / ${fmt(vid.duration)}`;
  };
  /* 重播三坑：
   * ① ended 后「paused 仍为 false」是 HTML 规范行为——只判 paused，重播第一下会变成 pause()；
   * ② iOS Safari 上「ended → 同步 seek+play」会被 seek 打断，表现为第一次点击没反应、第二次才播；
   * ③ 规范本身：ended 态调用 play() 会自动回到开头重新播，无需手动归零。
   * 故 ended 态直接 play()，仅当 promise 被拒（偶发打断）才归零重试一次。 */
  const toggle = () => {
    if (!vid.paused && !vid.ended) { vid.pause(); return; }
    vid.play().catch(() => {
      try { vid.currentTime = 0; } catch { /* noop */ }
      vid.play().catch(() => { /* 路由切换中断等 AbortError 静默 */ });
    });
  };
  const paint = (ratio) => {
    if (fill) fill.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
  };

  /* 横竖构图自适应：比例 clamp 到 9:16 ～ 16:9，极端宽银幕由 object-fit: cover 轻裁；
   * 同时把总时长刷进时间码（preload="metadata"，未播放即可见） */
  vid.addEventListener('loadedmetadata', () => {
    paintTime();
    if (!inner || !vid.videoWidth || !vid.videoHeight) return;
    const ar = vid.videoWidth / vid.videoHeight;
    const clamped = Math.min(Math.max(ar, 9 / 16), 16 / 9);
    inner.style.aspectRatio = clamped === ar
      ? `${vid.videoWidth} / ${vid.videoHeight}`
      : String(+clamped.toFixed(4));
  });
  vid.addEventListener('durationchange', paintTime);

  frame.querySelector('.vplay')?.addEventListener('click', toggle);
  vid.addEventListener('click', toggle);

  /* 进度条：可点可拖 */
  if (bar) {
    let scrubbing = false;
    const seekTo = (clientX) => {
      if (!vid.duration || Number.isNaN(vid.duration)) return;
      const r = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      vid.currentTime = ratio * vid.duration;
      paint(ratio);
    };
    bar.addEventListener('pointerdown', (e) => {
      scrubbing = true;
      try { bar.setPointerCapture(e.pointerId); } catch { /* noop */ }
      seekTo(e.clientX);
    });
    bar.addEventListener('pointermove', (e) => { if (scrubbing) seekTo(e.clientX); });
    const stop = () => { scrubbing = false; };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
  }

  vid.addEventListener('play', () => frame?.classList.add('playing'));
  vid.addEventListener('pause', () => frame?.classList.remove('playing'));
  vid.addEventListener('ended', () => {
    frame?.classList.remove('playing');
    paint(0);
    if (time) time.textContent = `00:00 / ${fmt(vid.duration)}`;
  });
  vid.addEventListener('timeupdate', () => {
    if (vid.duration) paint(vid.currentTime / vid.duration);
    paintTime();
  });

  /* 全屏：安卓/桌面走容器 Fullscreen API（自绘控制条随容器进入全屏照常可用）；
   * iPhone Safari 没有元素级全屏 API → 回退 vid.webkitEnterFullscreen() 原生播放器；
   * 退出后由 fullscreenchange 同步图标。 */
  const fsBtn = /** @type {HTMLButtonElement | null} */ (frame.querySelector('.vfs'));
  if (fsBtn && inner) {
    const d = /** @type {any} */ (document);
    const v = /** @type {any} */ (vid);
    const ICON_ENTER = fsBtn.innerHTML;
    const ICON_EXIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';
    const fsEl = () => d.fullscreenElement || d.webkitFullscreenElement || null;
    const syncIcon = () => { fsBtn.innerHTML = fsEl() ? ICON_EXIT : ICON_ENTER; };
    fsBtn.addEventListener('click', () => {
      if (fsEl()) {
        const exit = d.exitFullscreen || d.webkitExitFullscreen;
        if (exit) exit.call(d);
        return;
      }
      if (inner.requestFullscreen) void inner.requestFullscreen().catch(() => {});
      else if (inner.webkitRequestFullscreen) inner.webkitRequestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iPhone Safari
    });
    document.addEventListener('fullscreenchange', syncIcon);
    document.addEventListener('webkitfullscreenchange', syncIcon);
  }
}
