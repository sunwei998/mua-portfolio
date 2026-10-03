/* ============================================================
 * stub.js —— M1 → M4 期间的占位视图（路由已通，页面 M4 实施）
 * ============================================================ */
// @ts-check

/**
 * @param {string} name 页面名
 * @param {string} no   屏号 / 编号
 * @param {string} hint 一句话说明这一页最终会是什么
 */
export function stub(name, no, hint) {
  return async (el) => {
    el.innerHTML = `
      <div class="stub">
        <span class="no">${no}</span>
        <h1>${name}</h1>
        <p>${hint}</p>
        <p>M4 · 前台页面阶段实施</p>
        <a class="back" href="/">返回首页</a>
      </div>`;
  };
}
