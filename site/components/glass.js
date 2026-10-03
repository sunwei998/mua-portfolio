/* ============================================================
 * glass.js —— X5 降级探测（全站唯一入口，M1 四项实测之一）
 * 规则：
 *   ① CSS.supports 检测 backdrop-filter（含 -webkit- 前缀）→ 不支持则 html.noblur
 *   ② URL ?noblur=1 强制降级（M5 验收「X5 降级预览」用）
 *   ③ prefers-reduced-motion → html.reduce（配合 base.css 全量停动效）
 * ============================================================ */
// @ts-check

export function initGlass() {
  const root = document.documentElement;

  const supportsBlur =
    (typeof CSS !== 'undefined' && CSS.supports &&
      (CSS.supports('backdrop-filter', 'blur(1px)') ||
       CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))) || false;

  const forced = new URLSearchParams(location.search).get('noblur') === '1';

  if (forced || !supportsBlur) root.classList.add('noblur');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('reduce');

  // 供真机验收脚本读取：console 里看 window.__mua.glass 即知走了哪一档
  /** @type {any} */ (window).__mua = {
    glass: forced ? 'forced-fake' : (supportsBlur ? 'real' : 'fake'),
  };
}
