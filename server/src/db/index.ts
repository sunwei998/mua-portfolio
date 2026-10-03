/* ============================================================
 * db/index.ts —— MySQL 连接池（mysql2，无 ORM）
 * 凭据来源：环境变量 DB_*；本地开发用 server/.env.mua（gitignore）+
 * ssh 隧道 33061 → 服务器 172.18.0.2:3306（sanhe-mysql 无宿主端口映射）。
 * 生产（M7）：mua-api 容器加入 sanhe_default 网络，直连容器名。
 * ============================================================ */
import mysql from 'mysql2/promise';
import { loadEnvFile } from './env.ts';

// 连接池创建前加载 server/.env.mua（进程环境变量优先，不覆盖）
loadEnvFile();

const cfg = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'mua',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'mua_portfolio',
  connectionLimit: 8,
  charset: 'utf8mb4',
  timezone: 'Z',
  /** 让 mysql2 返回 JS number 而不是 DECIMAL 字符串 */
  decimalNumbers: true,
};

export const pool = mysql.createPool(cfg);

/** 便捷查询：SELECT 返回行数组 */
export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/** 便捷执行：INSERT/UPDATE/DELETE */
export async function execute(sql: string, params: unknown[] = []): Promise<{ affectedRows: number; insertId: number }> {
  const [ret] = await pool.execute(sql, params as Parameters<typeof pool.execute>[1]);
  const r = ret as { affectedRows: number; insertId: number };
  return { affectedRows: r.affectedRows, insertId: r.insertId };
}

export async function pingDB(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * 事务包装器：把多条写操作捆成「全成或全败」。
 *
 * 为什么必须有（2026-10-03 实测踩坑）：
 *   整册替换 sections 是「逐段 upsert + 逐段删差集照片 + 末段删差集段」几十条 SQL。
 *   没有事务时，只要中途撞唯一键（uq_section_kind）抛错，
 *   **前面已执行的 DELETE 不会回滚** —— 实测「删 2 张图 + 加一段重复 kind」
 *   请求返回 500，但 2 张照片已被真删，用户以为没保存成功、数据却已经没了。
 *
 * 用法：回调里用 `conn` 代替模块级的 query/execute；
 *      回调抛错 → 自动 ROLLBACK 并把错误原样抛给上层。
 */
export async function transaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    try { await conn.rollback(); } catch { /* 连接已断时忽略，回滚失败不掩盖原始错误 */ }
    throw err;
  } finally {
    conn.release();
  }
}
