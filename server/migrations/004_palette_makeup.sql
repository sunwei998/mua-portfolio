-- ============================================================
-- 004 · v6 还原 #11：cmeta 配色文案 + bmeta 妆面描述
--   collection.palette_cn —— 双封面下方 cmeta 左侧（设计稿 02 屏：
--     「玫瑰 · 奶白 · 香槟 | 共 四 册」「绛红 · 藕荷 · 香槟金 | 共 六 册」）
--   album.makeup_cn      —— 册页列表 bmeta 左侧（设计稿 03/04 屏：
--     「香槟裸妆 · 低盘发」「绛唇 · 描金眼线 · 盘发」等，替代现渲染的
--     「N 张 · 全程记录」占位；前端空值回退占位，不糊）
-- 可空列：admin 后台（M6）未填时前台自动回退，不阻断旧数据。
-- ============================================================

ALTER TABLE collection
  ADD COLUMN palette_cn VARCHAR(60) NULL AFTER vslip_cn;

ALTER TABLE album
  ADD COLUMN makeup_cn VARCHAR(60) NULL AFTER cover_len_ratio;

-- 双封面配色（v6 02 屏 cmeta）
UPDATE collection SET palette_cn = '玫瑰 · 奶白 · 香槟'     WHERE style = 'western';
UPDATE collection SET palette_cn = '绛红 · 藕荷 · 香槟金'   WHERE style = 'chinese';

-- 六册妆面描述（v6 03/04 屏 bmeta）
UPDATE album SET makeup_cn = '香槟裸妆 · 低盘发'            WHERE slug = 'western-01';
UPDATE album SET makeup_cn = '雾感眼妆 · 珍珠耳饰'          WHERE slug = 'western-02';
UPDATE album SET makeup_cn = '缎面蝴蝶结 · 玫瑰棕唇'        WHERE slug = 'western-03';
UPDATE album SET makeup_cn = '绛唇 · 描金眼线 · 盘发'       WHERE slug = 'chinese-01';
UPDATE album SET makeup_cn = '点翠 · 绒花 · 柳叶眉'         WHERE slug = 'chinese-02';
UPDATE album SET makeup_cn = '素纱 · 步摇 · 绛色唇釉'       WHERE slug = 'chinese-03';
