/* ============================================================
 * ink.js —— M5 转场指示（2026-10-03 改造：全屏墨晕 → 顶部进度条）
 * 旧版：route:start 全屏铺墨 + 强制覆盖 420ms —— 用户反馈「突然一黑」太唐突。
 * 新版：router 离屏渲染（旧页保持可见），这里只出一条顶部 2px 进度条；
 *      新内容就绪（route:change）或渲染失败（route:abort）即收回。
 * 首屏不显示；prefers-reduced-motion 全跳过。
 * ============================================================ */
// @ts-check

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MIN_SHOW_MS = 160;   // 最短显示时长：避免超快响应时进度条闪烁

let barEl = /** @type {HTMLElement | null} */ (null);
let shownAt = 0;
let first = true;

/** @returns {void} */
function hide() {
  if (!barEl) return;
  const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - shownAt));
  window.setTimeout(() => barEl && barEl.classList.remove('on'), wait);
}

export function initInk() {
  if (barEl || reduced) return;

  barEl = document.createElement('div');
  barEl.id = 'ink';
  barEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(barEl);

  document.addEventListener('route:start', () => {
    if (first) { first = false; return; }   // 首屏直接渲染，不显示
    shownAt = Date.now();
    barEl.classList.remove('done');
    barEl.classList.add('on');
    // 兜底：视图抛异常导致收尾事件不来，也要收回
    window.setTimeout(() => barEl && barEl.classList.remove('on'), 2500);
  });

  document.addEventListener('route:change', hide);
  document.addEventListener('route:abort', hide);
}
