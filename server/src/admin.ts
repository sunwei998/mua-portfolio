/* ============================================================
 * admin.ts —— M6 管理后台接口（单账号 + HS256 手写 token，零新依赖）
 *
 * 鉴权：
 *   POST /api/admin/login       登录换 token（scrypt 校验）
 *   POST /api/admin/password    改密码（带旧密码）
 *   其余 /api/admin/* 一律校验 Authorization: Bearer <token>
 *
 * 册（含未发布）：
 *   GET    /api/admin/albums           全量列表 + 张数 + 热度
 *   POST   /api/admin/albums           新建（flat 册自动建挂载段）
 *   GET    /api/admin/albums/:id       详情（段 + 照片）
 *   PUT    /api/admin/albums/:id       基础字段
 *   PUT    /api/admin/albums/:id/sections  段+照片整册替换（排序/增删同口）
 *   DELETE /api/admin/albums/:id       级联删
 *
 * 系列 / 看板 / 设置 / 上传：
 *   GET/PUT /api/admin/collections/:id
 *   GET    /api/admin/stats            热度看板
 *   GET/PUT /api/admin/site            站点设置单行（018 起含视频两字段）
 *   GET/PUT /api/admin/home-featured   首页精选 ≤20 张（018 建表，020 放宽上限，整表替换）
 *   POST   /api/admin/upload           multipart 图 → site/img/uploads/
 *   POST   /api/admin/upload-video     视频上传 + ffprobe 探测 + H.264 自动转码 + 抽封面
 * ============================================================ */
import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query, execute, transaction } from './db/index.ts';

const execFileP = promisify(execFile);
/* ffmpeg-static / ffprobe-static：平台二进制（darwin/linux 均有），上传视频自动转码用。
 * 走 createRequire 取默认导出，规避 CJS 包在 ESM 下的类型解析问题。 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const FFMPEG_BIN = require('ffmpeg-static') as string;
const FFPROBE_BIN = (require('ffprobe-static') as { path: string }).path;

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number => Number(v ?? 0);

/* ---------- 枚举白名单 ----------
 * album.style / album.category / album.layout / album_section.kind / photo.orientation
 * 全是 MySQL ENUM 列。直接透传非法值会得到 WARN_DATA_TRUNCATED → 500，
 * 而 500 对 admin 是「保存失败但原因不明」，且**事务回滚前的写入已落库**。
 * 统一在此收口：非法值一律 400 拒绝，不进SQL。 */
const ALBUM_STYLES = new Set(['western', 'chinese', 'engagement', 'maternity', 'family']);
const ALBUM_CATEGORIES = new Set(['wedding', 'engagement', 'maternity', 'family']);
const ALBUM_LAYOUTS = new Set(['sectioned', 'flat']);
const ORIENTATIONS = new Set(['portrait', 'landscape']);

/** 从 section_kind 配置表取全部合法 kind（权威来源，与建表ENUM 同域）。
 *  查不到时回落到迁移 014 灌入的 8 值兜底，绝不让合法段类型被判非法。
 *
 *  ⚠️ 这里**刻意不按 selectable 过滤**（2026-10-03 用户拍板「停用 = 照常显示，只是不能再新建」）：
 *     selectable 只管「后台下拉提不提供新建」，不是「这个 kind 还不合法」。
 *     若在此处把停用类型剔除，册编辑页保存一个已停用类型的既有段就会撞 400
 *     —— 用户啥也没改，只是把某个类型停了，保存直接失败，属于「停用反噬既有数据」。
 *     过滤必须只发生在 admin 前端的下拉组装处（见 AlbumEdit.vue kindOptions）。 */
let KIND_CACHE: { at: number; set: Set<string> } | null = null;
async function knownKinds(): Promise<Set<string>> {
  if (KIND_CACHE && Date.now() - KIND_CACHE.at < 5000) return KIND_CACHE.set;
  try {
    const rows = await query<Row>('SELECT code FROM section_kind');
    const set = new Set(rows.map((r) => str(r.code)));
    if (set.size > 0) {
      KIND_CACHE = { at: Date.now(), set };
      return set;
    }
  } catch { /* 表不存在时用兜底 */ }
  const fb = new Set(['morning', 'outdoor', 'welcome', 'ceremony', 'toast', 'face', 'headdress', 'flat']);
  KIND_CACHE = { at: Date.now(), set: fb };
  return fb;
}

const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'img', 'uploads');

/* ---------- 视频探测 + 自动转码（2026-10-03 根治「传了放不出」） ----------
 * 病根：iPhone/相机导出的是 HEVC（.mov 容器），Chrome 与微信 X5 都放不出，
 * 且 4K 码率对 390px 的 H5 完全超配；admin 每次上传都会把 video_key 指回原始文件。
 * 政策：容器 mp4 + H.264 + 最长边 ≤1920 → 直收；其余一律转 H.264 mp4
 * （横 1920 宽 / 竖 1080 高上限，faststart 供流式播放）并自动抽封面帧。 */
interface VideoProbe { codec: string; width: number; height: number; duration: number; }

async function probeVideo(file: string): Promise<VideoProbe | null> {
  try {
    const { stdout } = await execFileP(FFPROBE_BIN, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height',
      '-show_entries', 'format=duration',
      '-of', 'json', file,
    ]);
    const j = JSON.parse(stdout) as { streams?: Array<Record<string, unknown>>; format?: { duration?: string } };
    const s = j.streams?.[0];
    if (!s) return null;
    return {
      codec: String(s.codec_name ?? ''),
      width: Number(s.width ?? 0),
      height: Number(s.height ?? 0),
      duration: Number(j.format?.duration ?? 0),
    };
  } catch {
    return null;
  }
}

async function transcodeToMp4(src: string, dest: string, landscape: boolean): Promise<void> {
  // filtergraph 内的引号保护逗号（execFile 无 shell，引号由 ffmpeg 自己的解析器处理）
  const vf = landscape ? "scale='min(1920,iw)':-2" : "scale=-2:'min(1920,ih)'";
  await execFileP(FFMPEG_BIN, [
    '-y', '-i', src,
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k', '-sn', '-dn',
    dest,
  ], { timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
}

async function extractPoster(mp4: string, jpg: string, duration: number): Promise<void> {
  const at = Math.min(0.5, duration > 0 ? duration * 0.08 : 0.5);
  await execFileP(FFMPEG_BIN, ['-y', '-ss', String(at), '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg],
    { timeout: 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
}

/* ---------- 密码（scrypt：N=16384, keylen=64） ---------- */
const hashPassword = (pw: string): string => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`;
};
const verifyPassword = (pw: string, stored: string): boolean => {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pw, salt, a.length);
  return a.length === b.length && timingSafeEqual(a, b);
};

/* ---------- JWT HS256（手写，单账号场景够用） ---------- */
const jwtSecret = (): string => process.env.ADMIN_JWT_SECRET ?? 'mua-dev-secret-change-me';
const b64u = (buf: Buffer | string): string =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uJson = <T,>(s: string): T | null => {
  try { return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as T; } catch { return null; }
};

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 天

function signToken(username: string): string {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ sub: username, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = b64u(createHmac('sha256', jwtSecret()).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

function verifyToken(token: string): string | null {
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) return null;
  const expect = b64u(createHmac('sha256', jwtSecret()).update(`${head}.${body}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = b64uJson<{ sub: string; exp: number }>(body);
  if (!payload || payload.exp < Date.now()) return null;
  return payload.sub;
}

/** 启动时兜底：账号表为空则建默认账号（ADMIN_USER / ADMIN_PASS，默认 mua / yue2026） */
export async function ensureAdminAccount(): Promise<void> {
  const rows = await query<Row>('SELECT id FROM admin_user WHERE id = 1');
  if (rows.length > 0) return;
  const username = process.env.ADMIN_USER ?? 'mua';
  const password = process.env.ADMIN_PASS ?? 'yue2026';
  await execute('INSERT IGNORE INTO admin_user (id, username, pass_hash) VALUES (1, ?, ?)', [
    username, hashPassword(password),
  ]);
  console.log(`[admin] seeded default account "${username}"（改密走 /api/admin/password）`);
}

/* ---------- 鉴权守卫 ---------- */
async function guard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization || '';
  const user = auth.startsWith('Bearer ') ? verifyToken(auth.slice(7)) : null;
  if (!user) {
    await reply.code(401).send({ ok: false, error: 'unauthorized' });
  }
}

/* ---------- 路由注册 ---------- */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {

  /* 登录（免鉴权） */
  app.post('/api/admin/login', async (req: FastifyRequest, reply) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    const rows = await query<Row>('SELECT username, pass_hash FROM admin_user WHERE id = 1');
    const r = rows[0];
    if (!r || str(r.username) !== username || !verifyPassword(password ?? '', str(r.pass_hash))) {
      return reply.code(401).send({ ok: false, error: '用户名或密码不对' });
    }
    return { ok: true, token: signToken(username), username };
  });

  /* 以下全部要 token */
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/admin') || req.url.startsWith('/api/admin/login')) return;
    await guard(req, reply);
  });

  /* 改密码 */
  app.post('/api/admin/password', async (req: FastifyRequest, reply) => {
    const { oldPassword, newPassword } = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    if (!newPassword || newPassword.length < 6) {
      return reply.code(400).send({ ok: false, error: '新密码至少 6 位' });
    }
    const rows = await query<Row>('SELECT pass_hash FROM admin_user WHERE id = 1');
    const r = rows[0];
    if (!r || !verifyPassword(oldPassword ?? '', str(r.pass_hash))) {
      return reply.code(400).send({ ok: false, error: '旧密码不对' });
    }
    await execute('UPDATE admin_user SET pass_hash = ? WHERE id = 1', [hashPassword(newPassword)]);
    return { ok: true };
  });

  /* ---------- 册 ---------- */
  app.get('/api/admin/albums', async () => {
    const albums = await query<Row>(
      `SELECT a.id, a.slug, a.title_cn, a.title_en, a.style, a.category, a.layout,
              a.ordinal_label, a.cover_key, a.cover_len_ratio, a.makeup_cn, a.sort, a.published,
              COALESCE(s.views, 0) AS views, COALESCE(s.likes, 0) AS likes
       FROM album a LEFT JOIN album_stats s ON s.album_id = a.id
       ORDER BY a.style, a.sort`,
    );
    const counts = await query<Row>(
      `SELECT s.album_id, COUNT(p.id) AS n
       FROM album_section s LEFT JOIN photo p ON p.section_id = s.id
       GROUP BY s.album_id`,
    );
    const countMap = new Map(counts.map((r) => [num(r.album_id), num(r.n)]));
    return albums.map((a) => ({
      id: num(a?.id),
      slug: str(a?.slug),
      titleCn: str(a?.title_cn),
      titleEn: str(a?.title_en),
      style: str(a?.style),
      category: str(a?.category),
      layout: str(a?.layout),
      ordinalLabel: str(a?.ordinal_label),
      coverKey: str(a?.cover_key),
      coverLenRatio: num(a?.cover_len_ratio),
      makeupCn: str(a?.makeup_cn) || null,
      sort: num(a?.sort),
      published: num(a?.published) === 1,
      photoCount: countMap.get(num(a?.id)) ?? 0,
      stats: { views: num(a?.views), likes: num(a?.likes) },
    }));
  });

  app.post('/api/admin/albums', async (req: FastifyRequest, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!str(b.slug) || !str(b.titleCn) || !str(b.style)) {
      return reply.code(400).send({ ok: false, error: 'slug / titleCn / style 必填' });
    }
    /* 枚举收口：非法值直接 400，不进 SQL（否则 WARN_DATA_TRUNCATED → 500） */
    const style = str(b.style);
    if (!ALBUM_STYLES.has(style)) {
      return reply.code(400).send({ ok: false, error: `style 只能是 ${[...ALBUM_STYLES].join(' | ')}` });
    }
    const category = str(b.category) || 'wedding';
    if (!ALBUM_CATEGORIES.has(category)) {
      return reply.code(400).send({ ok: false, error: `category 只能是 ${[...ALBUM_CATEGORIES].join(' | ')}` });
    }
    const reqLayout = str(b.layout) === 'flat' ? 'flat' : 'sectioned';
    if (b.layout != null && !ALBUM_LAYOUTS.has(str(b.layout))) {
      return reply.code(400).send({ ok: false, error: `layout 只能是 ${[...ALBUM_LAYOUTS].join(' | ')}` });
    }
    const layout = reqLayout;

    /* slug 重复：uq_album_slug 撞了会500，这里先查一次给友好 400 */
    const dup = await query<Row>('SELECT id FROM album WHERE slug = ?', [str(b.slug)]);
    if (dup[0]) {
      return reply.code(400).send({ ok: false, error: `slug「${str(b.slug)}」已存在，请换一个` });
    }

    const ret = await execute(
      `INSERT INTO album (slug, title_cn, title_en, style, category, layout, ordinal_label,
                          cover_key, cover_len_ratio, makeup_cn, sort, published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        str(b.slug), str(b.titleCn), str(b.titleEn), style, category,
        layout, str(b.ordinalLabel), str(b.coverKey) || '/img/hero.png',
        num(b.coverLenRatio) || 0.8, str(b.makeupCn) || null, num(b.sort) || 99, b.published ? 1 : 0,
      ],
    );
    if (layout === 'flat') {
      await execute(
        `INSERT INTO album_section (album_id, kind, title_cn, title_en, layout, sort)
         VALUES (?, 'flat', ?, ?, 'auto', 1)`,
        [ret.insertId, str(b.titleCn), str(b.titleEn)],
      );
    }
    await execute('INSERT IGNORE INTO album_stats (album_id) VALUES (?)', [ret.insertId]);
    return { ok: true, id: ret.insertId };
  });

  app.get('/api/admin/albums/:id', async (req: FastifyRequest, reply) => {
    const id = num((req.params as { id?: string }).id);
    const albums = await query<Row>('SELECT * FROM album WHERE id = ?', [id]);
    const a = albums[0];
    if (!a) return reply.code(404).send({ ok: false, error: `album ${id}` });
    const sections = await query<Row>('SELECT * FROM album_section WHERE album_id = ? ORDER BY sort', [id]);
    const photos = await query<Row>(
      'SELECT * FROM photo WHERE section_id IN (SELECT id FROM album_section WHERE album_id = ?) ORDER BY sort', [id],
    );
    return {
      id, slug: str(a.slug), titleCn: str(a.title_cn), titleEn: str(a.title_en),
      style: str(a.style), category: str(a.category), layout: str(a.layout),
      ordinalLabel: str(a.ordinal_label), coverKey: str(a.cover_key),
      coverLenRatio: num(a.cover_len_ratio), makeupCn: str(a.makeup_cn) || null,
      sort: num(a.sort), published: num(a.published) === 1,
      sections: sections.map((s) => ({
        id: num(s.id), kind: str(s.kind), titleCn: str(s.title_cn), titleEn: str(s.title_en),
        descCn: str(s.desc_cn) || null, layout: str(s.layout), sort: num(s.sort),
        photos: photos
          .filter((p) => num(p.section_id) === num(s.id))
          .map((p) => ({
            id: num(p.id), cosKey: str(p.cos_key), w: num(p.w), h: num(p.h), ratio: num(p.ratio),
            orientation: str(p.orientation), captionCn: str(p.caption_cn) || null,
            captionEn: str(p.caption_en) || null, sort: num(p.sort),
          })),
      })),
    };
  });

  app.put('/api/admin/albums/:id', async (req: FastifyRequest, reply) => {
    const id = num((req.params as { id?: string }).id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const sets: string[] = [];
    const vals: unknown[] = [];
    /** 字段白名单映射（camelCase → snake_case），严防拼 SQL 注入 */
    const MAP: Record<string, string> = {
      titleCn: 'title_cn', titleEn: 'title_en', style: 'style', category: 'category',
      layout: 'layout', ordinalLabel: 'ordinal_label', coverKey: 'cover_key',
      coverLenRatio: 'cover_len_ratio', makeupCn: 'makeup_cn', sort: 'sort', published: 'published',
    };
    for (const [k, col] of Object.entries(MAP)) {
      if (!(k in b)) continue;
      const v = (b as Row)[k];
      /* 枚举收口：style/category/layout 是 ENUM 列，非法值会WARN_DATA_TRUNCATED → 500。
         置 400 明确告诉 admin 哪个字段不合法，而不是丢一个「保存失败」。 */
      if (k === 'style' && !ALBUM_STYLES.has(str(v))) {
        return reply.code(400).send({ ok: false, error: `style 只能是 ${[...ALBUM_STYLES].join(' | ')}` });
      }
      if (k === 'category' && !ALBUM_CATEGORIES.has(str(v))) {
        return reply.code(400).send({ ok: false, error: `category 只能是 ${[...ALBUM_CATEGORIES].join(' | ')}` });
      }
      if (k === 'layout' && !ALBUM_LAYOUTS.has(str(v))) {
        return reply.code(400).send({ ok: false, error: `layout 只能是 ${[...ALBUM_LAYOUTS].join(' | ')}` });
      }
      sets.push(`${col} = ?`);
      vals.push(k === 'published' ? (v ? 1 : 0) : v);
    }
    if (sets.length === 0) return { ok: true, affected: 0 };
    /* 册不存在时不能静默回 ok —— 前端会以为存上了，其实什么都没发生 */
    const exists = await query<Row>('SELECT id FROM album WHERE id = ?', [id]);
    if (!exists[0]) return reply.code(404).send({ ok: false, error: `album ${id} 不存在` });
    vals.push(id);
    const ret = await execute(`UPDATE album SET ${sets.join(', ')} WHERE id = ?`, vals);
    return { ok: true, affected: ret.affectedRows };
  });

  /** 段 + 照片整册替换：排序、增删一个接口全收。策略 = 算差集删、按 id upsert
   *
   *  ⚠️ 全程包在事务里（2026-10-03 修复）：
   *  原实现逐条execute 无事务，实测「删 2 张照片 + 加一段与既有段重复的 kind」时，
   *  撞uq_section_kind 抛 500，但**前面段的照片 DELETE 已落库**——
   *  用户看到「保存失败」，数据却已经丢了。现在 kind 重复在**进事务前**就400 挡掉，
   *  其余任何 SQL 异常由事务整体回滚，杜绝半写入。
   */
  app.put('/api/admin/albums/:id/sections', async (req: FastifyRequest, reply) => {
    const id = num((req.params as { id?: string }).id);
    const b = (req.body ?? {}) as { sections?: Row[] };
    const list = Array.isArray(b.sections) ? b.sections : [];

    /* --- 前置校验 1：册必须存在（否则是往不存在的册里插段） --- */
    const albumRows = await query<Row>('SELECT id FROM album WHERE id = ?', [id]);
    if (!albumRows[0]) return reply.code(404).send({ ok: false, error: `album ${id} 不存在` });

    /* --- 前置校验 2：kind 合法 + 同册内不重复 ---
     * uq_section_kind(album_id, kind) 要求一册一段一枚。
     * admin 前端允许自由下拉选 kind，用户很容易把两段设成同一个 kind。
     * 提前拦成 400 并指名冲撞的两段，比让MySQL 抛 500 友好得多。 */
    const kinds = await knownKinds();
    const kindOwner = new Map<string, number>();
    for (const [i, s] of list.entries()) {
      const k = str(s.kind) || 'morning';
      if (!kinds.has(k)) {
        return reply.code(400).send({ ok: false, error: `第 ${i + 1} 段的类型「${k}」不存在，请刷新页面后重试` });
      }
      if (kindOwner.has(k)) {
        return reply.code(400).send({
          ok: false,
          error: `第 ${i + 1} 段与第 ${kindOwner.get(k)! + 1} 段类型重复（都是「${k}」）；一册一段一枚，请改成其他类型`,
        });
      }
      kindOwner.set(k, i);
    }

    /* 前置校验 2b：提交里出现的 section id / photo id 必须真属于本册
     * （防前端串册 bug 与恶意构造：绝不允许借「整册替换」改到别的册去）。
     * 一律 400，不要丢500 —— 数据没被改，但要让人看得懂原因。 */
    const existingSecIds = new Set(
      (await query<Row>('SELECT id FROM album_section WHERE album_id = ?', [id])).map((r) => num(r.id)),
    );
    const existingPhOwners = new Map<number, number>();
    for (const r of await query<Row>(
      'SELECT p.id, p.section_id FROM photo p JOIN album_section s ON s.id = p.section_id WHERE s.album_id = ?',
      [id],
    )) existingPhOwners.set(num(r.id), num(r.section_id));
    for (const [i, s] of list.entries()) {
      const sid = num(s.id);
      if (sid && !existingSecIds.has(sid)) {
        return reply.code(400).send({ ok: false, error: `第 ${i + 1} 段不属于本册（段落 id ${sid}），请刷新页面后重试` });
      }
      const photos: Row[] = Array.isArray(s.photos) ? s.photos : [];
      for (const p of photos) {
        const pid = num(p.id);
        if (!pid) continue;
        const owner = existingPhOwners.get(pid);
        if (owner == null) {
          return reply.code(400).send({ ok: false, error: `照片 id ${pid} 不属于本册，请刷新页面后重试` });
        }
        if (sid && owner !== sid) {
          return reply.code(400).send({
            ok: false, error: `第 ${i + 1} 段里带了别的段的照片（id ${pid}），请刷新页面后重试`,
          });
        }
      }
    }

    await transaction(async (conn) => {
      const [oldSecRows] = await conn.query('SELECT id FROM album_section WHERE album_id = ?', [id]);
      const oldIds = new Set((oldSecRows as unknown as Row[]).map((r) => num(r.id)));

      for (const [i, s] of list.entries()) {
        /* sort 一律 1-based（与 002_seed 的 1..N 及建册路径的 sort=1 对齐）。
           曾经误用数组下标 i（0-based），导致「被后台保存过的册」序号整体前移一格、
           且与未保存过的册口径分裂 —— 用户 2026-10-03 拍板统一为 1-based。 */
        const secSort = i + 1;
        const kind = str(s.kind) || 'morning';
        let sectionId = num(s.id);
        if (sectionId && oldIds.has(sectionId)) {
          await conn.execute(
            `UPDATE album_section SET kind=?, title_cn=?, title_en=?, desc_cn=?, layout=?, sort=? WHERE id=?`,
            [kind, str(s.titleCn), str(s.titleEn), str(s.descCn) || null,
             str(s.layout) || 'auto', secSort, sectionId],
          );
          oldIds.delete(sectionId);
        } else {
          /* id 不属于本册的情况已在进事务前 400 挡掉，这里只会是「真新增」 */
          const [ret] = await conn.execute(
            `INSERT INTO album_section (album_id, kind, title_cn, title_en, desc_cn, layout, sort)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, kind, str(s.titleCn), str(s.titleEn),
             str(s.descCn) || null, str(s.layout) || 'auto', secSort],
          );
          sectionId = num((ret as { insertId: number }).insertId);
        }

        // 照片：本段全量对账（删不在清单里的，其余更新/插入）
        const photos: Row[] = Array.isArray(s.photos) ? s.photos : [];
        const [oldPhRows] = await conn.query('SELECT id FROM photo WHERE section_id = ?', [sectionId]);
        const oldPids = new Set((oldPhRows as unknown as Row[]).map((r) => num(r.id)));
        for (const [j, p] of photos.entries()) {
          /* 照片 sort同样 1-based：前台角标写死「造型 0{sort}」，
             0-based 会渲染成「造型 00」。 */
          const phSort = j + 1;
          const pid = num(p.id);
          if (pid && oldPids.has(pid)) {
            await conn.execute(
              `UPDATE photo SET cos_key=?, w=?, h=?, ratio=?, orientation=?, caption_cn=?, sort=? WHERE id=?`,
              [str(p.cosKey), num(p.w) || 800, num(p.h) || 1200, num(p.ratio) || 0.667,
               str(p.orientation) === 'landscape' ? 'landscape' : 'portrait',
               str(p.captionCn) || null, phSort, pid],
            );
            oldPids.delete(pid);
          } else {
            await conn.execute(
              `INSERT INTO photo (section_id, cos_key, w, h, ratio, orientation, caption_cn, sort)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [sectionId, str(p.cosKey), num(p.w) || 800, num(p.h) || 1200, num(p.ratio) || 0.667,
               str(p.orientation) === 'landscape' ? 'landscape' : 'portrait',
               str(p.captionCn) || null, phSort],
            );
          }
        }
        if (oldPids.size > 0) {
          const ids = [...oldPids].map(() => '?').join(',');
          await conn.execute(`DELETE FROM photo WHERE id IN (${ids})`, [...oldPids]);
        }
      }
      if (oldIds.size > 0) {
        const ids = [...oldIds].map(() => '?').join(',');
        await conn.execute(`DELETE FROM album_section WHERE id IN (${ids})`, [...oldIds]); // 照片级联删
      }
    });
    return { ok: true };
  });

  app.delete('/api/admin/albums/:id', async (req: FastifyRequest, reply) => {
    const id = num((req.params as { id?: string }).id);
    /* 删不存在的册不能回 ok：否则 admin 点删除、看提示「已删除」，
       实际册还好好挂在库里（下次进列表又出现），属于典型逻辑闭环断裂。 */
    const exists = await query<Row>('SELECT id FROM album WHERE id = ?', [id]);
    if (!exists[0]) return reply.code(404).send({ ok: false, error: `album ${id} 不存在` });
    await execute('DELETE FROM album WHERE id = ?', [id]); // 段/照片/计数级联
    return { ok: true };
  });

  /* ---------- 系列 ---------- */
  app.get('/api/admin/collections', async () => {
    const rows = await query<Row>('SELECT * FROM collection ORDER BY sort');
    return rows.map((r) => ({
      id: num(r.id), slug: str(r.slug), style: str(r.style),
      bigCn: str(r.big_cn), taglineCn: str(r.tagline_cn), taglineEn: str(r.tagline_en),
      vslipCn: str(r.vslip_cn),
      showBig: num(r.show_big ?? 1) === 1,
      showTagCn: num(r.show_tag_cn ?? 1) === 1, showTagEn: num(r.show_tag_en ?? 1) === 1,
      enabled: num(r.enabled ?? 1) === 1,
      coverKey: str(r.cover_key), strips: Array.isArray(r.strips_json) ? r.strips_json : [],
      sort: num(r.sort),
    }));
  });

  app.put('/api/admin/collections/:id', async (req: FastifyRequest) => {
    const id = num((req.params as { id?: string }).id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    await execute(
      `UPDATE collection SET big_cn=?, tagline_cn=?, tagline_en=?, vslip_cn=?,
                             show_big=?, show_tag_cn=?, show_tag_en=?, enabled=?,
                             cover_key=?, strips_json=CAST(? AS JSON)
       WHERE id = ?`,
      [str(b.bigCn), str(b.taglineCn), str(b.taglineEn), str(b.vslipCn),
       b.showBig === false ? 0 : 1,
       b.showTagCn === false ? 0 : 1, b.showTagEn === false ? 0 : 1, b.enabled === false ? 0 : 1,
       str(b.coverKey), JSON.stringify(b.strips ?? []), id],
    );
    return { ok: true };
  });

  /* ---------- 热度看板 ---------- */
  app.get('/api/admin/stats', async () => {
    const rows = await query<Row>(
      `SELECT a.id, a.slug, a.title_cn, a.style, a.published,
              COALESCE(s.views, 0) AS views, COALESCE(s.likes, 0) AS likes
       FROM album a LEFT JOIN album_stats s ON s.album_id = a.id
       ORDER BY s.views DESC, s.likes DESC`,
    );
    return rows.map((r) => ({
      id: num(r.id), slug: str(r.slug), titleCn: str(r.title_cn), style: str(r.style),
      published: num(r.published) === 1,
      stats: { views: num(r.views), likes: num(r.likes) },
    }));
  });

  /* ---------- 站点设置 ---------- */
  app.get('/api/admin/site', async () => {
    const rows = await query<Row>('SELECT * FROM site_setting WHERE id = 1');
    const r = rows[0] ?? {};
    return {
      brandCn: str(r.brand_cn), brandEn: str(r.brand_en), taglineCn: str(r.tagline_cn),
      subCn: str(r.sub_cn), subLongCn: str(r.sub_long_cn), bylineCn: str(r.byline_cn),
      bioCn: str(r.bio_cn) || null,
      statsJson: Array.isArray(r.stats_json) ? r.stats_json : [],
      flowJson: Array.isArray(r.flow_json) ? r.flow_json : [],
      marqueeJson: Array.isArray(r.marquee_json) ? r.marquee_json : [],
      heroKey: str(r.hero_key) || null, heroTagCn: str(r.hero_tag_cn) || null,
      wechatId: str(r.wechat_id) || null, qrcodeKey: str(r.qrcode_key) || null,
      ogImageKey: str(r.og_image_key) || null,
      videoKey: str(r.video_key) || null, videoPosterKey: str(r.video_poster_key) || null,
      videoWidth: num(r.video_width) || null, videoHeight: num(r.video_height) || null,
      videoDuration: num(r.video_duration) || null,
      video2Key: str(r.video2_key) || null, video2PosterKey: str(r.video2_poster_key) || null,
      video2Width: num(r.video2_width) || null, video2Height: num(r.video2_height) || null,
      video2Duration: num(r.video2_duration) || null,
      video3Key: str(r.video3_key) || null, video3PosterKey: str(r.video3_poster_key) || null,
      video3Width: num(r.video3_width) || null, video3Height: num(r.video3_height) || null,
      video3Duration: num(r.video3_duration) || null,
      video4Key: str(r.video4_key) || null, video4PosterKey: str(r.video4_poster_key) || null,
      video4Width: num(r.video4_width) || null, video4Height: num(r.video4_height) || null,
      video4Duration: num(r.video4_duration) || null,
      video5Key: str(r.video5_key) || null, video5PosterKey: str(r.video5_poster_key) || null,
      video5Width: num(r.video5_width) || null, video5Height: num(r.video5_height) || null,
      video5Duration: num(r.video5_duration) || null,
    };
  });

  app.put('/api/admin/site', async (req: FastifyRequest) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    await execute(
      `UPDATE site_setting SET brand_cn=?, brand_en=?, tagline_cn=?, sub_cn=?, sub_long_cn=?,
                               byline_cn=?, bio_cn=?, stats_json=CAST(? AS JSON),
                               flow_json=CAST(? AS JSON), marquee_json=CAST(? AS JSON),
                               hero_key=?, hero_tag_cn=?, wechat_id=?, qrcode_key=?, og_image_key=?,
                               video_key=?, video_poster_key=?, video_width=?, video_height=?, video_duration=?,
                               video2_key=?, video2_poster_key=?, video2_width=?, video2_height=?, video2_duration=?,
                               video3_key=?, video3_poster_key=?, video3_width=?, video3_height=?, video3_duration=?,
                               video4_key=?, video4_poster_key=?, video4_width=?, video4_height=?, video4_duration=?,
                               video5_key=?, video5_poster_key=?, video5_width=?, video5_height=?, video5_duration=?
       WHERE id = 1`,
      [str(b.brandCn), str(b.brandEn), str(b.taglineCn), str(b.subCn), str(b.subLongCn),
       str(b.bylineCn), str(b.bioCn) || null, JSON.stringify(b.statsJson ?? []),
       JSON.stringify(b.flowJson ?? []), JSON.stringify(b.marqueeJson ?? []),
       str(b.heroKey) || null, str(b.heroTagCn) || null, str(b.wechatId) || null,
       str(b.qrcodeKey) || null, str(b.ogImageKey) || null,
       str(b.videoKey) || null, str(b.videoPosterKey) || null,
       num(b.videoWidth) || null, num(b.videoHeight) || null, num(b.videoDuration) || null,
       str(b.video2Key) || null, str(b.video2PosterKey) || null,
       num(b.video2Width) || null, num(b.video2Height) || null, num(b.video2Duration) || null,
       str(b.video3Key) || null, str(b.video3PosterKey) || null,
       num(b.video3Width) || null, num(b.video3Height) || null, num(b.video3Duration) || null,
       str(b.video4Key) || null, str(b.video4PosterKey) || null,
       num(b.video4Width) || null, num(b.video4Height) || null, num(b.video4Duration) || null,
       str(b.video5Key) || null, str(b.video5PosterKey) || null,
       num(b.video5Width) || null, num(b.video5Height) || null, num(b.video5Duration) || null],
    );
    return { ok: true };
  });

  /* ---------- 首页精选（home_featured，018） ----------
   * ≤20 张（2026-10-03 放宽）、独立于相册。PUT 整表替换：
   *   校验全部放在进事务前（能 400 的不进 SQL 层抛 500）；
   *   写入用 transaction() 包裹（几十条 DELETE+INSERT，中途抛错必须整体回滚）。 */
  const FEATURED_MAX = 20;

  app.get('/api/admin/home-featured', async () => {
    const rows = await query<Row>('SELECT * FROM home_featured ORDER BY sort');
    return {
      ok: true as const,
      items: rows.map((r) => ({
        cosKey: str(r.cos_key),
        w: num(r.w), h: num(r.h), ratio: num(r.ratio),
        orientation: str(r.orientation),
        captionCn: str(r.caption_cn) || null, captionEn: str(r.caption_en) || null,
      })),
    };
  });

  app.put('/api/admin/home-featured', async (req: FastifyRequest, reply) => {
    const b = (req.body ?? {}) as { items?: Record<string, unknown>[] };
    const items = Array.isArray(b.items) ? b.items : [];

    /* ---- 校验（事务前，违规直接 400） ---- */
    if (items.length > FEATURED_MAX) {
      return reply.code(400).send({ ok: false, error: `精选最多 ${FEATURED_MAX} 张，收到 ${items.length}` });
    }
    const clean: { cosKey: string; w: number; h: number; ratio: number; orientation: 'portrait' | 'landscape'; captionCn: string | null; captionEn: string | null; sort: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] ?? {};
      const cosKey = str(it.cosKey).trim();
      if (!cosKey) return reply.code(400).send({ ok: false, error: `第 ${i + 1} 张缺少图片 key` });
      const w = num(it.w); const h = num(it.h);
      if (!(w > 0) || !(h > 0)) {
        return reply.code(400).send({ ok: false, error: `第 ${i + 1} 张宽高非法（须为实测像素值）` });
      }
      const orientation = str(it.orientation) === 'landscape' ? 'landscape' : 'portrait'; // 白名单收口，非法值不进 SQL
      const ratio = Math.round((w / h) * 1000) / 1000;
      clean.push({
        cosKey: cosKey.slice(0, 500),
        w: Math.round(w), h: Math.round(h), ratio, orientation,
        captionCn: str(it.captionCn).trim().slice(0, 200) || null,
        captionEn: str(it.captionEn).trim().slice(0, 200) || null,
        sort: i + 1, // sort 全库 1-based
      });
    }

    await transaction(async (conn) => {
      await conn.execute('DELETE FROM home_featured');
      for (const c of clean) {
        await conn.execute(
          `INSERT INTO home_featured (cos_key, w, h, ratio, orientation, caption_cn, caption_en, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.cosKey, c.w, c.h, c.ratio, c.orientation, c.captionCn, c.captionEn, c.sort],
        );
      }
    });
    return { ok: true, saved: clean.length };
  });

  /* ---------- 段落类型配置（section_kind）
   * 名称（name_cn / name_en）可配；**style（展示风格）严格限死、不可改**
   * —— 用户明确要求「除瀑布流外展示风格严格限死」。
   * PUT 只接受名称 + selectable，style/sort/is_flat 一律保持库中原值，
   * 避免后台误改导致前台版式（拼版 / 右偏位 / 瀑布流）漂移。
   *
   * ⛔ 无删除接口，且**永远不提供**（用户 2026-10-03 拍板）：
   *   code 是 album_section.kind（MySQL ENUM）的取值，删它等于改表结构，
   *   属于开发/迁移动作；后台只暴露「停用」这一个软开关。
   *
   * selectable（迁移 018，原名 enabled）的语义**仅限「能否新建」**：
   *   selectable=0 → admin 册编辑页的下拉不再把它作为可选项；
   *   但已有段落照常显示、照常保存，public.ts 对该字段零引用，前台零变化。
   *   刻意不叫 enabled：那个名字会被后来人读成「前台隐藏」而误加过滤。 */
  app.get('/api/admin/section-kinds', async () => {
    /* LEFT JOIN 一次算出 refCount：让 admin 能提示「停用会影响哪些既有内容」，
       避免用户把一个被34 段引用的类型停用后毫无感知。 */
    const rows = await query<Row>(
      `SELECT k.code, k.name_cn, k.name_en, k.style, k.sort, k.is_flat, k.selectable,
              COUNT(s.id) AS ref_count
         FROM section_kind k
         LEFT JOIN album_section s ON s.kind = k.code
        GROUP BY k.code, k.name_cn, k.name_en, k.style, k.sort, k.is_flat, k.selectable
        ORDER BY k.is_flat, k.sort, k.code`);
    return rows.map((r) => ({
      code: str(r.code), nameCn: str(r.name_cn), nameEn: str(r.name_en),
      style: str(r.style), sort: num(r.sort),
      isFlat: num(r.is_flat) === 1, selectable: num(r.selectable) === 1,
      refCount: num(r.ref_count),
    }));
  });

  app.put('/api/admin/section-kinds', async (req: FastifyRequest) => {
    const b = (req.body ?? {}) as { items?: Record<string, unknown>[] };
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return { ok: true, updated: 0 };
    // 白名单 code：以库中现存code 为准，杜绝写入不存在的类型
    const known = await query<Row>('SELECT code FROM section_kind');
    const allow = new Set(known.map((r) => str(r.code)));
    /* 保存后必须回读一次：段落类型配置表的读取有 5s缓存
       （server/src/admin.ts knownKinds），不回读就清缓存会出现
       「后台显示已保存、册编辑页下拉框还是旧名」的错觉。 */
    KIND_CACHE = null;
    let updated = 0;
    for (const it of items) {
      const code = str(it.code);
      if (!allow.has(code)) continue;      // 未知 code 跳过（不新增、不改风格）
      /* 中文名不能为空：前台章节头用 kindNameCn（空则回落到段名 titleCn），
         空中文名会让下拉框出现一个没有文字的选项。英文名留空可接受。 */
      const nameCn = str(it.nameCn).trim().slice(0, 20);
      if (!nameCn) continue;
      await execute(
        'UPDATE section_kind SET name_cn=?, name_en=?, selectable=? WHERE code=?',
        [nameCn, str(it.nameEn).trim().slice(0, 60),
         num(it.selectable) === 1 ? 1 : 0, code],
      );
      updated += 1;
    }
    return { ok: true, updated };
  });

  /* ---------- 上传（multipart → site/img/uploads/） ---------- */
  app.post('/api/admin/upload', async (req: FastifyRequest, reply) => {
    const mp = (req as unknown as { file?: () => AsyncIterable<Row> & Promise<Row> | Row }).file;
    if (typeof mp !== 'function') {
      return reply.code(400).send({ ok: false, error: '需要 @fastify/multipart 注册' });
    }
    const data = await mp.call(req as never) as Row & { toBuffer: () => Promise<Buffer> };
    if (!data) return reply.code(400).send({ ok: false, error: '没有文件' });
    const mime = str(data.mimetype);
    if (!mime.startsWith('image/')) return reply.code(400).send({ ok: false, error: `只收图片，收到 ${mime}` });
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
    const buf = await (data as unknown as { toBuffer: () => Promise<Buffer> }).toBuffer();
    if (buf.length > 12 * 1024 * 1024) return reply.code(400).send({ ok: false, error: '单张 ≤ 12MB' });

    mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${ext}`;
    writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return { ok: true, key: `/img/uploads/${name}` };
  });

  /* ---------- 视频上传（018：首页视频位；2026-10-03 接自动转码管线） ----------
   * @fastify/multipart 全局限 12MB 是给图的；本路由按请求覆写 fileSize 到 200MB，
   * 且**流式写盘**（pipeline），不把整段视频读进内存——服务器内存小，禁 toBuffer。
   * 落盘后 ffprobe 探测：mp4+H.264+≤1920 直接收；否则 ffmpeg 转 H.264 并抽封面。
   * 返回 { key, posterKey, converted }——key 永远是确定可播的 mp4。
   * 生产走 COS 直传 + 数据万象转码后本接口仅作本地/过渡用途。 */
  app.post('/api/admin/upload-video', async (req: FastifyRequest, reply) => {
    const mp = (req as unknown as { file?: (o?: Row) => AsyncIterable<Row> & Promise<Row> }).file;
    if (typeof mp !== 'function') {
      return reply.code(400).send({ ok: false, error: '需要 @fastify/multipart 注册' });
    }
    const data = await mp.call(req as never, { limits: { fileSize: 200 * 1024 * 1024 } }) as
      Row & { mimetype: unknown; file: NodeJS.ReadableStream };
    if (!data) return reply.code(400).send({ ok: false, error: '没有文件' });
    const mime = str(data.mimetype);
    if (!mime.startsWith('video/')) return reply.code(400).send({ ok: false, error: `只收视频，收到 ${mime}` });
    const ext = mime === 'video/webm' ? 'webm' : mime === 'video/quicktime' ? 'mov' : 'mp4';

    mkdirSync(UPLOAD_DIR, { recursive: true });
    const stamp = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const tmpPath = path.join(UPLOAD_DIR, `tmp-${stamp}.${ext}`);
    try {
      await pipeline(data.file, createWriteStream(tmpPath));
    } catch (err) {
      rmSync(tmpPath, { force: true });
      return reply.code(400).send({ ok: false, error: `上传失败（文件可能超过 200MB）：${err instanceof Error ? err.message : '未知错误'}` });
    }

    /* 探测：解不开的视频一律 400，不给前台埋雷 */
    const probe = await probeVideo(tmpPath);
    if (!probe || !probe.width || !probe.height) {
      rmSync(tmpPath, { force: true });
      return reply.code(400).send({ ok: false, error: '无法解析该视频（容器损坏或不受支持）' });
    }

    /* 直收快路径：mp4 容器 + H.264 + 最长边 ≤1920 */
    const directOk = probe.codec === 'h264' && Math.max(probe.width, probe.height) <= 1920 && ext === 'mp4';
    let mp4Path: string;
    let converted = false;
    if (directOk) {
      mp4Path = path.join(UPLOAD_DIR, `${stamp}.mp4`);
      renameSync(tmpPath, mp4Path);
    } else {
      mp4Path = path.join(UPLOAD_DIR, `${stamp}.mp4`);
      try {
        await transcodeToMp4(tmpPath, mp4Path, probe.width >= probe.height);
      } catch (err) {
        rmSync(tmpPath, { force: true });
        rmSync(mp4Path, { force: true });
        const detail = err instanceof Error ? err.message.slice(0, 300) : '未知错误';
        return reply.code(500).send({ ok: false, error: `转码失败：${detail}` });
      }
      rmSync(tmpPath, { force: true });
      converted = true;
    }

    /* 封面帧：失败不挡上传（前台 posterKey 为空就退回首帧） */
    let posterKey: string | null = null;
    const posterPath = path.join(UPLOAD_DIR, `${stamp}-poster.jpg`);
    try {
      await extractPoster(mp4Path, posterPath, probe.duration);
      posterKey = `/img/uploads/${stamp}-poster.jpg`;
    } catch { /* 无封面也可接受 */ }

    return {
      ok: true,
      key: `/img/uploads/${path.basename(mp4Path)}`,
      posterKey,
      converted,
      probe: { codec: probe.codec, width: probe.width, height: probe.height, duration: +probe.duration.toFixed(1) },
    };
  });
}
