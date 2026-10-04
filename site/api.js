/* ============================================================
 * api.js —— fetch 封装 + JSDoc 类型（与 server/src/types.ts 保持镜像）
 * 约定：同源 /api（生产由 Nginx 反代；本地由根目录 dev.js 代理到 8082）。
 * ============================================================ */
// @ts-check

/**
 * @typedef {Object} Health
 * @property {boolean} ok
 * @property {string}  service
 * @property {string}  version
 * @property {string}  time
 * @property {boolean} db
 */

/** @typedef {'western'|'chinese'|'engagement'|'maternity'|'family'} AlbumStyle */
/** @typedef {'wedding'|'engagement'|'maternity'|'family'} AlbumCategory */
/** @typedef {'morning'|'outdoor'|'welcome'|'ceremony'|'toast'|'face'|'headdress'|'flat'} SectionKind */
/** @typedef {Object} AlbumStats
 *  @property {number} views
 *  @property {number} likes
 */

/** @typedef {Object} Photo
 *  @property {number} id
 *  @property {number} sectionId
 *  @property {string} cosKey
 *  @property {number} w
 *  @property {number} h
 *  @property {number} ratio
 *  @property {'portrait'|'landscape'} orientation
 *  @property {string|null} captionCn
 *  @property {string|null} captionEn
 *  @property {number} sort
 */

/** @typedef {Object} AlbumSection
 *  @property {number} id
 *  @property {number} albumId
 *  @property {SectionKind} kind
 *  @property {string} kindNameCn 段落类型名（section_kind 配置表，后台可改；取不到回落 titleCn）
 * @property {string} kindNameEn 段落类型英文名（section_kind.name_en）。
 *   ⚠️ **前台暂不消费**（2026-10-03 用户拍板「字段留着，前台暂时不展示」）：
 *   后端照常下发，但 site/ 零引用；前台所有英文文案走的是段自己的 titleEn。
 *   若将来要让类型英文名上前台，须改用「段名优先、类型名兜底」的口径，别直接顶替 titleEn。
 *  @property {string} titleCn
 *  @property {string} titleEn
 *  @property {string|null} descCn
 *  @property {string|null} descEn
 *  @property {string} layout
 *  @property {number} maxVisible
 *  @property {number} sort
 *  @property {Photo[]} photos
 */

/** @typedef {Object} Album
 *  @property {number} id
 *  @property {string} slug
 *  @property {string} titleCn
 *  @property {string} titleEn
 *  @property {AlbumStyle} style
 *  @property {AlbumCategory} category
 *  @property {'sectioned'|'flat'} layout
 *  @property {string} ordinalLabel
 *  @property {string} coverKey
 *  @property {number} coverLenRatio
 *  @property {number} sort
 *  @property {boolean} published
 *  @property {string|null} videoKey
 *  @property {string|null} videoPosterKey
 *  @property {number|null} videoDuration
 *  @property {AlbumStats} stats
 *  @property {AlbumSection[]} sections
 */

/** @typedef {Object} AlbumCard
 *  @property {string} slug
 *  @property {string} titleCn
 *  @property {string} titleEn
 *  @property {AlbumStyle} style
 *  @property {AlbumCategory} category
 *  @property {'sectioned'|'flat'} layout
 *  @property {string} ordinalLabel
 *  @property {string} coverKey
 *  @property {number} coverLenRatio
 *  @property {number} photoCount
 *  @property {AlbumStats} stats
 *  @property {string[]} previewKeys
 */

/** @typedef {Object} Collection
 *  @property {number} id
 *  @property {string} slug
 *  @property {AlbumStyle} style
 *  @property {string} bigCn
 *  @property {string} taglineCn
 *  @property {string} taglineEn
 *  @property {string} vslipCn
 *  @property {string} coverKey
 *  @property {boolean} [showBig] 卡片左上角标题显隐（admin 配置）
 *  @property {boolean} [showTagCn] 卡片左下角中文描述显隐（admin 配置）
 *  @property {boolean} [showTagEn] 卡片左下角英文描述显隐（admin 配置）
 *  @property {string[]} strips
 *  @property {number} sort
 */

/** @typedef {Object} Gallery
 *  @property {number} id
 *  @property {string} slug
 *  @property {string} titleCn
 *  @property {string} titleEn
 *  @property {string|null} descCn
 *  @property {Photo[]} photos
 */

/** @typedef {Object} HomeEntry
 *  @property {AlbumCategory} key
 *  @property {string} titleCn
 *  @property {string} titleEn
 *  @property {string} href
 *  @property {string} descCn
 */

/** @typedef {Object} FeaturedItem 首页精选单图（home_featured，≤20 张）
 *  @property {string} cosKey
 *  @property {number} w
 *  @property {number} h
 *  @property {number} ratio
 *  @property {'portrait'|'landscape'} orientation
 *  @property {string|null} captionCn 预留列：前台暂禁用展示
 *  @property {string|null} captionEn
 */

/** @typedef {Object} HomeVideo 首页视频（≤5 个；0 个 = 前台占位态）
 *  @property {string} key
 *  @property {string|null} posterKey
 *  @property {number|null} w 022 起：真实宽，首帧即按真实比例渲染；null 时退回元数据兜底
 *  @property {number|null} h
 *  @property {number|null} duration
 */

/** @typedef {Object} HomePayload
 *  @property {string|null} heroKey
 *  @property {string|null} heroTagCn
 *  @property {string[]} marquee
 *  @property {HomeEntry[]} entries
 *  @property {{nameCn: string, roleCn: string}} byline
 *  @property {string} taglineCn
 *  @property {FeaturedItem[]} featured 精选瀑布流（0 张 = 前台整块隐藏）
 *  @property {HomeVideo[]} videos
 */

/** @typedef {Object} SiteSettings
 *  @property {string} brandCn
 *  @property {string} brandEn
 *  @property {string} taglineCn
 *  @property {string} subCn
 *  @property {string} subLongCn
 *  @property {string} bylineCn
 *  @property {string|null} bioCn
 *  @property {{labelCn: string, value: string}[]} stats
 *  @property {{step: string, titleCn: string}[]} flowSteps
 *  @property {string|null} wechatId
 *  @property {string|null} qrcodeKey
 *  @property {string|null} ogImageKey
 */

/** 六段枚举（build-plan §03「唯一权威」）：
 *  morning 晨袍 · outdoor 出门 · ceremony 仪式主纱 · toast 敬酒 · face 面部细节 · headdress 头饰造型 */
export const SECTION_KINDS = /** @type {const} */ ([
  'morning', 'outdoor', 'ceremony', 'toast', 'face', 'headdress',
]);

const BASE = '/api';

/**
 * @param {string} path  以 / 开头的 API 路径
 * @returns {Promise<unknown>}
 */
export async function getJSON(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(BASE + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`API ${res.status} · ${path}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<Health | null>} 拉不到返回 null（API 未起不该阻塞页面） */
export async function getHealth() {
  try {
    return /** @type {Health} */ (await getJSON('/health'));
  } catch {
    return null;
  }
}

/** @returns {Promise<HomePayload>} GET /api/home */
export function getHome() {
  return /** @type {Promise<HomePayload>} */ (getJSON('/home'));
}

/** @returns {Promise<Collection[]>} GET /api/collections（西式在前） */
export function getCollections() {
  return /** @type {Promise<Collection[]>} */ (getJSON('/collections'));
}

/**
 * @param {AlbumStyle} style
 * @returns {Promise<AlbumCard[]>} GET /api/albums?style=
 */
export function getAlbumsByStyle(style) {
  return /** @type {Promise<AlbumCard[]>} */ (getJSON(`/albums?style=${style}`));
}

/**
 * @param {string} slug
 * @returns {Promise<Album>} GET /api/albums/:slug（一次给全六段）
 */
export function getAlbum(slug) {
  return /** @type {Promise<Album>} */ (getJSON(`/albums/${encodeURIComponent(slug)}`));
}

/**
 * 互动计数上报（V7）。浏览按会话去重由调用方控制 type；转发已退役（2026-10-03）。
 * @param {string} slug
 * @param {'view'|'like'} type
 * @returns {Promise<{ok: boolean, stats: AlbumStats}>}
 */
export async function postStats(slug, type) {
  const res = await fetch(`${BASE}/albums/${encodeURIComponent(slug)}/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return /** @type {{ok: boolean, stats: AlbumStats}} */ (await res.json());
}

/**
 * @param {string} slug
 * @returns {Promise<Gallery>} GET /api/galleries/:slug
 */
export function getGallery(slug) {
  return /** @type {Promise<Gallery>} */ (getJSON(`/galleries/${encodeURIComponent(slug)}`));
}

/** @returns {Promise<SiteSettings>} GET /api/site */
export function getSite() {
  return /** @type {Promise<SiteSettings>} */ (getJSON('/site'));
}
