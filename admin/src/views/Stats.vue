<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { api, type AdminStatsRow } from '../api';

const rows = ref<AdminStatsRow[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    rows.value = await api.get<AdminStatsRow[]>('/api/admin/stats');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const STYLE_CN: Record<string, string> = {
  western: '西式婚礼', chinese: '新中式婚礼', engagement: '订婚宴跟妆',
  maternity: '孕妈照', family: '亲子照',
};

const total = computed(() =>
  rows.value.reduce(
    (acc, r) => ({ views: acc.views + r.stats.views, likes: acc.likes + r.stats.likes }),
    { views: 0, likes: 0 },
  ));
const maxViews = computed(() => Math.max(1, ...rows.value.map((r) => r.stats.views)));
</script>

<template>
  <div>
    <h2>互动看板</h2>

    <div class="cards">
      <div class="card"><span class="n">{{ total.views }}</span><span class="l">总浏览</span></div>
      <div class="card"><span class="n">{{ total.likes }}</span><span class="l">总点赞</span></div>
    </div>

    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="titleCn" label="册" min-width="150" />
      <el-table-column label="系列" width="110">
        <template #default="{ row }">
          <el-tag size="small">{{ STYLE_CN[row.style] || row.style }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="stats.views" label="浏览" width="90" sortable />
      <el-table-column prop="stats.likes" label="点赞" width="90" sortable />
      <el-table-column label="浏览热度" min-width="200">
        <template #default="{ row }">
          <el-progress :percentage="Math.round((row.stats.views / maxViews) * 100)"
                       :show-text="false" :stroke-width="8"
                       color="linear-gradient(90deg,#d96d5b,#c89e84)" />
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.published ? 'success' : 'info'">
            {{ row.published ? '已发布' : '下架' }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
h2 { margin: 0 0 16px; font-size: 18px; color: #221d19; }
.cards { display: flex; gap: 14px; margin-bottom: 16px; }
.card { flex: 1; background: #fff; border-radius: 10px; padding: 18px 20px;
  display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 10px rgba(32,27,23,.05); }
.card .n { font-size: 26px; font-weight: 700; color: #221d19; font-variant-numeric: tabular-nums; }
.card .l { font-size: 12px; color: #999; letter-spacing: 2px; }
</style>
