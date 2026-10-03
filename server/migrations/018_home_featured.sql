-- 018_home_featured.sql
-- 首页改版（2026-10-03，用户拍板 A+A）：撤「作品系列」横条 → 精选瀑布流（单图 ≤10 张）
-- + 走马灯后新增视频画框区。
-- ① home_featured：精选单图，独立于相册（不引用 photo.id），后台「首页精选」卡维护。
--    caption_cn / caption_en 为预留列（功能保留、前台暂禁用展示），0 张时前台整块隐藏。
-- ② site_setting 增 video_key / video_poster_key：NULL = 前台占位态（COMING SOON）。

CREATE TABLE home_featured (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cos_key     VARCHAR(500) NOT NULL,
  w           SMALLINT UNSIGNED NOT NULL DEFAULT 800,
  h           SMALLINT UNSIGNED NOT NULL DEFAULT 1200,
  ratio       DECIMAL(5,3) NOT NULL DEFAULT 0.667,
  orientation ENUM('portrait','landscape') NOT NULL DEFAULT 'portrait',
  caption_cn  VARCHAR(200) NULL,
  caption_en  VARCHAR(200) NULL,
  sort        INT NOT NULL,
  INDEX idx_home_featured_order (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE site_setting
  ADD COLUMN video_key        VARCHAR(500) NULL AFTER og_image_key,
  ADD COLUMN video_poster_key VARCHAR(500) NULL AFTER video_key;
