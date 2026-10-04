<script setup lang="ts">
/* Login.vue —— 登录页（2026-10-03 重设计 v2）
 * 构图：左宽右窄的非对称分割 + 满版出血（2026-10-03 用户拍板方案 A，弃拱形）
 *   ① 实拍图整个左区四边出血、零留白；上下各一道压暗渐变托住图注与英文
 *   ② 纸面板直角贴边，金线一道收缝，与图区一刀切开
 *   ③ 文案口径与前台六段叙事同构（仪式主纱），竖排英文 = 标语英文同构
 * 质感：暖白纸底 + 极轻颗粒 + 金色发丝线；动效走长时缓动，reduced 下冻结。
 */
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, setToken } from '../api';

const route = useRoute();
const router = useRouter();

const u = ref('');
const p = ref('');
const loading = ref(false);
const err = ref('');

async function submit() {
  if (!u.value || !p.value) { err.value = '请输入用户名和密码'; return; }
  loading.value = true;
  err.value = '';
  try {
    const r = await api.post<{ ok: boolean; token: string; username: string }>('/api/admin/login', {
      username: u.value.trim(), password: p.value,
    });
    setToken(r.token);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/albums';
    router.push(redirect);
  } catch (e) {
    err.value = e instanceof Error ? e.message : '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <!-- ─────────── 左：舞台（满版出血实拍） ─────────── -->
    <section class="stage">
      <img class="photo" src="/img/admin-login-art.jpg" alt="跟妆过程实拍：化妆师为新娘细致描画眼妆" />
      <span class="veil" aria-hidden="true"></span>
      <span class="grain" aria-hidden="true"></span>

      <p class="axis" aria-hidden="true"><span>FOR THE MOMENTS THAT MATTER</span></p>

      <div class="cap">
        <span class="rule" aria-hidden="true"></span>
        <span class="no">Nº 01</span>
        <span class="tt">BRIDAL · 仪式主纱</span>
      </div>
    </section>

    <!-- ─────────── 右：面板（登录表单） ─────────── -->
    <section class="panel">
      <div class="form">
        <header class="brand">
          <h1>茉與妝</h1>
          <p class="sub"><span>MO·BEAUTÉ</span><i aria-hidden="true"></i><span>管理后台</span></p>
        </header>

        <el-form label-position="top" @submit.prevent="submit">
          <el-form-item class="field" label="用户名">
            <el-input v-model="u" name="username" placeholder="mua" autocomplete="username" autofocus />
          </el-form-item>
          <el-form-item class="field" label="密码">
            <el-input
              v-model="p" name="password" type="password" show-password
              placeholder="••••••" autocomplete="current-password" @keyup.enter="submit"
            />
          </el-form-item>

          <transition name="shake">
            <p v-if="err" class="err" role="alert"><i aria-hidden="true"></i>{{ err }}</p>
          </transition>

          <el-button class="go" native-type="submit" :loading="loading" @click="submit">
            <span>进入后台</span>
          </el-button>
        </el-form>

        <p class="foot">仅限授权人员访问 · 茉與妝 MO·BEAUTÉ</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ============ 版面：左宽右窄的非对称分割 ============ */
.login {
  --paper:  #FAF7F2;   /* 面板纸色 */
  --stage:  #EFE7DB;   /* 舞台暖砂 */
  --ink:    #241E1B;
  --muted:  #9A8F84;
  --gold:   #C2A874;
  --rose:   #B0707B;
  --ease:   cubic-bezier(.16, 1, .3, 1);   /* easeOut expo：入场主力曲线 */

  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(360px, 34%, 468px);
  background: var(--stage);
  color: var(--ink);
  overflow: hidden;
}

/* ============ 左：舞台（满版出血） ============ */
.stage {
  position: relative;
  overflow: hidden;
  background: var(--stage);
}

/* 实拍图：整个左区四边出血，人脸落在画面上三分之一 */
.photo {
  position: absolute; inset: 0; z-index: 1;
  width: 100%; height: 100%;
  object-fit: cover; object-position: 50% 30%;
  animation: photoIn 1.6s var(--ease) both;
}
/* 上下两道压暗：顶部轻纱、底部托住图注可读性 */
.veil {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background:
    linear-gradient(180deg, rgba(20,14,10,.16), rgba(20,14,10,0) 26%),
    linear-gradient(0deg, rgba(20,14,10,.42), rgba(20,14,10,0) 38%);
}

/* 极轻胶片颗粒 */
.grain {
  position: absolute; inset: 0; z-index: 3; pointer-events: none; opacity: .28; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* 竖排英文轴线（标语英文同构）：贴右上，向下拖一条渐隐金线 */
.axis {
  position: absolute; z-index: 4; right: clamp(16px, 2.2vw, 34px); top: clamp(30px, 5.5vh, 48px); margin: 0;
  writing-mode: vertical-rl;
  font-size: 9px; letter-spacing: .42em; color: rgba(255,248,238,.55);
  text-shadow: 0 1px 8px rgba(20,14,10,.55), 0 0 2px rgba(20,14,10,.3);
  white-space: nowrap;
  animation: riseIn 1.1s var(--ease) .5s both;
}
.axis span { display: block; }
.axis::after {
  content: ''; position: absolute; left: 50%; top: calc(100% + 2.4em); width: 1px; height: 9vh;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(194,168,116,.75), rgba(194,168,116,0));
}

/* 金色图注：左下压在图上（文案口径 = 前台六段叙事「仪式主纱」） */
.cap {
  position: absolute; z-index: 4;
  left: clamp(26px, 3.2vw, 46px); bottom: clamp(28px, 5vh, 44px);
  display: flex; align-items: center; gap: 13px;
  animation: riseIn 1.1s var(--ease) .5s both;
}
.cap .rule { width: 46px; height: 1px; background: var(--gold); }
.cap .no  { font-size: 10px; letter-spacing: .3em; color: #E5B3B9; }
.cap .tt  {
  font-size: 10px; letter-spacing: .3em; color: rgba(255,248,238,.82);
  text-shadow: 0 1px 8px rgba(20,14,10,.55), 0 0 2px rgba(20,14,10,.3);
}

@keyframes photoIn {
  from { opacity: 0; transform: scale(1.05); }
  to   { opacity: 1; transform: none; }
}
@keyframes riseIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: none; }
}

/* ============ 右：面板（窄栏，直角贴边） ============ */
.panel {
  position: relative;
  display: flex; align-items: center;
  padding: 6vh clamp(24px, 2.6vw, 44px);
  background: var(--paper);
  /* 一刀切：直角贴边 + 金线收缝，与满版图区分界 */
  border-left: 1px solid rgba(194,168,116,.45);
  box-shadow: -30px 0 70px -40px rgba(20,14,10,.6);
}
/* 表单在窄栏内居中，与左侧满版图一刀分开 */
.form {
  width: 100%; max-width: 19.5rem;
  margin: 0 auto;
  animation: riseIn 1.1s var(--ease) .22s both;
}

/* 字标 */
.brand { text-align: center; margin-bottom: clamp(30px, 4.6vh, 48px); }
.brand h1 {
  margin: 0; font-family: "Noto Serif SC", serif; font-weight: 300;
  font-size: 27px; letter-spacing: .3em; text-indent: .3em; color: var(--ink);
}
.brand .sub {
  display: flex; align-items: center; justify-content: center; gap: 10px; margin: 12px 0 0;
  font-size: 9px; letter-spacing: .3em; color: var(--muted);
}
.brand .sub i { width: 24px; height: 1px; background: var(--gold); }

/* 表单：下划线式 */
.form :deep(.el-form-item) { margin-bottom: 26px; }
.form :deep(.el-form-item__label) {
  height: auto; padding: 0 0 7px; line-height: 1;
  font-size: 10px; letter-spacing: .26em; color: var(--muted);
}
.form :deep(.el-input__wrapper) {
  padding: 2px 0 10px; background: transparent; border-radius: 0;
  box-shadow: inset 0 -1px 0 rgba(36,30,27,.16);
  transition: box-shadow .4s var(--ease);
}
.form :deep(.el-input__wrapper:hover) { box-shadow: inset 0 -1px 0 rgba(36,30,27,.3); }
.form :deep(.el-input__wrapper.is-focus) { box-shadow: inset 0 -1.5px 0 var(--rose); }
.form :deep(.el-input__inner) {
  height: auto; font-family: "Noto Serif SC", serif;
  font-size: 14px; letter-spacing: .06em; color: var(--ink);
}
.form :deep(.el-input__inner::placeholder) { color: rgba(154,143,132,.62); letter-spacing: .18em; }
.form :deep(.el-input__inner:focus-visible) { outline: none; }

/* 错误：细前缀 + 轻颤 */
.err {
  display: flex; align-items: center; gap: 8px; margin: -10px 0 18px;
  font-size: 12px; letter-spacing: .04em; color: #c05f4d;
}
.err i { width: 5px; height: 5px; border-radius: 50%; background: #c05f4d; flex: none; }
.shake-enter-active { animation: shake .42s var(--ease); }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  22% { transform: translateX(-5px); }
  46% { transform: translateX(4px); }
  72% { transform: translateX(-2px); }
}

/* 按钮：通栏墨色 */
.go {
  width: 100%; height: 46px; margin-top: 6px; border-radius: 2px;
  font-family: "Noto Serif SC", serif; font-size: 13px; font-weight: 400;
  letter-spacing: .42em; text-indent: .42em; color: #F6F1E7;
  background: var(--ink); border-color: var(--ink);
  transition: transform .5s var(--ease), box-shadow .5s var(--ease), background .5s var(--ease);
}
.go:hover, .go:focus-visible {
  background: #322A25; border-color: #322A25; transform: translateY(-1px);
  box-shadow: 0 14px 28px -16px rgba(36,30,27,.7), 0 0 0 1px rgba(194,168,116,.5) inset;
}

.foot {
  margin: clamp(30px, 5vh, 52px) 0 0; text-align: center;
  font-size: 9px; letter-spacing: .24em; color: rgba(154,143,132,.85);
}

/* ============ 响应式 ============ */
@media (max-width: 1180px) {
  .login { grid-template-columns: minmax(0, 1fr) minmax(330px, 38%); }
}
@media (max-width: 860px) {
  .login {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 42vh) minmax(0, 1fr);
    overflow-y: auto;
  }
  .stage { min-height: 42vh; }
  .axis { display: none; }
  .cap { left: 24px; bottom: 24px; }
  .panel { border-left: none; border-top: 1px solid rgba(194,168,116,.45); padding: 5vh 26px 40px; }
  .form { margin: 0 auto; }
  .brand { margin-bottom: 26px; }
  .foot { margin-top: 26px; }
}

@media (prefers-reduced-motion: reduce) {
  .photo, .cap, .axis, .form { animation: none; }
  .shake-enter-active { animation: none; }
  .go, .form :deep(.el-input__wrapper) { transition: none; }
}
</style>