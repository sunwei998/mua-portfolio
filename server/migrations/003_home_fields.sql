-- ============================================================
-- 003_home_fields.sql — /api/home 需要的配置字段（M3）
-- 首页的 hero 图、标签、走马灯词全部走 site_setting 配置，不硬编码。
-- ============================================================

ALTER TABLE site_setting
  ADD COLUMN hero_key     VARCHAR(500) NULL AFTER og_image_key,
  ADD COLUMN hero_tag_cn  VARCHAR(60)  NULL AFTER hero_key,
  ADD COLUMN marquee_json JSON         NULL AFTER hero_tag_cn;

UPDATE site_setting SET
  hero_key     = '/img/hero.png',
  hero_tag_cn  = 'PORTFOLIO · 2026',
  marquee_json = JSON_ARRAY('婚礼跟妆', '订婚宴', '出阁宴', '孕妇照', '亲子照', '日常妆')
WHERE id = 1;
