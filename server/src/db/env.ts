/* ============================================================
 * env.ts —— 极简 env 加载（不引 dotenv：只支持 KEY=VALUE、# 注释、无引号值）
 * 读取顺序：server/.env.mua（已加载的进程环境变量优先，不覆盖）
 * ============================================================ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnvFile(): void {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const file = path.join(__dirname, '..', '..', '.env.mua');
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return; // 文件不存在就纯靠进程环境变量
  }
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
