<script setup lang="ts">
/* SectionKinds.vue —— 段落类型配置（2026-10-03 新增页）
 * 口径（用户拍板，四条铁律）：
 *   ① **名称**（中文名）可配 —— 改完前台玻璃角标 / 拼版 alt / 后台下拉同步生效。
 *      ⚠️ 只影响**类型名**，不影响章节大标题（大标题读的是段名 album_section.title_cn）。
 *   ② **展示风格 style 严格限死** —— 建表时写死，后台只读，不给改入口。
 *      shot=单图段落版式 / off=单张右偏 66% / grid=多图拼版 / flat=瀑布流挂载段
 *   ③ code 是 album_section.kind（MySQL ENUM）的取值，**不可改也不可删**
 *      （删它等于改表结构，属开发/迁移动作），排序 sort 同为库内固化值，只读。
 *   ④ **停用（selectable）= 后台不再提供新建，已有段落照常显示，前台零变化**。
 *      刻意不用「禁用 / 隐藏」这类字眼：那会被误读成「停用后前台不展示」。
 *
 * 英文名（name_en）口径：**仅后台可见，前台不展示**。
 *   前台所有英文文案走的是段自己的 titleEn（每段可覆写），
 *   kindNameEn 后端有下发但 site/ 零消费（2026-10-03 实测确认）。
 *   字段保留用于后台辨识 / 未来 SEO，但不承诺前台生效，故在页面上写明。
 */
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, type SectionKindConfig } from '../api';

const list = ref<SectionKindConfig[]>([]);
const loading = ref(false);
const saving = ref(false);

const STYLE_CN: Record<string, string> = {
  shot: '单图段落版式',
  off: '单张时右偏 66%',
  grid: '多图拼版',
  flat: '瀑布流挂载段',
};

/** 展示顺序：瀑布流永远排最后（isFlat=1），其余按 sort 升序 */
const rows = computed(() => list.value);
const flatRow = computed(() => rows.value.find((r) => r.isFlat) ?? null);
const shotRows = computed(() => rows.value.filter((r) => !r.isFlat));

/** 已停用的类型数—— 让「停用」这个动作在页面上是显性的，而不是悄悄生效 */
const offCount = computed(() => rows.value.filter((r) => !r.selectable).length);

async function load() {
  loading.value = true;
  try {
    list.value = await api.get<SectionKindConfig[]>('/api/admin/section-kinds');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

/* 只提交 code / nameCn / nameEn / selectable —— style、sort、isFlat 后端白名单也会拒，
   双端都不给改风格的入口。flat 段即便改名也不影响版式（它只是挂载点）。 */
async function save() {
  saving.value = true;
  try {
    await api.put('/api/admin/section-kinds', {
      items: list.value.map((r) => ({
        code: r.code, nameCn: r.nameCn, nameEn: r.nameEn, selectable: r.selectable,
      })),
    });
    ElMessage.success('已保存，前台刷新生效');
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/**
 * 停用前的风险确认（用户 2026-10-03 要求「停用要有感知」）。
 * 只有 refCount > 0 才需要确认—— 有引用才谈得上影响既有内容。
 */
async function confirmOff(row: SectionKindConfig) {
  if (row.selectable || !row.refCount) return;   // 启用中 / 无引用：不需要拦
  try {
    await ElMessageBox.confirm(
      `「${row.nameCn}」已被 ${row.refCount} 个段落引用。停用后：后台新建段落时不再提供该类型，` +
      `但这 ${row.refCount} 个已有段落在前台照常显示，角标与版式均不变。确认停用？`,
      '停用确认',
      { type: 'warning', confirmButtonText: '确认停用', cancelButtonText: '取消' },
    );
  } catch {
    row.selectable = true;   // 用户点了取消 → 开关拨回去
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <h2 class="ttl">段落类型配置</h2>
    <p class="sub">
      段落类型的<b>中文名</b>可改，改完前台玻璃角标、拼版图片说明、作品管理下拉框同步生效。<br />
      <b>展示风格严格限死</b>（由版式代码决定，不可改）；<b>类型标识与排序</b>是库内固化值。<br />
      <b>停用</b>只会让后台不再提供新建该类型段落——已有段落在前台<b>照常显示</b>，不会从前台消失。
    </p>

    <el-alert class="tip" type="info" :closable="false" show-icon>
      <template #title>
        <span class="tip-t">
          英文名仅后台可见，前台不展示（前台英文一律取每段自己的段名英文）。字段保留供后台辨识与后续使用。
        </span>
      </template>
    </el-alert>

    <el-card class="card" shadow="never">
      <template #header>
        <div class="chead">
          <span>叙事段（单图段落版式族）</span>
          <span class="dim">共 {{ shotRows.length }} 类 · 已停用 {{ offCount }} 类</span>
        </div>
      </template>

      <table class="tbl">
        <thead>
          <tr>
            <th class="c-code">类型标识</th>
            <th class="c-cn">名称（中文）</th>
            <th class="c-en">名称（英文）<i class="ib">仅后台</i></th>
            <th class="c-style">展示风格（限死）</th>
            <th class="c-ref">被引用</th>
            <th class="c-sel">可新建</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in shotRows" :key="r.code" :class="{ off: !r.selectable }">
            <td class="c-code"><code>{{ r.code }}</code></td>
            <td class="c-cn">
              <el-input v-model="r.nameCn" size="small" maxlength="20" />
            </td>
            <td class="c-en">
              <el-input v-model="r.nameEn" size="small" maxlength="60" placeholder="仅后台可见" />
            </td>
            <td class="c-style">
              <el-tag size="small" effect="plain" :type="r.style === 'grid' ? 'warning' : 'info'">
                {{ STYLE_CN[r.style] || r.style }}
              </el-tag>
            </td>
            <td class="c-ref">
              <span v-if="r.refCount" :class="{ dim: !r.selectable }">{{ r.refCount }} 段</span>
              <span v-else class="dim">—</span>
            </td>
            <td class="c-sel">
              <el-switch v-model="r.selectable" size="small" @change="confirmOff(r)" />
            </td>
          </tr>
        </tbody>
      </table>
    </el-card>

    <el-card v-if="flatRow" class="card" shadow="never">
      <template #header>
        <div class="chead">
          <span>挂载段</span>
          <span class="dim">共 1 类</span>
        </div>
      </template>

      <table class="tbl">
        <thead>
          <tr>
            <th class="c-code">类型标识</th>
            <th class="c-cn">名称（中文）</th>
            <th class="c-en">名称（英文）<i class="ib">仅后台</i></th>
            <th class="c-style">展示风格</th>
            <th class="c-ref">被引用</th>
            <th class="c-sel">可新建</th>
          </tr>
        </thead>
        <tbody>
          <tr :class="{ off: !flatRow.selectable }">
            <td class="c-code"><code>{{ flatRow.code }}</code></td>
            <td class="c-cn"><el-input v-model="flatRow.nameCn" size="small" maxlength="20" /></td>
            <td class="c-en">
              <el-input v-model="flatRow.nameEn" size="small" maxlength="60" placeholder="仅后台可见" />
            </td>
            <td class="c-style">
              <el-tag size="small" effect="plain" type="success">可配版式</el-tag>
            </td>
            <td class="c-ref"><span class="dim">{{ flatRow.refCount }} 段</span></td>
            <td class="c-sel">
              <el-switch v-model="flatRow.selectable" size="small" @change="confirmOff(flatRow)" />
            </td>
          </tr>
        </tbody>
      </table>
      <div class="hint">
        瀑布流是唯一可自由增删图片的段落（走双列流、拖拽瀑布、逐屏入场），其余段落版式固定。
      </div>
    </el-card>

    <div class="bar">
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      <el-button @click="load">重新读取</el-button>
      <span class="dim">类型标识、展示风格与排序为库内固化值，改动需开发介入；本页不提供删除（段落类型是作品内容骨架，不可删除）</span>
    </div>
  </div>
</template>

<style scoped>
.ttl { margin: 0 0 6px; font-size: 18px; color: #221d19; }
.sub { margin: 0 0 12px; font-size: 12.5px; line-height: 1.8; color: #8a8078; }
.sub b { color: #B0707B; font-weight: 500; }

.tip { margin-bottom: 16px; }
.tip :deep(.el-alert__title) { font-size: 12.5px; line-height: 1.7; }
.tip-t { color: #6f655c; }

.card { margin-bottom: 16px; }
.chead { display: flex; align-items: center; justify-content: space-between; }
.chead .dim, .bar .dim { color: #b3a89e; font-size: 12px; font-weight: 400; }

.tbl { width: 100%; border-collapse: collapse; }
.tbl th {
  text-align: left; font-weight: 400; font-size: 11px; letter-spacing: .12em;
  color: #a89d93; padding: 0 10px 8px; border-bottom: 1px solid rgba(194,168,116,.3);
}
.tbl td { padding: 7px 10px; border-bottom: 1px solid rgba(194,168,116,.16); vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }

/* 停用行灰底：一眼看出哪些类型不再提供新建 */
.tbl tr.off td { background: rgba(0, 0, 0, .022); }
.tbl tr.off .c-code code { opacity: .5; }

.c-code { width: 110px; }
.c-code code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; color: #9A8F84; background: rgba(194,168,116,.12);
  padding: 2px 7px; border-radius: 3px;
}
.c-cn { width: 170px; }
.c-en { width: 210px; }
.c-style { width: 180px; }
.c-ref { width: 74px; font-size: 12px; color: #8a8078; }
.c-sel { width: 74px; }
.c-ref .dim, .c-ref .dim { color: #c3b8ae; }
.ib {
  font-style: normal; font-size: 10px; color: #b3a89e;
  border: 1px solid rgba(194,168,116,.4); border-radius: 3px;
  padding: 0 4px; margin-left: 5px; letter-spacing: 0;
}

.hint { margin-top: 12px; font-size: 12px; color: #aaa; line-height: 1.8; }
.bar { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
</style>
