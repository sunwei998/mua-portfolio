-- ============================================================
-- 015_restore_section_titles.sql
-- ------------------------------------------------------------
-- 背景：014迁移里我多做了一件事 —— 把存量段名 title_cn / title_en
--   的「造型」「细节」等后缀洗掉（晨袍造型→晨袍、面部细节→面部、
--   Face Detail→Face）。**这是越界**：
--
--   · album_section.title_cn / title_en 是「段名」（后台可逐段覆写）；
--   · section_kind.name_cn / name_en 才是「段落类型名」（本次需求要改的）。
--   用户原话：「只是让你把段落类型的文字改的不加造型，没让你改 titleCn
--   和 titleEn，这两个请恢复之前的数据。」
--
-- 本迁移**反向恢复** 014 的洗名动作，回到 002_seed 的原始口径。
-- desc_cn / desc_en **未被 014 触碰**（比对 seed：0 处差异），无需恢复。
--
-- 为什么不改 014 文件而新建 015：
--   迁移 runner 靠 _migrations 账本 + sha256 校验，已执行迁移不可改动
--   （改字节即checksum 漂移）。且「014 洗一遍 → 015 洗回来」对新库同样
--   成立（净结果 = seed 原样），不需要动 014。
--
-- 幂等：WHERE 同时限定 kind 与 014 的输出值，可重复执行；
--       若后台人工把段名改成别的值（如「晨袍特写」），不会被误改。
-- ============================================================

-- 段名回到 002_seed 口径（「造型 / 细节」后缀保留）
UPDATE album_section SET title_cn = '晨袍造型'  WHERE kind = 'morning'   AND title_cn = '晨袍';
UPDATE album_section SET title_cn = '出门造型'  WHERE kind = 'outdoor'   AND title_cn = '出门';
UPDATE album_section SET title_cn = '仪式主纱'  WHERE kind = 'ceremony'  AND title_cn = '主纱';
UPDATE album_section SET title_cn = '敬酒造型'  WHERE kind = 'toast'     AND title_cn = '敬酒';
UPDATE album_section SET title_cn = '面部细节'  WHERE kind = 'face'      AND title_cn = '面部';
UPDATE album_section SET title_cn = '头饰造型'  WHERE kind = 'headdress' AND title_cn = '头饰';

-- 英文侧：只有 face 一条被 014 改过（Face Detail → Face）
UPDATE album_section SET title_en = 'Face Detail' WHERE kind = 'face' AND title_en = 'Face';
