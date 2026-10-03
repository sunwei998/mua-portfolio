-- ============================================================
-- 007_v7_copy_polish.sql — V7 还原度比对后的文案/数据修齐
-- 对照 design-v7.html 逐屏核出的偏差（2026-10-02）：
--   ① collection 三新系列 tagline 改设计稿口径：
--      卡 EN 副标 Engagement Rouge / Maternity Soft / Family Warm；
--      卡描述行「N 册 · 轻纱与微醺的光」式
--   ② 三本 flat 演示册补 makeup_cn（列表 bmeta 左侧，稿「微醺烛光 · 低马尾」式）
--   ③ engagement-01 演示图说（瀑布流 cap 胶囊，稿「迎宾 · 烛光」式），
--      三册各 2 张，中英同补
-- 纯 DML，幂等（按 slug/sort 定位 UPDATE）
-- ============================================================

-- ① collection 三新系列 tagline（western/chinese 双封面文案不动）
UPDATE collection SET tagline_cn = '轻纱与微醺的光', tagline_en = 'Engagement Rouge'
  WHERE slug = 'engagement';
UPDATE collection SET tagline_cn = '柔光里的期待', tagline_en = 'Maternity Soft'
  WHERE slug = 'maternity';
UPDATE collection SET tagline_cn = '一起长大的证据', tagline_en = 'Family Warm'
  WHERE slug = 'family';

-- ② flat 演示册妆面描述（styleList bmeta；对齐六段册 004 口径）
UPDATE album SET makeup_cn = '微醺烛光 · 低马尾' WHERE slug = 'engagement-01' AND makeup_cn IS NULL;
UPDATE album SET makeup_cn = '素纱柔光 · 轻盘发'   WHERE slug = 'maternity-01'  AND makeup_cn IS NULL;
UPDATE album SET makeup_cn = '亲子日常 · 透感底妆' WHERE slug = 'family-01'     AND makeup_cn IS NULL;

-- ③ 演示图说（photo.caption_cn/en；每册 sort 1/4 两张，形态同稿 cap 胶囊）
UPDATE photo p
JOIN album_section s ON s.id = p.section_id
JOIN album a ON a.id = s.album_id
SET p.caption_cn = '迎宾 · 烛光', p.caption_en = 'Reception · Candlelight'
WHERE a.slug = 'engagement-01' AND p.sort = 1;

UPDATE photo p
JOIN album_section s ON s.id = p.section_id
JOIN album a ON a.id = s.album_id
SET p.caption_cn = '敬酒 · 香槟纱', p.caption_en = 'Toast · Champagne Veil'
WHERE a.slug = 'engagement-01' AND p.sort = 4;

UPDATE photo p
JOIN album_section s ON s.id = p.section_id
JOIN album a ON a.id = s.album_id
SET p.caption_cn = '窗边 · 剪影', p.caption_en = 'Window · Silhouette'
WHERE a.slug = 'maternity-01' AND p.sort = 1;

UPDATE photo p
JOIN album_section s ON s.id = p.section_id
JOIN album a ON a.id = s.album_id
SET p.caption_cn = '待产 · 静候', p.caption_en = 'Waiting · Softly'
WHERE a.slug = 'maternity-01' AND p.sort = 4;

UPDATE photo p
JOIN album_section s ON s.id = p.section_id
JOIN album a ON a.id = s.album_id
SET p.caption_cn = '午后 · 游戏', p.caption_en = 'Afternoon · Play'
WHERE a.slug = 'family-01' AND p.sort = 1;

UPDATE photo p
JOIN album_section s ON s.id = p.section_id
JOIN album a ON a.id = s.album_id
SET p.caption_cn = '睡前 · 依偎', p.caption_en = 'Bedtime · Cuddle'
WHERE a.slug = 'family-01' AND p.sort = 4;
