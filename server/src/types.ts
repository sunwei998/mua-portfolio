/* ============================================================
 * types.ts —— API 契约（唯一权威）。admin 后台直接 import type 复用。
 * 数据模型 8 表的 TS 镜像，字段口径 = build-plan §03。
 * M2 建库、M3 出接口时以此为准；改字段先改这里。
 * ============================================================ */

/**
 * 风格维度。V7 起扩为五值：western/chinese 走双封面六段叙事；
 * engagement/maternity/family 为「更多时刻」系列（flat 瀑布流，不分中西式）。
 */
export type AlbumStyle = 'western' | 'chinese' | 'engagement' | 'maternity' | 'family';

/** 系列维度：wedding 进双封面，其余各成系列（V7：三新系列改走 flat 册） */
export type AlbumCategory = 'wedding' | 'engagement' | 'maternity' | 'family';

/**
 * 六段枚举 —— 唯一权威（build-plan §03「取值域」）。
 * 注意：没有「迎宾」。已拍板删除（2026-10-02 #2）。
 * 西式婚礼与新中式婚礼共用同一套 kind，差异只在标题文案与皮肤（Ⅰ–Ⅵ / 壹–陆）。
 */
export type SectionKind =
  | 'morning'     // 晨袍 Morning Robe
  | 'outdoor'     // 出门 Out the Door
  | 'welcome'     // 迎宾 Welcome（2026-10-03 用户新增，迁移 014）
  | 'ceremony'    // 主纱 Ceremony（不是「礼仪主纱」）
  | 'toast'       // 敬酒 The Toast
  | 'face'        // 面部 Face（1–N 张）
  | 'headdress'   // 头饰 Headdress（1–N 张）
  | 'flat';       // V7：flat 册的照片挂载段（一册一段，不参与六段叙事）

/** 段落类型的**展示风格** —— 严格限死，后台只读不可改（用户 2026-10-03 拍板）。
 *  shot —— 单图段落版式（1 full / 2 duo / ≥3 首图 full + 两两 duo）
 *  off  —— 单张时右偏 66%（仅 toast 沿用既有设计）
 *  grid —— 多图拼版（1 moon / 2-4 双列 / ≥5 横滑）
 *  flat —— 瀑布流挂载段（无章节头，直接进双列流） */
export type SectionStyle = 'shot' | 'off' | 'grid' | 'flat';

/** 段落类型配置（section_kind 表）——名称可配，风格限死 */
export interface SectionKindConfig {
  code: string;
  nameCn: string;
  nameEn: string;
  style: SectionStyle;
  sort: number;
  isFlat: boolean;
  /** 能否**新建**该类型段落（2026-10-03 由 enabled 改名 selectable，迁移 018）。
   *  ⚠️ 纯「可选择性」语义，**与前台展示无关**：
   *     0 = 后台下拉不再提供新建；已有段落照常显示，public.ts 对本字段零引用。
   *     刻意不叫 enabled/disabled —— 那两个名字会被误读成「前台隐藏」。 */
  selectable: boolean;
  /** 当前被多少个段落引用（`album_section` 里 kind=code 的行数）——
   *  给 admin 提示「停用会影响哪些既有内容」，纯展示用。 */
  refCount: number;
}

export const SECTION_ORDER: readonly SectionKind[] = [
  'morning', 'outdoor', 'welcome', 'ceremony', 'toast', 'face', 'headdress',
] as const;

/** 多图布局：auto 由 photoGrid 按张数与方向自动选型（build-plan §11 屏规则） */
export type SectionLayout = 'auto' | 'single' | 'duo' | 'grid' | 'strip';

export interface Photo {
  id: number;
  sectionId: number;
  /** COS 对象 key（M7 起拼 CDN base URL；一期为本地占位路径） */
  cosKey: string;
  w: number;
  h: number;
  /** w/h，如 0.667（2:3）、0.8（4:5）—— 上传时由前端写入，后端不做图像处理 */
  ratio: number;
  orientation: 'portrait' | 'landscape';
  captionCn: string | null;
  captionEn: string | null;
  sort: number;
}

export interface AlbumSection {
  id: number;
  albumId: number;
  kind: SectionKind;
  /** 段落类型名（section_kind.name_cn）—— 2026-10-03 起前台不再硬编码短名 */
  kindNameCn: string;
  /** 段落类型英文名（section_kind.name_en）—— **本字段暂为「只下发不使用」**：
   *  2026-10-03 用户拍板「字段留着，前台暂时不展示」，前台所有英文文案走 titleEn。
   *  保留下发是为了将来接通时不用改接口；⚠️ 但别以为前台在用它而据此删掉。 */
  kindNameEn: string;
  titleCn: string;
  titleEn: string;
  descCn: string | null;
  descEn: string | null;
  layout: SectionLayout;
  /** 布局 domBudget 红线（默认 6） */
  maxVisible: number;
  sort: number;
  photos: Photo[];
}

/** 互动计数（album_stats 1:1）——全站口径：浏览/点赞（转发退役 2026-10-03，迁移 011） */
export interface AlbumStats {
  views: number;
  likes: number;
}

export interface Album {
  id: number;
  slug: string;
  titleCn: string;
  titleEn: string;
  style: AlbumStyle;
  category: AlbumCategory;
  /** V7：sectioned = 六段叙事；flat = 瀑布流（更多时刻系列） */
  layout: 'sectioned' | 'flat';
  /** Ⅰ / 壹 —— 罗马数字与汉字序号由皮肤决定，值存基准序 */
  ordinalLabel: string;
  coverKey: string;
  /** 封面宽高比，默认 0.8（4:5） */
  coverLenRatio: number;
  sort: number;
  published: boolean;
  /** 一期只留字段不实现播放（单个 ≤90s、码率 ≤4Mbps、每册 0 或 1 个） */
  videoKey: string | null;
  videoPosterKey: string | null;
  videoDuration: number | null;
  stats: AlbumStats;
  sections: AlbumSection[];
}

/** 双封面（western/chinese）+ V7「更多时刻」系列注册表（engagement/maternity/family） */
export interface Collection {
  id: number;
  slug: string;
  style: AlbumStyle;
  bigCn: string;
  taglineCn: string;
  taglineEn: string;
  vslipCn: string;
  /** 卡片左上角标题显隐（2026-10-02 拍板：admin 可配置，默认显示） */
  showBig: boolean;
  /** 卡片左下角中文描述显隐（2026-10-02 拍板：admin 可配置，默认显示） */
  showTagCn: boolean;
  /** 卡片左下角英文描述显隐（默认显示） */
  showTagEn: boolean;
  coverKey: string;
  strips: string[];
  /** 该系列已发布册数（/api/collections 子查询直接下发，省掉前台逐系列计数的 N+1） */
  albumCount: number;
  sort: number;
}

/** 平铺图集：订婚宴 / 孕亲照。刻意与 album 解耦（它们没有六段） */
export interface Gallery {
  id: number;
  slug: string;
  titleCn: string;
  titleEn: string;
  descCn: string | null;
  photos: Photo[];
}

/** site_setting 单行 —— 品牌文案全部配置化，改文案不碰代码 */
export interface SiteSettings {
  brandCn: string;          // 予时妍
  brandEn: string;          // YUÉ ATELIER
  taglineCn: string;        // 为重要时刻，留一份美
  subCn: string;            // 婚礼 与 日常（字标副标，短版）
  subLongCn: string;        // 婚礼跟妆 · 订婚宴 · 孕亲照 · 日常妆（长版，仅 meta/关于页）
  bylineCn: string;         // 甜茉 · 化妆师个人作品集
  bioCn: string | null;
  stats: { labelCn: string; value: string }[];
  flowSteps: { step: string; titleCn: string }[];
  wechatId: string | null;
  contactPhone: string | null;
  qrcodeKey: string | null;
  ogImageKey: string | null;
  portraitKey: string | null;
}

/** GET /api/albums?style= 的列表卡 —— 册页列表层用，不背六段全量 */
export interface AlbumCard {
  slug: string;
  titleCn: string;
  titleEn: string;
  style: AlbumStyle;
  category: AlbumCategory;
  /** V7：sectioned | flat —— 列表卡按此决定进六段册还是瀑布流册 */
  layout: 'sectioned' | 'flat';
  /** Ⅰ / 壹 */
  ordinalLabel: string;
  coverKey: string;
  coverLenRatio: number;
  /** bmeta 左侧妆面描述（v6 03/04 屏「香槟裸妆 · 低盘发」）；未填时前台回退「N 张 · 全程记录」 */
  makeupCn: string | null;
  photoCount: number;
  /** V7：热度行（浏览/点赞） */
  stats: AlbumStats;
  /** 首图三连：前三段（晨袍/出门/仪式）各取第一张 */
  previewKeys: string[];
}

/** 首页系列入口 —— V7：wedding 进双封面，engagement/maternity/family 各成系列 */
export interface HomeEntry {
  key: AlbumCategory;
  titleCn: string;
  titleEn: string;
  href: string;
  descCn: string;
}

/** 首页精选单图（home_featured，≤20 张，独立于相册；018，上限 020 起放宽） */
export interface FeaturedItem {
  cosKey: string;
  w: number;
  h: number;
  ratio: number;
  orientation: 'portrait' | 'landscape';
  /** 预留列：前台暂禁用展示（2026-10-03 拍板），入库备用 */
  captionCn: string | null;
  captionEn: string | null;
}

/** 首页视频（site_setting.video_key/video_poster_key + video2~5_*；NULL 槽位剔除） */
export interface HomeVideo {
  key: string;
  posterKey: string | null;
  /** 022 起：上传时 ffprobe 落库并随接口下发，前台首帧即按真实比例渲染；
   *  null（老数据未回填）时前台退回 loadedmetadata 读元数据兜底 */
  w: number | null;
  h: number | null;
  duration: number | null;
}

/** GET /api/home —— hero / 三类入口 / 走马灯词 / 署名条（全部来自 site_setting + gallery/collection） */
export interface HomePayload {
  heroKey: string | null;
  heroTagCn: string | null;
  marquee: string[];
  entries: HomeEntry[];
  byline: { nameCn: string; roleCn: string };
  taglineCn: string;
  /** 主理人头像（023 起：首页右上角 + 联系页圆形图同源；null = 前台回退 /img/portrait.webp） */
  portraitKey: string | null;
  /** 精选瀑布流（替代原「作品系列」区；空数组 = 前台整块隐藏） */
  featured: FeaturedItem[];
  /** 首页视频（≤5 个，021 起；空数组 = 占位「COMING SOON」） */
  videos: HomeVideo[];
}

/** GET /api/health */
export interface Health {
  ok: boolean;
  service: 'mua-api';
  version: string;
  time: string;
}
