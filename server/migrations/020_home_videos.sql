-- 020_home_videos.sql
-- 首页视频位扩到 2 个（2026-10-03，用户拍板）：site_setting 增第二视频列。
-- 第一个视频沿用 018 的 video_key / video_poster_key，存量数据零改动；
-- 两列均 NULL = 前台占位态（COMING SOON）。前台最多渲染 2 个画框。

ALTER TABLE site_setting
  ADD COLUMN video2_key        VARCHAR(500) NULL AFTER video_poster_key,
  ADD COLUMN video2_poster_key VARCHAR(500) NULL AFTER video2_key;
