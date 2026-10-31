# VIN Fashions – vinfashions.online

Everything is hosted on GitHub Pages. No database, no extra hosting.

| Part | Where it lives |
|---|---|
| Website | this repo → GitHub Pages |
| Catalogue | `products.json` in this repo; photos in `img/` |
| Admin panel | `/admin/` – email/password via the script, saves to this repo through the GitHub API |
| Customer + order database | private repo `vin-fashions-data` (users.json, orders.json) |
| Payment hash, PayU callback, order e-mails | `apps-script/Code.gs` – a Google Apps Script in help.vinfashions@gmail.com (GitHub Pages cannot run server code, and PayU requires it) |

## 1. Publish on GitHub Pages
1. Push this repo to GitHub as `sedhupathivishnu321/vin-fashions` (public).
2. Settings → Pages → Deploy from branch `main`, folder `/ (root)`. Custom domain `vinfashions.online` (the `CNAME` file is already here), tick *Enforce HTTPS*.
3. DNS at your registrar: four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `CNAME` `www` → `sedhupathivishnu321.github.io`.

## 2. Backend: payments, accounts, admin login, order e-mails (Google Apps Script)
1. script.google.com, signed in as help.vinfashions@gmail.com -> open the existing project -> replace the code with `apps-script/Code.gs`.
2. Project Settings (gear) -> **Script properties** -> add these (they never go into GitHub):

| Property | Value |
|---|---|
| `PAYU_KEY`, `PAYU_SALT` | from the PayU dashboard (test values first) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | your admin panel login |
| `SESSION_SECRET` | any long random string (signs login sessions) |
| `GH_TOKEN` | fine-grained GitHub token, **only** repo `vin-fashions-data`, Contents: Read and write (never leaves the script) |
| `GH_TOKEN_SITE` | fine-grained GitHub token, **only** repo `vin-fashions`, Contents: Read and write (given to the admin panel after login so it can save products) |

3. Deploy -> Manage deployments -> pencil -> Version: **New version** -> Deploy. (Needed after every code change; the URL stays the same.) First deploy asks for extra permission (GitHub/Gmail access): allow it.
4. The URL is already set as `API` in `js/config.js`. When PayU activates your account set `PAYU_ENV` to `"live"` in `Code.gs` and redeploy.

### The database
The private repo `sedhupathivishnu321/vin-fashions-data` holds `users.json` (customers: name, email, phone, address, salted password hash) and `orders.json` (every paid order). Only the Apps Script writes to it, with a lock so simultaneous orders do not overwrite each other. Keep that repo **private**: it contains customer details. Fine for hundreds of customers; if the shop grows large, move to a real database.
Customers can register / log in at `account.html`, see their orders and saved address (auto-filled at checkout); guest checkout still works. Admin: `/admin/` -> email + password -> Products and Orders tabs (set fulfilment status; buyers see it in their account).
Passwords are salted and hashed (3000 rounds of SHA-256, the best Apps Script offers, weaker than bcrypt). Login is locked for 10 minutes after 5 wrong attempts. No password reset yet: change one by editing `users.json` is not possible (hash), so delete the user entry and ask them to register again.

Paid orders are also e-mailed to nagaarjun1157@gmail.com (cc help.vinfashions@gmail.com); the buyer gets a receipt. Prices are recomputed from `products.json` on the server; PayU's response hash and amount are verified before an order counts as paid.

## 3. Admin
Log in at `https://vinfashions.online/admin/`. Adding/editing a product commits `products.json` (and the photo in `img/`); the site updates about a minute later. Stock is edited by hand (0 = sold out).

## Local preview
`python -m http.server 8080` → http://localhost:8080 (clear `API` in `js/config.js` to try checkout in demo mode without PayU).

## Notes
- Fill in your real phone and shop address in `js/config.js`; PayU asks for the policy pages in `policies.html` during approval.
- Product text is always HTML-escaped when displayed.
