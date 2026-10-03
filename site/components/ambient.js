/* ============================================================
 * ambient.js —— 动态背景层（v6 :573-576 等屏首三行，零依赖）
 * 只做一件事：把 .ambient 骨架 DOM 一次性 prepend 到 body。
 * 显隐 / 配色 / 漂移动画全在 ambient.css 里按根主题 class
 * （html.ms / .twe / .tcn）驱动 —— 路由切主题时背景自动跟随，
 * 这里不需要观察任何状态（配置驱动，无散点特判）。
 * ============================================================ */
// @ts-check

const SKELETON = `
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
  <div class="blob w1"></div><div class="blob w2"></div><div class="blob w3"></div>
  <div class="blob g1"></div><div class="blob g2"></div><div class="blob g3"></div>
  <div class="silk"></div><div class="sweep"></div><div class="grain"></div>
`;

/** 全局一次；重复调用是幂等空操作 */
export function initBackdrop() {
  if (document.getElementById('backdrop')) return;
  const host = document.createElement('div');
  host.id = 'backdrop';
  host.className = 'ambient';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = SKELETON;
  document.body.prepend(host);
}
