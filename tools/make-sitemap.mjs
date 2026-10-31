// Regenerates sitemap.xml from products.json:  node tools/make-sitemap.mjs
// (the admin panel also refreshes it automatically every time you save a product)
import fs from "node:fs";
const SITE = "https://vinfashions.online/";
const products = JSON.parse(fs.readFileSync("products.json", "utf8")).filter((p) => p.active !== false);
const cats = [...new Set(["Nighties", "Kurtis", "Sarees", "Western Wear", "Lounge Wear", "Kids", "Men", ...products.map((p) => p.category)])];
const today = new Date().toISOString().slice(0, 10);
const x = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rows = [["", "1.0", "daily"], ["shop.html", "0.9", "daily"],
  ...cats.map((c) => ["shop.html?cat=" + encodeURIComponent(c), "0.8", "daily"]),
  ...products.map((p) => ["product.html?id=" + encodeURIComponent(p.id), "0.7", "weekly"]),
  ["policies.html", "0.3", "monthly"]];
fs.writeFileSync("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  rows.map(([u, pr, f]) => `  <url><loc>${x(SITE + u)}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join("\n") + "\n</urlset>\n");
console.log(rows.length + " URLs written");
