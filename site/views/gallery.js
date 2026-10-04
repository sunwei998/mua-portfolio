/* ============================================================
 * gallery.js —— 07 平铺图集（接 GET /api/galleries/:slug）
 * 两列瀑布；横图整行独占（v6 第 07/08 屏规则）。
 * ============================================================ */
// @ts-check

import { getGallery } from '../api.js';
import { registerGroup } from '../components/viewer.js';

/**
 * @param {HTMLElement} el
 * @param {Record<string, string>} params
 */
export async function gallery(el, params) {
  el.innerHTML = `<div class="ihead"><span class="cd" style="opacity:.35">…</span></div>`;
  const g = await getGallery(params.slug || '').catch(() => null);
  if (!g) {
    el.innerHTML = `<div class="stub"><span class="no">404</span><h1>图集不存在</h1>
      <a class="back" href="/">返回首页</a></div>`;
    return { title: '图集不存在 · 茉與妝 MO·BEAUTÉ' };
  }

  registerGroup('gallery', g.photos, g.titleCn);

  el.innerHTML = `
    <header class="ihead">
      <a class="back" href="/" aria-label="返回首页">←</a>
      <div class="cd">${g.titleCn}</div>
      <div class="cnsub">${g.descCn || '全程记录 · 不设分类'}</div>
      <div class="en" style="margin-top:8px">${g.titleEn}</div>
    </header>
    <div class="ggrid">
      ${g.photos.map((p, i) => p.orientation === 'landscape'
        ? `<figure class="r32 wide reveal" data-vgroup="gallery" data-vi="${i}">${figImg(p, true)}</figure>`
        : `<figure class="${i % 2 === 0 ? 'r34' : 'r45'} reveal" data-vgroup="gallery" data-vi="${i}">${figImg(p)}</figure>`).join('')}
    </div>
    <div class="cue" style="margin-top:26px"><i></i><em>END</em></div>
  `;

  return { title: `${g.titleCn} · 茉與妝 MO·BEAUTÉ` };
}

/**
 * 拱门揭示的图片包裹（2026-10-03，与册页同一套动效口径）：
 * 外层 .rv-fig 承担 clip-path 揭开，内层 img 承担 scale 1.06→1 回落。
 *
 * ⚠ width/height 属性不可省：r32/r34/r45 虽给了 figure 固定宽高比，但
 *   .wide 之外的图若在 bindReveals 时未解码，布局仍会塌陷 → IO 一次性全亮。
 *   写上固有宽高让浏览器解码前就占位。
 * @param {import('../api.js').Photo} p
 * @param {boolean} [wide]
 */
function figImg(p, wide = false) {
  const wh = !p.w || !p.h ? '' : ` width="${p.w}" height="${p.h}"`;
  return `<span class="rv-fig ph${wide ? ' wide' : ''}"><img class="fit" src="${p.cosKey}" alt="${p.captionCn || ''}"${wh} loading="lazy" decoding="async" /></span>`;
}
