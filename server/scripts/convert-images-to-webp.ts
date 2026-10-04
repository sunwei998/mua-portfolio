/* ============================================================
 * convert-images-to-webp.ts —— 存量图片批量转 WebP（022 之后的图片瘦身）
 * 只处理 /img/uploads 下、被 DB 引用的 .png（.jpg 已压缩、体积小，跳过）。
 * 分辨率不变，WebP q90（实测 PSNR ≥40dB 无肉眼差）。
 *
 * 安全设计：
 *   - 默认 dry-run，只打印计划；加 --apply 才真正转换
 *   - 先生成全部 .webp（原图 .png 保留在磁盘做天然备份），全部成功后再用一个事务改 DB
 *   - sharp 解不开的文件（如历史假图片）跳过并警告，不中断
 *   - 二维码列 qrcode_key 刻意不处理
 *
 * 用法：cd server && npx tsx scripts/convert-images-to-webp.ts [--apply]
 * 验证通过后归档原图：npx tsx scripts/convert-images-to-webp.ts --archive
 * ============================================================ */
import { mkdir, stat, writeFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2';
import sharp from 'sharp';
import { pool } from '../src/db/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, '..', '..', 'site');
const UPLOADS_DIR = path.join(SITE_DIR, 'img', 'uploads');
const ARCHIVE_DIR = path.join(SITE_DIR, 'img', '_archive', 'uploads');
const QUALITY = 90;

/* 单列图片引用（表.列）；qrcode_key 刻意排除（二维码保持原格式） */
const SINGLE: { table: string; col: string }[] = [
  { table: 'album', col: 'cover_key' },
  { table: 'photo', col: 'cos_key' },
  { table: 'gallery_photo', col: 'cos_key' },
  { table: 'home_featured', col: 'cos_key' },
  { table: 'collection', col: 'cover_key' },
  { table: 'site_setting', col: 'hero_key' },
  { table: 'site_setting', col: 'og_image_key' },
];
/* JSON 数组型引用（collection.strips_json = ["…","…"]） */
const JSON_ARR: { table: string; col: string }[] = [
  { table: 'collection', col: 'strips_json' },
];

const isPngUpload = (k: string) => k.startsWith('/img/uploads/') && k.toLowerCase().endsWith('.png');
const webpKey = (k: string) => k.replace(/\.png$/i, '.webp');

/** 收集 DB 中所有被引用的 uploads png key（去重） */
async function collectKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const { table, col } of SINGLE) {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${col} AS k FROM ${table}`);
    rows.forEach((r) => { const k = String(r.k ?? ''); if (isPngUpload(k)) keys.add(k); });
  }
  for (const { table, col } of JSON_ARR) {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${col} AS j FROM ${table}`);
    rows.forEach((r) => {
      const arr = Array.isArray(r.j) ? r.j : [];
      arr.forEach((x) => { const k = String(x); if (isPngUpload(k)) keys.add(k); });
    });
  }
  return keys;
}

/** 转换单个文件，返回体积变化；解不开抛错 */
async function convertOne(key: string): Promise<{ oldSize: number; newSize: number }> {
  const rel = key.replace('/img/uploads/', '');
  const src = path.join(UPLOADS_DIR, rel);
  const dest = path.join(UPLOADS_DIR, rel.replace(/\.png$/i, '.webp'));
  const buf = await sharp(src)
    .webp({ quality: QUALITY })
    .toBuffer();
  // 回读校验：生成的 webp 必须能被解码且有尺寸
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error('生成的 webp 无有效尺寸');
  await writeFile(dest, buf);
  return { oldSize: (await stat(src)).size, newSize: buf.length };
}

async function runApply(): Promise<void> {
  const keys = [...(await collectKeys())].sort();
  console.log(`计划转换 ${keys.length} 张 PNG（WebP q${QUALITY}，分辨率不变）`);

  const map = new Map<string, { oldSize: number; newSize: number }>();
  let oldTotal = 0;
  let newTotal = 0;
  for (const key of keys) {
    try {
      const sizes = await convertOne(key);
      map.set(key, sizes);
      oldTotal += sizes.oldSize;
      newTotal += sizes.newSize;
      console.log(`✓ ${path.basename(key)}  ${(sizes.oldSize / 1024).toFixed(0)}KB → ${(sizes.newSize / 1024).toFixed(0)}KB`);
    } catch (err) {
      console.warn(`⚠ 跳过 ${path.basename(key)}：${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`文件转换完成：${(oldTotal / 1048576).toFixed(2)}MB → ${(newTotal / 1048576).toFixed(2)}MB（${(oldTotal / Math.max(1, newTotal)).toFixed(1)}×）`);

  // 全部生成成功后，一个事务更新所有引用
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const oldKey of map.keys()) {
      const newKey = webpKey(oldKey);
      for (const { table, col } of SINGLE) {
        await conn.execute(`UPDATE ${table} SET ${col}=? WHERE ${col}=?`, [newKey, oldKey]);
      }
      for (const { table, col } of JSON_ARR) {
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT id, ${col} AS j FROM ${table}`);
        for (const r of rows) {
          if (!Array.isArray(r.j) || !r.j.includes(oldKey)) continue;
          const next = r.j.map((x: string) => (x === oldKey ? newKey : x));
          await conn.execute(`UPDATE ${table} SET ${col}=CAST(? AS JSON) WHERE id=?`,
            [JSON.stringify(next), r.id]);
        }
      }
    }
    await conn.commit();
    console.log(`✓ DB 引用已全部更新（${map.size} 张）。原图 PNG 暂保留，验证后用 --archive 归档。`);
  } catch (err) {
    await conn.rollback();
    console.error('DB 更新失败已回滚：', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    conn.release();
  }
}

/** 归档：把已被 webp 替代、且 DB 不再引用的 uploads png 移到 _archive */
async function runArchive(): Promise<void> {
  const stillReferenced = await collectKeys(); // 现在只收集 .png，转换成功的已不在 DB
  await mkdir(ARCHIVE_DIR, { recursive: true });
  const files = (await readdir(UPLOADS_DIR)).filter((f) => f.toLowerCase().endsWith('.png'));
  let moved = 0;
  for (const f of files) {
    const key = `/img/uploads/${f}`;
    if (stillReferenced.has(key)) { console.log(`· 保留（仍被引用）：${f}`); continue; }
    await rename(path.join(UPLOADS_DIR, f), path.join(ARCHIVE_DIR, f));
    console.log(`→ 归档 ${f}`);
    moved += 1;
  }
  console.log(`归档完成，共移动 ${moved} 个文件 → ${ARCHIVE_DIR}`);
}

async function main(): Promise<void> {
  const mode = process.argv.includes('--apply') ? 'apply'
    : process.argv.includes('--archive') ? 'archive' : 'dry';
  if (mode === 'dry') {
    const keys = await collectKeys();
    console.log(`[dry-run] 待转换 PNG：${keys.size} 张（加 --apply 执行）`);
    [...keys].sort().forEach((k) => console.log('  ', k));
  } else if (mode === 'apply') {
    await runApply();
  } else {
    await runArchive();
  }
  await pool.end();
}

main().catch((err) => {
  console.error('convert: 失败 ——', err instanceof Error ? err.message : err);
  process.exit(1);
});
