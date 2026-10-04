-- 024: 联系电话入库（联系页「电话 + 拨号」一行，后台站点设置可配置）
-- 背景：联系页只有微信号，用户要求补充电话并支持一键拨打；号码格式
--   强校验在 admin PUT 与前端 blur 双重拦截（手机号 / 含区号座机号）。
ALTER TABLE site_setting
  ADD COLUMN contact_phone VARCHAR(32) NULL AFTER wechat_id;
