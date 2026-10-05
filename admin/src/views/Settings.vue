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

const PHONE_RE = /^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/;

/** 联系电话强校验：手机号（1[3-9] 开头 11 位）或含区号座机号（允许 - 分隔）；空值放行 */
function checkPhone(): boolean {
  const v = s.value?.contactPhone?.trim() ?? '';
  if (v && !PHONE_RE.test(v)) {
    ElMessage.error('联系电话格式不正确：支持手机号（如 13800138000）或含区号座机号（如 0514-1234567）');
    return false;
  }
  return true;
}

async function save(kind: string) {
  if (!s.value) return;
  if (kind === '首页' && !checkPhone()) return;
  saving.value = true;
  try {
    await api.put('/api/admin/site', s.value);
    ElMessage.success(`${kind}已保存，前台刷新生效`);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/* ---------- 折叠面板：单次只展开一类 ---------- */
const open = ref('brand');

/** 图片字段（hero / 二维码 / 头像）直接本地上传，不填地址 */
function pickImage(field: 'heroKey' | 'qrcodeKey' | 'portraitKey') {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file || !s.value) return;
    try {
      const { key } = await api.upload(file);
      s.value[field] = key;
      ElMessage.success('已上传，点该类「保存」后前台生效');
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '上传失败');
    }
  };
  input.click();
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
 * 联系页服务流程（site_setting.flow_json）
 * 增删改全开：前台按数组顺序动态渲染（about.js 只消费 titleCn），
 * 序号 step 在保存时按位置自动生成（01/02/…），不落手工值。
 * ⚠️ 只提供编辑能力，不改任何存量数据（改文案是用户的决定）。
 * ============================================================ */
const FLOW_MAX = 6;
const FLOW_TITLE_MAX = 10;

function addFlow() {
  if (!s.value) return;
  if (s.value.flowJson.length >= FLOW_MAX) {
    ElMessage.warning(`流程最多 ${FLOW_MAX} 步`);
    return;
  }
  s.value.flowJson.push({ step: '', title: '' });
}

function removeFlow(i: number) {
  if (!s.value) return;
  if (s.value.flowJson.length <= 1) {
    ElMessage.warning('至少保留一步');
    return;
  }
  s.value.flowJson.splice(i, 1);
}

function saveFlow() {
  if (!s.value) return;
  const rows = s.value.flowJson.map((r) => ({ ...r, title: (r.title ?? '').trim() }));
  if (rows.some((r) => !r.title)) {
    ElMessage.warning('步骤名称不能为空');
    return;
  }
  if (rows.some((r) => r.title.length > FLOW_TITLE_MAX)) {
    ElMessage.warning(`步骤名称最多 ${FLOW_TITLE_MAX} 个字`);
    return;
  }
  // 序号按位置重排（01、02…），与前台展示顺序严格一致
  s.value.flowJson = rows.map((r, i) => ({ step: String(i + 1).padStart(2, '0'), title: r.title }));
  save('流程');
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
const VID_FIELD: Record<VidSlot, { key: string; poster: string; width: string; height: string; duration: string }> = {
  1: { key: 'videoKey', poster: 'videoPosterKey', width: 'videoWidth', height: 'videoHeight', duration: 'videoDuration' },
  2: { key: 'video2Key', poster: 'video2PosterKey', width: 'video2Width', height: 'video2Height', duration: 'video2Duration' },
  3: { key: 'video3Key', poster: 'video3PosterKey', width: 'video3Width', height: 'video3Height', duration: 'video3Duration' },
  4: { key: 'video4Key', poster: 'video4PosterKey', width: 'video4Width', height: 'video4Height', duration: 'video4Duration' },
  5: { key: 'video5Key', poster: 'video5PosterKey', width: 'video5Width', height: 'video5Height', duration: 'video5Duration' },
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
    w: s.value?.[VID_FIELD[slot].width as keyof AdminSite] as number | null ?? null,
    h: s.value?.[VID_FIELD[slot].height as keyof AdminSite] as number | null ?? null,
    duration: s.value?.[VID_FIELD[slot].duration as keyof AdminSite] as number | null ?? null,
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
/* 022：宽高/时长随上传接口的 probe 结果写入，保存时一起落库；传 null = 清除 */
function setVideoMeta(slot: VidSlot, meta: { width: number; height: number; duration: number } | null) {
  if (!s.value) return;
  const rec = s.value as unknown as Record<string, number | null>;
  rec[VID_FIELD[slot].width] = meta?.width ?? null;
  rec[VID_FIELD[slot].height] = meta?.height ?? null;
  rec[VID_FIELD[slot].duration] = meta?.duration ?? null;
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
      if (res.probe) setVideoMeta(slot, res.probe);
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
  setVideoMeta(slot, null);
  ElMessage.info(`视频 ${slot} 已清除（未保存）`);
}
</script>

<template>
  <div v-if="s">
    <h2>站点设置</h2>

    <el-collapse v-model="open" accordion>
      <!-- ─────────── ① 品牌与文案 ─────────── -->
      <el-collapse-item name="brand" title="品牌与文案">
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
        <div class="sec-actions">
          <el-button type="primary" :loading="saving" @click="save('品牌')">保存品牌</el-button>
        </div>
      </el-collapse-item>

      <!-- ─────────── ② 首页设置 ─────────── -->
      <el-collapse-item name="home" title="首页设置">
        <el-form label-width="110">
          <el-form-item label="Hero 图">
            <div class="pic-field">
              <el-image v-if="s.heroKey" :src="s.heroKey" class="pic-thumb" :preview-src-list="[s.heroKey]" preview-teleported />
              <div class="pic-ops">
                <el-button size="small" plain @click="pickImage('heroKey')">{{ s.heroKey ? '重新上传' : '上传图片' }}</el-button>
                <el-button v-if="s.heroKey" size="small" text type="danger" @click="s.heroKey = ''">移除</el-button>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="主理人头像">
            <div class="pic-field">
              <el-image :src="s.portraitKey || '/img/portrait.webp'" class="pic-thumb avatar-thumb" :preview-src-list="[s.portraitKey || '/img/portrait.webp']" preview-teleported />
              <div class="pic-ops">
                <el-button size="small" plain @click="pickImage('portraitKey')">{{ s.portraitKey ? '重新上传' : '上传图片' }}</el-button>
                <el-button v-if="s.portraitKey" size="small" text type="danger" @click="s.portraitKey = ''">移除</el-button>
                <span class="pic-note">{{ s.portraitKey ? '已上传自定义头像' : '当前显示站点默认头像' }}</span>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="Hero 角签"><el-input v-model="s.heroTagCn" style="width:240px" placeholder="2026 婚礼季" /></el-form-item>
          <el-form-item label="走马灯词">
            <el-input v-model="MARQUEE_TEXT" style="width:420px" placeholder="婚礼跟妆、订婚宴、孕妇照…"
                      @focus="syncMarqueeOut" @change="syncMarqueeIn" />
          </el-form-item>
          <el-form-item label="微信号"><el-input v-model="s.wechatId" style="width:240px" /></el-form-item>
          <el-form-item label="联系电话">
            <el-input v-model="s.contactPhone" style="width:240px" placeholder="手机号或座机（如 13800138000 / 0514-1234567）" @blur="checkPhone" />
          </el-form-item>
          <el-form-item label="二维码图">
            <div class="pic-field">
              <el-image v-if="s.qrcodeKey" :src="s.qrcodeKey" class="pic-thumb qr-thumb" :preview-src-list="[s.qrcodeKey]" preview-teleported />
              <div class="pic-ops">
                <el-button size="small" plain @click="pickImage('qrcodeKey')">{{ s.qrcodeKey ? '重新上传' : '上传图片' }}</el-button>
                <el-button v-if="s.qrcodeKey" size="small" text type="danger" @click="s.qrcodeKey = ''">移除</el-button>
              </div>
            </div>
          </el-form-item>
        </el-form>
        <div class="sec-actions">
          <el-button type="primary" :loading="saving" @click="save('首页')">保存首页</el-button>
        </div>
      </el-collapse-item>

      <!-- ─────────── ③ 联系页服务流程（flow_json） ─────────── -->
      <el-collapse-item name="flow" title="联系页服务流程">
        <div class="feat-head">
          <span class="feat-hint">联系页「步骤」玻璃签 · 按此顺序渲染 · 序号自动生成 · 最多 {{ FLOW_MAX }} 步、每步 ≤ {{ FLOW_TITLE_MAX }} 字</span>
        </div>
        <div class="flow-list">
          <div v-for="(f, i) in s.flowJson" :key="i" class="flow-row">
            <span class="flow-no">{{ String(i + 1).padStart(2, '0') }}</span>
            <el-input v-model="f.title" :maxlength="FLOW_TITLE_MAX" style="width:260px"
                      :placeholder="['预约沟通', '试妆定型', '婚礼跟妆'][i] || '如：敬酒补妆'" />
            <el-button size="small" text type="danger" :disabled="s.flowJson.length <= 1"
                       @click="removeFlow(i)">移除</el-button>
          </div>
          <el-button v-if="s.flowJson.length < FLOW_MAX" size="small" plain class="flow-add"
                     @click="addFlow">＋ 加一步</el-button>
        </div>
        <div class="sec-actions">
          <el-button type="primary" :loading="saving" @click="saveFlow">保存流程</el-button>
        </div>
      </el-collapse-item>

      <!-- ─────────── ④ 首页精选（018） ─────────── -->
      <el-collapse-item name="feat" title="首页精选">
        <div class="feat-head">
          <span class="feat-hint">≤ {{ FEATURED_MAX }} 张 · 拖拽图片排序 · 前台 0 张时整块隐藏 · 不影响作品菜单</span>
        </div>
        <div class="feat-grid" v-loading="featsLoading">
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
        <div class="sec-actions">
          <el-button type="primary" :loading="featsSaving" @click="saveFeats">保存精选</el-button>
        </div>
      </el-collapse-item>

      <!-- ─────────── ④ 首页视频（018 建列，020 扩双位，021 扩五位） ─────────── -->
      <el-collapse-item name="video" title="首页视频">
        <div class="feat-head">
          <span class="feat-hint">最多 5 个 · 任意格式（mov/HEVC/4K）自动转码为 H.264 1080p · 随该类保存一起生效 · 中间槽位留空不影响其他视频</span>
        </div>
        <div v-for="v in vidSlots" :key="v.slot" class="vid-block">
          <div class="vid-title">{{ v.label }}
            <span v-if="v.w && v.h" class="vid-meta">{{ v.w }}×{{ v.h }} · {{ v.w >= v.h ? '横屏' : '竖屏' }}<template v-if="v.duration"> · {{ Math.round(v.duration) }}s</template></span>
          </div>
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
        <div class="sec-actions">
          <el-button type="primary" :loading="saving" @click="save('视频')">保存视频</el-button>
        </div>
      </el-collapse-item>
      <!-- ─────────── ⑤ 密码配置 ─────────── -->
      <el-collapse-item name="password" title="密码配置">
        <el-form label-width="110" inline>
          <el-form-item label="旧密码"><el-input v-model="oldPw" type="password" show-password style="width:200px" /></el-form-item>
          <el-form-item label="新密码"><el-input v-model="newPw" type="password" show-password style="width:200px" /></el-form-item>
          <el-form-item label="确认新密码"><el-input v-model="newPw2" type="password" show-password style="width:200px" /></el-form-item>
          <el-form-item>
            <el-button type="warning" plain :loading="pwSaving" @click="changePw">修改密码</el-button>
          </el-form-item>
        </el-form>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
h2 { margin: 0 0 16px; font-size: 18px; color: #221d19; }
.card { margin-bottom: 16px; }
.actions { margin-bottom: 16px; }

/* ---------- 折叠面板与每类保存 ---------- */
.sec-actions { margin-top: 16px; }
.el-collapse { border: none; }
.el-collapse :deep(.el-collapse-item__header) {
  font-size: 14px; font-weight: 600; color: #221d19;
  background: #faf7f1; border-bottom: 1px solid #efe8dc;
}
.el-collapse :deep(.el-collapse-item__wrap) { background: transparent; }
.el-collapse :deep(.el-collapse-item__content) { padding: 16px 4px 8px; }

/* ---------- 图片上传字段（hero / 二维码） ---------- */
.pic-field { display: flex; align-items: flex-start; gap: 12px; }
.pic-thumb {
  width: 120px; height: 160px; flex: none;
  border-radius: 8px; background: #efe9e1; display: block;
  box-shadow: 0 0 0 1px #e3dccf inset;
}
.qr-thumb { width: 120px; height: 120px; }
.avatar-thumb { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; }
.pic-note { font-size: 11px; color: #8a8177; letter-spacing: .05em; }
.pic-ops { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }

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

/* ---------- 联系页服务流程 ---------- */
.flow-list { display: flex; flex-direction: column; gap: 10px; max-width: 460px; }
.flow-row { display: flex; align-items: center; gap: 10px; }
.flow-no {
  flex: none; width: 30px; text-align: center;
  font-size: 12px; font-weight: 600; color: #8a8177;
  font-family: Georgia, serif; letter-spacing: .05em;
}
.flow-add { align-self: flex-start; margin-top: 2px; }

/* ---------- 首页视频卡 ---------- */
.vid-block { margin-bottom: 20px; }
.vid-block:last-child { margin-bottom: 0; }
.vid-title { font-size: 13px; font-weight: 600; color: #5c544b; margin-bottom: 10px; }
.vid-meta { font-size: 11px; font-weight: 400; color: #9e4e55; margin-left: 8px; }
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
