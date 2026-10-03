-- 021_home_videos_five.sql
-- 首页视频位 2 → 5（2026-10-03，用户拍板）：site_setting 增第三/四/五视频列。
-- 前两列沿用 018 的 video_key / video_poster_key 与 020 的 video2_*，存量数据零改动；
-- 全部 NULL = 前台占位态（COMING SOON）。前台最多渲染 5 个画框。

ALTER TABLE site_setting
  ADD COLUMN video3_key        VARCHAR(500) NULL AFTER video2_poster_key,
  ADD COLUMN video3_poster_key VARCHAR(500) NULL AFTER video3_key,
  ADD COLUMN video4_key        VARCHAR(500) NULL AFTER video3_poster_key,
  ADD COLUMN video4_poster_key VARCHAR(500) NULL AFTER video4_key,
  ADD COLUMN video5_key        VARCHAR(500) NULL AFTER video4_poster_key,
  ADD COLUMN video5_poster_key VARCHAR(500) NULL AFTER video5_key;
