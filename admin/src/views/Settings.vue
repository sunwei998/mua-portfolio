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

/* ---------- 分页签 ---------- */
const tab = ref('brand');

/** 品牌中文末字上色（前台口径：全站唯一彩色点），仅用于后台预览 */
const brandSplit = computed(() => {
  const cn = s.value?.brandCn ?? '';
  return cn.length > 1
    ? { head: cn.slice(0, -1), tail: cn.slice(-1) }
    : { head: cn, tail: '' };
});

/** 图片字段直接本地上传，不填地址；ogImage 为预留字段（前台暂未消费） */
function pickImage(field: 'heroKey' | 'qrcodeKey' | 'portraitKey' | 'ogImageKey') {
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

/** 流程规范化：校验非空/长度 + 序号按位置重排（与前台展示顺序严格一致）。
 *  返回 false 表示校验未通过（已弹提示），调用方不要继续保存。 */
function normalizeFlow(): boolean {
  if (!s.value) return false;
  const rows = s.value.flowJson.map((r) => ({ ...r, title: (r.title ?? '').trim() }));
  if (rows.some((r) => !r.title)) {
    ElMessage.warning('步骤名称不能为空');
    return false;
  }
  if (rows.some((r) => r.title.length > FLOW_TITLE_MAX)) {
    ElMessage.warning(`步骤名称最多 ${FLOW_TITLE_MAX} 个字`);
    return false;
  }
  s.value.flowJson = rows.map((r, i) => ({ step: String(i + 1).padStart(2, '0'), title: r.title }));
  return true;
}

/* ============================================================
 * 关于页数据条（site_setting.stats_json）
 * 前台 about.js 已在渲染（labelCn + value），但后台一直没入口 → 此处补齐。
 * ⚠️ 只提供编辑能力，不改任何存量数据。
 * ============================================================ */
const STATS_MAX = 4;

function addStat() {
  if (!s.value) return;
  if (s.value.statsJson.length >= STATS_MAX) {
    ElMessage.warning(`数据条最多 ${STATS_MAX} 项`);
    return;
  }
  s.value.statsJson.push({ label: '', value: '' });
}

function removeStat(i: number) {
  s.value?.statsJson.splice(i, 1);
}

/** 信息配置统一保存：手机号格式 + 数据条 + 流程，全部通过才提交 */
async function saveInfo() {
  if (!s.value) return;
  if (!checkPhone()) return;
  if (!normalizeFlow()) return;
  s.value.statsJson = s.value.statsJson.map((x) => ({
    label: (x.label ?? '').trim(),
    value: (x.value ?? '').trim(),
  }));
  await save('信息配置');
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
  <div v-if="s" class="setpage">
    <div class="page-head">
      <div class="ph-main">
        <h2>站点设置</h2>
        <p>前台可见的文案、联系方式与首页素材 · 共 6 类</p>
      </div>
      <div class="ph-tip">站点配置为<b>整对象提交</b>：保存任意一类都会一并提交本页当前所有改动</div>
    </div>

    <el-tabs v-model="tab" class="settabs">
      <!-- ─────────── ① 品牌文案 ─────────── -->
      <el-tab-pane name="brand">
        <template #label><span class="tl"><el-icon><Postcard /></el-icon>品牌文案</span></template>
        <div class="cols">
          <div class="col-main">
            <el-card shadow="never" class="card">
              <template #header>
                <div class="card-hd"><span class="t">品牌标识</span><span class="h">页头字标 · 页签标题 · 关于页大字</span></div>
              </template>
              <el-form label-width="88px" class="grid2">
                <el-form-item label="品牌中文"><el-input v-model="s.brandCn" placeholder="茉與妝" /></el-form-item>
                <el-form-item label="品牌英文"><el-input v-model="s.brandEn" placeholder="MO·BEAUTÉ" /></el-form-item>
                <el-form-item label="标语"><el-input v-model="s.taglineCn" placeholder="为重要时刻，留一份美" /></el-form-item>
                <el-form-item label="署名条"><el-input v-model="s.bylineCn" placeholder="甜茉 · 化妆师个人作品集" /></el-form-item>
                <el-form-item label="字标副标"><el-input v-model="s.subCn" placeholder="MO·BEAUTÉ" /></el-form-item>
                <el-form-item label="副标长版"><el-input v-model="s.subLongCn" placeholder="MAKEUP &amp; HAIR · BRIDAL &amp; DAILY" /></el-form-item>
              </el-form>
            </el-card>

            <el-card shadow="never" class="card">
              <template #header>
                <div class="card-hd"><span class="t">关于页简介</span><span class="h">留空则该段不展示</span></div>
              </template>
              <el-form label-width="0">
                <el-input v-model="s.bioCn" type="textarea" :rows="5"
                          placeholder="一两段自我介绍：擅长风格 / 工作城市 / 接单方式…" />
              </el-form>
            </el-card>

            <el-card shadow="never" class="card">
              <template #header>
                <div class="card-hd"><span class="t">分享图</span><span class="h">字段已入库 · 前台暂未接入</span></div>
              </template>
              <div class="pic-field">
                <el-image v-if="s.ogImageKey" :src="s.ogImageKey" class="pic-thumb og-thumb"
                          :preview-src-list="[s.ogImageKey]" preview-teleported />
                <div v-else class="pic-thumb og-thumb thumb-empty">未设置</div>
                <div class="pic-ops">
                  <el-button size="small" plain @click="pickImage('ogImageKey')">{{ s.ogImageKey ? '重新上传' : '上传图片' }}</el-button>
                  <el-button v-if="s.ogImageKey" size="small" text type="danger" @click="s.ogImageKey = ''">移除</el-button>
                  <span class="pic-note">建议 1200×630 · 当前仅作备用，预留字段</span>
                </div>
              </div>
            </el-card>

            <div class="sec-actions">
              <el-button type="primary" :loading="saving" @click="save('品牌文案')">保存品牌文案</el-button>
            </div>
          </div>

          <aside class="col-side">
            <el-card shadow="never" class="card">
              <template #header><div class="card-hd"><span class="t">前台效果预览</span></div></template>
              <div class="pv-brand">
                <div class="pv-en">{{ s.brandEn || 'MO·BEAUTÉ' }}</div>
                <div class="pv-cn"><span>{{ brandSplit.head }}</span><em v-if="brandSplit.tail">{{ brandSplit.tail }}</em></div>
                <div class="pv-tag">{{ s.taglineCn || '标语' }}</div>
                <div class="pv-sub">{{ s.subCn }}</div>
                <div class="pv-byline">{{ s.bylineCn }}</div>
              </div>
            </el-card>
          </aside>
        </div>
      </el-tab-pane>

      <!-- ─────────── ② 信息配置 ─────────── -->
      <el-tab-pane name="info">
        <template #label><span class="tl"><el-icon><Iphone /></el-icon>信息配置</span></template>
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-hd"><span class="t">联系信息</span><span class="h">联系页玻璃卡 · 头像 / 微信 / 电话 / 二维码</span></div>
          </template>
          <div class="info-grid">
            <div class="info-pics">
              <div class="sub-t">主理人头像</div>
              <div class="pic-field">
                <el-image :src="s.portraitKey || '/img/portrait.webp'" class="pic-thumb avatar-thumb"
                          :preview-src-list="[s.portraitKey || '/img/portrait.webp']" preview-teleported />
                <div class="pic-ops">
                  <el-button size="small" plain @click="pickImage('portraitKey')">{{ s.portraitKey ? '重新上传' : '上传图片' }}</el-button>
                  <el-button v-if="s.portraitKey" size="small" text type="danger" @click="s.portraitKey = ''">移除</el-button>
                  <span class="pic-note">{{ s.portraitKey ? '已上传自定义头像' : '当前显示站点默认头像' }}</span>
                </div>
              </div>

              <div class="sub-t">微信二维码</div>
              <div class="pic-field">
                <el-image v-if="s.qrcodeKey" :src="s.qrcodeKey" class="pic-thumb qr-thumb"
                          :preview-src-list="[s.qrcodeKey]" preview-teleported />
                <div v-else class="pic-thumb qr-thumb thumb-empty">未设置</div>
                <div class="pic-ops">
                  <el-button size="small" plain @click="pickImage('qrcodeKey')">{{ s.qrcodeKey ? '重新上传' : '上传图片' }}</el-button>
                  <el-button v-if="s.qrcodeKey" size="small" text type="danger" @click="s.qrcodeKey = ''">移除</el-button>
                  <span class="pic-note">留空则前台整块不显示</span>
                </div>
              </div>
            </div>

            <el-form label-width="88px" class="info-form">
              <el-form-item label="微信号">
                <el-input v-model="s.wechatId" placeholder="前台显示为「微信 xxx」，行尾可一键复制" />
                <div class="tip">留空则该行不展示</div>
              </el-form-item>
              <el-form-item label="手机号码">
                <el-input v-model="s.contactPhone" placeholder="13800138000 / 0514-1234567" @blur="checkPhone" />
                <div class="tip">支持手机号或含区号座机 · 前台渲染为可点击拨号</div>
              </el-form-item>
            </el-form>
          </div>
        </el-card>

        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-hd"><span class="t">关于页数据条</span><span class="h">联系页玻璃卡上的一组数字 · ≤ {{ STATS_MAX }} 项</span></div>
          </template>
          <div class="stat-list">
            <div v-for="(x, i) in s.statsJson" :key="i" class="stat-row">
              <span class="flow-no">{{ String(i + 1).padStart(2, '0') }}</span>
              <el-input v-model="x.value" style="width:130px" placeholder="8" />
              <el-input v-model="x.label" style="width:190px" placeholder="从业年" />
              <el-button size="small" text type="danger" :disabled="s.statsJson.length <= 1" @click="removeStat(i)">移除</el-button>
            </div>
            <el-button v-if="s.statsJson.length < STATS_MAX" size="small" plain class="flow-add" @click="addStat">＋ 加一项</el-button>
            <span v-if="!s.statsJson.length" class="tip">暂无数据 · 前台该块不显示</span>
          </div>
        </el-card>

        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-hd"><span class="t">联系页服务流程</span><span class="h">步骤玻璃签 · 按此顺序渲染 · 序号自动生成 · ≤ {{ FLOW_MAX }} 步、每步 ≤ {{ FLOW_TITLE_MAX }} 字</span></div>
          </template>
          <div class="flow-list">
            <div v-for="(f, i) in s.flowJson" :key="i" class="flow-row">
              <span class="flow-no">{{ String(i + 1).padStart(2, '0') }}</span>
              <el-input v-model="f.title" :maxlength="FLOW_TITLE_MAX" style="width:260px"
                        :placeholder="['预约沟通', '试妆定型', '婚礼跟妆'][i] || '如：敬酒补妆'" />
              <el-button size="small" text type="danger" :disabled="s.flowJson.length <= 1" @click="removeFlow(i)">移除</el-button>
            </div>
            <el-button v-if="s.flowJson.length < FLOW_MAX" size="small" plain class="flow-add" @click="addFlow">＋ 加一步</el-button>
          </div>
          <div class="flow-pv">
            <span class="tip">前台预览</span>
            <span v-for="(f, i) in s.flowJson" :key="'pv' + i" class="chip">{{ f.title || '—' }}</span>
            <span v-if="!s.flowJson.length" class="tip">暂无步骤 · 前台整块隐藏</span>
          </div>
        </el-card>

        <div class="sec-actions">
          <el-button type="primary" :loading="saving" @click="saveInfo">保存信息配置</el-button>
          <span class="tip">手机号格式 · 数据条 · 服务流程一并校验后提交</span>
        </div>
      </el-tab-pane>

      <!-- ─────────── ③ 首页 ─────────── -->
      <el-tab-pane name="home">
        <template #label><span class="tl"><el-icon><HomeFilled /></el-icon>首页</span></template>
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-hd"><span class="t">首屏 Hero</span><span class="h">进入首页第一眼的大图</span></div>
          </template>
          <div class="pic-field">
            <el-image v-if="s.heroKey" :src="s.heroKey" class="pic-thumb" :preview-src-list="[s.heroKey]" preview-teleported />
            <div v-else class="pic-thumb thumb-empty">未设置</div>
            <div class="pic-ops">
              <el-button size="small" plain @click="pickImage('heroKey')">{{ s.heroKey ? '重新上传' : '上传图片' }}</el-button>
              <el-button v-if="s.heroKey" size="small" text type="danger" @click="s.heroKey = ''">移除</el-button>
              <span class="pic-note">建议竖幅 3:4 以上 · 建议 1200×1600 以内</span>
            </div>
          </div>
        </el-card>

        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-hd"><span class="t">首屏文案</span><span class="h">角签 · 走马灯词</span></div>
          </template>
          <el-form label-width="88px" class="grid2">
            <el-form-item label="Hero 角签">
              <el-input v-model="s.heroTagCn" placeholder="2026 婚礼季" />
              <div class="tip">图上角标 · 留空则不显示</div>
            </el-form-item>
            <el-form-item label="走马灯词">
              <el-input v-model="MARQUEE_TEXT" placeholder="婚礼跟妆、订婚宴、孕妇照…"
                        @focus="syncMarqueeOut" @change="syncMarqueeIn" />
              <div class="tip">顿号或逗号分隔 · 自动拆成数组存库</div>
            </el-form-item>
          </el-form>
        </el-card>

        <div class="sec-actions">
          <el-button type="primary" :loading="saving" @click="save('首页')">保存首页</el-button>
        </div>
      </el-tab-pane>

      <!-- ─────────── ④ 精选作品（018） ─────────── -->
      <el-tab-pane name="feat">
        <template #label><span class="tl"><el-icon><Star /></el-icon>精选作品</span></template>
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-hd"><span class="t">首页精选图墙</span><span class="h">≤ {{ FEATURED_MAX }} 张 · 拖拽排序 · 前台 0 张时整块隐藏</span></div>
          </template>
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
          <span class="tip">排序与增删即时入库，与其它类互不影响</span>
        </div>
        </el-card>
      </el-tab-pane>

      <!-- ─────────── ⑤ 首页视频（018 建列，020 扩双位，021 扩五位） ─────────── -->
      <el-tab-pane name="video">
        <template #label><span class="tl"><el-icon><VideoCamera /></el-icon>首页视频</span></template>
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-hd"><span class="t">视频槽位</span><span class="h">≤ 5 个 · 任意格式自动转码 H.264 1080p · 中间槽留空不影响其他</span></div>
          </template>
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
        </el-card>
      </el-tab-pane>

      <!-- ─────────── ⑥ 账号安全 ─────────── -->
      <el-tab-pane name="sec">
        <template #label><span class="tl"><el-icon><Lock /></el-icon>账号安全</span></template>
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-hd"><span class="t">修改登录密码</span><span class="h">仅影响后台账号 · 前台访客无密码</span></div>
          </template>
          <el-form label-width="96px" class="pw-form">
            <el-form-item label="当前密码">
              <el-input v-model="oldPw" type="password" show-password style="width:260px" placeholder="修改前需验证原密码" />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="newPw" type="password" show-password style="width:260px" placeholder="至少 6 位" />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input v-model="newPw2" type="password" show-password style="width:260px" placeholder="再输一次" />
            </el-form-item>
            <el-form-item>
              <el-button type="warning" plain :loading="pwSaving" @click="changePw">修改密码</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="card">
          <template #header><div class="card-hd"><span class="t">规则说明</span></div></template>
          <ul class="rules">
            <li>新密码至少 6 位，两次输入需一致；修改成功后<b>下次登录</b>生效。</li>
            <li>密码在库中以 scrypt 加盐散列存储，任何人无法反查明文。</li>
            <li>忘记密码无法在此自助找回，需在服务器端重置账号。</li>
            <li>前台内容配置与本 tab 相互独立，改密码不会影响任何站点设置。</li>
          </ul>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
/* ---------- 页头 ---------- */
.setpage { padding-bottom: 8px; }
.page-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 16px; margin-bottom: 4px;
}
.page-head h2 { margin: 0; font-size: 18px; color: #221d19; letter-spacing: .04em; }
.ph-main p { margin: 6px 0 0; font-size: 12px; color: #8a8177; letter-spacing: .06em; }
.ph-tip {
  flex: none; max-width: 340px; text-align: right;
  font-size: 11px; line-height: 1.7; color: #9e4e55;
  background: #fbf1f0; border: 1px solid #f0dcd9; border-radius: 6px; padding: 7px 10px;
}
.ph-tip b { font-weight: 600; }

/* ---------- 页签 ---------- */
.settabs :deep(.el-tabs__header) { margin-bottom: 18px; }
.settabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background: #efe8dc; }
.settabs :deep(.el-tabs__item) {
  font-size: 13.5px; letter-spacing: .06em; color: #6b6259; padding: 0 4px; margin-right: 22px;
}
.settabs :deep(.el-tabs__item.is-active) { color: #221d19; font-weight: 600; }
.settabs :deep(.el-tabs__active-bar) { background: #b0707b; height: 2px; }
.tl { display: inline-flex; align-items: center; gap: 6px; }

/* ---------- 卡片与栅格 ---------- */
.card { margin-bottom: 16px; border-radius: 8px; }
.card :deep(.el-card__header) {
  padding: 12px 16px; background: #faf7f1; border-bottom: 1px solid #efe8dc; border-radius: 8px 8px 0 0;
}
.card :deep(.el-card__body) { padding: 16px; }
.card-hd { display: flex; align-items: baseline; gap: 10px; }
.card-hd .t { font-size: 13.5px; font-weight: 600; color: #221d19; }
.card-hd .h { font-size: 11.5px; color: #8a8177; letter-spacing: .04em; }

.cols { display: flex; gap: 18px; align-items: flex-start; }
.col-main { flex: 1; min-width: 0; }
.col-side { flex: none; width: 300px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 22px; }
.grid2 :deep(.el-form-item) { margin-bottom: 16px; }
.tip { font-size: 11px; color: #9a9187; letter-spacing: .04em; line-height: 1.6; }
.sub-t { font-size: 12px; font-weight: 600; color: #5c544b; margin: 0 0 8px; }
.sub-t:not(:first-child) { margin-top: 20px; }

/* ---------- 品牌预览 ---------- */
.pv-brand {
  padding: 22px 18px; text-align: center; border-radius: 6px;
  background: linear-gradient(180deg, #fbf6f5, #f6efec);
  box-shadow: 0 0 0 1px #efe3e0 inset;
}
.pv-en { font-size: 9.5px; letter-spacing: .42em; text-indent: .42em; color: #b0707b; }
.pv-cn {
  margin-top: 12px; font-family: "Noto Serif SC", Georgia, serif; font-weight: 300;
  font-size: 30px; letter-spacing: .1em; text-indent: .1em; color: #221d19;
}
.pv-cn em { font-style: normal; color: #9e4e55; }
.pv-tag { margin-top: 12px; font-size: 12px; letter-spacing: .16em; text-indent: .16em; color: #5c544b; }
.pv-sub { margin-top: 8px; font-size: 9px; letter-spacing: .3em; text-indent: .3em; color: #a89a90; }
.pv-byline {
  margin-top: 18px; padding-top: 12px; border-top: 1px solid #e8dcd8;
  font-size: 11px; letter-spacing: .1em; color: #8a8177;
}

/* ---------- 信息配置 ---------- */
.info-grid { display: flex; gap: 26px; align-items: flex-start; }
.info-pics { flex: none; width: 300px; }
.info-form { flex: 1; min-width: 0; }
.info-form :deep(.el-form-item) { margin-bottom: 20px; }
.stat-list, .flow-list { display: flex; flex-direction: column; gap: 10px; }
.stat-row, .flow-row { display: flex; align-items: center; gap: 10px; }
.flow-no {
  flex: none; width: 30px; text-align: center;
  font-size: 12px; font-weight: 600; color: #8a8177;
  font-family: Georgia, serif; letter-spacing: .05em;
}
.flow-add { align-self: flex-start; margin-top: 2px; }
.flow-pv {
  margin-top: 16px; padding-top: 14px; border-top: 1px dashed #e8e0d4;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.chip {
  font-size: 11.5px; letter-spacing: .08em; color: #6b6259;
  background: #faf7f1; border: 1px solid #e8dfd2; border-radius: 999px; padding: 4px 12px;
}
.rules { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 2; color: #5c544b; }
.rules b { color: #9e4e55; font-weight: 600; }
.pw-form :deep(.el-form-item) { margin-bottom: 18px; }

/* ---------- 缩略图 ---------- */
.pic-field { display: flex; align-items: flex-start; gap: 12px; }
.pic-thumb {
  width: 120px; height: 160px; flex: none;
  border-radius: 8px; background: #efe9e1; display: block;
  box-shadow: 0 0 0 1px #e3dccf inset;
}
.og-thumb { width: 150px; height: 79px; }
.qr-thumb { width: 120px; height: 120px; }
.avatar-thumb { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; }
.thumb-empty {
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: #a89a90; letter-spacing: .1em;
}
.pic-note { font-size: 11px; color: #8a8177; letter-spacing: .05em; line-height: 1.6; }
.pic-ops { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }

/* ---------- 每类保存 ---------- */
.sec-actions { display: flex; align-items: center; gap: 12px; margin-top: 4px; }

/* ---------- 精选卡 ---------- */
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
