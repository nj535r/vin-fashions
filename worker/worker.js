/**
 * VIN Fashions backend – one Cloudflare Worker + one KV namespace (binding: VIN).
 * Does the three things a static GitHub Pages site cannot:
 *   1. stores the catalogue / orders and serves the admin API (password login)
 *   2. builds the PayU request hash (needs the secret SALT)
 *   3. receives PayU's POST callback (surl/furl), verifies the reverse hash, marks the order paid
 *
 * Secrets (wrangler secret put …): ADMIN_PASSWORD, TOKEN_SECRET, PAYU_KEY, PAYU_SALT
 * Vars (wrangler.toml):            SITE_URL, PAYU_ENV ("test" | "live"), FREE_SHIPPING_ABOVE, SHIPPING_FEE
 */
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha512 = async (s) => hex(await crypto.subtle.digest("SHA-512", enc.encode(s)));
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
function safeEq(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

const ALLOWED_ORIGINS = (env) => [env.SITE_URL, "https://www.vinfashions.online", "http://localhost:8080", "http://127.0.0.1:8080"].filter(Boolean);
function cors(req, env) {
  const o = req.headers.get("Origin");
  const h = { "Vary": "Origin", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Max-Age": "86400" };
  if (o && ALLOWED_ORIGINS(env).includes(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}
const json = (data, status, req, env, extra) => new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req, env), ...(extra || {}) } });
const fail = (msg, status, req, env) => json({ error: msg }, status || 400, req, env);

/* ---------- admin auth: password -> signed 12h token ---------- */
async function makeToken(env) {
  const exp = Date.now() + 12 * 3600e3, sig = await hmac(env.TOKEN_SECRET, "admin." + exp);
  return exp + "." + sig;
}
async function isAdmin(req, env) {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const [exp, sig] = t.split(".");
  if (!exp || !sig || +exp < Date.now()) return false;
  return safeEq(sig, await hmac(env.TOKEN_SECRET, "admin." + exp));
}

/* ---------- catalogue ---------- */
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const int = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
function cleanProduct(b, id) {
  const colors = (Array.isArray(b.colors) ? b.colors : []).slice(0, 20).map((c) => ({ n: str(c.n, 30), h: /^#[0-9a-f]{6}$/i.test(c.h) ? c.h : "#999999" })).filter((c) => c.n);
  const sizes = (Array.isArray(b.sizes) ? b.sizes : []).slice(0, 20).map((s) => str(s, 12)).filter(Boolean);
  const price = int(b.price, 1, 1e6);
  return { id, name: str(b.name, 120), category: str(b.category, 40) || "Other", price, mrp: Math.max(price, int(b.mrp, 0, 1e6)), sizes, colors, stock: int(b.stock, 0, 1e5), desc: str(b.desc, 1000), featured: !!b.featured, active: b.active !== false, image: str(b.image, 300), createdAt: Number(b.createdAt) || Date.now() };
}
const getProducts = async (env) => JSON.parse((await env.VIN.get("products")) || "[]");
const putProducts = (env, a) => env.VIN.put("products", JSON.stringify(a));
async function storeImage(env, id, dataUrl, base) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m || m[2].length > 1.2e6) throw new Error("Image must be a JPEG/PNG/WebP under ~900 KB");
  const v = Date.now().toString(36);
  await env.VIN.put("img:" + id, dataUrl);
  return `${base}/api/img/${encodeURIComponent(id)}?v=${v}`;
}

/* ---------- PayU ---------- */
const payuUrl = (env) => (env.PAYU_ENV === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment");
// request: key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||SALT
const requestHash = (env, f) => sha512([env.PAYU_KEY, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1, f.udf2, f.udf3, f.udf4, f.udf5, "", "", "", "", "", env.PAYU_SALT].join("|"));
// response: [additionalCharges|]SALT|status||||||udf5..udf1|email|firstname|productinfo|amount|txnid|key
function responseHash(env, p) {
  const parts = [env.PAYU_SALT, p.status, "", "", "", "", "", p.udf5 || "", p.udf4 || "", p.udf3 || "", p.udf2 || "", p.udf1 || "", p.email, p.firstname, p.productinfo, p.amount, p.txnid, env.PAYU_KEY];
  if (p.additionalCharges) parts.unshift(p.additionalCharges);
  return sha512(parts.join("|"));
}

function validCustomer(c) {
  if (!c) return "Missing details";
  const ok = str(c.name, 80).length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(c.email, 100)) && /^[6-9]\d{9}$/.test(str(c.phone, 10))
    && str(c.address, 250).length >= 8 && str(c.city, 60) && str(c.state, 60) && /^\d{6}$/.test(str(c.pincode, 6));
  return ok ? "" : "Please check your delivery details";
}

async function createOrder(req, env, body) {
  const err = validCustomer(body.customer);
  if (err) return fail(err, 400, req, env);
  const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  const products = await getProducts(env);
  const lines = [];
  for (const i of items) {
    const p = products.find((x) => x.id === i.id && x.active !== false);
    const qty = int(i.qty, 1, 10);
    if (!p) return fail("An item in your bag is no longer available", 409, req, env);
    if (p.stock < qty) return fail(`Only ${p.stock} of “${p.name}” left`, 409, req, env);
    lines.push({ id: p.id, name: p.name, size: str(i.size, 12), color: str(i.color, 30), qty, price: p.price });
  }
  if (!lines.length) return fail("Your bag is empty", 400, req, env);
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const free = Number(env.FREE_SHIPPING_ABOVE || 999), fee = Number(env.SHIPPING_FEE || 60);
  const shipping = subtotal >= free ? 0 : fee, total = subtotal + shipping;
  const c = body.customer;
  const id = "VIN" + Date.now().toString(36).toUpperCase() + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 5);
  const order = {
    id, customer: { name: str(c.name, 80), email: str(c.email, 100), phone: str(c.phone, 10), address: str(c.address, 250), city: str(c.city, 60), state: str(c.state, 60), pincode: str(c.pincode, 6) },
    items: lines, subtotal, shipping, total, status: "pending", fulfilment: "new", createdAt: Date.now()
  };
  await env.VIN.put("order:" + id, JSON.stringify(order));
  const origin = new URL(req.url).origin;
  const fields = {
    key: env.PAYU_KEY, txnid: id, amount: total.toFixed(2), productinfo: "VIN Fashions order", firstname: order.customer.name.split(/\s+/)[0].replace(/[^\w .-]/g, "").slice(0, 40) || "Customer",
    email: order.customer.email, phone: order.customer.phone, surl: origin + "/api/payu/callback", furl: origin + "/api/payu/callback",
    udf1: "", udf2: "", udf3: "", udf4: "", udf5: ""
  };
  fields.hash = await requestHash(env, fields);
  return json({ id, action: payuUrl(env), fields }, 200, req, env);
}

async function payuCallback(req, env, ctx) {
  const form = await req.formData();
  const p = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const site = env.SITE_URL || "https://vinfashions.online";
  const back = (id, tag) => new Response(null, { status: 303, headers: { Location: `${site}/order.html?id=${encodeURIComponent(id)}${tag ? "&s=" + tag : ""}` } });
  const raw = await env.VIN.get("order:" + p.txnid);
  if (!raw) return back("unknown");
  const order = JSON.parse(raw);
  if (order.status === "paid") return back(order.id);
  const okHash = p.hash && safeEq((await responseHash(env, p)).toLowerCase(), p.hash.toLowerCase());
  const okAmt = Number(p.amount).toFixed(2) === order.total.toFixed(2) && p.key === env.PAYU_KEY;
  if (okHash && okAmt && p.status === "success") {
    order.status = "paid"; order.payuId = p.mihpayid || ""; order.paidAt = Date.now();
    await env.VIN.put("order:" + order.id, JSON.stringify(order));
    const products = await getProducts(env);                       // decrement stock
    order.items.forEach((l) => { const x = products.find((q) => q.id === l.id); if (x) x.stock = Math.max(0, x.stock - l.qty); });
    await putProducts(env, products);
    ctx && ctx.waitUntil(notify(env, order));
  } else if (okHash && p.status !== "success") {
    order.status = p.status === "pending" ? "pending" : "failed";
    await env.VIN.put("order:" + order.id, JSON.stringify(order));
  } // bad hash / amount: leave untouched, treat as unpaid
  return back(order.id);
}

/* ---------- order e-mails via a Google Apps Script web app (see apps-script.gs) ---------- */
async function notify(env, order) {
  if (!env.NOTIFY_URL) return;
  try {
    await fetch(env.NOTIFY_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ token: env.NOTIFY_TOKEN, order }), redirect: "follow" });
  } catch (e) { /* order is already saved; e-mail failure must not break the callback */ }
}

/* ---------- router ---------- */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname, m = req.method;
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: cors(req, env) });
    try {
      if (path === "/api/products" && m === "GET") {
        const all = (await getProducts(env)).filter((p) => p.active !== false);
        return json({ products: all }, 200, req, env, { "Cache-Control": "public, max-age=30" });
      }
      let mm;
      if ((mm = /^\/api\/img\/([^/]+)$/.exec(path)) && m === "GET") {
        const d = await env.VIN.get("img:" + decodeURIComponent(mm[1]));
        if (!d) return new Response("Not found", { status: 404 });
        const [, type, b64] = /^data:([^;]+);base64,(.+)$/.exec(d);
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return new Response(bin, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" } });
      }
      if (path === "/api/orders" && m === "POST") {
        if (!env.PAYU_KEY || !env.PAYU_SALT) return fail("Payments are not configured yet", 503, req, env);
        return createOrder(req, env, await req.json());
      }
      if ((mm = /^\/api\/orders\/([^/]+)$/.exec(path)) && m === "GET") {
        const raw = await env.VIN.get("order:" + decodeURIComponent(mm[1]));
        if (!raw) return fail("Not found", 404, req, env);
        const o = JSON.parse(raw);
        return json({ id: o.id, status: o.status, total: o.total }, 200, req, env);
      }
      if (path === "/api/payu/callback" && m === "POST") return payuCallback(req, env, ctx);

      /* ---- admin ---- */
      if (path === "/api/admin/login" && m === "POST") {
        const { password } = await req.json();
        await new Promise((r) => setTimeout(r, 400)); // slow brute force
        if (!env.ADMIN_PASSWORD || !safeEq(password || "", env.ADMIN_PASSWORD)) return fail("Wrong password", 401, req, env);
        return json({ token: await makeToken(env) }, 200, req, env);
      }
      if (path.startsWith("/api/admin/")) {
        if (!(await isAdmin(req, env))) return fail("Please log in again", 401, req, env);
        const origin = url.origin;
        if (path === "/api/admin/products" && m === "GET") return json({ products: await getProducts(env) }, 200, req, env);
        if (path === "/api/admin/products" && m === "POST") {
          const b = await req.json(), id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          const p = cleanProduct(b, id);
          if (p.name.length < 2) return fail("Name is required", 400, req, env);
          if (b.imageData) p.image = await storeImage(env, id, b.imageData, origin);
          const a = await getProducts(env); a.unshift(p); await putProducts(env, a);
          return json({ product: p }, 201, req, env);
        }
        if ((mm = /^\/api\/admin\/products\/([^/]+)$/.exec(path))) {
          const id = decodeURIComponent(mm[1]), a = await getProducts(env), i = a.findIndex((x) => x.id === id);
          if (i < 0) return fail("Not found", 404, req, env);
          if (m === "PUT") {
            const b = await req.json(), p = cleanProduct({ ...b, image: b.image }, id);
            if (b.imageData) p.image = await storeImage(env, id, b.imageData, origin);
            else if (!b.image) await env.VIN.delete("img:" + id);
            a[i] = p; await putProducts(env, a); return json({ product: p }, 200, req, env);
          }
          if (m === "DELETE") { a.splice(i, 1); await putProducts(env, a); await env.VIN.delete("img:" + id); return json({ ok: true }, 200, req, env); }
        }
        if (path === "/api/admin/orders" && m === "GET") {
          const list = await env.VIN.list({ prefix: "order:", limit: 500 });
          const orders = (await Promise.all(list.keys.map((k) => env.VIN.get(k.name)))).filter(Boolean).map(JSON.parse);
          return json({ orders }, 200, req, env);
        }
        if ((mm = /^\/api\/admin\/orders\/([^/]+)$/.exec(path)) && m === "PATCH") {
          const k = "order:" + decodeURIComponent(mm[1]), raw = await env.VIN.get(k);
          if (!raw) return fail("Not found", 404, req, env);
          const o = JSON.parse(raw), { fulfilment } = await req.json();
          if (!["new", "packed", "shipped", "delivered", "cancelled"].includes(fulfilment)) return fail("Bad status", 400, req, env);
          o.fulfilment = fulfilment; await env.VIN.put(k, JSON.stringify(o));
          return json({ ok: true }, 200, req, env);
        }
      }
      return fail("Not found", 404, req, env);
    } catch (e) {
      return fail(e.message && e.message.length < 120 ? e.message : "Server error", 500, req, env);
    }
  }
};
export { requestHash, responseHash };
