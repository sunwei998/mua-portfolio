-- ============================================================
-- 005_v7_series_stats.sql — V7：三新系列（订婚宴/孕妈/亲子）+ 互动计数
-- 设计稿 design-v7.html（用户拍板 1-4 按稿、5 仅西式）：
--   ① album 加 layout（sectioned 六段叙事 | flat 瀑布流）
--   ② 新表 album_stats（views/likes/shares，与 album 1:1）
--   ③ 枚举扩容：style/category 加 engagement/maternity/family，
--      section kind 加 'flat'（flat 册的照片挂载段，一册一段）
--   ④ collection 插入 3 行新系列（首页「更多时刻」+ /style/:style 列表）
--   ⑤ 每系列 1 本 flat 演示册 + 12 张照片（复用 demo 资产）
-- 旧 gallery 两表保留不动（口径已由 flat 册接管，M6 后台再清理）
-- ============================================================

-- ① 枚举扩容（MySQL 8 追加枚举值为元数据变更，瞬间完成）
ALTER TABLE album MODIFY COLUMN style
  ENUM('western','chinese','engagement','maternity','family') NOT NULL;
ALTER TABLE album MODIFY COLUMN category
  ENUM('wedding','engagement','maternity','family') NOT NULL;
ALTER TABLE album_section MODIFY COLUMN kind
  ENUM('morning','outdoor','ceremony','toast','face','headdress','flat') NOT NULL;
ALTER TABLE collection MODIFY COLUMN style
  ENUM('western','chinese','engagement','maternity','family') NOT NULL;

-- ② 布局维度：六段叙事 | 瀑布流
ALTER TABLE album ADD COLUMN layout
  ENUM('sectioned','flat') NOT NULL DEFAULT 'sectioned' AFTER category;

-- ③ 互动计数（与 album 1:1；计数只增不减由服务端口径保证）
CREATE TABLE album_stats (
  album_id   BIGINT UNSIGNED PRIMARY KEY,
  views      INT UNSIGNED NOT NULL DEFAULT 0,
  likes      INT UNSIGNED NOT NULL DEFAULT 0,
  shares     INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stats_album FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ④ 三新系列（双封面之后，sort 3/4/5）
INSERT INTO collection (slug, style, big_cn, tagline_cn, tagline_en, vslip_cn, palette_cn, cover_key, strips_json, sort) VALUES
  ('engagement', 'engagement', '订婚宴跟妆', '每一场订婚 · 一册', 'Engagement Moments', '订婚宴', '香槟 · 珍珠白 · 藕粉',
   '/img/w-a.png', CAST('["/img/nc-c.png","/img/w-b.png","/img/closeup-face.png"]' AS JSON), 3),
  ('maternity',  'maternity',  '孕妈照',     '温柔的等待 · 一册', 'Maternity Moments',  '孕妈照', '奶白 · 素纱 · 暖杏',
   '/img/portrait.png', CAST('["/img/hero.png","/img/nc-a.png","/img/closeup-head.png"]' AS JSON), 4),
  ('family',     'family',     '亲子照',     '一起的时刻 · 一册', 'Family Moments',     '亲子照', '暖白 · 原木 · 浅驼',
   '/img/family.png', CAST('["/img/w-a.png","/img/portrait.png","/img/nc-b.png"]' AS JSON), 5);

-- ⑤ 每系列 1 本 flat 演示册（published 直接置 1，演示口径与六册一致）
INSERT INTO album (slug, title_cn, title_en, style, category, layout, ordinal_label, cover_key, cover_len_ratio, sort, published) VALUES
  ('engagement-01', '订婚宴 · 其一', 'ENGAGEMENT NO.1', 'engagement', 'engagement', 'flat', 'Ⅰ', '/img/w-a.png',      0.800, 1, 1),
  ('maternity-01',  '孕妈照 · 其一', 'MATERNITY NO.1',  'maternity',  'maternity',  'flat', 'Ⅰ', '/img/portrait.png', 0.800, 1, 1),
  ('family-01',     '亲子照 · 其一', 'FAMILY NO.1',     'family',     'family',     'flat', 'Ⅰ', '/img/family.png',   0.800, 1, 1);

-- flat 册的照片挂载段：一册一段（kind='flat'，uq_section_kind 天然限一）
INSERT INTO album_section (album_id, kind, title_cn, title_en, layout, sort)
SELECT id, 'flat', title_cn, title_en, 'auto', 1 FROM album
WHERE slug IN ('engagement-01','maternity-01','family-01');

-- 照片 12 张/册：第 5、11 张为横图（瀑布流错落样本）
INSERT INTO photo (section_id, cos_key, w, h, ratio, orientation, caption_cn, caption_en, sort)
SELECT
  s.id,
  ELT(1 + ((s.album_id * 4 + n.n * 3) MOD 10),
      '/img/w-a.png','/img/w-b.png','/img/nc-a.png','/img/nc-b.png','/img/nc-c.png',
      '/img/portrait.png','/img/hero.png','/img/family.png','/img/closeup-face.png','/img/closeup-head.png'),
  CASE WHEN n.n IN (5, 11) THEN 1200 ELSE 800 END,
  CASE WHEN n.n IN (5, 11) THEN  800 ELSE 1200 END,
  CASE WHEN n.n IN (5, 11) THEN 1.500 ELSE 0.667 END,
  CASE WHEN n.n IN (5, 11) THEN 'landscape' ELSE 'portrait' END,
  NULL, NULL,
  n.n
FROM album_section s
JOIN album a ON a.id = s.album_id
JOIN (
  SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
  UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
) n
WHERE s.kind = 'flat'
  AND a.slug IN ('engagement-01','maternity-01','family-01');

-- ⑥ 计数行初始化（0 起步；六段册也一并建行，浏览/点赞全站口径一致）
INSERT INTO album_stats (album_id) SELECT id FROM album;
