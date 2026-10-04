/* ============================================================
 * brandMark.js —— 品牌标记：内联 SVG 符号 + 中文主字标
 * SVG 内联自 assets/logo/symbol.svg（纯路径，继承 currentColor）；
 * 字标三字等大（2026-10-02 拍板），字距由统一 letter-spacing 控制。
 * 2026-10-05 品牌更名「茉與妝 MO·BEAUTÉ」：符号改为五瓣茉莉花。
 * ============================================================ */
// @ts-check

/** 品牌符号：五瓣茉莉花（茉 · 茉莉母题） */
export function symbolSVG() {
  return `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(0 32 32)"/>
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(72 32 32)"/>
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(144 32 32)"/>
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(216 32 32)"/>
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(288 32 32)"/>
    </g>
    <circle cx="32" cy="32" r="3.4" fill="currentColor" stroke="none"/>
  </svg>`;
}

/**
 * 「花头茉」字形：草字头 = 五瓣茉莉花剪影 + 下方木部（横竖撇捺）
 * 与主 Logo 中「茉」字的图形逻辑一致；继承 currentColor，可当行内字用。
 */
export function moGlyphSVG() {
  return `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true" class="mo-glyph">
    <g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="32" cy="13.5" rx="6.2" ry="10.5" transform="rotate(0 32 24)"/>
      <ellipse cx="32" cy="13.5" rx="6.2" ry="10.5" transform="rotate(72 32 24)"/>
      <ellipse cx="32" cy="13.5" rx="6.2" ry="10.5" transform="rotate(144 32 24)"/>
      <ellipse cx="32" cy="13.5" rx="6.2" ry="10.5" transform="rotate(216 32 24)"/>
      <ellipse cx="32" cy="13.5" rx="6.2" ry="10.5" transform="rotate(288 32 24)"/>
      <path d="M22 43.5 H42"/>
      <path d="M32 43.5 V59.5"/>
      <path d="M30 49 Q25 54.5 21.5 61"/>
      <path d="M34 49 Q39 54.5 42.5 61"/>
    </g>
    <circle cx="32" cy="24" r="3" fill="currentColor" stroke="none"/>
  </svg>`;
}

/**
 * 中文主字标「茉與妝」—— 末字「妝」是全站唯一彩色点；「茉」为花头字形
 * @param {{ size?: string, spacing?: string }} [opts]
 */
export function wordmarkHTML(opts = {}) {
  const { size = '35px', spacing = '.26em' } = opts;
  return `<span class="wordmark" style="font-size:${size};letter-spacing:${spacing};text-indent:${spacing}">${moGlyphSVG()}與<span class="acc">妝</span></span>`;
}
