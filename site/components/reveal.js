/* ============================================================
 * reveal.js —— 滚动入场编排（零依赖，2026-10-03 重做）
 * ------------------------------------------------------------
 * bindReveals(root) 每次路由渲染后调用，做四件事：
 *   ① .reveal → IO 进场加 .in（IO 不可用 / reduced 直接全亮，永不白屏）
 *   ② 错落排序：按视觉位置算 delay 写进 --d（同批 70ms + 列间 45ms，封顶 600ms）
 *   ③ img.rl/.ld 加载淡入（error 也放行，不吞图）
 *   ④ sectioned 册：章节中线判定 + 右侧进度轨点���
 *
 * 动效分工（详见 quality.css ③）：
 *   容器 .reveal 只负责 IO 观测，自身做短位移淡入；
 *   图片 .rv-fig 走 clip-path 揭开 + scale 回落（1.4s 慢层）；
 *   标题 .ln>span 逐字升起（0.85s 快层）—— 图片慢、文字快，节奏错位。
 *
 * X5 纪律：JS 只做一次性加 class / 写 CSS 变量，绝不逐帧写 style。
 * ============================================================ */
// @ts-check

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 错落参数：与 design 稿一致，勿随意改 */
const STEP = 70;   // 同批内递进
const COL = 45;    // 列间额外错位
const CAP = 600;   // 单批总时长封顶，超出后 delay 归零（防「等到最后一张」）

/** @type {IntersectionObserver | null} */
let io = null;
/** @type {IntersectionObserver | null} */
let liveIo = null;

/**
 * 错落排序：读每个 .reveal 的几何位置，反推它属于第几「视觉列」，
 * 把 delay 写进 --d。DOM 顺序 ≠ 视觉顺序（瀑布流按列高分配），
 * 直接用 indexOf 会让视觉相邻的两张图同时出现，stagger 感消失。
 * @param {HTMLElement} root
 */
function applyStagger(root) {
  /** @type {HTMLElement[]} */
  const els = Array.from(root.querySelectorAll('.reveal'));
  if (els.length < 2) return;

  /** @type {Map<Element, number>} */
  const colOf = new Map();
  /** @type {Map<Element, number>} */
  const idxOf = new Map();
  /** @type {number[]} */
  const delays = [];

  for (const el of els) {
    const p = el.parentElement || root;
    let col = colOf.get(p);
    if (col === undefined) {
      // 同一父容器下，按子元素几何 left 由小到大排出列位（左半=0，右半=1）
      /** @type {HTMLElement[]} */
      const sibs = Array.from(p.children).filter((c) => c.classList.contains('reveal'));
      let maxLeft = 0;
      for (const s of sibs) maxLeft = Math.max(maxLeft, s.getBoundingClientRect().left);
      for (const s of sibs) {
        const r = s.getBoundingClientRect();
        colOf.set(s, maxLeft - r.left > 8 ? 1 : 0);
      }
      col = 0;
    }
    const i = idxOf.get(p) ?? 0;
    idxOf.set(p, i + 1);
    delays.push(i * STEP + col * COL);
  }

  // 单批封顶：超出 CAP 的部分等比压回（视差最末一张不再继续往后拖）
  const max = Math.max(0, ...delays);
  const k = max > CAP ? CAP / max : 1;
  els.forEach((el, i) => el.style.setProperty('--d', `${Math.round(delays[i] * k)}ms`));
}

/**
 * 章节进度轨：仅 sectioned 册（渲染时已挂 .chapter-rail）才启动。
 * 用「视口中线窄带」判定当前段 —— 判定点收窄到中线 10% 带内，
 * 只有段落真正滚到画面中央才切换，避免边界抖动。
 * @param {HTMLElement} root
 */
function bindRail(root) {
  const rail = root.querySelector('.chapter-rail');
  /** @type {HTMLElement[]} */
  const chapters = Array.from(root.querySelectorAll('.chapter'));
  if (!rail || !chapters.length) return;

  const dots = rail.querySelectorAll('i');
  if (dots.length !== chapters.length) return;

  const setLive = (/** @type {number} */ i) => {
    chapters.forEach((c, j) => c.classList.toggle('is-live', i === j));
    dots.forEach((d, j) => d.classList.toggle('on', i === j));
  };

  if (!('IntersectionObserver' in window) || reduced) { setLive(0); rail.classList.add('on'); return; }

  if (!liveIo) {
    liveIo = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        setLive(chapters.indexOf(/** @type {HTMLElement} */ (en.target)));
      }
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  }
  chapters.forEach((c) => liveIo.observe(c));
  // 进度轨延后出现：等用户真的滚进正文再亮，避免首屏干扰
  const io2 = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { rail.classList.add('on'); io2.disconnect(); }
  }, { threshold: 0 });
  const first = chapters[0];
  if (first) io2.observe(first);
}

/**
 * @param {HTMLElement} root
 */
export function bindReveals(root) {
  /* 错落先算（写 --d），再让 IO 触发 —— 顺序不能反，否则首批 delay 为 0 */
  applyStagger(root);

  const els = root.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reduced) {
    els.forEach((el) => el.classList.add('in'));
  } else {
    if (!io) {
      io = new IntersectionObserver((ents) => {
        for (const en of ents) {
          if (en.isIntersecting) { en.target.classList.add('in'); io?.unobserve(en.target); }
        }
      }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    }
    els.forEach((el) => {
      /* 锚点跳段（hero 小签 #sec-*）会瞬间越过中段章节 —— 已在视口上方的直接点亮。
       * 判定必须用「完全在视口外」而非 top<0：布局未稳（图未解码）时 rect.top
       * 会集体偏小，用 top<0 会把整页误判成「已滚过」而一次性全亮（真踩）。
       * bottom<=0 才是真的滚过去了。 */
      if (el.getBoundingClientRect().bottom <= 0) { el.classList.add('in'); return; }
      io.observe(el);
    });
  }

  bindRail(root);

  /* 图片加载淡入（渐进增强：JS 先给 .rl，加载完 .ld；error 也放行） */
  root.querySelectorAll('img').forEach((im) => {
    if (reduced || im.complete) { im.classList.add('ld'); return; }
    im.classList.add('rl');
    im.addEventListener('load', () => im.classList.add('ld'), { once: true });
    im.addEventListener('error', () => im.classList.add('ld'), { once: true });
  });
}

/** 光影跟随：全局委托，指针划过 .glass 时更新该元素的 --mx/--my；
 *  陀螺仪（触屏无 hover）：设备倾斜写根级 --mx/--my —— CSS 自定义属性继承，
 *  未被指针局部覆盖的玻璃自动跟随根值，两路互不干扰。 */
export function initAmbient() {
  if (reduced) return;
  document.addEventListener('pointermove', (e) => {
    const g = /** @type {HTMLElement | null} */ (
      (/** @type {HTMLElement} */ (e.target)).closest && (/** @type {HTMLElement} */ (e.target)).closest('.glass'));
    if (!g) return;
    const r = g.getBoundingClientRect();
    if (!r.width || !r.height) return;
    g.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    g.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  }, { passive: true });

  /* ---- 陀螺仪：竖持 beta≈45–90、左右 gamma±45 映射到光斑位（越界夹取） ---- */
  let gyroOn = false;
  const onOrient = (e) => {
    if (e.gamma == null || e.beta == null) return;
    const mx = Math.min(100, Math.max(0, 50 + (e.gamma / 45) * 50));
    const my = Math.min(100, Math.max(0, 50 + ((e.beta - 45) / 45) * 50));
    document.documentElement.style.setProperty('--mx', `${mx.toFixed(1)}%`);
    document.documentElement.style.setProperty('--my', `${my.toFixed(1)}%`);
  };
  const enableGyro = async () => {
    if (gyroOn) return;
    const DOE = /** @type {any} */ (window.DeviceOrientationEvent);
    if (!DOE) return; // 桌面无此 API：保持指针路径
    try {
      // iOS 13+ 必须在用户手势内显式请求授权；拒绝则静默保持静态默认光斑
      if (typeof DOE.requestPermission === 'function') {
        const state = await DOE.requestPermission();
        if (state !== 'granted') return;
      }
      addEventListener('deviceorientation', onOrient, { passive: true });
      gyroOn = true;
    } catch { /* 授权失败：静默降级 */ }
  };
  addEventListener('touchend', enableGyro, { once: true });
}