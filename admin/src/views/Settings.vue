<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api, type AdminSite, type FeaturedAdmin } from '../api';

const s = ref<AdminSite | null>(null);
const saving = ref(false);

async function load() {
  try {
    s.value = await api.get<AdminSite>('/api/admin/site');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  }
}
onMounted(load);

async function save() {
  if (!s.value) return;
  saving.value = true;
  try {
    await api.put('/api/admin/site', s.value);
    ElMessage.success('已保存，前台刷新生效');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/* ---------- 改密码 ---------- */
const oldPw = ref('');
const newPw = ref('');
const newPw2 = ref('');
const pwSaving = ref(false);

async function changePw() {
  if (!oldPw.value || !newPw.value) { ElMessage.warning('请填写完整'); return; }
  if (newPw.value !== newPw2.value) { ElMessage.warning('两次新密码不一致'); return; }
  if (newPw.value.length < 6) { ElMessage.warning('新密码至少 6 位'); return; }
  pwSaving.value = true;
  try {
    await api.post('/api/admin/password', { oldPassword: oldPw.value, newPassword: newPw.value });
    ElMessage.success('密码已修改，下次登录用新密码');
    oldPw.value = newPw.value = newPw2.value = '';
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '修改失败');
  } finally {
    pwSaving.value = false;
  }
}

const MARQUEE_TEXT = ref('');
function syncMarqueeOut() {
  if (!s.value) return;
  MARQUEE_TEXT.value = s.value.marqueeJson.join('、');
}
function syncMarqueeIn() {
  if (!s.value) return;
  s.value.marqueeJson = MARQUEE_TEXT.value.split(/[,，、\s]+/).filter(Boolean);
}

/* ============================================================
 * 首页精选（home_featured，018）—— ≤20 张（020 放宽）、拖拽排序、独立保存
 * 图注入库但输入禁用（2026-10-03 拍板：功能保留、暂不启用）。
 * 宽高为浏览器解码实测值（铁律：禁写死），ratio / sort 由服务端归一。
 * ============================================================ */
const FEATURED_MAX = 20;
const feats = ref<FeaturedAdmin[]>([]);
const featsLoading = ref(false);
const featsSaving = ref(false);
const dragIdx = ref(-1);

async function loadFeats() {
  featsLoading.value = true;
  try {
    const r = await api.get<{ ok: boolean; items: FeaturedAdmin[] }>('/api/admin/home-featured');
    feats.value = r.items ?? [];
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '精选加载失败');
  } finally {
    featsLoading.value = false;
  }
}
onMounted(loadFeats);

/** 实测图片宽高（decode 后取 naturalWidth/Height，失败回落竖幅默认） */
function measure(key: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ w: im.naturalWidth || 800, h: im.naturalHeight || 1200 });
    im.onerror = () => resolve({ w: 800, h: 1200 });
    im.src = key;
  });
}

function pickUploadFeat() {
  if (feats.value.length >= FEATURED_MAX) {
    ElMessage.warning(`精选最多 ${FEATURED_MAX} 张`);
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { key } = await api.upload(file);
      const { w, h } = await measure(key);
      feats.value.push({
        cosKey: key, w, h,
        ratio: Math.round((w / h) * 1000) / 1000,
        orientation: w >= h ? 'landscape' : 'portrait',
        captionCn: null, captionEn: null,
      });
      ElMessage.success('已加入，记得点「保存精选」');
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '上传失败');
    }
  };
  input.click();
}

function removeFeat(i: number) {
  feats.value.splice(i, 1);
}

/* 原生 HTML5 拖拽排序（后台仅桌面使用，无需拖拽库） */
function onDragStart(i: number, e: DragEvent) {
  dragIdx.value = i;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDropAt(i: number) {
  const from = dragIdx.value;
  dragIdx.value = -1;
  if (from < 0 || from === i) return;
  const [it] = feats.value.splice(from, 1);
  feats.value.splice(i, 0, it);
}

async function saveFeats() {
  if (feats.value.length > FEATURED_MAX) {
    ElMessage.warning(`精选最多 ${FEATURED_MAX} 张`);
    return;
  }
  if (feats.value.some((f) => !f.cosKey)) {
    ElMessage.warning('存在缺少图片的条目');
    return;
  }
  featsSaving.value = true;
  try {
    await api.put('/api/admin/home-featured', { items: feats.value });
    ElMessage.success(`精选已保存（${feats.value.length} 张）`);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '精选保存失败');
  } finally {
    featsSaving.value = false;
  }
}

/* ============================================================
 * 首页视频（site_setting.video_key/video_poster_key + video2~5_*）
 * 018 建列、020 扩双位、021 扩五位；≤5 个槽位，槽位全空 = 前台占位画框。
 * 槽位 → 字段名全部走映射表（配置驱动，将来再扩位只改这两张表）。
 * ============================================================ */
type VidSlot = 1 | 2 | 3 | 4 | 5;
const VID_FIELD: Record<VidSlot, { key: string; poster: string }> = {
  1: { key: 'videoKey', poster: 'videoPosterKey' },
  2: { key: 'video2Key', poster: 'video2PosterKey' },
  3: { key: 'video3Key', poster: 'video3PosterKey' },
  4: { key: 'video4Key', poster: 'video4PosterKey' },
  5: { key: 'video5Key', poster: 'video5PosterKey' },
};
const VID_LABEL: Record<VidSlot, string> = {
  1: '视频一（前台在上）',
  2: '视频二',
  3: '视频三',
  4: '视频四',
  5: '视频五（前台在下）',
};
const vidSlots = computed(() =>
  (Object.keys(VID_FIELD) as unknown[] as VidSlot[]).map((slot) => ({
    slot,
    label: VID_LABEL[slot],
    key: s.value?.[VID_FIELD[slot].key as keyof AdminSite] as string | null ?? null,
    posterKey: s.value?.[VID_FIELD[slot].poster as keyof AdminSite] as string | null ?? null,
  })),
);
function setVideoKey(slot: VidSlot, val: string | null) {
  if (!s.value) return;
  (s.value as unknown as Record<string, string | null>)[VID_FIELD[slot].key] = val;
}
function setVideoPoster(slot: VidSlot, val: string | null) {
  if (!s.value) return;
  (s.value as unknown as Record<string, string | null>)[VID_FIELD[slot].poster] = val;
}

function pickVideo(slot: VidSlot) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/mp4,video/webm,video/quicktime';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file || !s.value) return;
    try {
      const res = await api.uploadVideo(file);
      setVideoKey(slot, res.key);
      if (res.posterKey) setVideoPoster(slot, res.posterKey);
      ElMessage.success(res.converted
        ? `视频 ${slot} 已自动转码为 H.264 mp4${res.posterKey ? '并生成封面' : ''}，点「保存设置」后前台生效`
        : `视频 ${slot} 已上传，点「保存设置」后前台生效`);
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '视频上传失败');
    }
  };
  input.click();
}

function pickPoster(slot: VidSlot) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file || !s.value) return;
    try {
      const { key } = await api.upload(file);
      setVideoPoster(slot, key);
      ElMessage.success(`视频 ${slot} 封面已上传，点「保存设置」后前台生效`);
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '封面上传失败');
    }
  };
  input.click();
}

function clearVideo(slot: VidSlot) {
  setVideoKey(slot, null);
  setVideoPoster(slot, null);
  ElMessage.info(`视频 ${slot} 已清除（未保存）`);
}
</script>

<template>
  <div v-if="s">
    <h2>站点设置</h2>

    <el-card class="card" shadow="never">
      <template #header>品牌与文案</template>
      <el-form label-width="110">
        <el-form-item label="品牌中文"><el-input v-model="s.brandCn" style="width:240px" /></el-form-item>
        <el-form-item label="品牌英文"><el-input v-model="s.brandEn" style="width:240px" /></el-form-item>
        <el-form-item label="标语"><el-input v-model="s.taglineCn" style="width:320px" /></el-form-item>
        <el-form-item label="字标副标（短）"><el-input v-model="s.subCn" style="width:240px" /></el-form-item>
        <el-form-item label="副标长版"><el-input v-model="s.subLongCn" style="width:420px" /></el-form-item>
        <el-form-item label="署名条"><el-input v-model="s.bylineCn" style="width:320px" placeholder="甜茉 · 化妆师个人作品集" /></el-form-item>
        <el-form-item label="关于页简介">
          <el-input v-model="s.bioCn" type="textarea" :rows="4" style="width:520px" />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="card" shadow="never">
      <template #header>首页</template>
      <el-form label-width="110">
        <el-form-item label="Hero 图"><el-input v-model="s.heroKey" style="width:320px" placeholder="/img/hero.png" /></el-form-item>
        <el-form-item label="Hero 角签"><el-input v-model="s.heroTagCn" style="width:240px" placeholder="2026 婚礼季" /></el-form-item>
        <el-form-item label="走马灯词">
          <el-input v-model="MARQUEE_TEXT" style="width:420px" placeholder="婚礼跟妆、订婚宴、孕妇照…"
                    @focus="syncMarqueeOut" @change="syncMarqueeIn" />
        </el-form-item>
        <el-form-item label="微信号"><el-input v-model="s.wechatId" style="width:240px" /></el-form-item>
        <el-form-item label="二维码图"><el-input v-model="s.qrcodeKey" style="width:320px" /></el-form-item>
      </el-form>
    </el-card>

    <!-- ─────────── 首页精选（018） ─────────── -->
    <el-card class="card feat-card" shadow="never" v-loading="featsLoading">
      <template #header>
        <div class="feat-head">
          <span>首页精选</span>
          <span class="feat-hint">≤ {{ FEATURED_MAX }} 张 · 拖拽图片排序 · 前台 0 张时整块隐藏 · 不影响作品菜单</span>
          <el-button size="small" type="primary" plain :loading="featsSaving" @click="saveFeats">保存精选</el-button>
        </div>
      </template>

      <div class="feat-grid">
        <div v-for="(f, i) in feats" :key="f.cosKey + i"
             class="feat-tile" draggable="true"
             @dragstart="onDragStart(i, $event)" @dragover.prevent @drop.prevent="onDropAt(i)">
          <el-image :src="f.cosKey" fit="cover" class="feat-img" :preview-src-list="[f.cosKey]" preview-teleported />
          <button class="feat-x" type="button" aria-label="移除" @click="removeFeat(i)">×</button>
          <span class="feat-orient" :class="f.orientation">{{ f.orientation === 'landscape' ? '横' : '竖' }}</span>
          <el-tooltip content="图注功能已预留，暂未启用" placement="top">
            <span class="feat-cap"><el-input v-model="f.captionCn" size="small" disabled placeholder="图注（预留）" /></span>
          </el-tooltip>
        </div>

        <button v-if="feats.length < FEATURED_MAX" class="feat-add" type="button" @click="pickUploadFeat">
          <span class="plus">＋</span>
          <span class="txt">上传图片</span>
          <span class="cnt">{{ feats.length }} / {{ FEATURED_MAX }}</span>
        </button>
      </div>
    </el-card>

    <!-- ─────────── 首页视频（018 建列，020 扩双位，021 扩五位） ─────────── -->
    <el-card class="card" shadow="never">
      <template #header>
        <div class="feat-head">
          <span>首页视频</span>
          <span class="feat-hint">最多 5 个 · 任意格式（mov/HEVC/4K）自动转码为 H.264 1080p · 随「保存设置」一起生效 · 中间槽位留空不影响其他视频</span>
        </div>
      </template>
      <div v-for="v in vidSlots" :key="v.slot" class="vid-block">
        <div class="vid-title">{{ v.label }}</div>
        <div class="vid-row">
          <div class="vid-preview">
            <video v-if="v.key" :src="v.key" controls preload="metadata" />
            <div v-else class="vid-empty">空<br /><span>{{ v.slot === 1 ? '前台将显示「视频即将上线」占位画框' : '本槽留空，前台不渲染' }}</span></div>
          </div>
          <div class="vid-ops">
            <el-button size="small" type="primary" plain @click="pickVideo(v.slot)">{{ v.key ? '重新上传视频' : '上传视频' }}</el-button>
            <el-button size="small" plain @click="pickPoster(v.slot)">{{ v.posterKey ? '重新上传封面' : '上传封面帧' }}</el-button>
            <el-button v-if="v.key || v.posterKey" size="small" text type="danger" @click="clearVideo(v.slot)">清除</el-button>
            <div class="vid-keys">
              <div class="k"><label>视频</label><el-input :model-value="v.key ?? ''" size="small" placeholder="/img/uploads/….mp4" @update:model-value="(val: string) => setVideoKey(v.slot, val || null)" /></div>
              <div class="k"><label>封面</label><el-input :model-value="v.posterKey ?? ''" size="small" placeholder="/img/uploads/….jpg" @update:model-value="(val: string) => setVideoPoster(v.slot, val || null)" /></div>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <div class="actions">
      <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
    </div>

    <el-card class="card" shadow="never">
      <template #header>修改登录密码</template>
      <el-form label-width="110" inline>
        <el-form-item label="旧密码"><el-input v-model="oldPw" type="password" show-password style="width:200px" /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="newPw" type="password" show-password style="width:200px" /></el-form-item>
        <el-form-item label="确认新密码"><el-input v-model="newPw2" type="password" show-password style="width:200px" /></el-form-item>
        <el-form-item>
          <el-button type="warning" plain :loading="pwSaving" @click="changePw">修改密码</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
h2 { margin: 0 0 16px; font-size: 18px; color: #221d19; }
.card { margin-bottom: 16px; }
.actions { margin-bottom: 16px; }

/* ---------- 首页精选卡 ---------- */
.feat-head { display: flex; align-items: center; gap: 12px; }
.feat-head > span:first-child { font-weight: 600; }
.feat-hint { flex: 1; font-size: 12px; color: #8a8177; }
.feat-grid { display: flex; flex-wrap: wrap; gap: 14px; }
.feat-tile {
  position: relative;
  width: 108px;
  cursor: grab;
  border-radius: 10px;
  transition: box-shadow .25s ease, transform .25s ease;
}
.feat-tile:active { cursor: grabbing; }
.feat-tile:hover { transform: translateY(-2px); box-shadow: 0 10px 22px -12px rgba(70, 54, 40, .45); }
.feat-img { width: 108px; height: 140px; border-radius: 10px; display: block; background: #efe9e1; }
.feat-x {
  position: absolute; top: -7px; right: -7px;
  width: 22px; height: 22px; border-radius: 50%;
  border: none; background: #B0707B; color: #fff;
  font-size: 14px; line-height: 1; cursor: pointer;
  opacity: 0; transition: opacity .2s ease;
  box-shadow: 0 3px 8px rgba(0,0,0,.18);
}
.feat-tile:hover .feat-x { opacity: 1; }
.feat-orient {
  position: absolute; left: 6px; top: 6px;
  font-size: 10px; letter-spacing: .1em; padding: 1px 6px;
  border-radius: 3px; color: #fff; background: rgba(34, 29, 25, .45);
}
.feat-cap { display: block; margin-top: 6px; }
.feat-cap :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px #e3dccf inset; background: #faf7f1; }
.feat-add {
  width: 108px; height: 140px;
  border: 1.5px dashed #cdbfa5; border-radius: 10px;
  background: #faf6ee; color: #8a8177;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  cursor: pointer; transition: border-color .25s ease, background .25s ease, color .25s ease;
}
.feat-add:hover { border-color: #B0707B; color: #B0707B; background: #fcf8f1; }
.feat-add .plus { font-size: 22px; line-height: 1; }
.feat-add .txt { font-size: 12px; letter-spacing: .08em; }
.feat-add .cnt { font-size: 10px; opacity: .6; }

/* ---------- 首页视频卡 ---------- */
.vid-block { margin-bottom: 20px; }
.vid-block:last-child { margin-bottom: 0; }
.vid-title { font-size: 13px; font-weight: 600; color: #5c544b; margin-bottom: 10px; }
.vid-row { display: flex; gap: 18px; align-items: flex-start; }
.vid-preview {
  flex: none; width: 180px; height: 220px;
  border-radius: 8px; overflow: hidden; background: #17130f;
}
.vid-preview video { width: 100%; height: 100%; object-fit: cover; display: block; }
.vid-empty {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  color: rgba(243, 233, 216, .8); font-size: 13px; letter-spacing: .2em; text-align: center;
}
.vid-empty span { font-size: 11px; letter-spacing: .06em; color: rgba(243, 233, 216, .4); }
.vid-ops { display: flex; flex-direction: column; gap: 10px; flex: 1; align-items: flex-start; }
.vid-keys { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; max-width: 420px; }
.vid-keys .k { display: flex; align-items: center; gap: 8px; }
.vid-keys label { font-size: 12px; color: #8a8177; width: 28px; flex: none; }
</style>
