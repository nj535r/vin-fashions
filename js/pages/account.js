(function(){
  const {$,$$,esc,money,Account,CFG,chrome}=VIN;
  chrome("");
  $("#sup").textContent=CFG.CONTACT.email;
  const bad=(f,m)=>{const e=$(".err",f);e.innerHTML='<div class="msg err"></div>';e.firstChild.textContent=m;};
  const ok=(f,m)=>{const e=$(".err",f);e.innerHTML='<div class="msg ok"></div>';e.firstChild.textContent=m;};
  const tab=(n)=>{$("#fl").hidden=n!==1;$("#fs").hidden=n!==2;$("#tl").setAttribute("aria-selected",n===1);$("#ts").setAttribute("aria-selected",n===2);};
  $("#tl").onclick=()=>tab(1);$("#ts").onclick=()=>tab(2);
  async function submit(f,action,data,btn){
    const b=$("button:last-of-type",f); b.disabled=true;
    try{ const r=await Account.call(action,data); Account.set({token:r.token,user:r.user}); view(); }
    catch(e){ bad(f,e.message); } b.disabled=false;
  }
  $("#fl").addEventListener("submit",e=>{e.preventDefault();submit(e.target,"login",{email:$("#le").value.trim(),password:$("#lp").value});});
  $("#fs").addEventListener("submit",e=>{e.preventDefault();
    const d={name:$("#sn").value.trim(),email:$("#se").value.trim(),phone:$("#sph").value.trim(),password:$("#sp").value};
    if(d.name.length<2||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return bad(e.target,"Enter your name and a valid email.");
    if(!/^[6-9]\d{9}$/.test(d.phone)) return bad(e.target,"Enter a valid 10-digit mobile number.");
    if(d.password.length<8) return bad(e.target,"Password must be at least 8 characters.");
    submit(e.target,"signup",d);});
  $("#logout").onclick=()=>{Account.set(null);view();};
  $("#fa").addEventListener("submit",async e=>{e.preventDefault();
    const a={address:$("#aa").value.trim(),city:$("#ac").value.trim(),state:$("#as").value.trim(),pincode:$("#ap").value.trim()};
    try{ const r=await Account.call("saveAddress",{token:Account.get().token,address:a}); Account.set({token:Account.get().token,user:r.user}); ok(e.target,"Address saved."); }
    catch(x){ bad(e.target,x.message); } });
  async function view(){
    const s=Account.get();
    $("#guest").hidden=!!s; $("#mine").hidden=!s; if(!s) return;
    $("#hi").textContent="Hello, "+s.user.name.split(" ")[0];
    const a=s.user.address||{}; $("#aa").value=a.address||"";$("#ac").value=a.city||"";$("#as").value=a.state||"";$("#ap").value=a.pincode||"";
    try{
      const r=await Account.call("me",{token:s.token}); Account.set({token:s.token,user:r.user});
      $("#orders").innerHTML=r.orders.length?r.orders.map(o=>`<div class="box" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(o.id)}</b><span class="pill ${esc(o.fulfilment)}">${esc(o.fulfilment)}</span></div>
        <div class="muted" style="font-size:.88rem">${new Date(o.createdAt).toLocaleDateString("en-IN")} · ${money(o.total)}</div>
        <div style="font-size:.93rem;margin-top:6px">${o.items.map(i=>esc(i.name)+" × "+i.qty).join("<br>")}</div></div>`).join(""):'<p class="muted">No orders yet. <a href="shop.html">Start shopping</a></p>';
    }catch(e){ if(/log in again/i.test(e.message)){Account.set(null);view();} else $("#orders").textContent=e.message; }
  }
  if(VIN.DEMO){ $("#guest").innerHTML='<p class="msg info">Accounts are available once the backend API is configured.</p>'; $("#guest").hidden=false; }
  else view();
})();
