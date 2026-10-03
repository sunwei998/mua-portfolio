<script setup lang="ts">
/* App.vue —— 根组件：路由出口 + 登录成功回跳（2026-10-03 路由化改造）
 * 之前：view ref 手动切页（无 URL、刷新丢页、无守卫）
 * 现在：hash 路由（router.ts），Layout 挂 401 踢回逻辑 */
import { useRouter, useRoute } from 'vue-router';
</script>

<template>
  <router-view />
</template>

<style>
@import './styles/theme.css';

html, body, #app { height: 100%; margin: 0; }
body { font-family: 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #FAF7F2; }
.main { padding: 24px 28px; overflow: auto; }
</style>
