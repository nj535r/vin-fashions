VIN.chrome("contact");
const {$,CFG,money}=VIN;
$("#fs").textContent=money(CFG.FREE_SHIPPING_ABOVE);$("#sf").textContent=money(CFG.SHIPPING_FEE);
$("#cdet").append(CFG.CONTACT.address,document.createElement("br"),"Email: "+CFG.CONTACT.email,document.createElement("br"),"Phone: "+CFG.CONTACT.phone,document.createElement("br"),"Hours: "+CFG.CONTACT.hours);
