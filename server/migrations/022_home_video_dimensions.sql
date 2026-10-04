-- 022: 首页视频宽高与时长入库（5 个槽位 × width / height / duration，共 15 列）
-- 背景：/api/home 原先只下发 key / posterKey，前台 .vinner 由 CSS 写死 9:16，
--   真实比例要等浏览器下载视频元数据触发 loadedmetadata；首屏大图占满 HTTP/1.1
--   的 6 条连接，元数据请求排队约一分钟后才到达，表现为「进来是竖框、过一会儿自己变好」。
-- 改为：上传时 ffprobe 已读到的 width / height / duration 落库，随 /api/home 下发，
--   前台首帧即按真实比例渲染；存量视频由部署后一次性 ffprobe 回填。

ALTER TABLE site_setting
  ADD COLUMN video_width     INT UNSIGNED   NULL AFTER video_poster_key,
  ADD COLUMN video_height    INT UNSIGNED   NULL AFTER video_width,
  ADD COLUMN video_duration  DECIMAL(10,2)  NULL AFTER video_height,

  ADD COLUMN video2_width    INT UNSIGNED   NULL AFTER video2_poster_key,
  ADD COLUMN video2_height   INT UNSIGNED   NULL AFTER video2_width,
  ADD COLUMN video2_duration DECIMAL(10,2)  NULL AFTER video2_height,

  ADD COLUMN video3_width    INT UNSIGNED   NULL AFTER video3_poster_key,
  ADD COLUMN video3_height   INT UNSIGNED   NULL AFTER video3_width,
  ADD COLUMN video3_duration DECIMAL(10,2)  NULL AFTER video3_height,

  ADD COLUMN video4_width    INT UNSIGNED   NULL AFTER video4_poster_key,
  ADD COLUMN video4_height   INT UNSIGNED   NULL AFTER video4_width,
  ADD COLUMN video4_duration DECIMAL(10,2)  NULL AFTER video4_height,

  ADD COLUMN video5_width    INT UNSIGNED   NULL AFTER video5_poster_key,
  ADD COLUMN video5_height   INT UNSIGNED   NULL AFTER video5_width,
  ADD COLUMN video5_duration DECIMAL(10,2)  NULL AFTER video5_height;
