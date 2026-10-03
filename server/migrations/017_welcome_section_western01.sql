-- ============================================================
-- 017_welcome_section_western01.sql
-- ------------------------------------------------------------
-- 给 western-01（西式婚礼 NO.1）加第 7 段「迎宾」—— 用户 2026-10-03 拍板：
-- 「当前实例不全要加迎宾的，可以给西式第一个作品加一下，你自己生成两张迎宾图。」
--
-- ⚠️ 写迁移注释必须 `--` 后跟一个空格（`-- 「`），写成 `--「` 会被 MySQL 当成 SQL 报语法错。
--
-- 段位：sort=7（接在 headdress 之后，1-based，与全库口径一致）
-- 照片：2 张 → 命中 shotFlow 的 **duo**（两图并排）分支，
--       版式与晨袍/出门/主纱同族；**刻意不同于面部/头饰的拼版（grid）体系**，
--       对应用户口径「迎宾展示风格偏向前面那几种，不同于面部和头饰」。
--
-- 图片规格（已用 PNG 头实测，非估算）：
--   /img/welcome-a.png  1024×1536ratio=0.6667  portrait（酒店门厅远景，新人分立两侧）
--   /img/welcome-b.png  1024×1536  ratio=0.6667  portrait（迎宾台中景，递花宾客、名单牌细节）
--   ⚠️ ratio 必须存真实值：上一轮「图片变形」事故就是把 landscape 误标 portrait + 800/1200 写死。
--
-- 幂等：整段 INSERT ... SELECT ... WHERE NOT EXISTS，重复执行不产生第二段。
-- title_cn='迎宾' 是**段名**（本段专属），类型名在 section_kind.name_cn（可后台改）。
-- ============================================================

-- ---------- 插入迎宾段（若已存在则跳过） ----------
INSERT INTO album_section (album_id, kind, title_cn, title_en, desc_cn, layout, max_visible, sort)
SELECT a.id, 'welcome', '迎宾', 'Welcome',
       '入口处的第一眼，笑容先于名字。', 'auto', 6, 7
  FROM album a
 WHERE a.slug = 'western-01'
   AND NOT EXISTS (
     SELECT 1 FROM album_section s
      WHERE s.album_id = a.id AND s.kind = 'welcome'
   );

-- ---------- 挂 2 张照片（sort 1..2，1-based） ----------
INSERT INTO photo (section_id, cos_key, w, h, ratio, orientation, caption_cn, caption_en, sort)
SELECT s.id, x.cos_key, x.w, x.h, x.ratio, x.orientation, x.caption_cn, x.caption_en, x.sort
  FROM album_section s
  JOIN album a ON a.id = s.album_id
  JOIN (
    SELECT '/img/welcome-a.png' AS cos_key, 1024 AS w, 1536 AS h, 0.6667 AS ratio,
           'portrait' AS orientation, '门厅 · 新人迎候' AS caption_cn, 'Greeting at the entrance' AS caption_en, 1 AS sort
    UNION ALL
    SELECT '/img/welcome-b.png', 1024, 1536, 0.6667, 'portrait', '迎宾台 · 递花', 'Handing a rose', 2
  ) x
 WHERE a.slug = 'western-01'
   AND s.kind = 'welcome'
   AND NOT EXISTS (SELECT 1 FROM photo p WHERE p.section_id = s.id);
