/* ============================================================
 * wedding.js —— 婚庆跟妆专属入口（首页 row 直达；区别于作品导航的
 * /collection）：只渲染婚礼双封面（西式婚礼 × 新中式婚礼），不出「更多时刻」。
 * 封面卡复用 collection.js 的 coverCard，双端结构零分叉。
 * ============================================================ */
// @ts-check

import { getCollections, getAlbumsByStyle } from '../api.js';
import { coverCard } from './collection.js';

/**
 * @param {HTMLElement} el
 */
export async function wedding(el) {
  el.innerHTML = `<div class="ihead"><span class="cd" style="opacity:.35">…</span></div>`;

  const cols = (await getCollections().catch(() => []))
    .filter((c) => c.style === 'western' || c.style === 'chinese');
  const lists = await Promise.all(
    cols.map((c) => getAlbumsByStyle(c.style).catch(() => [])));

  el.innerHTML = `
    <header class="ihead">
      <a class="back" href="/" aria-label="返回首页">←</a>
      <div class="cd">婚庆跟妆</div>
      <div class="cnsub">西式婚礼 × 新中式婚礼 · 双封面</div>
      <div class="en" style="margin-top:8px">Bridal Makeup</div>
    </header>
    ${cols.map((c, i) => coverCard(c, (lists[i] || []).length)).join('')}
    <div class="cue" style="margin-top:26px"><i></i><em>SCROLL</em></div>
  `;
}
