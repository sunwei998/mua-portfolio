/* ============================================================
 * backfill-video-dims.ts —— 回填首页视频宽高 / 时长（022 配套）
 * 遍历 site_setting 的 5 个视频槽位，对本地 site/img/uploads 下的文件跑
 * ffprobe，把 width / height / duration 写回对应列。
 * 上传流水线保存宽高后，新视频自动带尺寸；本脚本仅用于补存量 / 修复丢失，可重复运行。
 * 用法：cd server && npx tsx scripts/backfill-video-dims.ts
 *   （本地需先起 ssh 隧道 33061；生产容器内运行时 uploads 路径为 /site/img/uploads）
 * ============================================================ */
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../src/db/index.ts';

const require = createRequire(import.meta.url);
const FFPROBE_BIN = (require('ffprobe-static') as { path: string }).path;
const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'site', 'img', 'uploads');

/* 槽位 → 列名（与迁移 022、public.ts 的 slots 同口径） */
const SLOTS = [
  { key: 'video_key', width: 'video_width', height: 'video_height', duration: 'video_duration' },
  { key: 'video2_key', width: 'video2_width', height: 'video2_height', duration: 'video2_duration' },
  { key: 'video3_key', width: 'video3_width', height: 'video3_height', duration: 'video3_duration' },
  { key: 'video4_key', width: 'video4_width', height: 'video4_height', duration: 'video4_duration' },
  { key: 'video5_key', width: 'video5_width', height: 'video5_height', duration: 'video5_duration' },
] as const;

interface Dim {
  width: number;
  height: number;
  duration: number;
}

async function probe(file: string): Promise<Dim> {
  const { stdout } = await execFileP(FFPROBE_BIN, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-show_entries', 'format=duration',
    '-of', 'json', file,
  ]);
  const j = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const s = j.streams?.[0];
  if (!s?.width || !s.height) throw new Error('ffprobe 未读到视频宽高');
  return {
    width: Number(s.width),
    height: Number(s.height),
    duration: Number(j.format?.duration ?? 0),
  };
}

async function main(): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM site_setting WHERE id = 1');
  const r = rows[0] ?? {};
  let done = 0;

  for (const slot of SLOTS) {
    const key = r[slot.key] == null ? null : String(r[slot.key]);
    if (!key) continue;
    const file = path.join(UPLOADS_DIR, path.basename(key));
    const meta = await probe(file);
    await pool.execute(
      `UPDATE site_setting SET ${slot.width}=?, ${slot.height}=?, ${slot.duration}=? WHERE id = 1`,
      [meta.width, meta.height, +meta.duration.toFixed(2)],
    );
    console.log(`✓ ${path.basename(key)} → ${meta.width}×${meta.height} · ${meta.duration.toFixed(1)}s`);
    done += 1;
  }

  console.log(`backfill: 完成，共回填 ${done} 个视频`);
  await pool.end();
}

main().catch((err) => {
  console.error('backfill: 失败 ——', err instanceof Error ? err.message : err);
  process.exit(1);
});
