/* ============================================================
 * interact.js —— V7 相册互动：浏览 / 点赞（design-v7 屏4）
 * 口径（2026-10-02 拍板，2026-10-03 修订）：
 *   浏览：进入册详情时上报 view，sessionStorage 会话去重（同会话同册只计 1）
 *   点赞：**不可逆累加**——重复点击继续 +1，无 unlike；已赞点亮态
 *         localStorage 记忆（仅作 UI 点亮，不代表可取消）
 *   转发：**整体退役（2026-10-03）**——微信 H5 无 JS API 可调起转发，
 *         JS-SDK 自定义卡片需认证服务号 + 备案域名 + 签名，短期不可得，
 *         计数失去真实语义；shareAlbum / 降级面板 / stats share 已全链路摘除
 *   KPI 同步：所有上报的响应都携带服务端最新两计数（views/likes），
 *         前端以响应值为准回写全部展示位（server-authoritative，防并发漂移）
 * ============================================================ */
// @ts-check

import { postStats } from '../api.js';

const LIKE_KEY = 'mua.liked';       // JSON: { [slug]: 1 } —— 点亮态记忆
const VIEW_KEY = 'mua.viewed';      // JSON: { [slug]: 1 }（sessionStorage）

/** @param {Storage} store @param {string} key */
const readMap = (store, key) => {
  try { return JSON.parse(store.getItem(key) || '{}'); } catch { return {}; }
};

/**
 * @param {string} slug
 * @returns {boolean}
 */
export function isLiked(slug) {
  return Boolean(readMap(localStorage, LIKE_KEY)[slug]);
}

/**
 * 点赞（不可逆）：每次点击 +1，无取消。计数以服务端响应的最新值为准。
 * @param {string} slug
 * @param {HTMLElement} countEl 数字徽标（可选，响应回写）
 * @returns {Promise<import('../api.js').AlbumStats | null>} 最新两计数；失败 null
 */
export async function likeAlbum(slug, countEl) {
  try {
    const { stats } = await postStats(slug, 'like');
    const map = readMap(localStorage, LIKE_KEY);
    map[slug] = 1;
    localStorage.setItem(LIKE_KEY, JSON.stringify(map));
    if (countEl) countEl.textContent = String(stats.likes);
    return stats;
  } catch {
    return null; // 上报失败：UI 不动，点亮态等成功后再记忆
  }
}

/**
 * 浏览计数：每会话每册只报一次；上报成功后把最新计数回传给调用方刷 UI。
 * @param {string} slug
 * @returns {Promise<import('../api.js').AlbumStats | null>}
 */
export async function trackView(slug) {
  const seen = readMap(sessionStorage, VIEW_KEY);
  if (seen[slug]) return null;
  seen[slug] = 1;
  sessionStorage.setItem(VIEW_KEY, JSON.stringify(seen));
  try {
    const { stats } = await postStats(slug, 'view');
    return stats;
  } catch {
    return null;
  }
}
