// Runs inside the help.vinfashions@gmail.com Google account, so no password is ever shared.
// 1. script.google.com -> New project (signed in as help.vinfashions@gmail.com) -> paste this.
// 2. Set TOKEN below to a long random string (same value as the Worker secret NOTIFY_TOKEN).
// 3. Deploy -> New deployment -> Web app -> Execute as: Me, Access: Anyone -> copy the URL (Worker secret NOTIFY_URL).
const TOKEN = "CHANGE_ME_LONG_RANDOM";
const FORWARD_TO = "nagaarjun1157@gmail.com";

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.token !== TOKEN) return ContentService.createTextOutput("forbidden");
  const o = d.order, c = o.customer;
  const lines = o.items.map(i => `- ${i.name} (${[i.color, i.size].filter(Boolean).join(" / ")}) x ${i.qty}  Rs ${i.price * i.qty}`).join("\n");
  const body = `New paid order ${o.id}\n\n${lines}\n\nSubtotal Rs ${o.subtotal}\nShipping Rs ${o.shipping}\nTotal Rs ${o.total}\n\n` +
    `Customer: ${c.name}\nPhone: ${c.phone}\nEmail: ${c.email}\nAddress: ${c.address}, ${c.city}, ${c.state} ${c.pincode}\nPayU id: ${o.payuId || ""}`;
  GmailApp.sendEmail(FORWARD_TO, `New order ${o.id} - Rs ${o.total}`, body, { name: "VIN Fashions", cc: "help.vinfashions@gmail.com" });
  GmailApp.sendEmail(c.email, `Your VIN Fashions order ${o.id}`,
    `Hi ${c.name},\n\nThank you! We received your payment of Rs ${o.total} for order ${o.id}.\n\n${lines}\n\nWe will email you when it ships. Questions? Reply to this email.\n\nVIN Fashions`,
    { name: "VIN Fashions", replyTo: "help.vinfashions@gmail.com" });
  return ContentService.createTextOutput("ok");
}
