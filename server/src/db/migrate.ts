/* ============================================================
 * migrate.ts —— 自写迁移 runner（约 90 行，不引 ORM/umzug）
 * 规则：
 *   1. 读 migrations/*.sql，按文件名排序
 *   2. 已在 _migrations 账本里的跳过
 *   3. 未执行的：单连接 + 事务内整文件执行（multipleStatements）
 *      —— 注意 DDL 会隐式提交，事务只保护 DML（002_seed）；幂等由账本保证
 *   4. 记账：文件名 + sha256 checksum
 * 用法：npm run migrate（env 见 .env.mua）
 * ============================================================ */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadEnvFile } from './env.ts';

loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

async function main(): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'mua',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'mua_portfolio',
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  // 账本兜底（001 里也建，这里保证空库也能先记账）
  await conn.query(`CREATE TABLE IF NOT EXISTS _migrations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum CHAR(64) NOT NULL,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_migration_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('migrate: migrations 目录为空，无事可做');
    await conn.end();
    return;
  }

  /** 已执行的：name -> checksum */
  const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT name, checksum FROM _migrations');
  const done = new Map(rows.map((r) => [String(r.name), String(r.checksum)]));

  let applied = 0;
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    const recorded = done.get(file);
    if (recorded) {
      if (recorded !== checksum) {
        console.error(`✗ ${file} 已执行但内容有改动（checksum 不符）——已执行过的迁移不可修改，请新建迁移文件`);
        process.exitCode = 1;
        break;
      }
      console.log(`· 跳过 ${file}（已执行）`);
      continue;
    }

    try {
      await conn.beginTransaction();
      await conn.query(sql);
      await conn.query('INSERT INTO _migrations (name, checksum) VALUES (?, ?)', [file, checksum]);
      await conn.commit();
      applied += 1;
      console.log(`✓ ${file} 执行完成`);
    } catch (err) {
      await conn.rollback();
      console.error(`✗ ${file} 执行失败，已回滚：`, err instanceof Error ? err.message : err);
      process.exitCode = 1;
      break;
    }
  }

  const pending = files.length - applied - [...done.keys()].filter((n) => files.includes(n)).length;
  if (applied === 0 && pending === 0 && process.exitCode !== 1) {
    console.log('migrate: 无待执行迁移，幂等成立');
  }
  await conn.end();
}

main().catch((err) => {
  console.error('migrate: 连接失败 ——', err instanceof Error ? err.message : err);
  console.error('提示：本地开发先起 ssh 隧道（33061 → 服务器 172.18.0.2:3306）');
  process.exit(1);
});
