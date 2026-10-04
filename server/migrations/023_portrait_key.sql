-- 023: 主理人头像入库（首页右上角头像 + 联系页圆形图同源，后台站点设置上传）
-- 背景：两处头像原先硬编码 /img/portrait.webp，主理人无法自行更换；
--   新增 portrait_key 单列，/api/home 与 /api/site 同时下发，前后台共用。
ALTER TABLE site_setting
  ADD COLUMN portrait_key VARCHAR(500) NULL AFTER og_image_key;
