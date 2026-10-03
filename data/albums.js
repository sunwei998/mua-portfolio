/* ============================================================
   禧悦妆造 · 站点数据（纯前端版：后期可无缝替换为 API）
   原则：只呈现作品 —— 不写客户姓名、不写日期、不放价格
   占位图说明：assets/img/ 下均为 AI 占位图，直接按同名文件
   替换为真实客片即可（建议长边 1600px、WebP/约 200KB 展示图）
   ============================================================ */
window.MUA = {
  brand: {
    studio: "禧悦妆造",
    artist: "化妆师甜茉",
    latin: "XIYUE MAKEUP · TIANMO",
    tagline: ["以", "妆", "为", "笺"],
  },

  /* 壹 · 婚庆跟妆：每场婚礼一册；册内新中式 / 西式严格隔离，
     二级按婚礼当天流程走：晨袍 → 出门 → 仪式（主纱）→ 迎宾 → 敬酒 */
  weddings: [
    {
      id: "w1", ordinal: "壹", cover: "assets/img/nc-b.png",
      styles: {
        cn: {
          label: "新中式",
          scenes: [
            { key: "chenpao", label: "晨袍造型", imgs: [{ src: "assets/img/nc-a.png" }, { src: "assets/img/nc-c.png" }, { src: "assets/img/closeup-face.png" }] },
            { key: "chumen",  label: "出门造型", imgs: [{ src: "assets/img/nc-b.png" }, { src: "assets/img/nc-a.png" }] },
            { key: "yishi",   label: "仪式 · 主纱", imgs: [{ src: "assets/img/nc-c.png" }, { src: "assets/img/nc-b.png" }] },
            { key: "yingbin", label: "迎宾造型", imgs: [{ src: "assets/img/nc-b.png" }] },
            { key: "jingjiu", label: "敬酒造型", imgs: [{ src: "assets/img/nc-a.png" }, { src: "assets/img/nc-b.png" }] },
          ],
          closeups: [
            { label: "头饰造型", src: "assets/img/closeup-head.png" },
            { label: "面部细节", src: "assets/img/closeup-face.png" },
          ],
        },
        we: {
          label: "西式",
          scenes: [
            { key: "chenpao", label: "晨袍造型", imgs: [{ src: "assets/img/w-a.png" }, { src: "assets/img/hero.png" }] },
            { key: "chumen",  label: "出门造型", imgs: [{ src: "assets/img/hero.png" }] },
            { key: "yishi",   label: "仪式 · 主纱", imgs: [{ src: "assets/img/w-a.png" }, { src: "assets/img/w-b.png" }] },
            { key: "yingbin", label: "迎宾造型", imgs: [{ src: "assets/img/w-b.png" }] },
            { key: "jingjiu", label: "敬酒造型", imgs: [{ src: "assets/img/w-b.png" }, { src: "assets/img/hero.png" }] },
          ],
          closeups: [
            { label: "头饰造型", src: "assets/img/closeup-head.png" },
            { label: "面部细节", src: "assets/img/closeup-face.png" },
          ],
        },
      },
    },
    {
      id: "w2", ordinal: "贰", cover: "assets/img/w-a.png",
      styles: {
        cn: {
          label: "新中式",
          scenes: [
            { key: "chenpao", label: "晨袍造型", imgs: [{ src: "assets/img/nc-c.png" }, { src: "assets/img/nc-a.png" }] },
            { key: "chumen",  label: "出门造型", imgs: [{ src: "assets/img/nc-a.png" }] },
            { key: "yishi",   label: "仪式 · 主纱", imgs: [{ src: "assets/img/nc-b.png" }, { src: "assets/img/nc-c.png" }] },
            { key: "yingbin", label: "迎宾造型", imgs: [{ src: "assets/img/nc-c.png" }] },
            { key: "jingjiu", label: "敬酒造型", imgs: [{ src: "assets/img/nc-b.png" }] },
          ],
          closeups: [
            { label: "头饰造型", src: "assets/img/closeup-head.png" },
            { label: "面部细节", src: "assets/img/closeup-face.png" },
          ],
        },
        we: {
          label: "西式",
          scenes: [
            { key: "chenpao", label: "晨袍造型", imgs: [{ src: "assets/img/hero.png" }, { src: "assets/img/w-a.png" }] },
            { key: "chumen",  label: "出门造型", imgs: [{ src: "assets/img/w-b.png" }] },
            { key: "yishi",   label: "仪式 · 主纱", imgs: [{ src: "assets/img/w-a.png" }, { src: "assets/img/hero.png" }] },
            { key: "yingbin", label: "迎宾造型", imgs: [{ src: "assets/img/w-a.png" }] },
            { key: "jingjiu", label: "敬酒造型", imgs: [{ src: "assets/img/w-b.png" }] },
          ],
          closeups: [
            { label: "头饰造型", src: "assets/img/closeup-head.png" },
            { label: "面部细节", src: "assets/img/closeup-face.png" },
          ],
        },
      },
    },
    {
      id: "w3", ordinal: "叁", cover: "assets/img/hero.png",
      styles: {
        cn: {
          label: "新中式",
          scenes: [
            { key: "chenpao", label: "晨袍造型", imgs: [{ src: "assets/img/nc-a.png" }] },
            { key: "chumen",  label: "出门造型", imgs: [{ src: "assets/img/nc-c.png" }] },
            { key: "yishi",   label: "仪式 · 主纱", imgs: [{ src: "assets/img/nc-b.png" }] },
            { key: "yingbin", label: "迎宾造型", imgs: [{ src: "assets/img/nc-a.png" }] },
            { key: "jingjiu", label: "敬酒造型", imgs: [{ src: "assets/img/nc-c.png" }] },
          ],
          closeups: [
            { label: "头饰造型", src: "assets/img/closeup-head.png" },
            { label: "面部细节", src: "assets/img/closeup-face.png" },
          ],
        },
        we: {
          label: "西式",
          scenes: [
            { key: "chenpao", label: "晨袍造型", imgs: [{ src: "assets/img/w-b.png" }] },
            { key: "chumen",  label: "出门造型", imgs: [{ src: "assets/img/hero.png" }] },
            { key: "yishi",   label: "仪式 · 主纱", imgs: [{ src: "assets/img/w-a.png" }] },
            { key: "yingbin", label: "迎宾造型", imgs: [{ src: "assets/img/w-b.png" }] },
            { key: "jingjiu", label: "敬酒造型", imgs: [{ src: "assets/img/hero.png" }] },
          ],
          closeups: [
            { label: "头饰造型", src: "assets/img/closeup-head.png" },
            { label: "面部细节", src: "assets/img/closeup-face.png" },
          ],
        },
      },
    },
  ],

  /* 贰 · 订婚宴跟妆：平铺图集（次要板块，不设分类） */
  engagement: {
    title: "订婚宴跟妆", latin: "ENGAGEMENT",
    imgs: [{ src: "assets/img/hero.png" }, { src: "assets/img/nc-a.png" }, { src: "assets/img/closeup-face.png" }, { src: "assets/img/nc-c.png" }],
  },

  /* 叁 · 孕妇照 · 亲子照跟妆：平铺图集 */
  family: {
    title: "孕妇照 · 亲子照跟妆", latin: "FAMILY & MATERNITY",
    imgs: [{ src: "assets/img/family.png" }, { src: "assets/img/nc-a.png" }, { src: "assets/img/closeup-head.png" }],
  },

  about: {
    portrait: "assets/img/portrait.png",
    bio: "跟妆八年。妆面干净透亮，造型考究；新中式取古意而不老气，西式求轻盈而不寡淡。愿以妆为笺，记下你最重要的一天。",
    steps: ["沟通", "试妆", "跟妆", "补场"],
  },
};
