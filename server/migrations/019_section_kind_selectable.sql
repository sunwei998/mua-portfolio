-- ============================================================
-- 019_section_kind_selectable.sql
-- ------------------------------------------------------------
-- 目的：section_kind.enabled 改名为 selectable，并把语义写死在列注释里。
--
-- 背景（用户 2026-10-03 拍板「改为 selectable，要严谨，改字段影响较大」）：
--   原名 `enabled` 会被读成「停用后前台不展示」，但真实语义是
--   **「停用 = 后台不再提供新建该类型段落；已有段落照常显示，前台零变化」**。
--   名字与语义不符是最容易埋雷的地方（后来人看到 enabled=0 会以为该隐藏前台内容，
--   从而在 public.ts 里加过滤，反而把已发布作品改掉）—— 故彻底更名。
--
-- 为什么不叫 archived / disabled：
--   archived 含「已归档」的过去式，暗示数据不再使用；disabled 易被读成「前台隐藏」。
--   selectable 精确表达「这个类型还能不能被新建选中」，是纯**可选择性**语义，
--   与「内容是否展示」完全解耦。
--
-- ⚠️ 本迁移**只改列名，不改数据**：TINYINT(1) NOT NULL DEFAULT 1 原样搬过去，
--    8 个段落类型的取值全部保持 1（= 仍可新建），等价于什么都没停用。
--
-- ⚠️ 不加任何前台过滤：`enabled/selectable` 在 server/src/routes/public.ts 里
--    **必须保持零引用**。停用只影响 admin 的「新建」入口，
--    已发布段落的角标 / 章节头 / 版式一律照旧（用户口径：照常显示，只是不能再新建）。
--
-- 幂等：CHANGE COLUMN 不能重复执行（第二次会报 Unknown column），
--       故用 information_schema 判存在性 + PREPARE 动态执行，重复跑是no-op。
-- ============================================================

SET @ren := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section_kind'
              AND COLUMN_NAME = 'enabled')
    AND NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section_kind'
              AND COLUMN_NAME = 'selectable'),
    'ALTER TABLE section_kind CHANGE COLUMN `enabled` `selectable` TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''能否新建该类型段落：1=可新建；0=已停用（后台不再提供新建，已有段落与前台展示完全不受影响）''',
    'DO 0'
  )
);
PREPARE st FROM @ren;
EXECUTE st;
DEALLOCATE PREPARE st;
