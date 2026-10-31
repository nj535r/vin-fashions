// Sample catalogue used only in DEMO mode (no backend). Replace via the admin panel.
(function () {
  const C = (n, h) => ({ n, h });
  const S = ["S", "M", "L", "XL"], F = ["Free Size"];
  const P = (id, name, category, price, mrp, sizes, colors, stock, desc, featured) => ({
    id, name, category, price, mrp, sizes, colors, stock, desc, featured: !!featured, active: true, image: "", createdAt: Date.now() - id.length * 1e6
  });
  window.VIN_SEED = [
    P("n1", "Rose Cotton Nightie", "Nighties", 549, 799, F, [C("Rose", "#e8a0b0"), C("Maroon", "#9f1239")], 25, "Soft breathable cotton nighty with a relaxed fit and lace-trimmed neckline.", 1),
    P("n2", "Floral Maxi Nighty", "Nighties", 699, 999, F, [C("Teal", "#2a9d8f"), C("Navy", "#1e3a5f")], 18, "Full-length printed maxi nighty with side pockets.", 1),
    P("n3", "Satin Night Gown", "Nighties", 1099, 1499, S, [C("Wine", "#722f37"), C("Black", "#1a1a1a")], 12, "Smooth satin gown with adjustable straps and lace hem.", 1),
    P("n4", "Feeding Nighty with Zip", "Nighties", 749, 999, S, [C("Sky", "#8ecae6"), C("Peach", "#f4a98c")], 10, "Front-zip nighty designed for easy feeding and everyday comfort."),
    P("k1", "Straight Cotton Kurti", "Kurtis", 799, 1199, S, [C("Mustard", "#d4a017"), C("Green", "#3a7d44")], 30, "Everyday straight-cut kurti in pure cotton.", 1),
    P("k2", "Anarkali Printed Kurti", "Kurtis", 1299, 1799, S, [C("Indigo", "#3f4a8a"), C("Red", "#c1272d")], 14, "Flared Anarkali kurti with block print and three-quarter sleeves."),
    P("s1", "Soft Cotton Saree", "Sarees", 1499, 2199, F, [C("Maroon", "#8b1d2c"), C("Bottle Green", "#14532d")], 9, "Lightweight cotton saree with woven border. Blouse piece included.", 1),
    P("s2", "Chanderi Silk Saree", "Sarees", 2499, 3299, F, [C("Gold", "#b8860b"), C("Pink", "#d6537a")], 6, "Chanderi silk blend saree with zari border."),
    P("w1", "Relaxed Linen Top", "Western Wear", 899, 1299, S, [C("White", "#f1ede4"), C("Olive", "#6b705c")], 22, "Boxy linen-blend top for warm days."),
    P("l1", "Cotton Lounge Set", "Lounge Wear", 1199, 1599, S, [C("Grey", "#9aa0a6"), C("Lilac", "#b5a3d6")], 16, "Matching top and pyjama set in brushed cotton.", 1),
    P("c1", "Girls Frock Dress", "Kids", 649, 899, ["2-3Y", "4-5Y", "6-7Y"], [C("Yellow", "#f2c94c"), C("Pink", "#f48fb1")], 20, "Cotton frock with soft inner lining."),
    P("m1", "Men's Check Shirt", "Men", 999, 1399, S, [C("Blue", "#3b6ea5"), C("Maroon", "#7a1f2b")], 24, "Full-sleeve check shirt in easy-iron cotton.")
  ];
})();
