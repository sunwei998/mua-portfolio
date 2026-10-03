/* ============================================================
 * index.ts —— 启动 + 插件注册（M1：CORS + /api/health）
 * 生产拓扑：宿主机 Nginx 443 反代 /api/ → 127.0.0.1:8082（本服务）
 * ============================================================ */
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import type { Health } from './types.ts';
import { registerPublicRoutes } from './routes/public.ts';
import { registerAdminRoutes, ensureAdminAccount } from './admin.ts';

const VERSION = '0.1.0';
const IS_PROD = process.env.NODE_ENV === 'production';

const app = Fastify({
  logger: IS_PROD
    ? true
    : { transport: undefined, level: 'info' },
  trustProxy: true,
});

/* ---------- CORS：手写三个头，不引插件（前台同源，跨域只为本地 dev 便利） ---------- */
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    await reply.code(204).send();
  }
});

/* ---------- 健康检查（带 DB 状态，M3 起数据层常驻） ---------- */
app.get('/api/health', async (): Promise<Health & { db: boolean }> => {
  const { pingDB } = await import('./db/index.ts');
  return {
    ok: true,
    service: 'mua-api',
    version: VERSION,
    time: new Date().toISOString(),
    db: await pingDB(),
  };
});

/* ---------- 前台 6 条只读接口（M3） ---------- */
await app.register(registerPublicRoutes);

/* ---------- 管理后台（M6）：multipart 上传 + 单账号鉴权 ---------- */
await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024 } });
await app.register(registerAdminRoutes);
await ensureAdminAccount();

/* ---------- 404 兜底（JSON，区别于前台的 SPA fallback） ---------- */
app.setNotFoundHandler(async (req, reply) => {
  await reply.code(404).send({ ok: false, error: `no route: ${req.method} ${req.url}` });
});

/* ---------- 启动 ---------- */
const port = Number(process.env.PORT ?? 8082);
const host = process.env.HOST ?? '127.0.0.1';

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
