/* ============================================================
 * collection.js —— 02 系列页（接 GET /api/collections；V7 屏1）
 * 上半：婚礼双封面（western/chinese，sort 保证西式在前）；
 * 下半：「更多时刻」——V7 三新系列玻璃横卡（订婚宴/孕妈/亲子）。
 * ============================================================ */
// @ts-check

import { getCollections, getAlbumsByStyle } from '../api.js';

/** @typedef {import('../api.js').AlbumStyle} AlbumStyle */

const WEDDING_STYLES = /** @type {const} */ (['western', 'chinese']);

/**
 * 双封面卡（婚礼系列大图入口）—— collection 与 wedding 两页共用
 * 中文/英文描述独立显隐（showTagCn/showTagEn，admin 配置）；两行按需拼接
 * @param {import('../api.js').Collection} c
 * @param {number} count 该系列册数
 */
export const coverCard = (c, count) => {
  const tagLines = [];
  if (c.showTagCn !== false) tagLines.push(`<span class="cd">${c.taglineCn}</span>`);
  if (c.showTagEn !== false) {
    tagLines.push(`<span class="en" style="color:rgba(255,255,255,.82)">${c.taglineEn}</span>`);
  }
  return `
  <a class="cover reveal" href="/style/${c.style}">
    <img src="${c.coverKey}" alt="${c.bigCn}" />
    <span class="tint"></span>
    ${c.showBig === false ? '' : `<span class="big">${c.bigCn}</span>`}
    <span class="glass vslip">${c.vslipCn}</span>
    <span class="strips">${c.strips.map((k) =>
      `<i style="background-image:url(${k})"></i>`).join('')}</span>
    <span class="foot">
      ${tagLines.length ? `<span>${tagLines.join('<br/>')}</span>` : ''}
      <span class="glass go" aria-hidden="true">→</span>
    </span>
  </a>
  <div class="cmeta"><span>共 ${count} 册</span></div>`;
};

/** 更多时刻入口缩略图（demo 资产；M7 换真图）。engagement 稿定 w-b（婚礼次封面） */
const THUMB_BY_STYLE = /** @type {Record<string, string>} */ ({
  engagement: '/img/w-b.png',
  maternity: '/img/portrait.png',
  family: '/img/family.png',
});

/**
 * @param {HTMLElement} el
 */
export async function collection(el) {
  el.innerHTML = `<div class="ihead"><span class="cd" style="opacity:.35">…</span></div>`;

  const cols = await getCollections().catch(() => []);
  const wedding = cols.filter((c) => WEDDING_STYLES.includes(c.style));
  const more = cols.filter((c) => !WEDDING_STYLES.includes(c.style));

  // 双封面册数 + 更多时刻各系列册数（并行拉取）
  const [we, cn, ...moreCounts] = await Promise.all([
    getAlbumsByStyle('western').catch(() => []),
    getAlbumsByStyle('chinese').catch(() => []),
    ...more.map((c) => getAlbumsByStyle(c.style).catch(() => [])),
  ]);
  /** @type {Record<string, number>} */
  const counts = { western: we.length, chinese: cn.length };
  more.forEach((c, i) => { counts[c.style] = (moreCounts[i] || []).length; });

  el.innerHTML = `
    <header class="ihead">
      <div class="cd">你的美，由你定义</div>
      <div class="en" style="margin-top:8px">DEFINE YOUR BEAUTY</div>
      <div class="cnsub">每种时刻 · 各成一册</div>
    </header>
    ${wedding.map((c) => coverCard(c, counts[c.style] || 0)).join('')}

    ${more.length > 0 ? `
    <div class="sec-head more-head">
      <div><span class="en">More Moments</span><span class="cd">更多时刻</span></div>
    </div>
    <nav class="secs" aria-label="更多时刻">
      ${more.map((c, i) => `
      <a class="row glass light reveal" href="/style/${c.style}">
        <span class="scrim"></span>
        <img src="${THUMB_BY_STYLE[c.style] || '/img/hero.png'}" alt="" loading="lazy" />
        <span class="m">
          <span class="cd">${c.bigCn}</span>
          <span class="en">${c.taglineEn}</span>
          <span class="n">${counts[c.style] || 0} 册 · ${c.taglineCn}</span>
        </span>
        <span class="arw" aria-hidden="true">→</span>
      </a>`).join('')}
    </nav>` : ''}

    <div class="cue" style="margin-top:26px"><i></i><em>SCROLL</em></div>
  `;
}
