/* ============================================================
 * dock.js —— 贴底玻璃 Dock：全路由常驻（H5 App 风格，主导航任何页面都在；
 * 暗房查看器 z 220 / 分享面板 z 120 均在其上，互不干扰）
 * ============================================================ */
// @ts-check

import { symbolSVG } from './brandMark.js';
import { currentRoute } from '../router.js';

/** Dock 三项（2026-10-03：关于页更名「联系」，dock 收为 首页/作品/联系） */
const ITEMS = /** @type {const} */ ([
  { href: '/',           label: '首页', icon: 'ring',   nav: 'home'  },
  { href: '/collection', label: '作品', icon: 'book',   nav: 'work'  },
  { href: '/about',      label: '联系', icon: 'wechat', nav: 'about' },
]);

const ICONS = {
  ring:   symbolSVG(),
  book:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M10 3v14"/></svg>',
  about:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="10" cy="7" r="3"/><path d="M4 17c1.2-3 3.4-4.4 6-4.4S14.8 14 16 17"/></svg>',
  wechat: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 5h9v7H8l-3 2.5V12H4z"/><path d="M13 8h3v6h-1.5v2L12 14"/></svg>',
};

/**
 * @param {HTMLElement | null} host
 */
export function mountDock(host) {
  if (!host) return;

  const paint = () => {
    // 高亮归属 = 当前命中路由的 nav 字段（作品域：/collection /wedding /style/* /album/* /gallery/* 全部保持「作品」亮）
    const nav = (currentRoute() || {}).nav || null;
    host.innerHTML = `
      <nav class="dock glass" aria-label="主导航"><ul>
        ${ITEMS.map((it) => {
          const active = nav === it.nav;
          return `<li><a href="${it.href}" ${active ? 'aria-current="page"' : ''}>
            ${ICONS[it.icon] || ''}<b>${it.label}</b></a></li>`;
        }).join('')}
      </ul></nav>`;
  };

  paint();
  document.addEventListener('route:change', paint);
}
