# VIN Fashions – vinfashions.online

Everything is hosted on GitHub Pages. No database, no extra hosting.

| Part | Where it lives |
|---|---|
| Website | this repo → GitHub Pages |
| Catalogue | `products.json` in this repo; photos in `img/` |
| Admin panel | `/admin/` – email/password via the script, saves to this repo through the GitHub API |
| Customer + order database | a Google Sheet the script creates in help.vinfashions@gmail.com's Drive |
| Payment hash, PayU callback, order e-mails | `apps-script/Code.gs` – a Google Apps Script in help.vinfashions@gmail.com (GitHub Pages cannot run server code, and PayU requires it) |

## 1. Publish on GitHub Pages
1. Push this repo to GitHub as `nj535r/vin-fashions` (public).
2. Settings → Pages → Deploy from branch `main`, folder `/ (root)`. Custom domain `vinfashions.online` (the `CNAME` file is already here), tick *Enforce HTTPS*.
3. DNS at your registrar: four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `CNAME` `www` → `nj535r.github.io`.

## 2. Backend: payments, accounts, admin login, order e-mails (Google Apps Script)
1. script.google.com, signed in as help.vinfashions@gmail.com -> open the existing project -> replace the code with `apps-script/Code.gs`.
2. Project Settings (gear) -> **Script properties** -> add these (they never go into GitHub):

| Property | Value |
|---|---|
| `PAYU_KEY`, `PAYU_SALT` | from the PayU dashboard (test values first) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | your admin panel login |
| `SESSION_SECRET` | any long random string (signs login sessions) |
| `GH_TOKEN_SITE` | fine-grained GitHub token, **only** repo `vin-fashions`, Contents: Read and write (given to the admin panel after login so it can save products) |

3. Deploy -> Manage deployments -> pencil -> Version: **New version** -> Deploy. (Needed after every code change; the URL stays the same.) The first deploy asks for permission to use Gmail, Google Sheets and external requests: allow it.
4. The URL is already set as `API` in `js/config.js`. When PayU activates your account set `PAYU_ENV` to `"live"` in `Code.gs` and redeploy.

### The database (Google Sheet)
On the first signup or paid order the script creates a spreadsheet called **VIN Fashions Data** in the Google Drive of help.vinfashions@gmail.com (its id is saved in the Script property `SHEET_ID`). It has two tabs: **Users** (name, email, phone, address, salted password hash) and **Orders** (every paid order, with readable name, phone and item columns). Keep the sheet private: it contains customer details. Writes are locked so simultaneous orders do not overwrite each other. Comfortable up to a few thousand rows; beyond that, move to Supabase.
You can open the sheet to look at, filter or export orders. You may edit the *fulfilment* column by hand (new / packed / shipped / delivered / cancelled), but do not edit other columns while an order is being placed. **Password reset:** delete that customer's row in the Users tab and ask them to register again.
Customers register / log in at `account.html`, see their orders and saved address (auto-filled at checkout); guest checkout still works. Admin: `/admin/` -> email + password -> Products and Orders tabs (set fulfilment status; buyers see it in their account).
Passwords are salted and hashed (3000 rounds of SHA-256, the best Apps Script offers, weaker than bcrypt). Login is locked for 10 minutes after 5 wrong attempts.

Paid orders are also e-mailed to nagaarjun1157@gmail.com (cc help.vinfashions@gmail.com); the buyer gets a receipt. Prices are recomputed from `products.json` on the server; PayU's response hash and amount are verified before an order counts as paid.

## 3. Admin
Log in at `https://vinfashions.online/admin/`. Adding/editing a product commits `products.json` (and its photos in `img/`); the site updates about a minute later. Stock is edited by hand (0 = sold out).
**Photos:** add **2 to 10** photos per product (up to 10 at once; each is resized to 1400 px). The first is the cover shown in the shop; use the arrows to reorder and the cross to remove (removed photos are deleted from the repo). Leave a product with no photos to show the coloured illustration. Shoppers get thumbnails, hover-zoom on desktop, and a full-screen viewer (click the photo) with zoom buttons, mouse-wheel / double-click / pinch zoom, drag to pan, and arrow keys.
**Delivery charge:** Rs 100 on orders up to and including Rs 2,000; free above Rs 2,000. Change `SHIPPING_FEE` / `FREE_SHIPPING_ABOVE` in `js/config.js` **and** `FEE` / `FREE_ABOVE` in `apps-script/Code.gs` (the server price is the one charged), then redeploy the script.

## Local preview
`python -m http.server 8080` → http://localhost:8080 (clear `API` in `js/config.js` to try checkout in demo mode without PayU).

## Security
**Built in**
- Content-Security-Policy on every page: scripts only from this site (no inline scripts, no third-party code), network calls only to Google Apps Script and the GitHub API, forms only to PayU. This blocks most cross-site-scripting attacks even if a bug slips in.
- All catalogue/customer text is HTML-escaped; product photos must be `img/...` files and colours must be `#rrggbb`; pages refuse to load inside another site's frame.
- Prices and stock are decided on the server; PayU's reply hash and amount are verified; amounts cannot be changed from the browser.
- Passwords are salted + hashed (never stored or returned). Login sessions are signed and expire (7 days customers, 12 hours admin). The server refuses to sign anything if `SESSION_SECRET` is missing/short.
- Brute-force/spam limits: 5 wrong logins per account then 10-minute lock; global caps on logins, signups and orders; requests over 20 KB rejected; common passwords refused.
- Order numbers are long and random; unpaid orders are deleted after a day.
- Text starting with `= + - @` is neutralised in the Google Sheet so a hostile name cannot run as a spreadsheet formula.
- The admin GitHub token only reaches the browser after an admin login, is limited to the `vin-fashions` repo (Contents only), and is kept in the tab's session storage only.

**Your checklist**
1. Turn on **two-step verification** for the GitHub account `nj535r` and for help.vinfashions@gmail.com (the Google account holds all customer data and the PayU salt).
2. Use a **long, unique admin password**, and change any password that was ever typed in a chat. Ask PayU to regenerate the salt if it was shared.
3. Give `GH_TOKEN_SITE` an **expiry** (e.g. 90 days) and renew it. Revoke it at once if a device is lost.
4. Never share the "VIN Fashions Data" Google Sheet, and do not add editors to the Apps Script project.
5. Keep GitHub **secret scanning / push protection** on (Settings -> Code security).
6. Admin lockout: five wrong admin attempts lock admin login for 10 minutes, which also stops an attacker guessing; wait it out if it happens to you.

**Known limits:** GitHub Pages cannot send security headers (so the CSP is delivered via a meta tag and clickjacking protection is script-based); Apps Script cannot run bcrypt (SHA-256 with 3000 rounds is used); there is no password-reset email yet.

## Notes
- Fill in your real phone and shop address in `js/config.js`; PayU asks for the policy pages in `policies.html` during approval.
- Product text is always HTML-escaped when displayed.
