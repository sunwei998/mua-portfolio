-- ============================================================
-- 002_seed.sql — 演示数据（占位图版，M7 切 COS 时只改 cos_key）
-- 结构：site_setting 1 行 · collection 2 条（西式在前）·
--       album 6 册（西式 w1-w3 / 新中式 c1-c3）· 六段齐全 ·
--       face/headdress 张数覆盖 1/2/3/4/5/6 全部分支（photoGrid 验收看这里）：
--         w1: face 2 + headdress 3      w2: face 4 + headdress 1     w3: face 6 + headdress 2
--         c1: face 1 + headdress 4      c2: face 3 + headdress 6     c3: face 2 + headdress 5(横滑档)
--       gallery 2 个 × 8 张（engagement / maternity）
-- album id 映射：1=w1 2=w2 3=w3 4=c1 5=c2 6=c3（下方 CASE 依赖此映射）
-- ============================================================

-- ---------- 站点设置（单行） ----------
INSERT INTO site_setting
  (id, brand_cn, brand_en, tagline_cn, sub_cn, sub_long_cn, byline_cn, bio_cn, stats_json, flow_json, wechat_id, qrcode_key, og_image_key)
VALUES
  (1, '予时妍', 'YUÉ ATELIER', '为重要时刻，留一份美',
   '婚礼 与 日常', '婚礼跟妆 · 订婚宴 · 孕亲照 · 日常妆', '甜茉 · 化妆师个人作品集',
   '予时妍是化妆师甜茉的个人工作室。专注婚礼跟妆与重要时刻的妆造，相信美是被认真对待的时间给的。',
   JSON_ARRAY(
     JSON_OBJECT('value', '120+', 'label', '场婚礼跟妆'),
     JSON_OBJECT('value', '6 年',  'label', '全职妆造经验'),
     JSON_OBJECT('value', '98%',   'label', '客人转介绍率')),
   JSON_ARRAY(
     JSON_OBJECT('step', '01', 'title', '预约沟通'),
     JSON_OBJECT('step', '02', 'title', '试妆定型'),
     JSON_OBJECT('step', '03', 'title', '婚礼跟妆'),
     JSON_OBJECT('step', '04', 'title', '返图归档')),
   'tianmo-demo', NULL, NULL);  -- wechat_id / 二维码 / 分享图为占位，后台可改

-- ---------- 双封面（西式婚礼在前） ----------
INSERT INTO collection (slug, style, big_cn, tagline_cn, tagline_en, vslip_cn, cover_key, strips_json, sort) VALUES
  ('western', 'western', '西式婚礼', '白纱与花窗之间的柔光', 'SOFT LIGHT BETWEEN VEILS', '西式 · 美学',
   '/img/w-a.png', JSON_ARRAY('/img/w-b.png', '/img/portrait.png', '/img/hero.png'), 0),
  ('chinese', 'chinese', '新中式婚礼', '锦绣嫁衣 · 十里红妆', 'ORIENTAL BRIDAL', '新中式 · 嫁衣',
   '/img/nc-a.png', JSON_ARRAY('/img/nc-b.png', '/img/nc-c.png', '/img/closeup-head.png'), 1);

-- ---------- 6 册 ----------
INSERT INTO album (id, slug, title_cn, title_en, style, category, ordinal_label, cover_key, cover_len_ratio, sort, published) VALUES
  (1, 'western-01', '婚礼跟妆 · 其一', 'Wedding No.1', 'western', 'wedding', 'Ⅰ', '/img/w-a.png',      0.800, 1, 1),
  (2, 'western-02', '婚礼跟妆 · 其二', 'Wedding No.2', 'western', 'wedding', 'Ⅱ', '/img/w-b.png',      0.800, 2, 1),
  (3, 'western-03', '婚礼跟妆 · 其三', 'Wedding No.3', 'western', 'wedding', 'Ⅲ', '/img/portrait.png', 0.800, 3, 1),
  (4, 'chinese-01', '中式嫁衣 · 壹',   'Chinese No.1', 'chinese', 'wedding', '壹', '/img/nc-a.png',     0.800, 1, 1),
  (5, 'chinese-02', '中式嫁衣 · 贰',   'Chinese No.2', 'chinese', 'wedding', '贰', '/img/nc-b.png',     0.800, 2, 1),
  (6, 'chinese-03', '中式嫁衣 · 叁',   'Chinese No.3', 'chinese', 'wedding', '叁', '/img/nc-c.png',     0.800, 3, 1);

-- ---------- 六段（西式婚礼与新中式婚礼共用 kind，标题为默认口径，后台可覆盖） ----------
INSERT INTO album_section (album_id, kind, title_cn, title_en, desc_cn, desc_en, layout, max_visible, sort)
SELECT a.id, k.kind, k.cn, k.en, k.desc_cn, k.desc_en, 'auto', 6, k.sort
FROM album a
JOIN (
  SELECT 1 AS sort, 'morning'   AS kind, '晨袍造型' AS cn, 'Morning Robe' AS en,
         '清晨的窗光里，先定下一个安静的底。' AS desc_cn, 'A quiet base in the morning light.' AS desc_en
  UNION ALL SELECT 2, 'outdoor',   '出门造型', 'Out the Door',
         '接亲出发前的最后确认，头纱与裙摆都妥帖。', 'Final checks before the door — veil and gown in place.'
  UNION ALL SELECT 3, 'ceremony',  '仪式主纱', 'Ceremony',
         '走向仪式区的那一段，主纱完整而庄重。', 'The walk to the altar, veil complete and solemn.'
  UNION ALL SELECT 4, 'toast',     '敬酒造型', 'The Toast',
         '换下主纱后的利落与红润，举杯刚刚好。', 'Sleek and glowing after the veil comes off.'
  UNION ALL SELECT 5, 'face',      '面部细节', 'Face Detail',
         '妆容的近看：底妆、眉眼与唇色。', 'Up close: base, brows, eyes and lips.'
  UNION ALL SELECT 6, 'headdress', '头饰造型', 'Headdress',
         '发间与耳畔的细节收束。', 'Details gathered in hair and at the ears.'
) k
WHERE a.category = 'wedding';

-- ---------- 照片（数字表 × 张数 CASE 生成；横图故意混入 face/headdress 的第 2 张） ----------
INSERT INTO photo (section_id, cos_key, w, h, ratio, orientation, caption_cn, caption_en, sort)
SELECT
  s.id,
  CASE
    WHEN s.kind = 'face' THEN ELT(1 + (n.n MOD 3), '/img/closeup-face.png', '/img/portrait.png', '/img/hero.png')
    WHEN s.kind = 'headdress' THEN ELT(1 + (n.n MOD 3), '/img/closeup-head.png', '/img/nc-c.png', '/img/portrait.png')
    ELSE ELT(1 + ((s.id + n.n * 3) MOD 10),
             '/img/w-a.png','/img/w-b.png','/img/nc-a.png','/img/nc-b.png','/img/nc-c.png',
             '/img/portrait.png','/img/hero.png','/img/family.png','/img/closeup-face.png','/img/closeup-head.png')
  END,
  CASE WHEN (s.kind IN ('face','headdress') AND n.n = 2 AND s.album_id IN (2, 5)) THEN 1200 ELSE 800 END,
  CASE WHEN (s.kind IN ('face','headdress') AND n.n = 2 AND s.album_id IN (2, 5)) THEN  800 ELSE 1200 END,
  CASE WHEN (s.kind IN ('face','headdress') AND n.n = 2 AND s.album_id IN (2, 5)) THEN 1.500 ELSE 0.667 END,
  CASE WHEN (s.kind IN ('face','headdress') AND n.n = 2 AND s.album_id IN (2, 5)) THEN 'landscape' ELSE 'portrait' END,
  NULL, NULL,
  n.n
FROM album_section s
JOIN (
  SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) n

-- ---------- 平铺图集（订婚宴 / 孕亲照，不分风格） ----------
INSERT INTO gallery (id, slug, title_cn, title_en, desc_cn) VALUES
  (1, 'engagement', '订婚宴跟妆',   'Engagement',         '订婚宴全程记录 · 不设分类'),
  (2, 'maternity',  '孕妇照 · 亲子照', 'Maternity & Family', '温柔的时刻 · 不设分类');

INSERT INTO gallery_photo (gallery_id, cos_key, w, h, ratio, orientation, caption_cn, caption_en, sort)
SELECT
  g.id,
  ELT(1 + ((g.id * 2 + n.n * 3) MOD 10),
      '/img/w-a.png','/img/w-b.png','/img/nc-a.png','/img/nc-b.png','/img/nc-c.png',
      '/img/portrait.png','/img/hero.png','/img/family.png','/img/closeup-face.png','/img/closeup-head.png'),
  CASE WHEN n.n = 5 THEN 1200 ELSE 800 END,
  CASE WHEN n.n = 5 THEN  800 ELSE 1200 END,
  CASE WHEN n.n = 5 THEN 1.500 ELSE 0.667 END,
  CASE WHEN n.n = 5 THEN 'landscape' ELSE 'portrait' END,
  NULL, NULL,
  n.n
FROM gallery g
JOIN (
  SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
) n;
