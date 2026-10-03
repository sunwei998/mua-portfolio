<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { api, type AdminAlbumDetail, type AdminSection, type SectionKindConfig } from '../api';

const props = defineProps<{ id: number }>();
const emit = defineEmits<{ back: [] }>();

const d = ref<AdminAlbumDetail | null>(null);
/** el-collapse 展开段（name = 段下标字符串；缺失会使折叠面板渲染即抛错） */
const openSecs = ref<string[]>([]);
const saving = ref(false);

/** 段落类型（来自 section_kind 配置表，可在「段落类型」页改名称 / 停用）。
 *  取不到时回落一份最小集，绝不让下拉框空掉导致无法建段。
 *  ⚠️ 回落集一律 selectable: true —— 拿不到配置时的默认行为必须是「全部可新建」，
 *     否则接口一抖就变成「谁都建不了段」。 */
interface KindOpt { v: string; l: string; selectable: boolean; refCount: number }
const FALLBACK: KindOpt[] = [
  { v: 'morning', l: '晨袍', selectable: true, refCount: 0 },
  { v: 'outdoor', l: '出门', selectable: true, refCount: 0 },
  { v: 'welcome', l: '迎宾', selectable: true, refCount: 0 },
  { v: 'ceremony', l: '主纱', selectable: true, refCount: 0 },
  { v: 'toast', l: '敬酒', selectable: true, refCount: 0 },
  { v: 'face', l: '面部', selectable: true, refCount: 0 },
  { v: 'headdress', l: '头饰', selectable: true, refCount: 0 },
  { v: 'flat', l: '瀑布流', selectable: true, refCount: 0 },
];
const KINDS = ref<KindOpt[]>(FALLBACK);

/** 段序号（按位置取，前台 ROMAN/汉字序数与此处一致——用户拍板不因加段而扩表） */
const SEC_NUM_CN = ['一', '二', '三', '四', '五', '六', '七', '八'];

function secNo(i: number): string {
  return SEC_NUM_CN[i] ?? String(i + 1);
}

function kindLabel(code: string): string {
  return KINDS.value.find((k) => k.v === code)?.l || code;
}

/**
 * 某一段的「段落类型」下拉可选项（2026-10-03 停用语义落地处）。
 *
 * 规则：可选项 = 全部 selectable 类型 + **本段自己当前用的类型**（若它已停用）。
 *   · 停用类型不出现在别的段的下拉里 → 后台不再提供新建，历史段改不动也换不掉；
 *   · 但本段正在用它时仍要能选中并原样保存 → 不会因为「别人停用了它」就保存失败。
 *     （后端 knownKinds 不按 selectable 过滤，就是为这条兜底）
 *   · 已停用项加「已停用」后缀，让「为什么它单独能选」一目了然。
 */
function kindOptions(cur: string): KindOpt[] {
  return KINDS.value.filter((k) => k.selectable || k.v === cur);
}

function kindOptionLabel(k: KindOpt): string {
  return k.selectable ? k.l : `${k.l}（已停用）`;
}

/** 该段用的类型是否已被停用（折叠面板标题挂一个提示标） */
function kindOff(code: string): boolean {
  return KINDS.value.find((k) => k.v === code)?.selectable === false;
}

/** 本册还没用到的段落类型（用于「加一段」时自动选一个不撞唯一键的）。
 *  album_section 有 uq_section_kind(album_id, kind) 唯一约束，一册一段一枚；
 *  曾经固定挑'face'，结果在已有 face 段的册里点「加一段」必定保存失败。
 *  ⚠️ 同时跳过 selectable=false（已停用）——「加一段」就是新建，不能给停用类型。 */
function nextFreeKind(): string {
  const used = new Set((d.value?.sections ?? []).map((s) => s.kind));
  const pool = KINDS.value.filter((k) => k.selectable);
  return pool.find((k) => !used.has(k.v) && k.v !== 'flat')?.v
    ?? pool.find((k) => !used.has(k.v))?.v
    ?? 'face';
}

/** 折叠面板标题：**数字 + 段内容**（段内容 = 类型名 · 可覆写的段名） */
function secTitle(sec: AdminSection, i: number): string {
  return `${secNo(i)} · ${kindLabel(sec.kind)} · ${sec.titleCn || '未命名'}`;
}

onMounted(async () => {
  /* 类型名与册详情并行取，互不依赖 */
    api.get<SectionKindConfig[]>('/api/admin/section-kinds')
    .then((rows) => {
      KINDS.value = rows.map((r) => ({
        v: r.code, l: r.nameCn, selectable: r.selectable, refCount: r.refCount,
      }));
    })
    .catch(() => { /* 保留回落集，不打扰编辑 */ });
  try {
    d.value = await api.get<AdminAlbumDetail>(`/api/admin/albums/${props.id}`);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  }
});

const isFlat = computed(() => d.value?.layout === 'flat');

/* ---------- 基础信息 ---------- */
async function saveBasic() {
  if (!d.value) return;
  saving.value = true;
  try {
    await api.put(`/api/admin/albums/${props.id}`, {
      titleCn: d.value.titleCn, titleEn: d.value.titleEn, style: d.value.style,
      category: d.value.category, layout: d.value.layout, ordinalLabel: d.value.ordinalLabel,
      coverKey: d.value.coverKey, coverLenRatio: d.value.coverLenRatio,
      makeupCn: d.value.makeupCn, sort: d.value.sort, published: d.value.published,
    });
    ElMessage.success('基础信息已保存');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/* ---------- 段操作 ---------- */
function addSection() {
  if (!d.value) return;
  const kind = nextFreeKind();
  d.value.sections.push({
    id: 0, kind, titleCn: '新段', titleEn: 'New Section', descCn: null,
    layout: 'auto', sort: d.value.sections.length + 1, photos: [],
  });
}

function moveSection(i: number, dir: -1 | 1) {
  if (!d.value) return;
  const arr = d.value.sections;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

async function removeSection(i: number) {
  if (!d.value) return;
  d.value.sections.splice(i, 1);
}

/* ---------- 照片操作 ---------- */
async function pickPhoto(sec: AdminSection) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files ?? []);
    for (const f of files) {
      try {
        const { key } = await api.upload(f);
        // 客户端读自然尺寸（后端不做图像处理，w/h/ratio 由前端写入口径）
        const dim = await new Promise<{ w: number; h: number }>((resolve) => {
          const im = new Image();
          im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => resolve({ w: 800, h: 1200 });
          im.src = key;
        });
        sec.photos.push({
          id: 0, cosKey: key, w: dim.w, h: dim.h,
          ratio: Number((dim.w / dim.h).toFixed(3)),
          orientation: dim.w >= dim.h ? 'landscape' : 'portrait',
          captionCn: null, sort: sec.photos.length + 1,
        });
      } catch (e) {
        ElMessage.error(e instanceof Error ? e.message : `上传失败：${f.name}`);
      }
    }
  };
  input.click();
}

/** 从素材库选图（复用现有 demo 资产，不必每次上传） */
function pickFromLib(sec: AdminSection) {
  const LIB = ['/img/w-a.png', '/img/w-b.png', '/img/nc-a.png', '/img/nc-b.png', '/img/nc-c.png',
    '/img/portrait.png', '/img/hero.png', '/img/family.png', '/img/closeup-face.png', '/img/closeup-head.png'];
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = () => {}; // 占位：库选择后续做成弹窗，当前用 URL 输入
  const url = window.prompt('输入图片路径或 URL（素材库可用：' + LIB.join(' ') + '）', LIB[0]);
  if (!url) return;
  const im = new Image();
  im.onload = () => {
    sec.photos.push({
      id: 0, cosKey: url, w: im.naturalWidth, h: im.naturalHeight,
      ratio: Number((im.naturalWidth / im.naturalHeight).toFixed(3)),
      orientation: im.naturalWidth >= im.naturalHeight ? 'landscape' : 'portrait',
      captionCn: null, sort: sec.photos.length,
    });
  };
  im.onerror = () => ElMessage.error('图片加载失败，检查路径');
  im.src = url;
}

function removePhoto(sec: AdminSection, i: number) {
  sec.photos.splice(i, 1);
}

/* 拖拽排序：HTML5 原生 drag，dragover 时实时交换 */
const dragFrom = ref<{ secIdx: number; photoIdx: number } | null>(null);
function onDragStart(secIdx: number, photoIdx: number) {
  dragFrom.value = { secIdx, photoIdx };
}
function onDrop(sec: AdminSection, secIdx: number, photoIdx: number) {
  const from = dragFrom.value;
  dragFrom.value = null;
  if (!from || from.photoIdx === photoIdx) return;
  // 仅支持同段内排序（跨段拖拽直接复制语义复杂，M6 v1 不做）
  if (from.secIdx !== secIdx) return;
  const arr = sec.photos;
  const [moved] = arr.splice(from.photoIdx, 1);
  arr.splice(photoIdx, 0, moved);
}

/* ---------- 整册保存（基础 + 段照片一次提交） ---------- */
async function saveAll() {
  if (!d.value) return;
  saving.value = true;
  try {
    await api.put(`/api/admin/albums/${props.id}`, {
      titleCn: d.value.titleCn, titleEn: d.value.titleEn, style: d.value.style,
      category: d.value.category, layout: d.value.layout, ordinalLabel: d.value.ordinalLabel,
      coverKey: d.value.coverKey, coverLenRatio: d.value.coverLenRatio,
      makeupCn: d.value.makeupCn, sort: d.value.sort, published: d.value.published,
    });
    await api.put(`/api/admin/albums/${props.id}/sections`, {
      sections: d.value.sections.map((s, i) => ({
        id: s.id, kind: s.kind, titleCn: s.titleCn, titleEn: s.titleEn,
        descCn: s.descCn, layout: s.layout, sort: i + 1,
        /* 照片 sort 一律 1-based（与后端 phSort=j+1 及前台「造型 0N」角标同口径） */
        photos: s.photos.map((p, j) => ({ ...p, sort: j + 1 })),
      })),
    });
    ElMessage.success('整册已保存，前台刷新即可看到');
    emit('back');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="d">
    <div class="bar">
      <el-button @click="emit('back')">← 返回列表</el-button>
      <h2>编辑：{{ d.titleCn }}</h2>
      <span class="meta">
        <el-tag size="small">{{ d.slug }}</el-tag>
        <el-tag size="small" :type="d.layout === 'flat' ? 'warning' : 'info'">
          {{ d.layout === 'flat' ? '瀑布流' : '六段叙事' }}
        </el-tag>
      </span>
      <div class="sp" />
      <el-button type="primary" :loading="saving" @click="saveAll">保存整册</el-button>
    </div>

    <el-card class="card" shadow="never">
      <template #header>基础信息</template>
      <el-form label-width="92" inline>
        <el-form-item label="中文标题"><el-input v-model="d.titleCn" /></el-form-item>
        <el-form-item label="英文标题"><el-input v-model="d.titleEn" /></el-form-item>
        <el-form-item label="序号"><el-input v-model="d.ordinalLabel" style="width:90px" /></el-form-item>
        <el-form-item label="封面"><el-input v-model="d.coverKey" style="width:220px" /></el-form-item>
        <el-form-item label="妆面描述"><el-input v-model="d.makeupCn" style="width:220px" placeholder="香槟裸妆 · 低盘发" /></el-form-item>
        <el-form-item label="排序值"><el-input-number v-model="d.sort" :min="0" /></el-form-item>
        <el-form-item label="发布"><el-switch v-model="d.published" /></el-form-item>
      </el-form>
    </el-card>

    <el-card class="card" shadow="never">
      <template #header>
        <div class="chead">
          <span>{{ isFlat ? '照片流（瀑布流挂载段）' : `内容分段（${d.sections.length} 段）` }}</span>
          <el-button v-if="!isFlat" size="small" @click="addSection">加一段</el-button>
        </div>
      </template>

      <el-collapse v-model="openSecs">
        <el-collapse-item v-for="(sec, i) in d.sections" :key="sec.id || `new${i}`" :name="String(i)">
          <template #title>
            <div class="sechead">
              <span class="no">{{ secNo(i) }}</span>
              <b>{{ kindLabel(sec.kind) }} · {{ sec.titleCn || '未命名' }}</b>
              <span v-if="kindOff(sec.kind)" class="offtag">类型已停用</span>
              <span class="dim">{{ sec.photos.length }} 张</span>
            </div>
          </template>

          <div class="secform">
            <el-select v-model="sec.kind" :disabled="isFlat" style="width:170px">
              <el-option v-for="k in kindOptions(sec.kind)" :key="k.v"
                         :label="kindOptionLabel(k)" :value="k.v" />
            </el-select>
            <el-input v-model="sec.titleCn" placeholder="段名（中文）" style="width:150px" />
            <el-input v-model="sec.titleEn" placeholder="Section EN" style="width:150px" />
            <el-input v-model="sec.descCn" placeholder="段描述（可空）" style="width:220px" />
            <span class="sp" />
            <el-button size="small" :disabled="i === 0" @click="moveSection(i, -1)">↑</el-button>
            <el-button size="small" :disabled="i === d.sections.length - 1" @click="moveSection(i, 1)">↓</el-button>
            <el-button v-if="!isFlat" size="small" type="danger" plain @click="removeSection(i)">删段</el-button>
          </div>

          <div class="photos">
            <div v-for="(p, j) in sec.photos" :key="p.id || `np${j}`"
                 class="ph" draggable="true"
                 @dragstart="onDragStart(i, j)"
                 @dragover.prevent
                 @drop="onDrop(sec, i, j)">
              <img :src="p.cosKey" alt="" />
              <span class="ori">{{ p.orientation === 'landscape' ? '横' : '竖' }}</span>
              <el-button class="del" size="small" circle type="danger"
                         @click="removePhoto(sec, j)">×</el-button>
            </div>
            <div class="ph add" @click="pickPhoto(sec)">＋<br/>上传</div>
            <div class="ph add lib" @click="pickFromLib(sec)">🔗<br/>素材库</div>
          </div>
          <div class="hint">拖动卡片可排序；保存整册后生效。</div>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.bar h2 { margin: 0; font-size: 18px; color: #221d19; }
.bar .meta { display: flex; gap: 6px; }
.bar .sp, .secform .sp { flex: 1; }
.card { margin-bottom: 16px; }
.chead { display: flex; align-items: center; justify-content: space-between; }
.sechead { display: flex; align-items: baseline; gap: 10px; }
.sechead .no {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 5px; border-radius: 2px;
  font-family: var(--mua-serif, serif); font-size: 11.5px; line-height: 1;
  color: #fff; background: var(--mua-rose, #B0707B);
}
.sechead .dim { color: #999; font-size: 12px; font-weight: 400; }
/* 类型已停用标：不刺眼的琥珀色小徽标，区别于「启用」的绿 */
.sechead .offtag {
  font-size: 11px; font-weight: 400; color: #9a7b4f;
  background: rgba(194,168,116,.18); border: 1px solid rgba(194,168,116,.42);
  border-radius: 3px; padding: 0 5px; align-self: center;
}
.secform { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.photos { display: flex; flex-wrap: wrap; gap: 10px; }
.ph { position: relative; width: 88px; height: 110px; border-radius: 8px; overflow: hidden;
  background: #eee; cursor: grab; }
.ph:active { cursor: grabbing; }
.ph img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.ph .ori { position: absolute; left: 4px; top: 4px; font-size: 10px; color: #fff;
  background: rgba(0,0,0,.45); border-radius: 4px; padding: 1px 5px; }
.ph .del { position: absolute; right: 4px; top: 4px; transform: scale(.8); }
.ph.add { display: grid; place-items: center; text-align: center; font-size: 12px;
  color: #888; border: 1px dashed #ccc; background: #fafafa; cursor: pointer; }
.ph.add:hover { border-color: #B0707B; color: #B0707B; }
.hint { color: #aaa; font-size: 12px; margin-top: 10px; }
</style>
