<script setup lang="ts">
/* Layout.vue —— 登录后的壳：侧栏 + 内容路由出口（2026-10-03 品牌化重做）
 * 侧栏：暖纸底 + 金线右缘；brand 区为真 logo（内联 symbol SVG，currentColor 上色）
 * + 予时妍 serif 字标 + YUÉ ATELIER 9px 疏排。菜单 serif 疏排，active = 玫瑰字 + 金线前缀。
 * 逻辑不变：401 统一踢回 /login；退出清 token。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { setToken, setUnauthorizedHandler } from './api';

const route = useRoute();
const router = useRouter();

const active = computed(() => '/' + (route.path.split('/')[1] || 'albums'));

/* 任意接口 401 → 踢回登录页（携带 redirect，登录后回到原页） */
setUnauthorizedHandler(() => {
  setToken('');
  router.push({ path: '/login', query: { redirect: route.fullPath } });
});

function logout() {
  setToken('');
  router.push('/login');
}
</script>

<template>
  <el-container style="height:100vh">
    <el-aside width="216px" class="side">
      <!-- 品牌：开口环符号（纯路径 currentColor）+ 三字字标 + 拉丁注脚 -->
      <div class="brand">
        <svg class="sym" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="22.5" fill="none" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-dasharray="121.4 20" transform="rotate(155.5 32 32)"/>
          <circle cx="32" cy="32" r="5.1" fill="currentColor"/>
        </svg>
        <p class="wm">予时妍</p>
        <p class="en"><i aria-hidden="true"></i><span>YUÉ ATELIER · ADMIN</span><i aria-hidden="true"></i></p>
      </div>

      <el-menu :default-active="active" router class="menu">
        <el-menu-item index="/albums"><el-icon><Picture /></el-icon>作品管理</el-menu-item>
        <el-menu-item index="/collections"><el-icon><Collection /></el-icon>系列管理</el-menu-item>
        <el-menu-item index="/stats"><el-icon><DataLine /></el-icon>互动看板</el-menu-item>
        <el-menu-item index="/section-kinds"><el-icon><PriceTag /></el-icon>段落类型</el-menu-item>
        <el-menu-item index="/settings"><el-icon><Setting /></el-icon>站点设置</el-menu-item>
      </el-menu>

      <div class="foot">
        <span class="user">已登录</span>
        <el-button link class="out" size="small" @click="logout">退出</el-button>
      </div>
    </el-aside>
    <el-main class="main">
      <router-view />
    </el-main>
  </el-container>
</template>

<style scoped>
/* ============ 侧栏：暖纸 + 金线 ============ */
.side {
  background: var(--mua-paper-deep, #F5EFE6);
  display: flex; flex-direction: column;
  border-right: 1px solid rgba(194, 168, 116, .45);
  box-shadow: 1px 0 0 rgba(255, 252, 245, .6) inset;
}

/* ---- 品牌区 ---- */
.brand { padding: 30px 0 24px; text-align: center; }
.brand .sym { width: 34px; height: 34px; color: var(--mua-rose, #B0707B); }
.brand .wm {
  margin: 12px 0 0;
  font-family: var(--mua-serif, serif); font-weight: 300;
  font-size: 19px; letter-spacing: .3em; text-indent: .3em;
  color: var(--mua-ink, #241E1B);
}
.brand .en {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin: 9px 0 0;
  font-size: 8px; letter-spacing: .26em; text-indent: .26em;
  color: var(--mua-muted, #9A8F84);
}
.brand .en i { width: 14px; height: 1px; background: var(--mua-gold, #C2A874); }

/* ---- 菜单 ---- */
.menu {
  border-right: none; flex: 1; padding: 6px 12px;
  background: transparent;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #6B6157;
  --el-menu-hover-bg-color: rgba(176, 112, 123, .06);
  --el-menu-active-color: #B0707B;
  --el-menu-hover-text-color: #241E1B;
}
.menu :deep(.el-menu-item) {
  height: 42px; margin: 3px 0; border-radius: 2px;
  font-family: var(--mua-serif, serif); font-weight: 300;
  font-size: 13.5px; letter-spacing: .14em;
  transition: background .3s cubic-bezier(.16,1,.3,1), color .3s cubic-bezier(.16,1,.3,1);
}
.menu :deep(.el-menu-item.is-active) {
  background: rgba(176, 112, 123, .09);
  box-shadow: inset 2px 0 0 var(--mua-gold, #C2A874);
}

/* ---- 底部 ---- */
.foot {
  padding: 13px 16px;
  border-top: 1px solid rgba(194, 168, 116, .35);
  display: flex; align-items: center; justify-content: space-between;
}
.foot .user { font-size: 11px; letter-spacing: .22em; color: var(--mua-muted, #9A8F84); }
.foot .out { color: var(--mua-rose, #B0707B); letter-spacing: .1em; }
</style>
