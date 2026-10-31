// Site settings. Set API to your deployed Cloudflare Worker URL (see README.md).
// While API is empty the site runs in DEMO mode: catalogue, cart, admin and "payment"
// all live in this browser only, so you can preview everything before going live.
window.VIN_CONFIG = {
  API: "",
  SITE: "https://vinfashions.online",
  FREE_SHIPPING_ABOVE: 999,
  SHIPPING_FEE: 60,
  CONTACT: {
    email: "help.vinfashions@gmail.com",
    phone: "+91 00000 00000",
    address: "VIN Fashions, (your shop address), India",
    hours: "Mon–Sat, 10:00–19:00 IST"
  },
  CATEGORIES: ["Nighties", "Kurtis", "Sarees", "Western Wear", "Lounge Wear", "Kids", "Men"]
};
