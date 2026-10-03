<script setup lang="ts">
/* ============================================================
 * Collections.vue —— 系列管理（2026-10-02 拍板：collection 纳入 admin）
 * 四个文案字段（标题/竖签/中文描述/英文描述）+ 封面 + 右下小签条图，
 * 外加四个开关：标题显隐（showBig）、中文/英文描述独立显隐（showTagCn/showTagEn）、
 * 系列启用/禁用（enabled）。
 * 禁用后前台 /collection、/wedding、/api/home 即时隐藏该系列。
 * ============================================================ */
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api, type AdminCollection } from '../api';

const STYLE_CN: Record<string, string> = {
  western: '西式婚礼', chinese: '新中式婚礼', engagement: '订婚宴跟妆',
  maternity: '孕妈照', family: '亲子照',
};

const cols = ref<AdminCollection[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    cols.value = await api.get<AdminCollection[]>('/api/admin/collections');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

/** 全量保存（PUT 覆盖式更新，行对象即完整载荷） */
async function save(row: AdminCollection, tip: string) {
  try {
    await api.put(`/api/admin/collections/${row.id}`, row);
    ElMessage.success(tip);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
    await load(); // 回滚 UI 到服务端状态
  }
}

async function toggleEnabled(row: AdminCollection) {
  await save(row, row.enabled ? '已启用（前台可见）' : '已禁用（前台隐藏）');
}

/* ---------- 编辑弹窗 ---------- */
const editVisible = ref(false);
const form = ref<AdminCollection | null>(null);

function openEdit(row: AdminCollection) {
  form.value = { ...row, strips: [...row.strips] };
  editVisible.value = true;
}

async function doSave() {
  const f = form.value;
  if (!f) return;
  if (!f.bigCn || !f.vslipCn || !f.taglineCn || !f.taglineEn) {
    ElMessage.warning('标题 / 竖签 / 描述均为必填'); return;
  }
  try {
    await api.put(`/api/admin/collections/${f.id}`, f);
    ElMessage.success('已保存');
    editVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  }
}

/* ---------- 图片上传（封面 + 小签条，走 /api/admin/upload） ---------- */
async function pickAndUpload(kind: 'cover' | 'strip', idx?: number) {
  const f = form.value;
  if (!f) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { key } = await api.upload(file);
      if (kind === 'cover') f.coverKey = key;
      else if (idx === undefined) f.strips.push(key);
      else f.strips[idx] = key;
      ElMessage.success('已上传，保存后生效');
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '上传失败');
    }
  };
  input.click();
}
</script>

<template>
  <div>
    <div class="bar">
      <h2>系列管理</h2>
      <span class="hint">改文案即时生效；标题 / 描述的显隐开关在「编辑」弹窗内；禁用 = 前台整体系列隐藏（首页入口 / 选择页 / 婚庆页）</span>
    </div>

    <el-table :data="cols" v-loading="loading" stripe>
      <el-table-column label="封面" width="96">
        <template #default="{ row }">
          <el-image :src="row.coverKey" fit="cover" class="cover" preview-teleported />
        </template>
      </el-table-column>
      <el-table-column label="系列" width="110">
        <template #default="{ row }">
          <el-tag size="small">{{ STYLE_CN[row.style] || row.style }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="bigCn" label="标题" min-width="100" />
      <el-table-column prop="vslipCn" label="右上竖签" min-width="110" />
      <el-table-column prop="taglineCn" label="中文描述" min-width="160" />
      <el-table-column prop="taglineEn" label="英文描述" min-width="150" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" @change="toggleEnabled(row)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="editVisible" title="编辑系列" width="560">
      <el-form v-if="form" label-width="96">
        <el-form-item label="标题">
          <div class="inline">
            <el-input v-model="form.bigCn" placeholder="西式婚礼" />
            <el-switch v-model="form.showBig" active-text="显示" inactive-text="隐藏" />
          </div>
        </el-form-item>
        <el-form-item label="右上竖签"><el-input v-model="form.vslipCn" placeholder="西式 · 美学" /></el-form-item>
        <el-form-item label="中文描述">
          <div class="inline">
            <el-input v-model="form.taglineCn" />
            <el-switch v-model="form.showTagCn" active-text="显示" inactive-text="隐藏" />
          </div>
        </el-form-item>
        <el-form-item label="英文描述">
          <div class="inline">
            <el-input v-model="form.taglineEn" />
            <el-switch v-model="form.showTagEn" active-text="显示" inactive-text="隐藏" />
          </div>
        </el-form-item>
        <el-form-item label="封面图">
          <div class="imgs">
            <el-image :src="form.coverKey" fit="cover" class="cover-big" preview-teleported />
            <el-button size="small" @click="pickAndUpload('cover')">上传新封面</el-button>
          </div>
        </el-form-item>
        <el-form-item label="右下小签条">
          <div class="imgs">
            <div v-for="(s, i) in form.strips" :key="i" class="strip-item">
              <el-image :src="s" fit="cover" class="strip-img" preview-teleported />
              <el-button link size="small" @click="pickAndUpload('strip', i)">换</el-button>
            </div>
            <el-button size="small" @click="pickAndUpload('strip')">+ 加一张</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="doSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.bar h2 { margin: 0; font-size: 18px; color: #221d19; }
.hint { font-size: 12px; color: #999; }
.cover { width: 60px; height: 72px; border-radius: 6px; }
.cover-big { width: 92px; height: 110px; border-radius: 6px; }
.inline { display: flex; align-items: center; gap: 12px; width: 100%; }
.imgs { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.strip-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.strip-img { width: 34px; height: 44px; border-radius: 4px; }
</style>
