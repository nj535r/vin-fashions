// Site settings. API = your Google Apps Script web app URL (apps-script/Code.gs, see README.md).
// While API is empty, checkout runs in DEMO mode (no real payment, no e-mails).
window.VIN_CONFIG = {
  API: "https://script.google.com/macros/s/AKfycbzQIl-ikyFPq_uBPyxXUPtg66IHBNOP2M15-LLMpP2SxXsAzexDu6DonQDh-6aYP4cu/exec",
  GITHUB: { repo: "nj535r/vin-fashions", branch: "main" }, // used by /admin to save products
  SITE: "https://vinfashions.online",
  FREE_SHIPPING_ABOVE: 2000, // delivery is free only when the order is ABOVE this amount
  SHIPPING_FEE: 100,        // standard delivery charge for orders up to and including the amount above
  CONTACT: {
    email: "help.vinfashions@gmail.com",
    phone: "+91 95858 94036",
    address: "VIN Fashions, Pondy-Mailam Main Road, Sedhenapattu, Villupuram - 605109, Tamil Nadu, India",
    hours: "Mon–Sat, 10:00–19:00 IST"
  },
  CATEGORIES: ["Nighties", "Kurtis", "Sarees", "Western Wear", "Lounge Wear", "Kids", "Men"]
};
