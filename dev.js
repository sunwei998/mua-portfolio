#!/usr/bin/env node
/* ============================================================
 * dev.js —— 本地开发入口（零依赖，node dev.js 即跑）
 *   http://127.0.0.1:8090/        → 托管 site/（history 路由回退 index.html）
 *   http://127.0.0.1:8090/api/*   → 反向代理到 127.0.0.1:8082（mua-api）
 * 生产环境不用它：Nginx 承担同样角色（try_files + proxy_pass）。
 * ============================================================ */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const SITE_ROOT = path.join(__dirname, 'site');
const PORT = Number(process.env.PORT || 8090);
const API_HOST = '127.0.0.1';
const API_PORT = Number(process.env.API_PORT || 8082);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm',
};

function serveFile(res, abs, req) {
  const ext = path.extname(abs).toLowerCase();
  // no-store：开发服务器禁止一切缓存——iOS Safari / 微信 WebView 的启发式缓存
  // 会把中间版本的 CSS/JS 卡在真机上（真踩：改完样式真机不变，误判为代码问题）
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  };

  // Range 支持：<video> 拖动进度条靠 206 分段拉流；无 Range 时 Chrome 只能全量下完才能 seek
  const range = req && req.headers.range;
  const size = fs.statSync(abs).size;
  const m = range && range.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] !== '' || m[2] !== '')) {
    let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
    let end = m[1] === '' ? size - 1 : (m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1));
    if (isNaN(start) || isNaN(end) || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': end - start + 1,
    });
    fs.createReadStream(abs, { start, end })
      .on('error', () => res.destroy())
      .pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, 'Content-Length': size });
  fs.createReadStream(abs)
    .on('error', () => res.destroy())
    .pipe(res);
}

function proxyApi(req, res) {
  const upstream = http.request(
    { host: API_HOST, port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` } },
    (ur) => { res.writeHead(ur.statusCode || 502, ur.headers); ur.pipe(res); },
  );
  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: `api upstream down (${err.code}) — 先起 server: cd server && npm run dev` }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith('/api/')) return proxyApi(req, res);

  // 路径净化，防目录穿越
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let abs = path.join(SITE_ROOT, rel);
  if (!abs.startsWith(SITE_ROOT)) { res.writeHead(403); return res.end(); }

  if (rel === '/' || !path.extname(abs)) {
    // history 路由：无扩展名的路径一律回退 index.html（SPA fallback）
    abs = path.join(SITE_ROOT, rel === '/' ? 'index.html' : 'index.html');
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    serveFile(res, abs, req);
  });
});

// HOST 可用环境变量覆盖；默认 0.0.0.0 以便手机同 Wi-Fi 访问（真机微信验收）
const HOST = process.env.DEV_HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`[dev] site  → http://${HOST === '0.0.0.0' ? '<lan-ip>' : HOST}:${PORT}`);
  console.log(`[dev] api   → http://127.0.0.1:${PORT}/api/*  (proxy → ${API_HOST}:${API_PORT})`);
});
