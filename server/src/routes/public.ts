/* ============================================================
 * routes/public.ts —— 前台 6 条只读接口（M3）+ V7 互动计数 1 条写接口
 * 口径 = build-plan §04 + server/src/types.ts（唯一权威）：
 *   GET  /api/site               品牌设置（/about · 全局）
 *   GET  /api/home               首页聚合（hero / 系列入口 / 走马灯 / 署名条）
 *   GET  /api/collections        双封面卡（西式在前）+ V7 新系列注册
 *   GET  /api/albums?style=      册列表卡（含热度三计数）
 *   GET  /api/albums/:slug       册详情一次给全（六段或 flat + 每段照片）
 *   POST /api/albums/:slug/stats 互动计数（view/like；点赞不可逆；转发已退役 2026-10-03）
 *   GET  /api/galleries/:slug    平铺图集的照片数组（旧口径，flat 册接管后待清理）
 * 只暴露 published=1 的册；snake_case → camelCase 在这一层归一。
 * ============================================================ */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
  Album, AlbumCard, AlbumSection, AlbumStats, AlbumStyle, Collection, FeaturedItem,
  Gallery, HomePayload, HomeVideo, Photo, SectionKind, SectionLayout, SiteSettings,
} from '../types.ts';
import { query } from '../db/index.ts';

/* ---------- 小工具 ---------- */
type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? '' : String(v));
const strN = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);

const WEDDING_STYLES: readonly AlbumStyle[] = ['western', 'chinese'];

const mapStats = (r: Row | undefined): AlbumStats =>
  r ? { views: num(r.views), likes: num(r.likes) }
    : { views: 0, likes: 0 };

function mapPhoto(r: Row): Photo {
  return {
    id: num(r.id),
    sectionId: num(r.section_id),
    cosKey: str(r.cos_key),
    w: num(r.w),
    h: num(r.h),
    ratio: num(r.ratio),
    orientation: r.orientation === 'landscape' ? 'landscape' : 'portrait',
    captionCn: strN(r.caption_cn),
    captionEn: strN(r.caption_en),
    sort: num(r.sort),
  };
}

function mapSection(r: Row, photos: Photo[]): AlbumSection {
  return {
    id: num(r.id),
    albumId: num(r.album_id),
    kind: str(r.kind) as SectionKind,
    /* 段落类型名（来自 section_kind 配置表，2026-10-03）：
       前台原先硬编码 SHORT 常量（晨袍/出门/仪式主纱…），改名后必须读配置。
       LEFT JOIN 取不到时回落到 title_cn，保证配置缺失也不至于空白。 */
    kindNameCn: str(r.kind_name_cn) || str(r.title_cn),
    /* ⚠️ kindNameEn **只下发、前台不消费**（2026-10-03 用户拍板「字段留着，前台暂时不展示」）：
       site/ 全站零引用，前台英文一律走下面的 title_en。
       保留下发是为将来接通时不必改接口 —— 接线时务必用「段名优先、类型名兜底」，
       别让类型名直接顶替段名（段名是用户逐段覆写的内容，优先级更高）。 */
    kindNameEn: str(r.kind_name_en) || str(r.title_en),
    titleCn: str(r.title_cn),
    titleEn: str(r.title_en),
    descCn: strN(r.desc_cn),
    descEn: strN(r.desc_en),
    layout: str(r.layout) as SectionLayout,
    maxVisible: num(r.max_visible),
    sort: num(r.sort),
    photos,
  };
}

function mapCollection(r: Row): Collection {
  return {
    id: num(r.id),
    slug: str(r.slug),
    style: str(r.style) as AlbumStyle,
    bigCn: str(r.big_cn),
    taglineCn: str(r.tagline_cn),
    taglineEn: str(r.tagline_en),
    vslipCn: str(r.vslip_cn),
    showBig: num(r.show_big ?? 1) === 1,
    showTagCn: num(r.show_tag_cn ?? 1) === 1,
    showTagEn: num(r.show_tag_en ?? 1) === 1,
    coverKey: str(r.cover_key),
    strips: Array.isArray(r.strips_json) ? (r.strips_json as string[]) : [],
    albumCount: num(r.album_count ?? 0),
    sort: num(r.sort),
  };
}

function mapSettings(r: Row): SiteSettings {
  const rawStats = Array.isArray(r.stats_json) ? (r.stats_json as Row[]) : [];
  const rawFlow = Array.isArray(r.flow_json) ? (r.flow_json as Row[]) : [];
  const byline = str(r.byline_cn);
  const [nameCn = '', roleCn = ''] = byline.split('·').map((p) => p.trim());
  return {
    brandCn: str(r.brand_cn),
    brandEn: str(r.brand_en),
    taglineCn: str(r.tagline_cn),
    subCn: str(r.sub_cn),
    subLongCn: str(r.sub_long_cn),
    bylineCn: byline,
    bioCn: strN(r.bio_cn),
    stats: rawStats.map((x) => ({ labelCn: str(x.label), value: str(x.value) })),
    flowSteps: rawFlow.map((x) => ({ step: str(x.step), titleCn: str(x.title) })),
    wechatId: strN(r.wechat_id),
    qrcodeKey: strN(r.qrcode_key),
    ogImageKey: strN(r.og_image_key),
    portraitKey: strN(r.portrait_key),
  };
}

const notFound = (reply: { code: (c: number) => { send: (b: unknown) => unknown } }, what: string) =>
  reply.code(404).send({ ok: false, error: `not found: ${what}` });

/* ---------- 路由注册 ---------- */
export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {

  /* ① 站点设置（单行） */
  app.get('/api/site', async (): Promise<SiteSettings | { ok: false; error: string }> => {
    const rows = await query<Row>('SELECT * FROM site_setting WHERE id = 1');
    const r = rows[0];
    if (!r) return { ok: false, error: 'site_setting is empty' };
    return mapSettings(r);
  });

  /* ② 首页聚合：V7 口径 = wedding 进双封面 + collection 表其余系列（更多时刻）
   *    2026-10-03 首页改版：增 featured（精选瀑布流，替代原「作品系列」区）+ video */
  app.get('/api/home', async (): Promise<HomePayload> => {
    const [settingRows, collections, featuredRows] = await Promise.all([
      query<Row>('SELECT * FROM site_setting WHERE id = 1'),
      query<Row>('SELECT * FROM collection WHERE enabled = 1 ORDER BY sort'),
      query<Row>('SELECT * FROM home_featured ORDER BY sort'),
    ]);
    const st = settingRows[0] ?? {};
    const cols = collections.map(mapCollection);
    const weddingDesc = cols.filter((c) => WEDDING_STYLES.includes(c.style)).length > 0
      ? `${cols.filter((c) => WEDDING_STYLES.includes(c.style)).map((c) => c.bigCn).join(' × ')} · 双封面`
      : '双封面';

    const entries = [
      { key: 'wedding' as const, titleCn: '婚庆跟妆', titleEn: 'WEDDING', href: '/wedding', descCn: weddingDesc },
      ...cols
        .filter((c) => !WEDDING_STYLES.includes(c.style))
        .map((c) => ({
          key: c.style as 'engagement' | 'maternity' | 'family',
          titleCn: c.bigCn,
          titleEn: c.taglineEn,
          href: `/style/${c.style}`,
          descCn: c.taglineCn,
        })),
    ];

    const rawMarquee = Array.isArray(st.marquee_json) ? (st.marquee_json as string[]) : [];
    const bylineParts = str(st.byline_cn).split('·').map((p) => p.trim());
    const featured = featuredRows.map<FeaturedItem>((r) => ({
      cosKey: str(r.cos_key),
      w: num(r.w),
      h: num(r.h),
      ratio: num(r.ratio),
      orientation: r.orientation === 'landscape' ? 'landscape' : 'portrait',
      captionCn: strN(r.caption_cn),
      captionEn: strN(r.caption_en),
    }));
    /** 021 起 ≤5 个视频：video_key（018）+ video2~5_key（020/021）；NULL 槽位剔除，
     *  中间槽位留空不影响前后槽位照常渲染 */
    const slots = [
      [st.video_key, st.video_poster_key, st.video_width, st.video_height, st.video_duration],
      [st.video2_key, st.video2_poster_key, st.video2_width, st.video2_height, st.video2_duration],
      [st.video3_key, st.video3_poster_key, st.video3_width, st.video3_height, st.video3_duration],
      [st.video4_key, st.video4_poster_key, st.video4_width, st.video4_height, st.video4_duration],
      [st.video5_key, st.video5_poster_key, st.video5_width, st.video5_height, st.video5_duration],
    ] as const;
    const videos = slots
      .map(([k, p, w, h, d]) => (strN(k) ? {
        key: strN(k) as string,
        posterKey: strN(p),
        w: num(w) || null,
        h: num(h) || null,
        duration: num(d) || null,
      } : null))
      .filter((v): v is HomeVideo => v !== null);
    return {
      heroKey: strN(st.hero_key),
      heroTagCn: strN(st.hero_tag_cn),
      marquee: rawMarquee,
      entries,
      byline: { nameCn: bylineParts[0] ?? '', roleCn: bylineParts[1] ?? '' },
      taglineCn: str(st.tagline_cn),
      portraitKey: strN(st.portrait_key),
      featured,
      videos,
    };
  });

  /* ③ 双封面（western/chinese，sort 保证西式在前）+ V7 新系列注册表
   *   enabled=0 的系列不返回（admin 禁用后前台整体隐藏，2026-10-02） */
  app.get('/api/collections', async (): Promise<Collection[]> => {
    /* album_count 用相关子查询直接下发，前台不再逐系列发 /albums 请求计数（N+1 → 1） */
    const rows = await query<Row>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM album a WHERE a.style = c.style AND a.published = 1) AS album_count
         FROM collection c WHERE c.enabled = 1 ORDER BY c.sort`);
    return rows.map(mapCollection);
  });

  /* ④ 册列表卡：?style= 全部五值（V7 起 engagement/maternity/family 同走本接口） */
  app.get('/api/albums', async (req: FastifyRequest, reply) => {
    const { style } = req.query as { style?: string };
    const VALID: readonly string[] = ['western', 'chinese', 'engagement', 'maternity', 'family'];
    if (!style || !VALID.includes(style)) {
      return reply.code(400).send({ ok: false, error: `query "style" must be one of ${VALID.join(' | ')}` });
    }
    /* 系列禁用（admin enabled=0）→ 列表入口一并 404，不只藏入口（2026-10-02） */
    const collRows = await query<Row>('SELECT enabled FROM collection WHERE style = ?', [style]);
    if (collRows[0] && num(collRows[0].enabled) !== 1) {
      return notFound(reply, `collection ${style}`);
    }
    const albums = await query<Row>(
      `SELECT a.id, a.slug, a.title_cn, a.title_en, a.style, a.category, a.layout,
              a.ordinal_label, a.cover_key, a.cover_len_ratio, a.makeup_cn,
              COALESCE(s.views, 0) AS views, COALESCE(s.likes, 0) AS likes
       FROM album a LEFT JOIN album_stats s ON s.album_id = a.id
       WHERE a.style = ? AND a.published = 1 ORDER BY a.sort`,
      [style],
    );
    if (albums.length === 0) return [];

    const ids = albums.map((a) => num(a.id));
    const placeholders = ids.map(() => '?').join(',');

    const [countRows, previewRows] = await Promise.all([
      query<Row>(
        `SELECT s.album_id, COUNT(p.id) AS n
         FROM album_section s LEFT JOIN photo p ON p.section_id = s.id
         WHERE s.album_id IN (${placeholders}) GROUP BY s.album_id`,
        ids,
      ),
      query<Row>(
        `SELECT s.album_id, s.sort AS section_sort, p.cos_key
         FROM album_section s
         LEFT JOIN photo p ON p.section_id = s.id
           AND p.sort = (SELECT MIN(p2.sort) FROM photo p2 WHERE p2.section_id = s.id)
         WHERE s.album_id IN (${placeholders})
         ORDER BY s.album_id, s.sort`,
        ids,
      ),
    ]);

    const countMap = new Map(countRows.map((r) => [num(r.album_id), num(r.n)]));
    const previewMap = new Map<number, string[]>();
    for (const r of previewRows) {
      const id = num(r.album_id);
      const list = previewMap.get(id) ?? [];
      const key = strN(r.cos_key);
      if (key && list.length < 3) list.push(key);
      previewMap.set(id, list);
    }

    return albums.map<AlbumCard>((a) => ({
      slug: str(a.slug),
      titleCn: str(a.title_cn),
      titleEn: str(a.title_en),
      style: str(a.style) as AlbumStyle,
      category: str(a.category) as AlbumCard['category'],
      layout: str(a.layout) === 'flat' ? 'flat' : 'sectioned',
      ordinalLabel: str(a.ordinal_label),
      coverKey: str(a.cover_key),
      coverLenRatio: num(a.cover_len_ratio),
      makeupCn: strN(a.makeup_cn),
      photoCount: countMap.get(num(a.id)) ?? 0,
      stats: mapStats(a),
      previewKeys: previewMap.get(num(a.id)) ?? [],
    }));
  });

  /* ⑤ 册详情：一次给全（册 + 六段 + 每段照片） */
  app.get('/api/albums/:slug', async (req: FastifyRequest, reply) => {
    const { slug } = req.params as { slug?: string };
    const albumRows = await query<Row>(
      'SELECT * FROM album WHERE slug = ? AND published = 1',
      [slug ?? ''],
    );
    const a = albumRows[0];
    if (!a) return notFound(reply, `album ${slug}`);
    /* 册所属系列被禁用（admin enabled=0）→ 详情同样 404（2026-10-02，与 style 列表拦截同口径） */
    const collRows = await query<Row>('SELECT enabled FROM collection WHERE style = ?', [str(a.style)]);
    if (collRows[0] && num(collRows[0].enabled) !== 1) {
      return notFound(reply, `album ${slug}`);
    }
    const albumId = num(a.id);

    const [sectionRows, photoRows, statRows] = await Promise.all([
      /* LEFT JOIN section_kind：把类型名一并带出，前台免二次请求。
       *
       * ⛔ 刻意**不 JOIN、不WHERE selectable**（2026-10-03 用户拍板）：
       *     selectable（原名 enabled）的语义只有「后台还能不能新建这种段落」，
       *     与「前台是否展示」完全无关。停用一个类型 = 只是不再提供新建入口，
       *     已有段落在前台**照常显示**：角标、章节头、版式、alt 一律不变。
       *     若在这里按 selectable 过滤，改一次配置就会让已发布作品的某一段凭空消失，
       *     那是「改配置」被当成「改内容」，是最难排查的一类事故。
       *     反之collection.enabled 才是真·前台开关（上方 173/245/307 行在用）。 */
      query<Row>(
        `SELECT s.*, k.name_cn AS kind_name_cn, k.name_en AS kind_name_en
           FROM album_section s
           LEFT JOIN section_kind k ON k.code = s.kind
          WHERE s.album_id = ? ORDER BY s.sort`, [albumId]),
      query<Row>('SELECT * FROM photo WHERE section_id IN (SELECT id FROM album_section WHERE album_id = ?) ORDER BY sort', [albumId]),
      query<Row>('SELECT * FROM album_stats WHERE album_id = ?', [albumId]),
    ]);

    const photosBySection = new Map<number, Photo[]>();
    for (const raw of photoRows) {
      const p = mapPhoto(raw);
      const list = photosBySection.get(p.sectionId) ?? [];
      list.push(p);
      photosBySection.set(p.sectionId, list);
    }

    const album: Album = {
      id: albumId,
      slug: str(a.slug),
      titleCn: str(a.title_cn),
      titleEn: str(a.title_en),
      style: str(a.style) as AlbumStyle,
      category: str(a.category) as Album['category'],
      layout: str(a.layout) === 'flat' ? 'flat' : 'sectioned',
      ordinalLabel: str(a.ordinal_label),
      coverKey: str(a.cover_key),
      coverLenRatio: num(a.cover_len_ratio),
      sort: num(a.sort),
      published: num(a.published) === 1,
      videoKey: strN(a.video_key),
      videoPosterKey: strN(a.video_poster_key),
      videoDuration: a.video_duration == null ? null : num(a.video_duration),
      stats: mapStats(statRows[0]),
      sections: sectionRows.map((s) => mapSection(s, photosBySection.get(num(s.id)) ?? [])),
    };
    return album;
  });

  /* ⑤b 互动计数：POST /api/albums/:slug/stats { type: view|like }
   * 浏览按会话去重在前端（sessionStorage）；点赞**不可逆累加**（重复点击继续 +1，
   * 无负向 unlike，2026-10-02 拍板）。转发已整体退役（2026-10-03，迁移 011）。
   * 响应携带服务端最新两计数供前端回写 KPI。 */
  app.post('/api/albums/:slug/stats', async (req: FastifyRequest, reply) => {
    const { slug } = req.params as { slug?: string };
    const body = (req.body ?? {}) as { type?: string };
    const type = body.type;
    if (type !== 'view' && type !== 'like') {
      return reply.code(400).send({ ok: false, error: 'body "type" must be view | like' });
    }
    const albumRows = await query<Row>('SELECT id, style FROM album WHERE slug = ? AND published = 1', [slug ?? '']);
    const a = albumRows[0];
    if (!a) return notFound(reply, `album ${slug}`);
    /* 系列禁用 → 互动计数一并拒收（防旧链接继续累计，同口径 2026-10-02） */
    const collRows = await query<Row>('SELECT enabled FROM collection WHERE style = ?', [str(a.style)]);
    if (collRows[0] && num(collRows[0].enabled) !== 1) {
      return notFound(reply, `album ${slug}`);
    }
    const albumId = num(a.id);

    await query<Row>('INSERT IGNORE INTO album_stats (album_id) VALUES (?)', [albumId]);
    const col = type === 'view' ? 'views' : 'likes';
    await query<Row>(
      `UPDATE album_stats SET ${col} = ${col} + 1 WHERE album_id = ?`,
      [albumId],
    );
    const rows = await query<Row>('SELECT views, likes FROM album_stats WHERE album_id = ?', [albumId]);
    return { ok: true, stats: mapStats(rows[0]) };
  });

  /* ⑥ 平铺图集 */
  app.get('/api/galleries/:slug', async (req: FastifyRequest, reply) => {
    const { slug } = req.params as { slug?: string };
    const gRows = await query<Row>('SELECT * FROM gallery WHERE slug = ?', [slug ?? '']);
    const g = gRows[0];
    if (!g) return notFound(reply, `gallery ${slug}`);
    const galleryId = num(g.id);

    const photoRows = await query<Row>(
      'SELECT * FROM gallery_photo WHERE gallery_id = ? ORDER BY sort',
      [galleryId],
    );
    const gallery: Gallery = {
      id: galleryId,
      slug: str(g.slug),
      titleCn: str(g.title_cn),
      titleEn: str(g.title_en),
      descCn: strN(g.desc_cn),
      photos: photoRows.map(mapPhoto),
    };
    return gallery;
  });
}
