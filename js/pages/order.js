(async function(){
  const {$,esc,money,API,Cart,chrome}=VIN;
  chrome("");
  const qs=new URLSearchParams(location.search), id=qs.get("id")||"";
  const box=$("#box");
  const o=id?await API.orderStatus(id):null;
  if(!o){ box.innerHTML='<h1>Order not found</h1><p>Check the link in your confirmation email or <a href="policies.html#contact">contact us</a>.</p>'; return; }
  if(o.status==="paid"){
    Cart.clear();
    box.innerHTML=`<h1>Thank you – order confirmed</h1><p>Your order <b>${esc(o.id)}</b> for <b>${money(o.total)}</b> is paid. We will email you when it ships.</p>${qs.get("demo")?'<p class="msg info">Demo mode: no real payment was made.</p>':""}<p><a class="btn" href="shop.html">Continue shopping</a></p>`;
  } else if(o.status==="pending"){
    box.innerHTML=`<h1>Payment pending</h1><p>Order <b>${esc(o.id)}</b> is waiting for the bank to confirm. If money was debited it will be confirmed shortly or refunded automatically. Refresh this page in a few minutes.</p>`;
  } else {
    box.innerHTML=`<h1>Payment did not go through</h1><p>Order <b>${esc(o.id)}</b> was not paid and you have not been charged (any debit is refunded by your bank within 5–7 working days).</p><p><a class="btn accent" href="cart.html">Try again</a></p>`;
  }
})();
