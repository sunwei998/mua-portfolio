/* ============================================================
   禧悦妆造 · 绢本妆册 — 路由与交互（零构建，原生 JS）
   路由：#/  首页 | #/wedding  婚庆相册墙 | #/album/:id  相册详情
        #/gallery/engagement | #/gallery/family | #/about
   ============================================================ */
(function () {
  "use strict";

  var D = window.MUA;
  var view = document.getElementById("view");
  var ink = document.getElementById("ink");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 相册详情的会话内状态（风格隔离：cn / we） */
  var albumState = { style: "cn", scene: 0 };

  /* ---------- 工具 ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function bindReveals(root) {
    var els = root.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window) || reduced) {
      els.forEach(function (e) { e.classList.add("in"); }); return;
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  }
  function lazyImgs(root) {
    root.querySelectorAll(".ph img").forEach(function (img) {
      if (img.complete) { img.classList.add("loaded"); }
      else { img.addEventListener("load", function () { img.classList.add("loaded"); }); }
    });
  }
  /* 墨晕过渡：中点换内容 */
  function withInk(swap) {
    if (reduced) { swap(); return; }
    ink.classList.add("on");
    window.setTimeout(function () { swap(); window.scrollTo(0, 0); }, 340);
    window.setTimeout(function () { ink.classList.remove("on"); }, 760);
  }

  /* ---------- 页头 ---------- */
  function pagehead(title, latin, backTo) {
    return '<header class="pagehead">'
      + (backTo ? '<a class="pagehead__back" href="' + backTo + '" aria-label="返回">‹</a>' : "")
      + '<h1 class="pagehead__title">' + esc(title) + "</h1>"
      + (latin ? '<span class="latin">' + esc(latin) + "</span>" : "")
      + "</header>";
  }

  /* ---------- 首页 ---------- */
  function pageHome() {
    var b = D.brand;
    var entries = [
      { num: "壹", label: "婚庆跟妆", href: "#/wedding", thumb: "assets/img/nc-b.png" },
      { num: "贰", label: "订婚宴跟妆", href: "#/gallery/engagement", thumb: "assets/img/hero.png" },
      { num: "叁", label: "孕妇照 · 亲子照", href: "#/gallery/family", thumb: "assets/img/family.png" },
    ];
    var tagline = b.tagline.map(function (c) { return '<span class="vfade">' + c + "</span>"; }).join("");
    return '<section class="page home">'
      + '<div class="home__top">'
      +   '<div class="seal seal--stamp">' + esc(b.studio.charAt(0)) + "</div>"
      +   '<span class="latin">' + esc(b.latin) + "</span>"
      + "</div>"
      + '<div class="home__stage">'
      +   '<div class="vtext home__vleft" aria-hidden="true">' + tagline + "</div>"
      +   '<figure class="home__img ph"><img src="assets/img/hero.png" alt="新娘造型侧影" /></figure>'
      +   '<div class="vtext home__vright" aria-hidden="true">'
      +     '<span class="vfade">' + esc(b.studio.charAt(0)) + "</span>"
      +     '<span class="vfade">' + esc(b.studio.charAt(1)) + "</span>"
      +     '<span class="vfade">' + esc(b.studio.charAt(2)) + "</span>"
      +     '<span class="vfade">' + esc(b.studio.charAt(3)) + "</span>"
      +     '<span class="vsub">' + esc(b.artist) + "</span>"
      +   "</div>"
      + "</div>"
      + '<nav class="home__entries reveal in">'
      + entries.map(function (e) {
          return '<a class="entry" href="' + e.href + '">'
            + '<span class="entry__num">' + e.num + "</span>"
            + '<span class="entry__label">' + esc(e.label) + "</span>"
            + '<img class="entry__thumb" src="' + e.thumb + '" alt="" />'
            + '<span class="entry__chev">›</span></a>';
        }).join("")
      + "</nav>"
      + '<div class="home__foot">'
      +   '<a href="#/about">关于我</a><a href="#/about">微信预约</a>'
      + "</div>"
      + "</section>";
  }

  /* ---------- 相册墙（婚庆跟妆：每场婚礼一册） ---------- */
  function pageWall() {
    var cards = D.weddings.map(function (w, i) {
      return '<a class="album-card reveal" href="#/album/' + w.id + '" data-album="' + w.id + '">'
        + '<div class="album-card__ph ph">'
        +   '<span class="album-card__num">' + w.ordinal + "</span>"
        +   '<img src="' + w.cover + '" alt="婚礼跟妆作品 ' + w.ordinal + '" loading="' + (i > 1 ? "lazy" : "eager") + '" />'
        +   '<span class="album-card__silk">婚礼跟妆 · 其' + w.ordinal + "</span>"
        + "</div></a>";
    }).join("");
    return '<section class="page">'
      + pagehead("婚庆跟妆", "WEDDING DAY")
      + '<div class="wall">' + cards + "</div>"
      + '<p class="viewer__hint" style="color:var(--color-muted);margin-top:var(--sp-5)">点开封面 · 翻开这一册</p>'
      + "</section>";
  }

  /* 进册动效：封面翻转后再跳转 */
  function bindWall(root) {
    root.querySelectorAll("[data-album]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        a.classList.add("flip");
        window.setTimeout(function () { location.hash = a.getAttribute("href"); }, reduced ? 0 : 280);
      });
    });
  }

  /* ---------- 相册详情（中西式严格隔离） ---------- */
  function albumWaterfall(alb) {
    var st = albumState;
    var style = alb.styles[st.style];
    var scene = style.scenes[st.scene];
    var chips = style.scenes.map(function (s, i) {
      return '<button class="chip' + (i === st.scene ? " is-on" : "") + '" data-scene="' + i + '">' + esc(s.label) + "</button>";
    }).join("");
    var figs = scene.imgs.map(function (im) {
      return '<figure class="ph"><img src="' + im.src + '" alt="' + esc(style.label + " · " + scene.label) + '" loading="lazy" /></figure>';
    }).join("");
    var fans = style.closeups.map(function (c, i) {
      return '<button class="fan" data-fan="' + i + '">'
        + '<span class="fan__disc"><img src="' + c.src + '" alt="' + esc(c.label) + '" loading="lazy" /></span>'
        + '<span class="fan__label">' + esc(c.label) + "</span></button>";
    }).join("");
    var next = D.weddings[(D.weddings.indexOf(alb) + 1) % D.weddings.length];
    return ""
      + '<div class="stylegate" role="tablist">'
      +   '<button class="gate' + (st.style === "cn" ? " is-on" : "") + '" data-style="cn">新中式</button>'
      +   '<button class="gate' + (st.style === "we" ? " is-on" : "") + '" data-style="we">西式</button>'
      + "</div>"
      + '<div class="chips" role="tablist">' + chips + "</div>"
      + '<div class="flow">' + figs + "</div>"
      + '<div class="closeups reveal">'
      +   '<div class="sec-title"><strong>细节 · 特写</strong><span class="latin">CLOSE-UP</span></div>'
      +   '<div class="fans">' + fans + "</div>"
      + "</div>"
      + '<a class="next-album" href="#/album/' + next.id + '">下一册 · ' + next.ordinal + " ›</a>";
  }

  function pageAlbum(id) {
    var alb = D.weddings.find(function (w) { return w.id === id; }) || D.weddings[0];
    return '<section class="page" id="albumPage">'
      + pagehead("婚礼跟妆 · 其" + alb.ordinal, "THE ALBUM", "#/wedding")
      + '<div id="albumBody">' + albumWaterfall(alb) + "</div>"
      + "</section>";
  }

  function bindAlbum(root, alb) {
    var body = root.querySelector("#albumBody");
    function rerender() { body.innerHTML = albumWaterfall(alb); lazyImgs(body); bindInner(); }
    function bindInner() {
      body.querySelectorAll("[data-style]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (btn.getAttribute("data-style") === albumState.style) return;
          albumState.style = btn.getAttribute("data-style"); albumState.scene = 0;
          withInk(rerender); /* 风格隔离：墨晕切换 */
        });
      });
      body.querySelectorAll("[data-scene]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          albumState.scene = Number(btn.getAttribute("data-scene"));
          body.querySelector(".flow").style.opacity = 0;
          window.setTimeout(rerender, reduced ? 0 : 160);
        });
      });
      /* 团扇 → 查看器 */
      body.querySelectorAll("[data-fan]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var i = Number(btn.getAttribute("data-fan"));
          openViewer(alb.styles[albumState.style].closeups.map(function (c) { return c.src; }),
            i, "细节 · 特写");
        });
      });
      /* 瀑布流 → 查看器 */
      var scene = alb.styles[albumState.style].scenes[albumState.scene];
      var figs = Array.prototype.slice.call(body.querySelectorAll(".flow figure"));
      figs.forEach(function (fig, i) {
        fig.addEventListener("click", function () {
          openViewer(scene.imgs.map(function (im) { return im.src; }), i,
            "婚礼跟妆 · 其" + alb.ordinal + " · " + scene.label);
        });
      });
    }
    bindInner(); lazyImgs(body);
  }

  /* ---------- 平铺图集（订婚 / 孕亲） ---------- */
  function pageGallery(key) {
    var g = D[key];
    if (!g) return pageHome();
    var figs = g.imgs.map(function (im, i) {
      return '<figure class="ph reveal"><img src="' + im.src + '" alt="' + esc(g.title) + '" loading="' + (i > 1 ? "lazy" : "eager") + '" /></figure>';
    }).join("");
    return '<section class="page">'
      + pagehead(g.title, g.latin, "#/")
      + '<div class="flow">' + figs + "</div>"
      + "</section>";
  }

  function bindGallery(root, key) {
    var g = D[key];
    var figs = Array.prototype.slice.call(root.querySelectorAll(".flow figure"));
    figs.forEach(function (fig, i) {
      fig.addEventListener("click", function () {
        openViewer(g.imgs.map(function (im) { return im.src; }), i, g.title);
      });
    });
  }

  /* ---------- 关于我 ---------- */
  function pageAbout() {
    var a = D.about, b = D.brand;
    return '<section class="page">'
      + pagehead("关于我", "ABOUT")
      + '<img class="about__portrait ph reveal" src="' + a.portrait + '" alt="化妆师甜茉工作照" />'
      + '<h2 class="about__name">' + esc(b.artist) + "</h2>"
      + '<p class="about__role">' + esc(b.studio) + " · 跟妆八年 · 新中式 × 西式</p>"
      + '<p class="about__bio reveal">' + esc(a.bio) + "</p>"
      + '<div class="steps reveal">' + a.steps.map(function (s) { return '<span class="chip">' + esc(s) + "</span>"; }).join("") + "</div>"
      + '<div class="qr-card reveal">'
      +   '<div class="qr-card__box">微信二维码<br />（待替换）</div>'
      +   "扫码添加微信 · 沟通档期与试妆"
      + "</div>"
      + '<button class="cta" id="ctaBook">预约跟妆</button>'
      + "</section>";
  }

  function bindAbout(root) {
    var cta = root.querySelector("#ctaBook");
    if (cta) cta.addEventListener("click", function () {
      window.scrollTo({ top: root.querySelector(".qr-card").offsetTop - 60, behavior: reduced ? "auto" : "smooth" });
    });
  }

  /* ---------- 全屏查看器 ---------- */
  var viewer = {
    el: document.getElementById("viewer"),
    img: document.getElementById("viewerImg"),
    stage: document.getElementById("viewerStage"),
    title: document.getElementById("viewerTitle"),
    count: document.getElementById("viewerCount"),
    fill: document.getElementById("viewerFill"),
    list: [], idx: 0, titleText: "",
    open: function (list, idx, title) {
      this.list = list; this.idx = idx; this.titleText = title;
      this.render();
      this.el.classList.add("is-open");
      document.body.style.overflow = "hidden";
    },
    render: function () {
      this.img.src = this.list[this.idx];
      this.title.textContent = this.titleText;
      this.count.textContent = (this.idx + 1) + " / " + this.list.length;
      this.fill.style.width = ((this.idx + 1) / this.list.length * 100) + "%";
      this.stage.classList.remove("is-zoom");
    },
    next: function () { this.idx = (this.idx + 1) % this.list.length; this.render(); },
    prev: function () { this.idx = (this.idx - 1 + this.list.length) % this.list.length; this.render(); },
    close: function () {
      this.el.classList.remove("is-open");
      document.body.style.overflow = "";
    },
  };
  document.getElementById("viewerClose").addEventListener("click", function () { viewer.close(); });
  document.addEventListener("keydown", function (e) {
    if (!viewer.el.classList.contains("is-open")) return;
    if (e.key === "Escape") viewer.close();
    if (e.key === "ArrowRight") viewer.next();
    if (e.key === "ArrowLeft") viewer.prev();
  });
  (function () {
    var sx = 0, lastTap = 0;
    viewer.stage.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    viewer.stage.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 42) { dx < 0 ? viewer.next() : viewer.prev(); }
    }, { passive: true });
    viewer.stage.addEventListener("click", function () {
      var now = Date.now();
      if (now - lastTap < 300) { viewer.stage.classList.toggle("is-zoom"); }
      lastTap = now;
    });
  })();

  /* ---------- 路由 ---------- */
  function render() {
    var h = location.hash.replace(/^#/, "") || "/";
    var m;
    var html, after = null;
    if (h === "/" ) { html = pageHome(); }
    else if (h === "/wedding") { html = pageWall(); after = bindWall; }
    else if ((m = h.match(/^\/album\/(\w+)$/))) { html = pageAlbum(m[1]); after = bindAlbum; }
    else if ((m = h.match(/^\/gallery\/(\w+)$/))) { html = pageGallery(m[1]); after = bindGallery; }
    else if (h === "/about") { html = pageAbout(); after = bindAbout; }
    else { html = pageHome(); }
    view.innerHTML = html;
    if (m && m[1] && h.indexOf("/album/") === 0) { after(view, D.weddings.find(function (w) { return w.id === m[1]; }) || D.weddings[0]); }
    else if (after) { after(view, m ? m[1] : undefined); }
    bindReveals(view); lazyImgs(view);
    if (h !== "/album/" + (m && m[1])) { /* 非相册页重置相册内态 */ }
  }

  window.addEventListener("hashchange", function () {
    /* 相册间跳转（下一册）保持风格状态，其余重置 */
    if (location.hash.indexOf("#/album/") !== 0) { albumState.style = "cn"; albumState.scene = 0; }
    render();
  });
  render();
})();
