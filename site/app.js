/* ============================================================
 * app.js —— 入口：玻璃探测 → 路由注册 → Dock 挂载（M4 全路由）
 * ============================================================ */
// @ts-check

import { initRouter } from './router.js';
import { initGlass } from './components/glass.js';
import { mountDock } from './components/dock.js?v=20261005e';
import { initViewer } from './components/viewer.js';
import { initInk } from './components/ink.js';
import { initAmbient, bindReveals } from './components/reveal.js';
import { initBackdrop } from './components/ambient.js';
import { home } from './views/home.js?v=20261005e';
import { collection } from './views/collection.js';
import { wedding } from './views/wedding.js';
import { styleList } from './views/styleList.js?v=20261005e';
import { album } from './views/album.js?v=20261005e';
import { gallery } from './views/gallery.js?v=20261005e';
import { about } from './views/about.js?v=20261005e';
import { stub } from './views/stub.js';

initGlass();
initViewer();
initInk();
initAmbient();
initBackdrop();

/* 禁止双指缩放：viewport user-scalable=no 对 iOS Safari/WKWebView 不生效
 * （无障碍策略），需拦 gesture 事件补刀；双击缩放由 base.css 的
 * touch-action:manipulation 负责。 */
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());

/** @type {import('./router.js').Route[]} */
const routes = [
  { path: '/',              view: home,        theme: 'ms', nav: 'home',
    title: '茉與妝 MO·BEAUTÉ · 为重要时刻，留一份美' },
  { path: '/collection',    view: collection,  theme: 'ms', nav: 'work',
    title: '作品系列 · 茉與妝 MO·BEAUTÉ' },
  // 婚庆跟妆专属入口（首页 row 直达）：只出婚礼双封面，不出更多时刻
  { path: '/wedding',       view: wedding,     theme: 'ms', nav: 'work',
    title: '婚庆跟妆 · 茉與妝 MO·BEAUTÉ' },
  // 册页列表：西式婚礼 twe / 新中式婚礼 tcn 主题在注册期就定死，无闪切；
  // V7 三新系列（更多时刻）走中性 ms 主题
  { path: '/style/western', view: styleList('western'), theme: 'twe', nav: 'work',
    title: '西式婚礼 · 茉與妝 MO·BEAUTÉ' },
  { path: '/style/chinese', view: styleList('chinese'), theme: 'tcn', nav: 'work',
    title: '新中式婚礼 · 茉與妝 MO·BEAUTÉ' },
  { path: '/style/engagement', view: styleList('engagement'), theme: 'ms', nav: 'work',
    title: '订婚宴跟妆 · 茉與妝 MO·BEAUTÉ' },
  { path: '/style/maternity', view: styleList('maternity'), theme: 'ms', nav: 'work',
    title: '孕妈照 · 茉與妝 MO·BEAUTÉ' },
  { path: '/style/family', view: styleList('family'), theme: 'ms', nav: 'work',
    title: '亲子照 · 茉與妝 MO·BEAUTÉ' },
  // 册详情：主题由 album.style 决定，视图取数后通过 ViewOverride 切根 class
  { path: '/album/:slug',   view: album,       theme: 'ms', nav: 'work',
    title: '茉與妝 MO·BEAUTÉ' },
  { path: '/gallery/:slug', view: gallery,     theme: 'ms', nav: 'work',
    title: '图集 · 茉與妝 MO·BEAUTÉ' },
  // 联系（原「关于」页更名，2026-10-03 拍板）：品牌介绍 + 预约转化同页
  { path: '/about',         view: about,       theme: 'ms', nav: 'about',
    title: '联系 · 茉與妝 MO·BEAUTÉ' },
  { path: '*',              view: stub('页面不存在', '404', '这里什么都没有'), theme: 'ms',
    title: '404 · 茉與妝 MO·BEAUTÉ' },
];

const viewEl = /** @type {HTMLElement} */ (document.getElementById('view'));
// 每次路由渲染完成后：滚动入场 + 图片淡入（M5）
document.addEventListener('route:change', () => { if (viewEl) bindReveals(viewEl); });

// 锚点小签（hero #sec-*）：SPA 内自行平滑滚动 —— 浏览器原生锚点对动态渲染的元素不可靠，
// 且 scrollIntoView({smooth}) 在长距离 + 懒加载布局增长时会被截断 → 自绘 rAF 缓动，
// 每帧重算目标位置吸收布局偏移，保证落定。
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * @param {HTMLElement} target
 */
function smoothScrollTo(target) {
  const DUR = 780;
  const from = window.scrollY;
  const start = performance.now();
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  addEventListener('wheel', cancel, { once: true, passive: true });
  addEventListener('touchstart', cancel, { once: true, passive: true });
  const step = (now) => {
    if (cancelled) return;
    const p = Math.min(1, (now - start) / DUR);
    const dest = target.getBoundingClientRect().top + window.scrollY - 16; // 16px ≙ scroll-margin
    window.scrollTo(0, from + (dest - from) * easeInOut(p));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

document.addEventListener('click', (e) => {
  const a = /** @type {HTMLAnchorElement | null} */ (
    (/** @type {HTMLElement} */ (e.target)).closest?.('a[href^="#"]'));
  if (!a) return;
  const id = a.getAttribute('href') || '';
  const target = id.length > 1 ? document.getElementById(id.slice(1)) : null;
  if (!target) return;
  e.preventDefault();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) target.scrollIntoView();
  else smoothScrollTo(target);
  history.replaceState({}, '', id);
});

initRouter(routes, viewEl);
mountDock(document.getElementById('dock'));
