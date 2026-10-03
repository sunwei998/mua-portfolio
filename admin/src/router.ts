/* ============================================================
 * router.ts —— admin 前端路由（2026-10-03 路由化改造）
 * ① 每页绑定 URL（hash 模式：#/albums，刷新不丢页、可直链）
 * ② 登录守卫：未登录访问业务页 → 重定向 /login
 * ③ 401（登录态过期）统一由 api.ts 的 unauthorizedHandler 踢回 /login
 * hash 模式：不依赖服务端 fallback，与 vite base=/admin/ 无耦合
 * ============================================================ */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { getToken } from './api';
import Login from './views/Login.vue';
import Layout from './Layout.vue';

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: Login },
  {
    path: '/',
    component: Layout,
    children: [
      { path: '', redirect: '/albums' },
      { path: 'albums', name: 'albums', component: () => import('./views/Albums.vue'), meta: { auth: true } },
      { path: 'collections', name: 'collections', component: () => import('./views/Collections.vue'), meta: { auth: true } },
      { path: 'stats', name: 'stats', component: () => import('./views/Stats.vue'), meta: { auth: true } },
      { path: 'section-kinds', name: 'section-kinds', component: () => import('./views/SectionKinds.vue'), meta: { auth: true } },
      { path: 'settings', name: 'settings', component: () => import('./views/Settings.vue'), meta: { auth: true } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/albums' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

/* 登录守卫：无 token 的业务页一律回登录页 */
router.beforeEach((to) => {
  if (to.meta.auth && !getToken()) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.path === '/login' && getToken()) {
    return { path: '/albums' };
  }
  return true;
});
