/* Product photo gallery: thumbnails, hover-zoom on desktop, full-screen lightbox with zoom / pan / pinch / keyboard. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const MAX = 5;

  /* ---------- lightbox (one shared dialog) ---------- */
  let lb, st;
  function buildLightbox() {
    lb = document.createElement("dialog");
    lb.className = "lb";
    lb.setAttribute("aria-label", "Photo viewer");
    lb.innerHTML = `<div class="lb-bar">
        <span class="lb-count" aria-live="polite"></span>
        <span class="lb-tools">
          <button type="button" data-a="out" aria-label="Zoom out">−</button>
          <button type="button" data-a="in" aria-label="Zoom in">+</button>
          <button type="button" data-a="reset" aria-label="Reset zoom">1:1</button>
          <button type="button" data-a="close" aria-label="Close">✕</button>
        </span></div>
      <div class="lb-stage"><img alt="" draggable="false"></div>
      <button type="button" class="lb-nav prev" data-a="prev" aria-label="Previous photo">‹</button>
      <button type="button" class="lb-nav next" data-a="next" aria-label="Next photo">›</button>
      <p class="lb-hint">Scroll, double-click or pinch to zoom · drag to move · arrow keys to browse</p>`;
    document.body.appendChild(lb);
    st = { imgs: [], alt: "", i: 0, s: 1, x: 0, y: 0, pts: new Map(), pinch: 0, drag: null };
    const stage = $(".lb-stage", lb), img = $("img", lb);

    const apply = () => {
      const w = img.clientWidth * st.s, h = img.clientHeight * st.s;
      const mx = Math.max(0, (w - stage.clientWidth) / 2), my = Math.max(0, (h - stage.clientHeight) / 2);
      st.x = clamp(st.x, -mx, mx); st.y = clamp(st.y, -my, my);
      img.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`;
      stage.classList.toggle("zoomed", st.s > 1);
    };
    const zoomAt = (ns, cx, cy) => {               // keep the point under the cursor fixed
      ns = clamp(ns, 1, MAX);
      const r = stage.getBoundingClientRect(), px = cx - (r.left + r.width / 2), py = cy - (r.top + r.height / 2);
      const k = ns / st.s;
      st.x = px - (px - st.x) * k; st.y = py - (py - st.y) * k; st.s = ns;
      if (ns === 1) { st.x = 0; st.y = 0; }
      apply();
    };
    const center = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const show = (i) => {
      st.i = (i + st.imgs.length) % st.imgs.length; st.s = 1; st.x = 0; st.y = 0;
      img.src = st.imgs[st.i]; img.alt = st.alt + " – photo " + (st.i + 1);
      $(".lb-count", lb).textContent = st.imgs.length > 1 ? (st.i + 1) + " / " + st.imgs.length : "";
      lb.classList.toggle("single", st.imgs.length < 2);
      img.style.transform = "";
      [1, -1].forEach((d) => { const n = new Image(); n.src = st.imgs[(st.i + d + st.imgs.length) % st.imgs.length]; }); // preload neighbours
    };
    lb._open = (imgs, alt, i) => { st.imgs = imgs; st.alt = alt; show(i); if (!lb.open) lb.showModal(); $('[data-a="close"]', lb).focus(); };

    lb.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]");
      if (a) {
        const k = a.dataset.a;
        if (k === "close") lb.close();
        else if (k === "next") show(st.i + 1);
        else if (k === "prev") show(st.i - 1);
        else if (k === "in") zoomAt(st.s * 1.5, ...center());
        else if (k === "out") zoomAt(st.s / 1.5, ...center());
        else if (k === "reset") zoomAt(1, ...center());
      } else if (e.target === lb) lb.close();               // click on the backdrop
    });
    lb.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") show(st.i + 1);
      else if (e.key === "ArrowLeft") show(st.i - 1);
      else if (e.key === "+" || e.key === "=") zoomAt(st.s * 1.5, ...center());
      else if (e.key === "-") zoomAt(st.s / 1.5, ...center());
      else if (e.key === "0") zoomAt(1, ...center());
    });
    stage.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(st.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); }, { passive: false });
    stage.addEventListener("dblclick", (e) => zoomAt(st.s > 1 ? 1 : 2.5, e.clientX, e.clientY));
    stage.addEventListener("pointerdown", (e) => {
      stage.setPointerCapture(e.pointerId); st.pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (st.pts.size === 2) { const [a, b] = [...st.pts.values()]; st.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
      else st.drag = { x: e.clientX, y: e.clientY, tx: st.x, ty: st.y, moved: false };
    });
    stage.addEventListener("pointermove", (e) => {
      if (!st.pts.has(e.pointerId)) return;
      st.pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (st.pts.size === 2) {
        const [a, b] = [...st.pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (st.pinch) zoomAt(st.s * d / st.pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        st.pinch = d;
      } else if (st.drag && st.s > 1) {
        st.x = st.drag.tx + e.clientX - st.drag.x; st.y = st.drag.ty + e.clientY - st.drag.y; apply();
      }
    });
    const up = (e) => { st.pts.delete(e.pointerId); st.pinch = 0; st.drag = null; };
    stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
    window.addEventListener("resize", () => { if (lb.open) apply(); });
  }

  /* ---------- the gallery on the product page ---------- */
  window.VIN = window.VIN || {};
  VIN.gallery = function (root, imgs, alt, real) {
    const esc = VIN.esc;
    root.classList.add("gal");
    root.innerHTML = `<div class="gmain" role="button" tabindex="0" aria-label="${esc(alt)} – open photo viewer to zoom">
        <img src="${esc(imgs[0])}" alt="${esc(alt)}" width="600" height="750"><span class="gzoom" aria-hidden="true">🔍 Zoom</span>
        ${imgs.length > 1 ? `<span class="gcount" aria-hidden="true">1 / ${imgs.length}</span>` : ""}</div>
      ${imgs.length > 1 ? `<div class="gthumbs" role="list">${imgs.map((u, i) => `<button type="button" role="listitem" class="gthumb" data-i="${i}" aria-label="Show photo ${i + 1} of ${imgs.length}" aria-pressed="${i === 0}"><img src="${esc(u)}" alt="" loading="lazy" width="72" height="90"></button>`).join("")}</div>` : ""}`;
    const main = $(".gmain", root), im = $("img", main), cnt = $(".gcount", root);
    let cur = 0;
    const set = (i) => {
      cur = i; im.src = imgs[i]; im.style.transform = "";
      root.querySelectorAll(".gthumb").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.i === i));
      if (cnt) cnt.textContent = (i + 1) + " / " + imgs.length;
    };
    root.addEventListener("click", (e) => { const t = e.target.closest(".gthumb"); if (t) set(+t.dataset.i); });
    const open = () => { if (!lb) buildLightbox(); lb._open(imgs, alt, cur); };
    main.addEventListener("click", open);
    main.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    if (real && window.matchMedia("(hover:hover) and (pointer:fine)").matches) {   // magnifier-style hover zoom
      main.addEventListener("mousemove", (e) => {
        const r = main.getBoundingClientRect();
        im.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + "% " + ((e.clientY - r.top) / r.height * 100) + "%";
        im.style.transform = "scale(2)";
      });
      main.addEventListener("mouseleave", () => { im.style.transform = ""; });
    }
    return { setArt(src) { if (!real) { imgs[0] = src; if (cur === 0) im.src = src; } } };
  };
})();
