-- ============================================================
-- 014_section_kind_config.sql
-- ------------------------------------------------------------
-- ① album_section.kind 加 'welcome'（迎宾）—— 原ENUM 只有 7 值
--    （morning/outdoor/ceremony/toast/face/headdress/flat），迎宾是新增类型。
--    注：007迁移里出现过的「迎宾」只是图说文案 caption_cn='迎宾 · 烛光'，
--    不是段落类型；本迁移才是真正新增该段落类型。
-- ② 新建 section_kind 配置表 —— 段落类型的**中文名 / 英文名**配置化，
--    前台所有硬编码短名（SHORT）改为从这张表取。
--    展示风格（style）**只读**：用户要求「除瀑布流外展示风格严格限死」，
--    所以 style 列建表时写死、后台配置页只展示不可改。
-- ③ 存量段落 title_cn 去掉「造型」二字（晨袍造型→晨袍、出门造型→出门、
--    敬酒造型→敬酒、面部细节→面部、头饰造型→头饰、仪式主纱→主纱）。
--
-- 幂等：ALTER ENUM 与 CREATE TABLE 均为幂等写法（ENUM 值列表全量给出）；
--       UPDATE 用WHERE 精确匹配，重复执行结果一致。
-- 后续加类型：ALTER kind ENUM 再加一个值 + INSERT 一行 section_kind。
-- ============================================================

-- ---------- ① album_section.kind 枚举加值（必须放最末，不能插中间） ----------
-- welcome（迎宾）插在 flat **之前**：flat 是特殊挂载类型，保持在末位更清晰。
ALTER TABLE album_section
  MODIFY COLUMN kind ENUM('morning','outdoor','welcome','ceremony','toast','face','headdress','flat')
  NOT NULL;

-- ---------- ② 段落类型配置表 ----------
-- style 取值域（写死，不可改）：
--   shot —— 单图段落版式（1张 full / 2 张 duo / ≥3 首图 full + 两两duo）
--   off  —— 单张时右偏 66%（仅 toast 敬酒段沿用既有设计）
--   grid —— 多图拼版（1 moon 特写 / 2-4 双列 / ≥5 横滑）
--   flat —— 瀑布流挂载段（无章节头，照片直接进双列流）
CREATE TABLE IF NOT EXISTS section_kind (
  code      VARCHAR(32)   NOT NULL PRIMARY KEY,          -- 与 album_section.kind 同一取值域
  name_cn   VARCHAR(20)   NOT NULL,                      -- 章节名（中文）
  name_en   VARCHAR(60)   NOT NULL,                      -- 英文副标
  style     ENUM('shot','off','grid','flat') NOT NULL DEFAULT 'shot',
  sort      INT           NOT NULL DEFAULT 0,           -- 章节序号（西式 Ⅰ-Ⅵ / 新中式 壹-陆）
  is_flat   TINYINT(1)    NOT NULL DEFAULT 0,           -- 1 = 瀑布流挂载段（无章节头）
  enabled   TINYINT(1)    NOT NULL DEFAULT 1,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 灌 8 行（幂等：INSERT ... ON DUPLICATE KEY UPDATE 只更新名称，不重置风格）
INSERT INTO section_kind (code, name_cn, name_en, style, sort, is_flat) VALUES
  ('morning',   '晨袍',   'Morning Robe',  'shot', 1, 0),
  ('outdoor',   '出门',   'Out the Door',  'shot', 2, 0),
  ('welcome',   '迎宾',   'Welcome',       'shot', 3, 0),
  ('ceremony',  '主纱',   'Ceremony',      'shot', 4, 0),
  ('toast',     '敬酒',   'The Toast',     'off',  5, 0),
  ('face',      '面部',   'Face Detail',   'grid', 6, 0),
  ('headdress', '头饰',   'Headdress',     'grid', 7, 0),
  ('flat',      '瀑布流', 'Waterfall',     'flat', 0, 1)
ON DUPLICATE KEY UPDATE
  name_cn = VALUES(name_cn), name_en = VALUES(name_en),
  style = VALUES(style), sort = VALUES(sort), is_flat = VALUES(is_flat);

-- ---------- ③ 存量段落名去「造型」（幂等：WHERE 精确匹配） ----------
UPDATE album_section SET title_cn = '晨袍' WHERE title_cn = '晨袍造型';
UPDATE album_section SET title_cn = '出门' WHERE title_cn = '出门造型';
UPDATE album_section SET title_cn = '主纱' WHERE title_cn = '仪式主纱';
UPDATE album_section SET title_cn = '敬酒' WHERE title_cn = '敬酒造型';
UPDATE album_section SET title_cn = '面部' WHERE title_cn = '面部细节';
UPDATE album_section SET title_cn = '头饰' WHERE title_cn = '头饰造型';

-- 英文侧同步去冗余（面部细节→面部，与中文侧保持一致口径）
UPDATE album_section SET title_en = 'Face'   WHERE title_en = 'Face Detail';
