-- ============================================================
-- 008 · 婚庆选择页拍板（2026-10-02）：
--   ① collection.show_big —— 卡片左上角大字显隐开关（默认显示，历史行为不变）
--   ② collection.enabled  —— 系列启用/禁用（禁用后前台 /api/collections、
--      /api/home 不再返回该系列；admin 仍可见可改）
--   ③ 竖排绢签改名（用户拍板）：西式 · 浪漫 → 西式 · 美学
--                              新中式 · 嫁衣 → 东方 · 新韵
-- 默认 1：存量行与 005 种子 INSERT（未列新列）均落默认开启，零回归。
-- ============================================================

ALTER TABLE collection
  ADD COLUMN show_big TINYINT(1) NOT NULL DEFAULT 1 AFTER palette_cn,
  ADD COLUMN enabled  TINYINT(1) NOT NULL DEFAULT 1 AFTER show_big;

-- 竖签改名（用户拍板 2026-10-02）
UPDATE collection SET vslip_cn = '西式 · 美学' WHERE style = 'western';
UPDATE collection SET vslip_cn = '东方 · 新韵' WHERE style = 'chinese';
