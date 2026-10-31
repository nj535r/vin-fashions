# VIN Fashions – vinfashions.online

Static storefront (GitHub Pages) + one small Cloudflare Worker (admin API, PayU hash + callback).

## Preview now (demo mode)
`python -m http.server 8080`, then open http://localhost:8080. With `API` empty in `js/config.js` everything runs in your browser only; the admin password is `admin`.

## Go live
1. **Pages**: repo Settings → Pages → source `main` / root, custom domain `vinfashions.online`, tick *Enforce HTTPS*.
2. **DNS** at your registrar: four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `CNAME` `www` → `<github-user>.github.io`.
3. **Backend** (free Cloudflare account):
   ```
   cd worker
   npx wrangler login
   npx wrangler kv namespace create VIN        # paste the id into wrangler.toml
   npx wrangler secret put ADMIN_PASSWORD      # your admin login (long!)
   npx wrangler secret put TOKEN_SECRET        # any long random string
   npx wrangler secret put PAYU_KEY            # from the PayU dashboard
   npx wrangler secret put PAYU_SALT
   npx wrangler deploy
   ```
   Put the printed `https://vin-fashions-api.<you>.workers.dev` into `API` in `js/config.js`, commit, push.
4. **PayU**: start with `PAYU_ENV = "test"` (PayU test key/salt), place a test order, then switch to `"live"` with live key/salt once PayU activates the account. PayU needs the live site with the pages in `policies.html`; put your real business name, address, phone and email in `js/config.js`.
5. **Admin**: https://vinfashions.online/admin/ – add/edit/delete clothing (photo upload, sizes, colours, stock), view orders, set fulfilment status.

## Security notes
- Prices are recomputed on the server, so the browser cannot change an amount. PayU's response hash and amount are verified before an order is marked paid.
- Salt and admin password exist only as Worker secrets, never in this repo.
- Admin is on a public URL: use a long password, and consider Cloudflare Access in front of it.
- Product text is always HTML-escaped when displayed.
