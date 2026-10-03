-- ============================================================
-- 001_init.sql — mua_portfolio 8 张表
-- 口径 = build-plan §03（唯一权威）+ server/src/types.ts（API 契约）
-- 注意：六段枚举没有「迎宾」（2026-10-02 拍板删除）
-- ============================================================

-- ① 册：一本册 = 一场婚礼里的一种风格
CREATE TABLE album (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug            VARCHAR(64)  NOT NULL,
  title_cn        VARCHAR(120) NOT NULL,
  title_en        VARCHAR(120) NOT NULL,
  style           ENUM('western','chinese') NOT NULL,
  category        ENUM('wedding','engagement','maternity') NOT NULL,
  ordinal_label   VARCHAR(8)   NOT NULL DEFAULT '',      -- Ⅰ Ⅱ Ⅲ / 壹 贰 叁
  cover_key       VARCHAR(500) NOT NULL,
  cover_len_ratio DECIMAL(5,3) NOT NULL DEFAULT 0.800,   -- 封面宽高比（4:5）
  sort            INT          NOT NULL DEFAULT 0,
  published       TINYINT(1)   NOT NULL DEFAULT 0,
  video_key         VARCHAR(500) NULL,                   -- 一期只留字段
  video_poster_key  VARCHAR(500) NULL,
  video_duration    INT          NULL,                   -- 秒
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_album_slug (slug),
  INDEX idx_album_list (style, published, sort),
  INDEX idx_album_category (category, published, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ② 六段叙事的载体
CREATE TABLE album_section (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  album_id    BIGINT UNSIGNED NOT NULL,
  kind        ENUM('morning','outdoor','ceremony','toast','face','headdress') NOT NULL,
  title_cn    VARCHAR(120) NOT NULL,
  title_en    VARCHAR(120) NOT NULL,
  desc_cn     VARCHAR(500) NULL,
  desc_en     VARCHAR(500) NULL,
  layout      ENUM('auto','single','duo','grid','strip') NOT NULL DEFAULT 'auto',
  max_visible TINYINT UNSIGNED NOT NULL DEFAULT 6,       -- 布局 domBudget 红线
  sort        INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_section_kind (album_id, kind),           -- 一册一段一枚
  INDEX idx_section_order (album_id, sort),
  CONSTRAINT fk_section_album FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ③ 照片：w/h/ratio 由前端上传时写入，后端不做图像处理
CREATE TABLE photo (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  section_id  BIGINT UNSIGNED NOT NULL,
  cos_key     VARCHAR(500) NOT NULL,
  w           SMALLINT UNSIGNED NOT NULL DEFAULT 800,
  h           SMALLINT UNSIGNED NOT NULL DEFAULT 1200,
  ratio       DECIMAL(5,3) NOT NULL DEFAULT 0.667,
  orientation ENUM('portrait','landscape') NOT NULL DEFAULT 'portrait',
  caption_cn  VARCHAR(200) NULL,
  caption_en  VARCHAR(200) NULL,
  sort        INT NOT NULL DEFAULT 0,
  INDEX idx_photo_order (section_id, sort),
  CONSTRAINT fk_photo_section FOREIGN KEY (section_id) REFERENCES album_section(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ④ 双封面：西式婚礼、新中式婚礼（固定 2 条，西式在前）
CREATE TABLE collection (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(64)  NOT NULL,
  style       ENUM('western','chinese') NOT NULL,
  big_cn      VARCHAR(60)  NOT NULL,                    -- 封面大字
  tagline_cn  VARCHAR(200) NOT NULL,
  tagline_en  VARCHAR(200) NOT NULL,
  vslip_cn    VARCHAR(60)  NOT NULL,                    -- 竖排绢签文案
  cover_key   VARCHAR(500) NOT NULL,
  strips_json JSON         NOT NULL,                    -- 右下三张小图
  sort        INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_collection_slug (slug),
  UNIQUE KEY uq_collection_style (style)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ⑤⑥ 平铺图集：订婚宴 / 孕亲照。刻意与 album 解耦（它们没有六段）
CREATE TABLE gallery (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug       VARCHAR(64)  NOT NULL,
  title_cn   VARCHAR(120) NOT NULL,
  title_en   VARCHAR(120) NOT NULL,
  desc_cn    VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gallery_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE gallery_photo (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gallery_id  BIGINT UNSIGNED NOT NULL,
  cos_key     VARCHAR(500) NOT NULL,
  w           SMALLINT UNSIGNED NOT NULL DEFAULT 800,
  h           SMALLINT UNSIGNED NOT NULL DEFAULT 1200,
  ratio       DECIMAL(5,3) NOT NULL DEFAULT 0.667,
  orientation ENUM('portrait','landscape') NOT NULL DEFAULT 'portrait',
  caption_cn  VARCHAR(200) NULL,
  caption_en  VARCHAR(200) NULL,
  sort        INT NOT NULL DEFAULT 0,
  INDEX idx_gphoto_order (gallery_id, sort),
  CONSTRAINT fk_gphoto_gallery FOREIGN KEY (gallery_id) REFERENCES gallery(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ⑦ 站点设置：单行，品牌文案全部配置化
CREATE TABLE site_setting (
  id           TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  brand_cn     VARCHAR(60)  NOT NULL,
  brand_en     VARCHAR(60)  NOT NULL,
  tagline_cn   VARCHAR(120) NOT NULL,
  sub_cn       VARCHAR(60)  NOT NULL,                   -- 字标副标（短版）
  sub_long_cn  VARCHAR(120) NOT NULL,                   -- 长版，仅 meta / 关于页
  byline_cn    VARCHAR(120) NOT NULL,
  bio_cn       VARCHAR(1000) NULL,
  stats_json   JSON         NULL,                       -- 三组统计数字
  flow_json    JSON         NULL,                       -- 流程四步
  wechat_id    VARCHAR(64)  NULL,
  qrcode_key   VARCHAR(500) NULL,
  og_image_key VARCHAR(500) NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ⑧ 迁移 runner 自己的账本（IF NOT EXISTS：runner 启动时也会兜底创建）
CREATE TABLE IF NOT EXISTS _migrations (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  checksum   CHAR(64)     NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_migration_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
