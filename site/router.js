/* ============================================================
 * history 路由 —— pushState + popstate + 站内 <a> 拦截。零依赖。
 * 约定：全部站内链接都是绝对路径（/collection），外链/下载不拦。
 * 服务端（Nginx try_files / dev.js）对未命中路径回退 index.html。
 * ============================================================ */
// @ts-check

/**
 * @typedef {Object} Route
 * @property {string}  path   以 / 开头；`:name` 为参数段；`*` 为 404 兜底
 * @property {(el: HTMLElement, params: Record<string, string>) => (void | Promise<void | ViewOverride>)} view
 * @property {string}  title  渲染完成后写入 document.title（微信 SPA 分享一期对策）
 * @property {'ms'|'twe'|'tcn'} theme  根主题 class
 * @property {'home'|'work'|'about'} [nav]  Dock 高亮归属（缺省则该路由不高亮任何项）
 */

/** 视图可在异步取数后覆盖标题 / 主题（如册详情的主题由 album.style 决定）
 *  @typedef {Object} ViewOverride
 *  @property {string}  [title]
 *  @property {'ms'|'twe'|'tcn'} [theme]
 */

/** @type {Route[]} */
let routes = [];
/** @type {HTMLElement | null} */
let viewEl = null;
/** 竞态守卫：只有最新一次 render 允许落盘（快速连点链接时旧渲染作废） */
let renderSeq = 0;

/**
 * 模式匹配。命中返回参数表，否则 null。
 * @param {string} pattern
 * @param {string} path
 * @returns {Record<string, string> | null}
 */
function match(pattern, path) {
  const pp = pattern.split('/').filter(Boolean);
  const aa = path.split('/').filter(Boolean);
  if (pp.length !== aa.length) return null;
  /** @type {Record<string, string>} */
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(aa[i]);
    else if (pp[i] !== aa[i]) return null;
  }
  return params;
}

/**
 * @param {Route[]} list
 * @param {HTMLElement} el
 */
export function initRouter(list, el) {
  routes = list;
  viewEl = el;

  document.addEventListener('click', (e) => {
    const a = /** @type {HTMLAnchorElement | null} */ (e.target.closest('a'));
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (a.target || a.hasAttribute('download')) return;
    if (!href.startsWith('/')) return; // 外链 / mailto: / tel: 不拦
    e.preventDefault();
    navigate(href);
  });

  addEventListener('popstate', () => { void render(); });
  void render();
}

/**
 * @param {string} path
 * @param {{ replace?: boolean }} [opts]
 */
export function navigate(path, opts = {}) {
  const { replace = false } = opts;
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  void render();
}

/** 当前路径命中的路由（供 Dock 等做 active 状态） */
export function currentRoute() {
  const path = location.pathname;
  return routes.find((r) => r.path !== '*' && match(r.path, path) !== null) || null;
}

async function render() {
  const seq = ++renderSeq;
  const path = location.pathname;
  const route =
    routes.find((r) => r.path !== '*' && match(r.path, path) !== null) ||
    routes.find((r) => r.path === '*');
  if (!route || !viewEl) return;

  const params = route.path === '*' ? {} : (match(route.path, path) || {});

  // 生命周期起点：顶部进度条起步（M5 ink，2026-10-03 改造：不再全屏遮罩）
  document.dispatchEvent(new CustomEvent('route:start'));
  // 点击即时反馈：旧页面立即降透明 + 居中加载指示，弱网下不再像"点了没反应"
  viewEl.classList.add('route-loading');

  // 主题提前切：body 背景色有 .45s 过渡，提前给过渡留时间
  const root = document.documentElement;
  root.classList.remove('ms', 'twe', 'tcn');
  root.classList.add(route.theme);

  /* 离屏渲染：旧页面保持可见，直到新内容就绪才原子替换（主流 App 过渡，
   * 告别「取数期间白/黑屏」）。视图函数拿到的 shell 只是暂存容器，事件
   * 监听随节点一起搬进 #view，行为不变。 */
  const shell = document.createElement('div');
  let override = {};
  try {
    override = (await route.view(shell, params)) || {};
  } catch (err) {
    console.error('[router] view render failed:', err);
    viewEl.classList.remove('route-loading');
    document.dispatchEvent(new CustomEvent('route:abort'));
    return; // 旧页面原样保留
  }
  if (seq !== renderSeq) return; // 已被更新的导航取代，丢弃

  // 微信 SPA 分享一期对策：渲染完成后同步标题（视图可覆盖）
  document.title = override.title || route.title;

  // 异步取数后才知道主题的页面（如册详情）在这里切根 class
  const finalTheme = override.theme || route.theme;
  if (!root.classList.contains(finalTheme)) {
    root.classList.remove('ms', 'twe', 'tcn');
    root.classList.add(finalTheme);
  }

  viewEl.classList.remove('is-entering');
  viewEl.classList.remove('route-loading');
  viewEl.replaceChildren(...shell.childNodes);

  scrollTo(0, 0);
  void viewEl.offsetWidth; // 重排后再播入场动画
  viewEl.classList.add('is-entering');

  document.dispatchEvent(new CustomEvent('route:change', { detail: { path, route } }));
}
