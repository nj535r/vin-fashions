# VIN Fashions – vinfashions.online

Everything is hosted on GitHub Pages. No database, no extra hosting.

| Part | Where it lives |
|---|---|
| Website | this repo → GitHub Pages |
| Catalogue | `products.json` in this repo; photos in `img/` |
| Admin panel | `/admin/` – saves to this repo through the GitHub API |
| Payment hash, PayU callback, order e-mails | `apps-script/Code.gs` – a Google Apps Script in help.vinfashions@gmail.com (GitHub Pages cannot run server code, and PayU requires it) |

## 1. Publish on GitHub Pages
1. Push this repo to GitHub as `sedhupathivishnu321/vin-fashions` (public).
2. Settings → Pages → Deploy from branch `main`, folder `/ (root)`. Custom domain `vinfashions.online` (the `CNAME` file is already here), tick *Enforce HTTPS*.
3. DNS at your registrar: four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `CNAME` `www` → `sedhupathivishnu321.github.io`.

## 2. Payments + order e-mails (Google Apps Script)
1. script.google.com, signed in as help.vinfashions@gmail.com → open the existing project → replace the code with `apps-script/Code.gs`.
2. Project Settings (gear) → Script properties → add `PAYU_KEY` and `PAYU_SALT` (PayU **test** values first).
3. Deploy → Manage deployments → pencil → Version: **New version** → Deploy. (A new version is needed every time you change the code; the URL stays the same.)
4. The URL is already set as `API` in `js/config.js`.
5. When PayU activates your account: change `PAYU_ENV` to `"live"` in `Code.gs`, use the live key/salt, redeploy a new version.

Paid orders are e-mailed to nagaarjun1157@gmail.com (cc help.vinfashions@gmail.com); the buyer gets a receipt. Prices are always recomputed from `products.json` on the server, and PayU's response hash and amount are verified before an order counts as paid.

## 3. Admin token (once)
GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate: repository access *Only select repositories* → `vin-fashions`; permissions → *Contents: Read and write*; set an expiry. Copy it, open `https://vinfashions.online/admin/`, paste it. It lives only in that browser tab (sessionStorage). Anyone with the token can change the shop, so keep it private.

Adding/editing a product commits `products.json` (and the photo in `img/`); the site updates about a minute later. Stock is edited by hand (set 0 for sold out).

## Local preview
`python -m http.server 8080` → http://localhost:8080 (clear `API` in `js/config.js` to try checkout in demo mode without PayU).

## Notes
- Fill in your real phone and shop address in `js/config.js`; PayU asks for the policy pages in `policies.html` during approval.
- Product text is always HTML-escaped when displayed.
