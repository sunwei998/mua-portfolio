-- ============================================================
-- 016_align_sort_one_based.sql
-- ------------------------------------------------------------
-- 背景：`album_section.sort` 与 `photo.sort` 在库内存在**两套口径**——
--   002_seed 写的全是 1..N；
--   而 admin「整册替换」接口（PUT /api/admin/albums/:id/sections）用数组下标
--   i / j 写回，是 0-based。western-01 是唯一被后台保存过的册子，
--   于是它的 6 段 + 14 张照片全部被改成了 0-based，其余 8 册仍是 1-based。
--
-- 受害面（前台 album.js）：
--   ① 章节序号 `idx = sort - 1` → western-01 的「出门」与「晨袍」都显示 Ⅰ，
--      「头饰」显示 Ⅴ 而非 Ⅵ（整体前移一格）；
--   ② 照片角标写死「造型 0{sort}」→ 0-based 渲染成「造型 00」。
--
-- 处理：
--   本迁移把 western-01 的段 sort / 照片 sort **整册整体 +1**，对齐其余册；
--   接口侧的 0-based 写入已同步改掉（admin.ts: secSort = i + 1 / phSort = j + 1），
--   且前台序号改以**位置**为准（renderSection 的 pos 参数），三处互为保险。
--
-- ⚠️ 写法要点：0-based 册的 sort 全体落在 0..n-1，若 WHERE 只写 `sort = 0`
--   只会命中首行、其余行留在原值 ⇒ 必须用「该册 MIN(sort)=0」做闸门，
--   然后对整册所有行 +1。
--
-- 幂等：闸门条件是 MIN(sort)=0；对齐后 MIN 变1，条件不成立 ⇒ 天然幂等。
-- ============================================================

-- ---------- 段 sort：western-01 存在 sort=0 的段 ⇒ 整册 +1 ----------
UPDATE album_section
   SET sort = sort + 1
 WHERE album_id IN (
       SELECT album_id FROM (
         SELECT album_id
           FROM album_section
          WHERE album_id IN (SELECT id FROM album WHERE slug = 'western-01')
          GROUP BY album_id
         HAVING MIN(sort) = 0
       ) t
     );

-- ---------- 照片 sort：逐段判定，起点为 0 的段整段 +1 ----------
UPDATE photo
   SET sort = sort + 1
 WHERE section_id IN (
       SELECT id FROM (
         SELECT s.id
           FROM album_section s
           JOIN (
             SELECT section_id, MIN(sort) AS mn
               FROM photo
              WHERE section_id IN (
                      SELECT id FROM album_section
                       WHERE album_id IN (SELECT id FROM album WHERE slug = 'western-01'))
              GROUP BY section_id
           ) p ON p.section_id = s.id
          WHERE p.mn = 0
       ) t
     );
