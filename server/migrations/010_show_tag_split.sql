-- ============================================================
-- 010 · 描述显隐细分中英（2026-10-02 拍板）：
--   009 的 show_foot（左下描述整体开关）拆为两个独立开关：
--     show_tag_cn —— 中文描述显隐
--     show_tag_en —— 英文描述显隐
--   支持只展示中文 / 只展示英文 / 都展示 / 都隐藏（箭头保留）。
-- ============================================================

ALTER TABLE collection
  ADD COLUMN show_tag_cn TINYINT(1) NOT NULL DEFAULT 1 AFTER show_big,
  ADD COLUMN show_tag_en TINYINT(1) NOT NULL DEFAULT 1 AFTER show_tag_cn;

ALTER TABLE collection
  DROP COLUMN show_foot;
