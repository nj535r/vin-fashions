/**
 * VIN Fashions backend – runs as a Google Apps Script web app inside help.vinfashions@gmail.com.
 * No server, no database, no password sharing. It does what GitHub Pages cannot:
 *   1. builds the PayU request hash (needs the secret SALT)       -> POST {items, customer}
 *   2. receives PayU's POST callback, verifies hash + amount      -> POST (form-encoded, from PayU)
 *   3. e-mails the order to the owner and a receipt to the buyer
 *   4. answers "is order X paid?" for the thank-you page          -> GET ?id=X
 *   5. customer accounts + order history, stored in a Google Sheet (created automatically in this Google account)
 *   6. admin login (e-mail + password checked here) -> returns the GitHub token the admin panel needs
 * Secrets live in Project Settings -> Script properties, never in GitHub:
 *   PAYU_KEY, PAYU_SALT, GH_TOKEN_SITE (token for the site repo only, used by the admin panel), SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
 */
const CFG = {
  SITE: "https://vinfashions.online",
  FORWARD_TO: "nagaarjun1157@gmail.com",
  SUPPORT: "help.vinfashions@gmail.com",
  FREE_ABOVE: 2000, // delivery is free only when the order is ABOVE this amount
  FEE: 100,         // standard delivery charge for orders up to and including FREE_ABOVE
  PAYU_ENV: "test" // change to "live" only after PayU activates your account
};

const ORDER_ID = /^VIN[A-Z0-9]{8,40}$/;
const props = () => PropertiesService.getScriptProperties();
const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const sha512 = (s) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_512, s, Utilities.Charset.UTF_8)
  .map((b) => ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join("");
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));

function doGet(e) {
  const id = e && e.parameter && e.parameter.id;
  if (!id) return out({ ok: true, service: "VIN Fashions" });
  if (!ORDER_ID.test(String(id))) return out({ error: "not found" });
  const raw = props().getProperty("o_" + id);
  if (!raw) return out({ error: "not found" });
  const o = JSON.parse(raw);
  return out({ id: o.id, status: o.status, total: o.total });
}

function doPost(e) {
  try {
    const type = (e.postData && e.postData.type) || "";
    if (type.indexOf("x-www-form-urlencoded") >= 0) return callback(e.parameter); // PayU
    if (e.postData.contents.length > 20000) throw new Error("Request too large");
    const body = JSON.parse(e.postData.contents);
    if (body.action) return out(account(body));
    return out(createOrder(body));
  } catch (err) {
    return out({ error: String(err.message || err).slice(0, 120) });
  }
}

function catalogue() {
  // try the real domain first, then the GitHub address (works before DNS/HTTPS for the domain is ready)
  const urls = [CFG.SITE, "https://nj535r.github.io/vin-fashions"];
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = UrlFetchApp.fetch(urls[i] + "/products.json?t=" + Date.now(), { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() === 200) return JSON.parse(r.getContentText());
    } catch (e) { /* try the next address */ }
  }
  throw new Error("Catalogue unavailable");
}

function validCustomer(c) {
  return c && str(c.name, 80).length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(c.email, 100)) && /^[6-9]\d{9}$/.test(str(c.phone, 10)) &&
    str(c.address, 250).length >= 8 && str(c.city, 60) && str(c.state, 60) && /^\d{6}$/.test(str(c.pincode, 6));
}

function createOrder(body) {
  rate("order", 60, 600000);
  const sp = props();
  if (!sp.getProperty("PAYU_KEY") || !sp.getProperty("PAYU_SALT")) return { error: "Payments are not configured yet" };
  if (!validCustomer(body.customer)) return { error: "Please check your delivery details" };
  const products = catalogue(), lines = [];
  (Array.isArray(body.items) ? body.items.slice(0, 30) : []).forEach((i) => {
    const p = products.filter((x) => x.id === i.id && x.active !== false)[0];
    if (!p) throw new Error("An item in your bag is no longer available");
    const qty = num(i.qty, 1, 10);
    if (!(p.stock >= qty)) throw new Error("“" + p.name + "” is out of stock");
    lines.push({ id: p.id, name: p.name, size: str(i.size, 12), color: str(i.color, 30), qty: qty, price: p.price });
  });
  if (!lines.length) throw new Error("Your bag is empty");
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const shipping = subtotal > CFG.FREE_ABOVE ? 0 : CFG.FEE, total = subtotal + shipping;
  const c = body.customer, id = "VIN" + Date.now().toString(36).toUpperCase() + Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase();
  const order = {
    id: id, userId: userFromToken(body.token), items: lines, subtotal: subtotal, shipping: shipping, total: total, status: "pending", createdAt: Date.now(),
    customer: { name: str(c.name, 80), email: str(c.email, 100), phone: str(c.phone, 10), address: str(c.address, 250), city: str(c.city, 60), state: str(c.state, 60), pincode: str(c.pincode, 6) }
  };
  prune();
  sp.setProperty("o_" + id, JSON.stringify(order));
  const url = ScriptApp.getService().getUrl();
  const f = { key: sp.getProperty("PAYU_KEY"), txnid: id, amount: total.toFixed(2), productinfo: "VIN Fashions order",
    firstname: order.customer.name.split(/\s+/)[0].replace(/[^\w .-]/g, "").slice(0, 40) || "Customer", email: order.customer.email, phone: order.customer.phone,
    surl: url, furl: url, udf1: "", udf2: "", udf3: "", udf4: "", udf5: "" };
  // key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||SALT
  f.hash = sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, "", "", "", "", "", "", "", "", "", "", sp.getProperty("PAYU_SALT")].join("|"));
  return { id: id, action: CFG.PAYU_ENV === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment", fields: f };
}

function callback(p) {
  if (!ORDER_ID.test(String(p.txnid))) return HtmlService.createHtmlOutput("Invalid request").setTitle("VIN Fashions");
  const sp = props(), key = "o_" + p.txnid, raw = sp.getProperty(key);
  const page = (id, msg, ok) => HtmlService.createHtmlOutput(
    '<body style="font:16px system-ui;text-align:center;padding:48px 16px"><h2>' + msg + '</h2><p>Order ' + String(id).replace(/[^\w]/g, "") +
    '</p><p><a target="_top" style="background:#9f1239;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none" href="' + CFG.SITE + "/order.html?id=" +
    encodeURIComponent(id) + '">' + (ok ? "View my order" : "Back to VIN Fashions") + "</a></p>" +
    '<script>try{window.top.location.href="' + CFG.SITE + "/order.html?id=" + encodeURIComponent(id) + '"}catch(e){}</script></body>').setTitle("VIN Fashions");
  if (!raw) return page("unknown", "Order not found", false);
  const o = JSON.parse(raw);
  if (o.status === "paid") return page(o.id, "Payment received", true);
  // response: [additionalCharges|]SALT|status||||||udf5..udf1|email|firstname|productinfo|amount|txnid|key
  const parts = [sp.getProperty("PAYU_SALT"), p.status, "", "", "", "", "", p.udf5 || "", p.udf4 || "", p.udf3 || "", p.udf2 || "", p.udf1 || "", p.email, p.firstname, p.productinfo, p.amount, p.txnid, sp.getProperty("PAYU_KEY")];
  if (p.additionalCharges) parts.unshift(p.additionalCharges);
  const okHash = p.hash && sha512(parts.join("|")).toLowerCase() === String(p.hash).toLowerCase();
  const okAmt = Number(p.amount).toFixed(2) === o.total.toFixed(2) && p.key === sp.getProperty("PAYU_KEY");
  if (okHash && okAmt && p.status === "success") {
    o.status = "paid"; o.payuId = p.mihpayid || ""; o.paidAt = Date.now();
    sp.setProperty(key, JSON.stringify(o));
    try { notify(o); } catch (e) { /* payment is recorded; mail failure must not break the page */ }
    try { dbUpdate("orders.json", (a) => { a.unshift(o); return a; }, "Order " + o.id); } catch (e) { /* e-mail is the fallback record */ }
    return page(o.id, "Payment received", true);
  }
  if (okHash && okAmt) { o.status = p.status === "pending" ? "pending" : "failed"; sp.setProperty(key, JSON.stringify(o)); }
  return page(o.id, "Payment not completed", false);
}

function notify(o) {
  const c = o.customer;
  const lines = o.items.map((i) => "- " + i.name + " (" + [i.color, i.size].filter(Boolean).join(" / ") + ") x " + i.qty + "  Rs " + i.price * i.qty).join("\n");
  const body = "New paid order " + o.id + "\n\n" + lines + "\n\nSubtotal Rs " + o.subtotal + "\nShipping Rs " + o.shipping + "\nTotal Rs " + o.total + "\n\n" +
    "Customer: " + c.name + "\nPhone: " + c.phone + "\nEmail: " + c.email + "\nAddress: " + c.address + ", " + c.city + ", " + c.state + " " + c.pincode + "\nPayU id: " + o.payuId;
  GmailApp.sendEmail(CFG.FORWARD_TO, "New order " + o.id + " - Rs " + o.total, body, { name: "VIN Fashions", cc: CFG.SUPPORT });
  GmailApp.sendEmail(c.email, "Your VIN Fashions order " + o.id,
    "Hi " + c.name + ",\n\nThank you! We received your payment of Rs " + o.total + " for order " + o.id + ".\n\n" + lines + "\n\nWe will email you when it ships. Questions? Reply to this email.\n\nVIN Fashions",
    { name: "VIN Fashions", replyTo: CFG.SUPPORT });
}

// keep Script Properties small: drop orders older than 30 days (the e-mails are the permanent record)
function prune() {
  const all = props().getProperties(), now = Date.now();
  Object.keys(all).forEach((k) => {
    if (k.indexOf("o_") !== 0) return;
    try {
      const o = JSON.parse(all[k]), age = now - o.createdAt;
      if (age > 30 * 864e5 || (o.status !== "paid" && age > 864e5)) props().deleteProperty(k); // unpaid attempts expire after a day
    } catch (e) { props().deleteProperty(k); }
  });
}
// at most `max` calls per `windowMs` across everyone (spam / flooding protection)
function rate(key, max, windowMs) {
  const sp = props(), k = "r_" + key, now = Date.now();
  let r = JSON.parse(sp.getProperty(k) || '{"n":0,"t":0}');
  if (now - r.t > windowMs) r = { n: 0, t: now };
  if (r.n >= max) throw new Error("Too many requests. Please try again in a few minutes.");
  r.n++; sp.setProperty(k, JSON.stringify(r));
}


/* ================= accounts + admin (Google Sheet as a tiny database) ================= */
const sha256 = (s) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
  .map((b) => ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join("");
function secret() {
  const k = props().getProperty("SESSION_SECRET");
  if (!k || k.length < 16) throw new Error("Server is not configured (SESSION_SECRET)"); // never sign with an empty key
  return k;
}
const hmac = (m) => Utilities.computeHmacSha256Signature(m, secret())
  .map((b) => ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join("");
const same = (a, b) => { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
const COMMON_PW = ["password", "12345678", "123456789", "1234567890", "qwertyuiop", "11111111", "iloveyou", "password1", "password123", "abcd1234", "admin123", "welcome1", "qwerty123", "letmein1"];
function hashPw(pw, salt) { let h = salt + pw; for (let i = 0; i < 3000; i++) h = sha256(h + pw); return h; }

// ---- database: a Google Sheet that the script creates in this Google account on first use ----
const TABLES = {
  "users.json": { sheet: "Users", cols: ["id", "name", "email", "phone", "salt", "pw", "address", "createdAt"], json: ["address"], nums: ["createdAt"] },
  "orders.json": { sheet: "Orders", cols: ["id", "userId", "createdAt", "status", "fulfilment", "total", "subtotal", "shipping", "payuId", "customer", "items", "name", "phone", "summary"],
    json: ["customer", "items"], nums: ["createdAt", "total", "subtotal", "shipping"] }
};
function book() {
  const sp = props(); let id = sp.getProperty("SHEET_ID"), ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.create("VIN Fashions Data (do not share)"); sp.setProperty("SHEET_ID", ss.getId());
    Object.keys(TABLES).forEach((k, i) => { const t = TABLES[k], sh = i === 0 ? ss.getSheets()[0].setName(t.sheet) : ss.insertSheet(t.sheet); sh.appendRow(t.cols); sh.setFrozenRows(1); });
  }
  return ss;
}
const fx = (v) => (/^[=+\-@\t\r]/.test(v) ? "'" + v : v);          // neutralise formulas for anyone opening the sheet / a CSV export
const ux = (v) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);
// Everything is stored as text so phone numbers / hex hashes are never turned into numbers by Sheets.
function dbRead(name) {
  const t = TABLES[name], sh = book().getSheetByName(t.sheet), rows = sh.getDataRange().getValues();
  const data = rows.slice(1).filter((r) => r[0] !== "").map((r) => {
    const o = {}; t.cols.forEach((c, i) => {
      const v = r[i];
      if (t.json.indexOf(c) >= 0) o[c] = v === "" ? undefined : JSON.parse(v);
      else o[c] = t.nums.indexOf(c) >= 0 ? Number(v) : ux(String(v));
    }); return o;
  });
  return { data: data };
}
// read-modify-write under a lock so two simultaneous signups/orders cannot overwrite each other
function dbUpdate(name, fn, msg) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = TABLES[name], sh = book().getSheetByName(t.sheet), next = fn(dbRead(name).data);
    const rows = next.map((o) => t.cols.map((c) => {
      if (c === "name" && o.customer) return fx(String(o.customer.name));
      if (c === "phone" && o.customer) return fx(String(o.customer.phone));
      if (c === "summary") return fx((o.items || []).map((i) => i.name + " x" + i.qty).join("; "));
      if (t.json.indexOf(c) >= 0) return o[c] === undefined ? "" : JSON.stringify(o[c]);
      return o[c] === undefined ? "" : fx(String(o[c]));
    }));
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, t.cols.length).clearContent();
    if (rows.length) { const r = sh.getRange(2, 1, rows.length, t.cols.length); r.setNumberFormat("@"); r.setValues(rows); }
    return next;
  } finally { lock.releaseLock(); }
}

// 5 wrong tries per key -> locked for 10 minutes
function throttle(key, failed) {
  const sp = props(), k = "t_" + key, t = JSON.parse(sp.getProperty(k) || '{"n":0,"t":0}'), now = Date.now();
  if (failed === undefined) { if (t.n >= 5 && now - t.t < 600000) throw new Error("Too many attempts. Try again in 10 minutes."); return; }
  if (failed) sp.setProperty(k, JSON.stringify({ n: (now - t.t < 600000 ? t.n : 0) + 1, t: now })); else sp.deleteProperty(k);
}
const mkToken = (kind, id, hours) => { const exp = Date.now() + hours * 3600e3, m = kind + "." + id + "." + exp; return m + "." + hmac(m); };
function readToken(kind, tok) {
  const p = String(tok || "").split(".");
  if (p.length !== 4 || p[0] !== kind || +p[2] < Date.now() || !same(p[3], hmac(p.slice(0, 3).join(".")))) return "";
  return p[1];
}
function userFromToken(tok) { return readToken("u", tok); }
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, address: u.address || null });

function account(b) {
  const a = b.action;
  if (a === "signup") {
    const name = str(b.name, 80), email = str(b.email, 100).toLowerCase(), phone = str(b.phone, 10), pw = String(b.password || "");
    if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^[6-9]\d{9}$/.test(phone)) throw new Error("Please check your name, email and mobile number");
    if (pw.length < 8 || pw.length > 100) throw new Error("Password must be at least 8 characters");
    if (COMMON_PW.indexOf(pw.toLowerCase()) >= 0 || /^(.)\1+$/.test(pw)) throw new Error("Please choose a less common password");
    rate("signup", 30, 3600000);
    const salt = Utilities.getUuid(), u = { id: "u" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), name: name, email: email, phone: phone, salt: salt, pw: hashPw(pw, salt), createdAt: Date.now() };
    dbUpdate("users.json", (all) => { if (all.some((x) => x.email === email)) throw new Error("An account with this email already exists"); all.push(u); return all; }, "New user");
    return { token: mkToken("u", u.id, 24 * 7), user: publicUser(u) };
  }
  if (a === "login") {
    rate("login", 300, 600000);
    const email = str(b.email, 100).toLowerCase(); throttle(email);
    const u = dbRead("users.json").data.filter((x) => x.email === email)[0];
    if (!u || !same(hashPw(String(b.password || ""), u.salt), u.pw)) { throttle(email, true); throw new Error("Wrong email or password"); }
    throttle(email, false);
    return { token: mkToken("u", u.id, 24 * 7), user: publicUser(u) };
  }
  if (a === "me" || a === "saveAddress") {
    const uid = userFromToken(b.token); if (!uid) throw new Error("Please log in again");
    let user;
    if (a === "saveAddress") {
      const ad = b.address || {}, addr = { address: str(ad.address, 250), city: str(ad.city, 60), state: str(ad.state, 60), pincode: str(ad.pincode, 6) };
      if (addr.address.length < 8 || !addr.city || !addr.state || !/^\d{6}$/.test(addr.pincode)) throw new Error("Please check the address");
      dbUpdate("users.json", (all) => { const u = all.filter((x) => x.id === uid)[0]; if (!u) throw new Error("Account not found"); u.address = addr; user = u; return all; }, "Update address");
    } else user = dbRead("users.json").data.filter((x) => x.id === uid)[0];
    if (!user) throw new Error("Account not found");
    const orders = dbRead("orders.json").data.filter((o) => o.userId === uid).map((o) => ({ id: o.id, createdAt: o.createdAt, total: o.total, status: o.status, fulfilment: o.fulfilment || "new", items: o.items }));
    return { user: publicUser(user), orders: orders };
  }
  if (a === "adminLogin") {
    throttle("admin");
    const P = props();
    if (!P.getProperty("ADMIN_EMAIL") || !P.getProperty("ADMIN_PASSWORD")) throw new Error("Admin login is not configured");
    const okE = same(str(b.email, 100).toLowerCase(), String(P.getProperty("ADMIN_EMAIL") || "").toLowerCase()), okP = same(String(b.password || ""), P.getProperty("ADMIN_PASSWORD") || "\u0000");
    if (!(okE && okP)) { throttle("admin", true); throw new Error("Wrong email or password"); }
    throttle("admin", false);
    return { token: mkToken("a", "admin", 12), ghToken: P.getProperty("GH_TOKEN_SITE") };
  }
  if (a === "adminOrders" || a === "adminFulfil") {
    if (readToken("a", b.token) !== "admin") throw new Error("Please log in again");
    if (a === "adminOrders") return { orders: dbRead("orders.json").data, users: dbRead("users.json").data.length };
    if (["new", "packed", "shipped", "delivered", "cancelled"].indexOf(b.fulfilment) < 0) throw new Error("Bad status");
    dbUpdate("orders.json", (all) => { const o = all.filter((x) => x.id === b.id)[0]; if (o) o.fulfilment = b.fulfilment; return all; }, "Order " + b.id + " " + b.fulfilment);
    return { ok: true };
  }
  throw new Error("Unknown request");
}

// Run this ONCE from the editor (function dropdown -> authorize -> Run) so Google asks you to approve
// Gmail, Google Sheets and external-request access. Then redeploy a New version.
function authorize() {
  try { UrlFetchApp.fetch(CFG.SITE); } catch (e) { }
  GmailApp.getInboxUnreadCount();
  try { SpreadsheetApp.openById("permission-check"); } catch (e) { /* expected: only here so Google asks for Sheets access */ }
}
