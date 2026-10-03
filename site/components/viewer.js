/* ============================================================
 * viewer.js —— M5 暗房查看器（零依赖，继承原型 demo 手势逻辑）
 * 数据流：视图渲染时 registerGroup(id, photos, title) 注册照片组；
 *         照片元素带 data-vgroup / data-vi，全局点击委托开图。
 * 交互：拖动跟手翻页（位移 > 28% 或快速轻扫即翻页，否则弹回）·
 *       双击放大 · Esc / ←→ 键（带同款滑动动画）· 进度条 · 邻图预载
 * 结构：v-stage 内双层（cur / alt），翻页动画平移层，缩放作用于层内 img，
 *       两者互不干扰。路由切换（route:start）自动关查看器并清空注册表。
 * ============================================================ */
// @ts-check

/** @typedef {import('../api.js').Photo} Photo */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EASE = 'transform .42s cubic-bezier(.22,.61,.36,1)';

/** @type {Map<string, {photos: Photo[], title: string}>} */
const groups = new Map();

/** @type {{root: HTMLElement, stage: HTMLElement, curLayer: HTMLElement, altLayer: HTMLElement, img: HTMLImageElement, altImg: HTMLImageElement, title: HTMLElement, count: HTMLElement, fill: HTMLElement, thumbs: HTMLElement} | null} */
let ui = null;

let list = /** @type {Photo[]} */ ([]);
let idx = 0;
let titleText = '';
/** 动画进行中（commit/cancel 未落定）——期间忽略新的翻页输入 */
let anim = false;

/**
 * 视图渲染时注册一组可查看的照片（路由切换时自动清空）。
 * @param {string} id
 * @param {Photo[]} photos
 * @param {string} title
 */
export function registerGroup(id, photos, title) {
  groups.set(id, { photos, title });
}

const stageW = () => (ui ? ui.stage.clientWidth || 1 : 1);
/** 翻页目标页（非环形：到头即停，不许绕回第一张——绕回会被感知为「多出一张」） */
const neighbor = (d) => idx + d;

/** 平移层；withTrans=false 用于拖拽跟手/瞬时复位 */
function setT(el, x, withTrans) {
  el.style.transition = withTrans ? EASE : 'none';
  el.style.transform = `translateX(${x}px)`;
}

/** 计数 / 进度 / 缩略图 on 态 / 缩放复位 / 邻图预载（与画面位移同步更新） */
function renderMeta() {
  if (!ui) return;
  ui.title.textContent = titleText;
  ui.count.textContent = `${idx + 1} / ${list.length}`;
  ui.fill.style.width = `${((idx + 1) / list.length) * 100}%`;
  ui.stage.classList.remove('is-zoom');
  Array.from(ui.thumbs.children).forEach((el, i) =>
    (/** @type {HTMLElement} */ (el)).classList.toggle('on', i === idx));
  for (const n of [idx + 1, idx - 1]) {
    const np = list[n];
    if (np) { const pre = new Image(); pre.src = np.cosKey; }
  }
}

/** 把 alt 层摆到 dir 方向邻位（d=+1：下一张停在右侧屏外） */
function prepare(d) {
  if (!ui) return false;
  const p = list[neighbor(d)];
  if (!p) return false;
  ui.altImg.src = p.cosKey;
  ui.altImg.alt = p.captionCn || '';
  ui.altLayer.classList.add('live');
  const w = stageW();
  setT(ui.altLayer, d > 0 ? w : -w, false);
  setT(ui.curLayer, 0, false);
  return true;
}

/** 翻页落定：alt 滑入 0 位后把内容移交 cur 并复位 */
function commit(d) {
  if (!ui) return;
  const w = stageW();
  setT(ui.curLayer, -d * w, true);
  setT(ui.altLayer, 0, true);
  idx = neighbor(d);
  renderMeta();
  setTimeout(() => {
    if (!ui) return;
    ui.img.src = ui.altImg.src;
    ui.img.alt = ui.altImg.alt;
    ui.altLayer.classList.remove('live');
    setT(ui.curLayer, 0, false);
    setT(ui.altLayer, 0, false);
    anim = false;
  }, 440);
}

/** 未达阈值：双弹回 */
function cancel(d) {
  if (!ui) return;
  const w = stageW();
  setT(ui.curLayer, 0, true);
  setT(ui.altLayer, d > 0 ? w : -w, true);
  setTimeout(() => {
    if (!ui) return;
    ui.altLayer.classList.remove('live');
    setT(ui.curLayer, 0, false);
    setT(ui.altLayer, 0, false);
    anim = false;
  }, 440);
}

/** 全量渲染（开图 / 兜底复位） */
function render() {
  if (!ui) return;
  const p = list[idx];
  if (!p) return;
  ui.img.src = p.cosKey;
  ui.img.alt = p.captionCn || '';
  ui.altLayer.classList.remove('live');
  setT(ui.curLayer, 0, false);
  setT(ui.altLayer, 0, false);
  anim = false;
  renderMeta();
}

function open(photos, i, title) {
  if (!ui || photos.length === 0) return;
  list = photos;
  idx = Math.min(Math.max(0, i), photos.length - 1);
  titleText = title;
  buildThumbs();
  render();
  ui.root.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

/** 缩略图条（v6 09 屏 .thumbs）：46×60 背景图位，on 高亮，点击跳图 */
function buildThumbs() {
  if (!ui) return;
  ui.thumbs.innerHTML = list.map((p, i) =>
    `<i style="background-image:url('${p.cosKey}')" role="button"
        aria-label="第 ${i + 1} 张" data-ti="${i}"></i>`).join('');
}

function close() {
  if (!ui) return;
  ui.root.classList.remove('is-open');
  document.body.style.overflow = '';
}

/** 程序化翻页（键盘 / 无拖拽场景），与手势共用 prepare/commit */
function slideBy(d) {
  if (!list.length || anim) return;
  if (list.length < 2 || reduced) { idx = neighbor(d); render(); return; }
  anim = true;
  if (!prepare(d)) { anim = false; return; }
  void ui.altLayer.offsetWidth; // 强制重排，确保初始位先落盘再起过渡
  commit(d);
}

/** 路由切换时复位（由 ink/router 生命周期调用） */
export function closeViewer() { close(); groups.clear(); }

export function initViewer() {
  if (ui) return;

  const root = document.createElement('div');
  root.id = 'viewer';
  root.className = 'viewer';
  root.hidden = true;
  root.innerHTML = `
    <div class="v-bar"><span class="v-title"></span><button class="v-close" type="button" aria-label="关闭">×</button></div>
    <div class="v-stage">
      <div class="v-layer cur"><img class="v-img" alt="" draggable="false" /></div>
      <div class="v-layer alt"><img class="v-img" alt="" draggable="false" /></div>
    </div>
    <div class="v-foot"><span class="v-count"></span><span class="v-track"><i class="v-fill"></i></span><div class="v-thumbs" aria-hidden="false"></div></div>`;
  document.body.appendChild(root);

  const img = /** @type {HTMLImageElement} */ (root.querySelector('.v-layer.cur .v-img'));
  const altImg = /** @type {HTMLImageElement} */ (root.querySelector('.v-layer.alt .v-img'));
  const stage = /** @type {HTMLElement} */ (root.querySelector('.v-stage'));
  ui = {
    root,
    stage,
    img,
    altImg,
    curLayer: /** @type {HTMLElement} */ (root.querySelector('.v-layer.cur')),
    altLayer: /** @type {HTMLElement} */ (root.querySelector('.v-layer.alt')),
    title: /** @type {HTMLElement} */ (root.querySelector('.v-title')),
    count: /** @type {HTMLElement} */ (root.querySelector('.v-count')),
    fill: /** @type {HTMLElement} */ (root.querySelector('.v-fill')),
    thumbs: /** @type {HTMLElement} */ (root.querySelector('.v-thumbs')),
  };

  /* 缩略图点击跳图（动画中忽略；跨多张直接落定） */
  ui.thumbs.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const el = t.closest && t.closest('[data-ti]');
    if (!el || anim || list.length < 2) return;
    const i = Number(el.getAttribute('data-ti') || 0);
    if (i === idx) return;
    idx = i;
    render(); // renderMeta 同步缩略图 on 态
    const cur = /** @type {HTMLElement | null} */ (ui.thumbs.children[idx]);
    cur?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  });

  // 开启前一刻才移除 hidden（避免初始渲染闪黑）
  new MutationObserver(() => {
    root.hidden = !root.classList.contains('is-open');
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  /* ---- 关闭 / 键盘 ---- */
  root.querySelector('.v-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (!root.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') slideBy(1);
    if (e.key === 'ArrowLeft') slideBy(-1);
  });

  /* ---- 点击委托：任何 [data-vgroup] 元素 → 开查看器 ---- */
  document.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const host = t.closest && t.closest('[data-vgroup]');
    if (!host) return;
    const g = groups.get(host.getAttribute('data-vgroup') || '');
    if (!g) return;
    e.preventDefault();
    open(g.photos, Number(host.getAttribute('data-vi') || 0), g.title);
  });

  /* ---- 手势：拖动跟手翻页 + 双击放大 ---- */
  let sx = 0;
  let sy = 0;
  let t0 = 0;
  let mode = '';        // '' | 'h'（水平翻页） | 'v'（纵向，放行）
  let gDir = 0;         // 拖拽方向（实时跟随，可反向）
  let prepOk = false;   // 最近一次 prepare 是否成功（边界处邻位无图 → 翻页落定时必须弹回而非 commit）
  let dxCur = 0;
  let dragged = false;  // 本次手势发生过水平拖拽 → 吞掉随后的 click（防误触放大/关图）
  let lastTap = 0;

  stage.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    t0 = Date.now();
    mode = ''; gDir = 0; dxCur = 0; prepOk = false;
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (!ui || !list.length || anim || list.length < 2 || reduced) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (!mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (mode === 'h') dragged = true;
    }
    if (mode !== 'h') return;
    dxCur = dx;
    const want = dx < 0 ? 1 : -1;
    if (want !== gDir) { gDir = want; prepOk = prepare(want); }
    const w = stageW();
    setT(ui.curLayer, dx, false);
    setT(ui.altLayer, (gDir > 0 ? w : -w) + dx, false);
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    const dt = Date.now() - t0;
    if (mode === 'h') {
      const flick = dt < 260 && Math.abs(dxCur) > 28;
      if (reduced) {
        const t = neighbor(gDir);
        if (t >= 0 && t < list.length) { idx = t; render(); }
      } else if (prepOk && (Math.abs(dxCur) > stageW() * 0.28 || flick)) {
        anim = true; commit(gDir);
      } else {
        // 邻位无图（已在首/尾）或未达阈值：一律弹回
        anim = true; cancel(gDir);
      }
    } else if (mode === '' && !dragged) {
      // 未成形的轻扫：保留原型 demo 的 42px 兜底
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 42) slideBy(dx < 0 ? 1 : -1);
    }
    mode = '';
    setTimeout(() => { dragged = false; }, 350);
  }, { passive: true });

  stage.addEventListener('click', (e) => {
    if (dragged) return; // 翻页手势不触发双击判定
    const now = Date.now();
    if (now - lastTap < 300) stage.classList.toggle('is-zoom');
    lastTap = now;
    void e;
  });

  /* ---- 生命周期：路由切换即复位 ---- */
  document.addEventListener('route:start', closeViewer);
}
