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
      <div class="portrait reveal"><img src="${s?.portraitKey || '/img/portrait.webp'}" alt="化妆师肖像" /></div>
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
          ? `<img class="qc" src="${s.qrcodeKey}" alt="微信二维码"
               onerror="this.outerHTML='&lt;div class=&quot;qb&quot;&gt;微信二维码&lt;br/&gt;待替换&lt;/div&gt;'" />`
          : `<div class="qb">微信二维码<br/>待替换</div>`}
        <p class="hint">扫码或搜索添加 · 沟通档期与试妆</p>
        <div class="clines">
          <p class="cline">
            <span>微信 ${s?.wechatId || '—'}</span>
            <button class="ic cp" type="button" id="cp" aria-label="复制微信号">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9.2 3.6h8.3a2.9 2.9 0 0 1 2.9 2.9v8.3a.7.7 0 0 1-1.2.5l-1.6-1.6a.7.7 0 0 1-.2-.5V7.2a1 1 0 0 0-1-1H9.2a.7.7 0 0 1-.7-.7V4.3a.7.7 0 0 1 .7-.7z"/>
                <path d="M6.5 7.7a2.9 2.9 0 0 1 2.9 2.9v7.8a1 1 0 0 0 1 1h7.5a.7.7 0 0 1 .7.7v.6a.7.7 0 0 1-.7.7H8.4a2.9 2.9 0 0 1-2.9-2.9v-9.1a1.6 1.6 0 0 1 1-1.7z"/>
              </svg>
            </button>
            <em class="cfb" id="cfb" aria-live="polite"></em>
          </p>
          ${s?.contactPhone ? `<p class="cline">
            <span>电话 ${s.contactPhone}</span>
            <a class="ic" href="tel:${s.contactPhone}" aria-label="拨打 ${s.contactPhone}">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.7.7.5 0 .9.4.9.9v3.5c0 .5-.4.9-.9.9A17.6 17.6 0 0 1 3.1 3.1c0-.5.4-.9.9-.9h3.5c.5 0 .9.4.9.9 0 1.3.3 2.5.7 3.7.1.4 0 .7-.2 1l-2.3 2.2z"/>
              </svg>
            </a>
          </p>` : ''}
        </div>
      </div>
    </div>
  `;

  // 复制微信号：行尾小图标（转化路径 = 加微信，不做在线表单）
  // 微信 X5（http 非安全上下文）navigator.clipboard 不可用 → execCommand fallback
  const copyText = (t) => {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(t).then(() => true, () => legacyCopy(t));
    }
    return Promise.resolve(legacyCopy(t));
  };
  const legacyCopy = (t) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };
  const cfb = /** @type {HTMLElement | null} */ (el.querySelector('#cfb'));
  const cp = /** @type {HTMLButtonElement | null} */ (el.querySelector('#cp'));
  if (cp && cfb && s?.wechatId) {
    let timer = 0;
    cp.addEventListener('click', () => {
      copyText(s.wechatId || '').then((ok) => {
        cfb.textContent = ok ? '已复制' : '请长按选择';
        cfb.classList.add('on');
        clearTimeout(timer);
        timer = window.setTimeout(() => cfb.classList.remove('on'), 2000);
      });
    });
  } else if (cp) {
    cp.setAttribute('disabled', 'disabled');
  }
}
