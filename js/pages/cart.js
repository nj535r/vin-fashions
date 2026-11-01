(async function(){
  const {$,esc,money,Cart,API,priceCart,imgOf,chrome,CFG}=VIN;
  chrome("");
  let products=[];
  try{ products=await API.products(); }catch(e){}
  function draw(){
    const pr=priceCart(Cart.items(),products);
    // drop items whose product vanished
    if(pr.lines.length!==Cart.items().length) Cart.save(pr.lines.map(({id,size,color,qty})=>({id,size,color,qty})));
    $("#empty").hidden=!!pr.lines.length; $("#cartg").hidden=!pr.lines.length;
    $("#lines").innerHTML=pr.lines.map((l,i)=>`<div class="line">
      <img src="${esc(imgOf(l.p,(l.p.colors||[]).find(c=>c.n===l.color)?.h))}" alt="">
      <div><a href="product.html?id=${encodeURIComponent(l.p.id)}"><b>${esc(l.p.name)}</b></a>
        <div class="muted" style="font-size:.9rem">${[l.color,l.size].filter(Boolean).map(esc).join(" · ")}</div>
        <div style="margin-top:8px;display:flex;gap:10px;align-items:center">
          <div class="qty"><button type="button" data-d="-1" data-i="${i}" aria-label="Decrease quantity">−</button><span>${l.qty}</span><button type="button" data-d="1" data-i="${i}" aria-label="Increase quantity">+</button></div>
          <button class="btn sm ghost" type="button" data-rm="${i}">Remove</button></div></div>
      <b>${money(l.amount)}</b></div>`).join("");
    $("#sum").innerHTML=`<h2 style="font-size:1.15rem">Order summary</h2>
      <div><span>Subtotal</span><span>${money(pr.subtotal)}</span></div>
      <div><span>Delivery</span><span>${pr.shipping?money(pr.shipping):"Free"}</span></div>
      ${pr.shipping?`<div class="muted" style="font-size:.85rem">Add ${money(CFG.FREE_SHIPPING_ABOVE+1-pr.subtotal)} more for free delivery (orders above ${money(CFG.FREE_SHIPPING_ABOVE)})</div>`:""}
      <div class="tot"><span>Total</span><span>${money(pr.total)}</span></div>`;
    return pr;
  }
  draw();
  const U=VIN.Account.get();
  if(U){ const u=U.user, a=u.address||{}; [["name",u.name],["email",u.email],["phone",u.phone],["addr",a.address],["city",a.city],["state",a.state],["pin",a.pincode]].forEach(([i,v])=>{ if(v) $("#"+i).value=v; }); }
  $("#lines").addEventListener("click",e=>{
    const a=Cart.items(), d=e.target.closest("[data-d]"), r=e.target.closest("[data-rm]");
    if(d){const it=a[+d.dataset.i]; it.qty=Math.max(1,Math.min(10,it.qty+ +d.dataset.d));}
    if(r) a.splice(+r.dataset.rm,1);
    if(d||r){Cart.save(a);draw();}
  });
  const bad=(m)=>{$("#err").innerHTML='<div class="msg err"></div>';$("#err").firstChild.textContent=m;};
  $("#form").addEventListener("submit",async e=>{
    e.preventDefault(); $("#err").innerHTML="";
    const f=new FormData(e.target), c=Object.fromEntries(f);
    if(c.website) return; // honeypot
    c.name=c.name.trim();c.phone=c.phone.trim();c.pincode=c.pincode.trim();c.email=c.email.trim();
    if(c.name.length<2) return bad("Please enter your full name.");
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return bad("Please enter a valid email.");
    if(!/^[6-9]\d{9}$/.test(c.phone)) return bad("Enter a valid 10-digit Indian mobile number.");
    if(c.address.trim().length<8) return bad("Please enter your full address.");
    if(!c.city.trim()||!c.state.trim()) return bad("City and state are required.");
    if(!/^\d{6}$/.test(c.pincode)) return bad("PIN code must be 6 digits.");
    delete c.website;
    const btn=$("#pay"); btn.disabled=true; btn.textContent="Please wait…";
    try{
      const res=await API.checkout(Cart.items(),c);
      if(res.demo){ Cart.clear(); location.href="order.html?id="+encodeURIComponent(res.id)+"&demo=1"; return; }
      const form=document.createElement("form"); form.method="POST"; form.action=res.action;
      Object.entries(res.fields).forEach(([k,v])=>{const i=document.createElement("input");i.type="hidden";i.name=k;i.value=v;form.appendChild(i);});
      document.body.appendChild(form); form.submit();
    }catch(err){ bad(err.message||"Could not start payment. Please try again."); btn.disabled=false; btn.textContent="Pay securely with PayU"; }
  });
})();
