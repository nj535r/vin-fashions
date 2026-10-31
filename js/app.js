/* VIN Fashions – shared storefront code: helpers, cart, API (live or demo), header/footer. */
(function () {
  "use strict";
  const CFG = window.VIN_CONFIG;
  const DEMO = !CFG.API;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const LS = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert("Browser storage is full – use smaller images."); } }
  };

  /* ---------- generated garment art (used when a product has no photo) ---------- */
  function shade(hex, p) {
    const n = parseInt(hex.replace("#", ""), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (p < 0 ? v : 255 - v) * p)));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function art(category, hex) {
    hex = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex : "#c9a0a0";
    const d = shade(hex, -0.22), l = shade(hex, 0.35);
    let g;
    if (/night|lounge|kids/i.test(category)) {
      g = `<path d="M112 38 L124 112 Q150 136 176 112 L188 38" fill="none" stroke="${d}" stroke-width="5" stroke-linecap="round"/>
      <path d="M124 112 L118 190 L66 338 Q150 366 234 338 L182 190 L176 112 Q150 136 124 112Z" fill="${hex}"/>
      <path d="M122 200 Q150 214 178 200" fill="none" stroke="${d}" stroke-width="3"/>
      <path d="M72 322 Q91 336 110 322 Q130 336 150 322 Q170 336 190 322 Q209 336 228 322" fill="none" stroke="${l}" stroke-width="4"/>`;
    } else if (/kurti/i.test(category)) {
      g = `<path d="M104 46 Q150 84 196 46 L252 108 L226 140 L206 120 L214 334 L86 334 L94 120 L74 140 L48 108Z" fill="${hex}"/>
      <path d="M104 46 Q150 84 196 46" fill="none" stroke="${d}" stroke-width="4"/>
      <path d="M150 84 L150 170" stroke="${d}" stroke-width="3"/><circle cx="150" cy="120" r="4" fill="${l}"/><circle cx="150" cy="146" r="4" fill="${l}"/>
      <path d="M86 322 H214" stroke="${l}" stroke-width="5"/>`;
    } else if (/saree/i.test(category)) {
      g = `<path d="M96 40 H204 L218 340 H82Z" fill="${hex}"/>
      <path d="M96 40 L204 130 V176 L96 86Z" fill="${d}"/>
      <path d="M82 318 H218 V340 H82Z" fill="${l}"/><path d="M84 326 H216" stroke="${d}" stroke-width="3" stroke-dasharray="6 5"/>`;
    } else {
      g = `<path d="M100 52 L150 76 L200 52 L256 104 L232 138 L210 122 L210 304 L90 304 L90 122 L68 138 L44 104Z" fill="${hex}"/>
      <path d="M100 52 L150 110 L200 52 L150 76Z" fill="${l}"/><path d="M150 110 V304" stroke="${d}" stroke-width="3"/>
      <circle cx="150" cy="150" r="4" fill="${d}"/><circle cx="150" cy="190" r="4" fill="${d}"/><circle cx="150" cy="230" r="4" fill="${d}"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 380"><rect width="300" height="380" fill="#f5efec"/>${g}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  const imgOf = (p, hex) => p.image || art(p.category, hex || (p.colors && p.colors[0] && p.colors[0].h));

  /* ---------- cart ---------- */
  const Cart = {
    items() { return LS.get("vin_cart", []); },
    save(a) { LS.set("vin_cart", a); updateBadge(); },
    add(id, size, color, qty) {
      const a = this.items(), k = a.find((i) => i.id === id && i.size === size && i.color === color);
      if (k) k.qty = Math.min(10, k.qty + qty); else a.push({ id, size, color, qty });
      this.save(a);
    },
    count() { return this.items().reduce((n, i) => n + i.qty, 0); },
    clear() { this.save([]); }
  };
  function updateBadge() { const b = $("#cartCount"); if (b) { const n = Cart.count(); b.textContent = n; b.hidden = !n; } }

  /* ---------- pricing (the live server recomputes this; never trusts the browser) ---------- */
  function priceCart(items, products) {
    const lines = [];
    items.forEach((i) => {
      const p = products.find((x) => x.id === i.id && x.active !== false);
      if (p) lines.push({ ...i, p, amount: p.price * i.qty });
    });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const shipping = !subtotal || subtotal >= CFG.FREE_SHIPPING_ABOVE ? 0 : CFG.SHIPPING_FEE;
    return { lines, subtotal, shipping, total: subtotal + shipping };
  }

  /* ---------- data: catalogue = products.json in the repo; payments = Google Apps Script web app ---------- */
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  async function script(path, body) {
    // text/plain keeps this a "simple" request (no CORS preflight); Apps Script redirects, fetch follows it
    const r = await fetch(CFG.API + (path || ""), body ? { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({ error: "Unexpected reply from the payment service" }));
    if (j.error) throw new Error(j.error);
    return j;
  }
  const Account = {
    get() { return LS.get("vin_user", null); },
    set(v) { try { v ? LS.set("vin_user", v) : localStorage.removeItem("vin_user"); } catch (e) {} },
    call(action, data) { if (DEMO) throw new Error("Accounts need the live backend"); return script("", Object.assign({ action }, data)); }
  };
  const API = {
    DEMO,
    async products() {
      const r = await fetch("products.json?t=" + Math.floor(Date.now() / 60000));
      if (!r.ok) throw new Error("Catalogue unavailable");
      return (await r.json()).filter((p) => p.active !== false);
    },
    /* Returns {demo:true,id} or {id, action, fields} – fields must be POSTed to PayU. */
    async checkout(items, customer) {
      if (DEMO) {
        const pr = priceCart(items, await API.products());
        if (!pr.lines.length) throw new Error("Your bag is empty");
        const id = "VIN" + Date.now().toString(36).toUpperCase();
        LS.set("vin_demo_order", { id, status: "paid", total: pr.total });
        return { demo: true, id };
      }
      return script("", { token: (Account.get() || {}).token, items: items.map((i) => ({ id: i.id, size: i.size, color: i.color, qty: i.qty })), customer });
    },
    async orderStatus(id) {
      if (DEMO) { const o = LS.get("vin_demo_order", null); return o && o.id === id ? o : null; }
      try { return await script("?id=" + encodeURIComponent(id)); } catch (e) { return null; }
    }
  };

  /* ---------- UI pieces ---------- */
  function card(p) {
    const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
    const out = !(p.stock > 0);
    return `<a class="card" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="im"><img src="${esc(imgOf(p))}" alt="${esc(p.name)}" loading="lazy" width="300" height="380">${out ? '<span class="tag out">Sold out</span>' : off ? `<span class="tag">${off}% off</span>` : ""}</div>
      <h3>${esc(p.name)}</h3>
      <div class="price"><b>${money(p.price)}</b>${off ? `<s>${money(p.mrp)}</s>` : ""}</div></a>`;
  }

  const ICON = {
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>'
  };

  function chrome(active) {
    const link = (href, t, key) => `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${t}</a>`;
    const hd = $("#hdr");
    if (hd) hd.outerHTML = `<a class="sr skip" href="#main">Skip to content</a>
    <div class="topbar">Free shipping above ${money(CFG.FREE_SHIPPING_ABOVE)} · Secure payment by PayU${DEMO ? " · <b>DEMO MODE</b>" : ""}</div>
    <header class="site"><div class="wrap bar">
      <button class="ibtn" id="burger" aria-label="Menu" aria-expanded="false" aria-controls="mainnav">${ICON.menu}</button>
      <a class="logo" href="index.html" aria-label="VIN Fashions home"><img src="assets/logo.svg" alt="VIN Fashions" width="170" height="41"></a>
      <nav class="main" id="mainnav" aria-label="Main">
        ${link("index.html", "Home", "home")}${link("shop.html", "Shop all", "shop")}${link("shop.html?cat=Nighties", "Nighties", "nighties")}${link("shop.html?cat=Kurtis", "Kurtis", "kurtis")}${link("shop.html?cat=Sarees", "Sarees", "sarees")}${link("policies.html#contact", "Contact", "contact")}
      </nav>
      <form class="search" role="search" action="shop.html"><label class="sr" for="q">Search</label><input id="q" name="q" type="search" placeholder="Search clothing" autocomplete="off"><button aria-label="Search">${ICON.search}</button></form>
      <div class="icons"><a class="ibtn" href="account.html" aria-label="My account">${ICON.user}</a><a class="ibtn" href="cart.html" aria-label="Shopping bag">${ICON.bag}<span class="badge" id="cartCount" hidden>0</span></a></div>
    </div></header>`;
    const ft = $("#ftr");
    if (ft) ft.outerHTML = `<footer class="site"><div class="wrap">
      <div class="cols">
        <div><a class="logo" href="index.html"><img src="assets/logo.svg" alt="VIN Fashions"></a><p>Nighties, kurtis, sarees and everyday wear for the whole family.</p></div>
        <div><h3>Shop</h3><a href="shop.html?cat=Nighties">Nighties</a><a href="shop.html?cat=Kurtis">Kurtis</a><a href="shop.html?cat=Sarees">Sarees</a><a href="shop.html?cat=Kids">Kids</a></div>
        <div><h3>Help</h3><a href="policies.html#shipping">Shipping</a><a href="policies.html#returns">Returns &amp; refunds</a><a href="policies.html#terms">Terms</a><a href="policies.html#privacy">Privacy</a></div>
        <div id="contactcol"><h3>Contact</h3><p style="margin:0"></p></div>
      </div>
      <div class="copy">© ${new Date().getFullYear()} VIN Fashions · vinfashions.online · Payments processed securely by PayU</div></div></footer>`;
    const cc = $("#contactcol p");
    if (cc) { cc.append(CFG.CONTACT.address, document.createElement("br"), CFG.CONTACT.email, document.createElement("br"), CFG.CONTACT.phone, document.createElement("br"), CFG.CONTACT.hours); }
    const b = $("#burger"), nav = $("#mainnav");
    if (b) b.addEventListener("click", () => { const o = nav.classList.toggle("open"); b.setAttribute("aria-expanded", o); });
    updateBadge();
  }

  window.VIN = { Account, CFG, DEMO, $, $$, esc, money, LS, art, imgOf, Cart, priceCart, API, card, chrome, uid };
})();
