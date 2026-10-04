/* ============================================================
 * api.ts —— admin fetch 封装：token 注入 + 401 处理
 * token 存 localStorage（mua.token），401 时清掉并广播给 App 切登录页
 * ============================================================ */

const TOKEN_KEY = 'mua.token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(t: string): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/** 401 回调由 App.vue 注册（切回登录页） */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  const tk = getToken();
  if (tk) headers.Authorization = `Bearer ${tk}`;
  if (init.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    /* 登录接口的 401 = 凭据错误，透传服务端文案（不清 token、不广播过期）；
       其余 401 = 登录态过期，清 token 并踢回登录页（Layout 注册的 handler） */
    let msg = '登录已过期';
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* 非 JSON 响应体 */ }
    if (!path.startsWith('/api/admin/login')) {
      setToken('');
      onUnauthorized?.();
    }
    throw new ApiError(401, msg);
  }
  if (!res.ok) {
    let msg = `请求失败 ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string; ok?: boolean };
      if (j.error) msg = j.error;
    } catch { /* 非 JSON 响应体 */ }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: async (file: File): Promise<{ ok: boolean; key: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await request<{ ok: boolean; key: string }>('/api/admin/upload', {
      method: 'POST',
      body: fd,
    });
    return res;
  },
  /** 视频上传（018：首页视频位，≤200MB，走独立接口流式落盘） */
  uploadVideo: async (file: File): Promise<{
    ok: boolean; key: string; posterKey: string | null; converted: boolean;
    probe?: { codec: string; width: number; height: number; duration: number };
  }> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await request<{
      ok: boolean; key: string; posterKey: string | null; converted: boolean;
      probe?: { codec: string; width: number; height: number; duration: number };
    }>('/api/admin/upload-video', {
      method: 'POST',
      body: fd,
    });
    return res;
  },
};

/* ---------- admin 数据类型（镜像 server/src/admin.ts 返回体） ---------- */

export interface AlbumStats {
  views: number;
  likes: number;
}

export interface AdminAlbum {
  id: number;
  slug: string;
  titleCn: string;
  titleEn: string;
  style: string;
  category: string;
  layout: string;
  ordinalLabel: string;
  coverKey: string;
  coverLenRatio: number;
  makeupCn: string | null;
  sort: number;
  published: boolean;
  photoCount: number;
  stats: AlbumStats;
}

export interface AdminPhoto {
  id: number;
  cosKey: string;
  w: number;
  h: number;
  ratio: number;
  orientation: string;
  captionCn: string | null;
  sort: number;
}

export interface AdminSection {
  id: number;
  kind: string;
  /** 段落类型名（section_kind 配置表）—— 与 titleCn（可覆写的段名）不同 */
  kindNameCn?: string;
  titleCn: string;
  titleEn: string;
  descCn: string | null;
  layout: string;
  sort: number;
  photos: AdminPhoto[];
}

/** 段落类型配置（section_kind）——名称可配；**style 严格限死、只读不可改** */
export interface SectionKindConfig {
  code: string;
  nameCn: string;
  /** 段落类型英文名 —— **仅后台可见，前台不展示**（2026-10-03 用户拍板「字段留着，前台暂时不展示」）。
   *  前台所有英文文案取段自己的 titleEn；后端仍会下发 kindNameEn，但 site/ 零消费。
   *  字段保留供后台辨识与后续使用，改它不会影响前台。 */
  nameEn: string;
  /** shot 单图段落 / off 单张右偏 / grid 多图拼版 / flat 瀑布流 */
  style: 'shot' | 'off' | 'grid' | 'flat';
  sort: number;
  isFlat: boolean;
  /** 能否**新建**该类型段落（2026-10-03 由 enabled 改名 selectable，迁移 019）。
   *  ⚠️ 只管「下拉里提不提供新建」，**不管前台显不显示**：
   *     0 = 后台不再提供新建；已有段落在前台照常显示，public 接口零变化。 */
  selectable: boolean;
  /** 被多少个段落引用（album_section 中 kind=code 的行数）—— 仅用于停用风险提示 */
  refCount: number;
}

export interface AdminAlbumDetail extends AdminAlbum {
  sections: AdminSection[];
}

export interface AdminCollection {
  id: number;
  slug: string;
  style: string;
  bigCn: string;
  taglineCn: string;
  taglineEn: string;
  vslipCn: string;
  /** 卡片左上角标题显隐 */
  showBig: boolean;
  /** 卡片左下角中文描述显隐 */
  showTagCn: boolean;
  /** 卡片左下角英文描述显隐 */
  showTagEn: boolean;
  /** 启用/禁用（禁用后前台整体隐藏） */
  enabled: boolean;
  coverKey: string;
  strips: string[];
  sort: number;
}

export interface AdminStatsRow {
  id: number;
  slug: string;
  titleCn: string;
  style: string;
  published: boolean;
  stats: AlbumStats;
}

export interface AdminSite {
  brandCn: string;
  brandEn: string;
  taglineCn: string;
  subCn: string;
  subLongCn: string;
  bylineCn: string;
  bioCn: string | null;
  statsJson: { label: string; value: string }[];
  flowJson: { step: string; title: string }[];
  marqueeJson: string[];
  heroKey: string | null;
  heroTagCn: string | null;
  wechatId: string | null;
  contactPhone: string | null;
  qrcodeKey: string | null;
  ogImageKey: string | null;
  portraitKey: string | null;
  /** 018 建列；020 扩双位、021 扩五位（video2~5*；null = 该位占位态）；022 加宽高时长 */
  videoKey: string | null;
  videoPosterKey: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoDuration: number | null;
  video2Key: string | null;
  video2PosterKey: string | null;
  video2Width: number | null;
  video2Height: number | null;
  video2Duration: number | null;
  video3Key: string | null;
  video3PosterKey: string | null;
  video3Width: number | null;
  video3Height: number | null;
  video3Duration: number | null;
  video4Key: string | null;
  video4PosterKey: string | null;
  video4Width: number | null;
  video4Height: number | null;
  video4Duration: number | null;
  video5Key: string | null;
  video5PosterKey: string | null;
  video5Width: number | null;
  video5Height: number | null;
  video5Duration: number | null;
}

/** 首页精选单图（home_featured，≤20 张；018 建表，020 放宽上限） */
export interface FeaturedAdmin {
  cosKey: string;
  w: number;
  h: number;
  ratio: number;
  orientation: string;
  /** 预留列：输入已禁用（2026-10-03 拍板），保存时透传 */
  captionCn: string | null;
  captionEn: string | null;
}
