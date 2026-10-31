/**
 * VIN Fashions backend – runs as a Google Apps Script web app inside help.vinfashions@gmail.com.
 * No server, no database, no password sharing. It does what GitHub Pages cannot:
 *   1. builds the PayU request hash (needs the secret SALT)       -> POST {items, customer}
 *   2. receives PayU's POST callback, verifies hash + amount      -> POST (form-encoded, from PayU)
 *   3. e-mails the order to the owner and a receipt to the buyer
 *   4. answers "is order X paid?" for the thank-you page          -> GET ?id=X
 * Secrets live in Project Settings -> Script properties: PAYU_KEY, PAYU_SALT (never in GitHub).
 */
const CFG = {
  SITE: "https://vinfashions.online",
  FORWARD_TO: "nagaarjun1157@gmail.com",
  SUPPORT: "help.vinfashions@gmail.com",
  FREE_ABOVE: 999,
  FEE: 60,
  PAYU_ENV: "test" // change to "live" only after PayU activates your account
};

const props = () => PropertiesService.getScriptProperties();
const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const sha512 = (s) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_512, s, Utilities.Charset.UTF_8)
  .map((b) => ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join("");
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));

function doGet(e) {
  const id = e && e.parameter && e.parameter.id;
  if (!id) return out({ ok: true, service: "VIN Fashions" });
  const raw = props().getProperty("o_" + id);
  if (!raw) return out({ error: "not found" });
  const o = JSON.parse(raw);
  return out({ id: o.id, status: o.status, total: o.total });
}

function doPost(e) {
  try {
    const type = (e.postData && e.postData.type) || "";
    if (type.indexOf("x-www-form-urlencoded") >= 0) return callback(e.parameter); // PayU
    return out(createOrder(JSON.parse(e.postData.contents)));
  } catch (err) {
    return out({ error: String(err.message || err).slice(0, 120) });
  }
}

function catalogue() {
  const r = UrlFetchApp.fetch(CFG.SITE + "/products.json?t=" + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Catalogue unavailable");
  return JSON.parse(r.getContentText());
}

function validCustomer(c) {
  return c && str(c.name, 80).length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(c.email, 100)) && /^[6-9]\d{9}$/.test(str(c.phone, 10)) &&
    str(c.address, 250).length >= 8 && str(c.city, 60) && str(c.state, 60) && /^\d{6}$/.test(str(c.pincode, 6));
}

function createOrder(body) {
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
  const shipping = subtotal >= CFG.FREE_ABOVE ? 0 : CFG.FEE, total = subtotal + shipping;
  const c = body.customer, id = "VIN" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();
  const order = {
    id: id, items: lines, subtotal: subtotal, shipping: shipping, total: total, status: "pending", createdAt: Date.now(),
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
  const all = props().getProperties(), cut = Date.now() - 30 * 864e5;
  Object.keys(all).forEach((k) => { if (k.indexOf("o_") === 0) { try { if (JSON.parse(all[k]).createdAt < cut) props().deleteProperty(k); } catch (e) { props().deleteProperty(k); } } });
}
