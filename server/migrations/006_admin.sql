-- ============================================================
-- 006_admin.sql — M6 管理后台：单账号（build-plan §03 口径）
-- 密码绝不存明文：scrypt(N=16384) 存 'scrypt$salt$hash'。
-- 账号种子不在 SQL 里做（hash 由 Node 生成）——server/src/admin.ts
-- 启动时检测空表 INSERT IGNORE 默认账号（ADMIN_USER / ADMIN_PASS）。
-- ============================================================

CREATE TABLE admin_user (
  id         TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  username   VARCHAR(60)  NOT NULL,
  pass_hash  VARCHAR(200) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_admin_single CHECK (id = 1)   -- 单账号口径，与 site_setting 同款
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
