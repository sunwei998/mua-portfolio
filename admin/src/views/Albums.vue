<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, type AdminAlbum } from '../api';
import AlbumEdit from './AlbumEdit.vue';

const albums = ref<AdminAlbum[]>([]);
const loading = ref(false);
const editingId = ref<number | null>(null);

const STYLE_CN: Record<string, string> = {
  western: '西式婚礼', chinese: '新中式婚礼', engagement: '订婚宴跟妆',
  maternity: '孕妈照', family: '亲子照',
};
const LAYOUT_CN: Record<string, string> = { sectioned: '六段叙事', flat: '瀑布流' };

async function load() {
  loading.value = true;
  try {
    albums.value = await api.get<AdminAlbum[]>('/api/admin/albums');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function togglePublish(row: AdminAlbum) {
  try {
    await api.put(`/api/admin/albums/${row.id}`, { published: row.published });
    ElMessage.success(row.published ? '已发布' : '已下架（前台隐藏）');
  } catch (e) {
    row.published = !row.published;
    ElMessage.error(e instanceof Error ? e.message : '操作失败');
  }
}

async function remove(row: AdminAlbum) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.titleCn}」？段与照片会一并删除，不可恢复。`,
      '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch { return; }
  try {
    await api.del(`/api/admin/albums/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败');
  }
}

/** 新建册 */
const createVisible = ref(false);
/** 系列 → 分类的映射。
 *  曾经偷懒写成 `@change="category = style"`，但 style 与 category 是**两套取值域**：
 *  style 有 western/chinese，category 没有（只有 wedding/engagement/maternity/family）。
 *  于是选「西式婚礼」会提交 category='western' → 后端 400，整册建不出来。 */
const STYLE_TO_CATEGORY: Record<string, string> = {
  western: 'wedding', chinese: 'wedding',
  engagement: 'engagement', maternity: 'maternity', family: 'family',
};
const createForm = ref({
  slug: '', titleCn: '', titleEn: '', style: 'western', category: 'wedding',
  layout: 'sectioned', ordinalLabel: 'Ⅰ', coverKey: '/img/hero.png', published: false,
});
async function doCreate() {
  const f = createForm.value;
  if (!f.slug || !f.titleCn) { ElMessage.warning('slug 与中文标题必填'); return; }
  try {
    const r = await api.post<{ ok: boolean; id: number }>('/api/admin/albums', f);
    ElMessage.success('已创建');
    createVisible.value = false;
    editingId.value = r.id; // 直接进编辑
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '创建失败');
  }
}

function onSaved() {
  editingId.value = null;
  void load();
}
</script>

<template>
  <AlbumEdit v-if="editingId !== null" :id="editingId" @back="onSaved" />
  <div v-else>
    <div class="bar">
      <h2>作品管理</h2>
      <el-button type="primary" @click="createVisible = true">新建册</el-button>
    </div>

    <el-table :data="albums" v-loading="loading" stripe>
      <el-table-column label="封面" width="76">
        <template #default="{ row }">
          <el-image :src="row.coverKey" fit="cover" class="cover" preview-teleported />
        </template>
      </el-table-column>
      <el-table-column prop="titleCn" label="标题" min-width="140" />
      <el-table-column label="系列" width="110">
        <template #default="{ row }">
          <el-tag size="small">{{ STYLE_CN[row.style] || row.style }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="布局" width="96">
        <template #default="{ row }">
          <el-tag size="small" :type="row.layout === 'flat' ? 'warning' : 'info'">
            {{ LAYOUT_CN[row.layout] || row.layout }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="photoCount" label="张数" width="70" />
      <el-table-column label="浏览 / 赞" width="110">
        <template #default="{ row }">
          <span class="nums">{{ row.stats.views }} / {{ row.stats.likes }}</span>
        </template>
      </el-table-column>
      <el-table-column label="发布" width="80">
        <template #default="{ row }">
          <el-switch v-model="row.published" @change="togglePublish(row)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="editingId = row.id">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createVisible" title="新建册" width="480">
      <el-form label-width="86">
        <el-form-item label="slug"><el-input v-model="createForm.slug" placeholder="western-04" /></el-form-item>
        <el-form-item label="中文标题"><el-input v-model="createForm.titleCn" placeholder="婚礼跟妆 · 其四" /></el-form-item>
        <el-form-item label="英文标题"><el-input v-model="createForm.titleEn" placeholder="WEDDING NO.4" /></el-form-item>
        <el-form-item label="系列">
          <el-select v-model="createForm.style"
                     @change="createForm.category = STYLE_TO_CATEGORY[createForm.style] || 'wedding'">
            <el-option label="西式婚礼" value="western" />
            <el-option label="新中式婚礼" value="chinese" />
            <el-option label="订婚宴跟妆" value="engagement" />
            <el-option label="孕妈照" value="maternity" />
            <el-option label="亲子照" value="family" />
          </el-select>
        </el-form-item>
        <el-form-item label="布局">
          <el-radio-group v-model="createForm.layout">
            <el-radio value="sectioned">六段叙事</el-radio>
            <el-radio value="flat">瀑布流</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="序号"><el-input v-model="createForm.ordinalLabel" placeholder="Ⅰ" style="width:120px" /></el-form-item>
        <el-form-item label="封面"><el-input v-model="createForm.coverKey" placeholder="/img/hero.png" /></el-form-item>
        <el-form-item label="发布"><el-switch v-model="createForm.published" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="doCreate">创建并编辑</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.bar h2 { margin: 0; font-size: 18px; color: #221d19; }
.cover { width: 52px; height: 64px; border-radius: 6px; }
.nums { font-variant-numeric: tabular-nums; font-size: 12px; color: #555; }
</style>
