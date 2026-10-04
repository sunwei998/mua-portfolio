/* ============================================================
 * styleList.js —— 03/04 册页列表（接 GET /api/albums?style=）
 * 西式婚礼 / 新中式婚礼共用本视图；主题差异由路由注册时的 theme 决定
 * （/style/western → twe，/style/chinese → tcn），CSS 逐行取自 v6。
 * ============================================================ */
// @ts-check

import { getAlbumsByStyle } from '../api.js';
import { ICON_EYE, ICON_HEART } from '../components/icons.js';

/** @typedef {import('../api.js').AlbumStyle} AlbumStyle */

/** 各风格的页头文案（v6 第 03/04 屏；V7 三新系列 = design-v7 屏2） */
const HEADS = /** @type {const} */ ({
  western: {
    cd: '<em>西式</em>婚礼',
    cnsub: '每场婚礼 · 一册',
    en: 'Western Wedding · Soft &amp; Airy',
    back: '/collection',
  },
  chinese: {
    cd: '新<em>中式</em>婚礼',
    cnsub: '每场婚礼 · 一册',
    en: 'Modern Oriental',
    back: '/collection',
  },
  engagement: {
    cd: '<em>订婚宴</em>跟妆',
    cnsub: '每场订婚 · 一册',
    en: 'Engagement Rouge',
    back: '/collection',
  },
  maternity: {
    cd: '<em>孕妈</em>照',
    cnsub: '温柔的等待 · 一册',
    en: 'Maternity Soft',
    back: '/collection',
  },
  family: {
    cd: '<em>亲子</em>照',
    cnsub: '一起的时刻 · 一册',
    en: 'Family Warm',
    back: '/collection',
  },
});

/** 热度行（design-v7 屏2：浏览/点赞两计数外露，线性 SVG 图标 + mono 数字；转发退役 2026-10-03） */
const numFmt = (/** @type {number} */ n) => (n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n));
const heatRow = (/** @type {import('../api.js').AlbumCard} */ a) => `
  <div class="heat">
    <span>${ICON_EYE}${numFmt(a.stats.views)}</span><span>${ICON_HEART}${numFmt(a.stats.likes)}</span>
  </div>`;

/**
 * @param {AlbumStyle} style
 */
export function styleList(style) {
  /**
   * @param {HTMLElement} el
   */
  return async (el) => {
    const head = /** @type {typeof HEADS[keyof typeof HEADS]} */ (
      (/** @type {Record<string, unknown>} */ (HEADS))[style] || HEADS.western);
    /** @type {import('../api.js').AlbumCard[]} */
    let albums;
    try {
      albums = await getAlbumsByStyle(style);
    } catch {
      /* 404 = 系列在后台被禁用（enabled=0），与「尚无册目」区分 */
      el.innerHTML = `<div class="stub"><h1>系列暂未开放</h1><a class="back" href="/collection">返回系列</a></div>`;
      return { title: `${head.cnsub} · 茉與妝 MO·BEAUTÉ` };
    }
    if (albums.length === 0) {
      el.innerHTML = `<div class="stub"><h1>尚无册目</h1><p>后台发布后这里会出现册列表</p><a class="back" href="/collection">返回系列</a></div>`;
      return { title: `${head.cnsub} · 茉與妝 MO·BEAUTÉ` };
    }

    el.innerHTML = `
      <header class="the-head">
        <div class="row">
          <a class="back" href="${head.back}" aria-label="返回系列" style="font-size:19px;color:var(--muted)">←</a>
          ${style === 'chinese' ? '<span class="seal-mini">妍</span>' : '<span class="en">Albums</span>'}
        </div>
        <div class="cd">${head.cd}</div>
        <div class="hrjade">
          <i class="${style === 'western' ? '' : 'gold'}"></i>
          <i class="gold" style="width:18px"></i>
          <span class="cn" style="font-size:10.5px;letter-spacing:.24em;color:var(--muted)">${head.cnsub}</span>
        </div>
        <div class="en" style="margin-top:6px">${head.en}</div>
      </header>

      ${albums.map((a) => `
        <a class="book reveal" href="/album/${a.slug}">
          <div class="ph ${style === 'chinese' ? 'dframe' : ''}">
            <img src="${a.coverKey}" alt="${a.titleCn}" loading="lazy" />
            <div class="veil"></div>
            <span class="num">${a.ordinalLabel}</span>
          </div>
          <div class="bmeta">
            <span class="cd" style="letter-spacing:.16em">${a.makeupCn || `${a.photoCount} 张 · 全程记录`}</span>
            <span class="en">${a.titleEn}</span>
          </div>
          ${heatRow(a)}
          <div class="hair"></div>
        </a>`).join('')}

      <a class="ab-foot" href="/collection">
        <span><span class="cd">回到系列</span><br/><span class="en">Collections</span></span>
        <span class="arw">→</span>
      </a>
    `;
  };
}
