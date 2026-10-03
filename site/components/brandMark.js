/* ============================================================
 * brandMark.js —— 品牌标记：内联 SVG 符号 + 中文主字标
 * SVG 内联自 assets/logo/symbol.svg（纯路径，继承 currentColor）；
 * 字标三字等大（2026-10-02 拍板），字距由统一 letter-spacing 控制。
 * ============================================================ */
// @ts-check

/** 品牌符号：开口环（给予 · 未合拢）+ 中心光点（妍 · 点妆） */
export function symbolSVG() {
  return `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="22.5" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-dasharray="121.4 20" transform="rotate(155.5 32 32)"/>
    <circle cx="32" cy="32" r="5.1" fill="currentColor"/>
  </svg>`;
}

/**
 * 中文主字标「予时妍」—— 末字「妍」是全站唯一彩色点
 * @param {{ size?: string, spacing?: string }} [opts]
 */
export function wordmarkHTML(opts = {}) {
  const { size = '35px', spacing = '.26em' } = opts;
  return `<span class="wordmark" style="font-size:${size};letter-spacing:${spacing};text-indent:${spacing}">予时<span class="acc">妍</span></span>`;
}
