/* ============================================================
 * about.js —— 10 联系 · 预约（路由 /about；2026-10-03 由「关于」更名）
 * 品牌文案全部来自配置；CTA 一期 = 展示微信号 + 二维码（已拍板）。
 * ============================================================ */
// @ts-check

import { getSite } from '../api.js';

/** 关于页完整字标（内联 SVG，继承 currentColor；三字等大 · 呼吸感字距 = Logo 资产口径） */
const WORDMARK = `
<svg viewBox="0 0 240 100" aria-label="茉與妝 MO·BEAUTÉ">
  <g transform="translate(4,26) scale(0.75)" fill="none">
    <g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(0 32 32)"/>
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(72 32 32)"/>
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(144 32 32)"/>
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(216 32 32)"/>
      <ellipse cx="32" cy="18.5" rx="6.5" ry="11" transform="rotate(288 32 32)"/>
    </g>
    <circle cx="32" cy="32" r="3.4" fill="currentColor" stroke="none"/>
  </g>
  <line x1="63" y1="26" x2="63" y2="74" stroke="currentColor" stroke-width="0.7" opacity="0.22"/>
  <text font-family="Noto Serif SC,serif" font-weight="200" fill="currentColor">
    <tspan x="76" y="58" font-size="33">茉</tspan>
    <tspan x="121" y="58" font-size="33">與</tspan>
    <tspan x="167" y="58" font-size="33" fill="var(--accent)">妝</tspan>
  </text>
  <circle cx="85" cy="68.6" r="1.7" fill="var(--gold)"/>
  <line x1="90" y1="68.6" x2="198" y2="68.6" stroke="var(--gold)" stroke-width="0.9" stroke-linecap="round"/>
  <text x="85" y="86" font-size="8.6" letter-spacing="3.5" fill="currentColor" opacity="0.74"
        font-family="Bodoni Moda,Georgia,serif">MO·BEAUTÉ</text>
</svg>`;

/**
 * @param {HTMLElement} el
 */
export async function about(el) {
  el.innerHTML = `<div class="ihead"><span class="cd" style="opacity:.35">…</span></div>`;
  const s = await getSite().catch(() => null);

  const statsHtml = (s?.stats || []).map((x) =>
    `<div><b>${x.value}</b><span>${x.labelCn}</span></div>`).join('');
  const stepsHtml = (s?.flowSteps || []).map((x) =>
    `<span class="glass light">${x.titleCn}</span>`).join('');

  el.innerHTML = `
    <header class="ihead">
      <div class="cd">联系${s?.byline?.nameCn || '甜茉'}</div>
      <div class="en" style="margin-top:8px">Contact</div>
      <div class="cnsub">沟通档期 · 试妆 · 报价</div>
    </header>
    <div class="ab">
      <div class="portrait reveal"><img src="/img/portrait.webp" alt="化妆师肖像" /></div>
      <div class="name cd reveal">化妆师 ${s?.byline?.nameCn || '甜茉'}</div>
      <div class="role">${s?.subLongCn || ''}</div>
      ${s?.bioCn ? `<div class="bio">${s.bioCn}</div>` : ''}
      ${statsHtml ? `<div class="stats glass light"><span class="scrim"></span>${statsHtml}</div>` : ''}
      ${stepsHtml ? `<div class="steps">${stepsHtml}</div>` : ''}

      <div class="brandblk">
        <span class="lgmark">${WORDMARK}</span>
        <div class="sub2">${s?.subCn || '婚礼 与 日常'}</div>
        <div class="sub2en">Bridal &amp; Daily</div>
        <span class="hairline"></span>
        <div class="cn" style="font-size:11px;letter-spacing:.22em;color:var(--muted)">${s?.taglineCn || ''}</div>
      </div>

      <div class="qrb glass reveal" id="contact">
        <span class="scrim"></span>
        ${s?.qrcodeKey
          ? `<img class="qc" src="${s.qrcodeKey}" alt="微信二维码" />`
          : `<div class="qb">微信二维码<br/>待替换</div>`}
        <p>微信号 ${s?.wechatId || '—'} · 扫码或搜索添加 · 沟通档期与试妆</p>
      </div>

      <button class="cta glass" id="cta" type="button">
        <span class="scrim"></span>复制微信号<em>Book Now</em>
      </button>
    </div>
  `;

  // CTA：复制微信号（一期转化路径 = 加微信，不做在线表单）
  const cta = /** @type {HTMLButtonElement | null} */ (el.querySelector('#cta'));
  if (cta && s?.wechatId) {
    cta.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(s.wechatId || '');
        cta.innerHTML = '<span class="scrim"></span>已复制 · 去微信粘贴<em>Copied</em>';
      } catch {
        cta.innerHTML = `<span class="scrim"></span>微信号 ${s.wechatId}<em>Manual</em>`;
      }
      setTimeout(() => {
        if (cta) cta.innerHTML = '<span class="scrim"></span>复制微信号<em>Book Now</em>';
      }, 2400);
    });
  }
}
