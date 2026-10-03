-- ============================================================
-- 012_photo_orientation_truth.sql
-- ------------------------------------------------------------
-- 修正 photo / gallery_photo 的 w / h / ratio / orientation —— 让它们
-- 反映**图片真实像素**，而不是 seed 里按「第几张 + 哪个册」硬编的值。
--
-- 背景（2026-10-03 实测）：
--   site/img 下 10 张照片**全是竖图**（1024×1536；closeup-face / closeup-head
--   是 1024×1024 正方），**没有一张真横图**。
--   但 002_seed 用 CASE 按 album_id + 序号强塞横图，把 9 条真实竖图标成了
--   landscape + 1200×800 + ratio 1.5。前端据此把它们排进「横图独占全宽行」，
--   于是竖图被拉成409px 宽的横构图 —— 视觉上就是变形。
--
-- 影响面（迁移前实测）：5 个册 + 2 个图集共 9 条记录：
--   western-02 / chinese-02 / engagement-01 / maternity-01 / family-01
--   + gallery engagement / maternity
--
-- 本迁移只改「描述图片本身属性」的字段，不动任何业务字段（sort / caption /
--   section_id / 所属册）。因此版式会从「假横图行」变回「双列竖图流」，
--   这是**修正**而非回归 —— 数据本来就该长这样。
--
-- 幂等：纯 UPDATE，重复执行结果一致。
-- 后续加图纪律：orientation 必须按真实像素登记；site/img 当前无真横图，
--   若日后补入横图，在末尾追加一条对应的 CASE 分支即可。
-- ============================================================

-- ---------- photo ----------
-- w 恒为 1024（全部素材的原生宽度一致）；h 按实际像素：正方形特写 1024，其余长图 1536
UPDATE photo SET
  w = 1024,
  h = CASE
    WHEN cos_key IN ('/img/closeup-face.png', '/img/closeup-head.png') THEN 1024
    ELSE 1536
  END,
  orientation = 'portrait'
WHERE cos_key IN (
  '/img/closeup-face.png','/img/closeup-head.png',
  '/img/w-a.png','/img/w-b.png','/img/nc-a.png','/img/nc-b.png','/img/nc-c.png',
  '/img/portrait.png','/img/hero.png','/img/family.png'
);

-- ratio 一律由 w/h 现算，避免手写常量再次与像素漂移
UPDATE photo SET ratio = ROUND(w / h, 3);

-- ---------- gallery_photo（同口径） ----------
UPDATE gallery_photo SET
  w = 1024,
  h = CASE
    WHEN cos_key IN ('/img/closeup-face.png', '/img/closeup-head.png') THEN 1024
    ELSE 1536
  END,
  orientation = 'portrait'
WHERE cos_key IN (
  '/img/closeup-face.png','/img/closeup-head.png',
  '/img/w-a.png','/img/w-b.png','/img/nc-a.png','/img/nc-b.png','/img/nc-c.png',
  '/img/portrait.png','/img/hero.png','/img/family.png'
);

UPDATE gallery_photo SET ratio = ROUND(w / h, 3);