-- ============================================================
-- 009 · 系列管理字段梳理（2026-10-02 拍板）：
--   ① collection.show_foot —— 卡片左下角描述（中英两行）显隐开关
--      （默认显示，历史行为不变；admin 可按系列禁用）
--   ② 删除 palette_cn（配色描述）—— 无实质作用，admin 移除、前台不再展示
-- 命名口径同步：admin 界面左上大字→「标题」、左下中英文→「中文/英文描述」。
-- ============================================================

ALTER TABLE collection
  ADD COLUMN show_foot TINYINT(1) NOT NULL DEFAULT 1 AFTER show_big;

ALTER TABLE collection
  DROP COLUMN palette_cn;
