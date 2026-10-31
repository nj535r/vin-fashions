(function(){
  const {$,esc,money,CFG,uid}=VIN, GH=CFG.GITHUB;
  let token="", at=""; try{token=sessionStorage.getItem("vin_gh")||""; at=sessionStorage.getItem("vin_at")||"";}catch(e){}
  let products=[], sha="";
  const img=p=>VIN.safeImage(p.image)?"../"+p.image:VIN.imgOf(p);
  const b64=t=>btoa(unescape(encodeURIComponent(t)));
  async function gh(path,opt){
    opt=opt||{};
    const r=await fetch("https://api.github.com/repos/"+GH.repo+path,{method:opt.method||"GET",headers:Object.assign({Accept:"application/vnd.github+json",Authorization:"Bearer "+token},opt.body?{"Content-Type":"application/json"}:{}),body:opt.body?JSON.stringify(opt.body):undefined});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(j.message||("GitHub error "+r.status));e.status=r.status;throw e;}
    return j;
  }
  const bad=(box,m)=>{box.innerHTML='<div class="msg err"></div>';box.firstChild.textContent=m;};
  const show=()=>{ $("#login").hidden=!!token; $("#app").hidden=!token; $("#out").hidden=!token; if(token) load(); };
  function logout(){token="";at="";try{sessionStorage.removeItem("vin_gh");sessionStorage.removeItem("vin_at");}catch(e){}show();}
  async function load(){
    try{
      const j=await gh("/contents/products.json?ref="+GH.branch+"&t="+Date.now());
      sha=j.sha; products=JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g,"")))));
    }catch(e){ if(e.status===401||e.status===403||e.status===404){logout();bad($("#lerr"),"GitHub rejected the stored site token (needs Contents: read & write on "+GH.repo+"). Update GH_TOKEN_SITE in the script.");} else alert(e.message); return; }
    draw();
  }
  async function commit(msg){
    const j=await gh("/contents/products.json",{method:"PUT",body:{message:msg,content:b64(JSON.stringify(products,null,1)),sha,branch:GH.branch}});
    sha=j.content.sha;
  }
  async function guarded(fn){ try{await fn();}catch(e){ if(e.status===409){alert("The catalogue changed elsewhere. Reloading – please repeat your change.");await load();} else alert(e.message); } }
  const call=async(action,data)=>{
    const r=await fetch(CFG.API,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(Object.assign({action},data))});
    const j=await r.json().catch(()=>({error:"Unexpected reply"})); if(j.error) throw new Error(j.error); return j; };
  $("#lf").addEventListener("submit",async e=>{e.preventDefault(); const b=e.target.querySelector("button"); b.disabled=true;
    try{ const r=await call("adminLogin",{email:$("#em").value.trim(),password:$("#pw").value});
      if(!r.ghToken) throw new Error("Server is missing GH_TOKEN_SITE (see README).");
      token=r.ghToken; at=r.token; $("#pw").value=""; try{sessionStorage.setItem("vin_gh",token);sessionStorage.setItem("vin_at",at);}catch(x){} $("#lerr").innerHTML=""; show(); }
    catch(x){ bad($("#lerr"),x.message); } b.disabled=false; });
  const tab=n=>{[1,2].forEach(i=>{$("#p"+i).hidden=i!==n;$("#t"+i).setAttribute("aria-selected",i===n);}); if(n===2) loadOrders();};
  $("#t1").onclick=()=>tab(1); $("#t2").onclick=()=>tab(2); $("#refresh").onclick=()=>loadOrders();
  async function loadOrders(){
    try{ const r=await call("adminOrders",{token:at}); $("#uc").textContent="· "+r.users+" registered customers"; $("#oc").textContent="("+r.orders.length+")";
      const F=["new","packed","shipped","delivered","cancelled"];
      $("#otb").innerHTML=r.orders.map(o=>`<tr><td><b>${esc(o.id)}</b></td><td>${new Date(o.createdAt).toLocaleString("en-IN")}</td>
        <td>${esc(o.customer.name)}<br><span class="muted">${esc(o.customer.phone)} · ${esc(o.customer.email)}</span><br><span class="muted">${esc(o.customer.address)}, ${esc(o.customer.city)}, ${esc(o.customer.state)} ${esc(o.customer.pincode)}</span></td>
        <td>${o.items.map(i=>`${esc(i.name)} (${esc([i.color,i.size].filter(Boolean).join("/"))}) × ${esc(i.qty)}`).join("<br>")}</td><td>${money(o.total)}</td>
        <td><select data-o="${esc(o.id)}" aria-label="Fulfilment for ${esc(o.id)}">${F.map(f=>`<option${f===(o.fulfilment||"new")?" selected":""}>${f}</option>`).join("")}</select></td></tr>`).join("")||'<tr><td colspan="6" class="muted">No paid orders yet.</td></tr>';
    }catch(e){ if(/log in again/i.test(e.message)) logout(); else alert(e.message); } }
  $("#otb").addEventListener("change",async e=>{const s=e.target.closest("[data-o]"); if(s){ try{await call("adminFulfil",{token:at,id:s.dataset.o,fulfilment:s.value});}catch(x){alert(x.message);} }});
  $("#out").onclick=logout;
  function draw(){
    $("#pc").textContent="("+products.length+")";
    $("#ptb").innerHTML=products.map(p=>`<tr>
      <td><img src="${esc(img(p))}" alt=""></td><td><b>${esc(p.name)}</b>${p.featured?' <span class="pill">Featured</span>':""}</td><td>${esc(p.category)}</td>
      <td>${money(p.price)}${p.mrp>p.price?` <s class="muted">${money(p.mrp)}</s>`:""}</td><td>${esc(p.stock)}</td>
      <td>${p.active===false?'<span class="pill">Hidden</span>':'<span class="pill paid">Live</span>'}</td>
      <td style="white-space:nowrap"><button class="btn sm ghost" data-e="${esc(p.id)}">Edit</button> <button class="btn sm danger" data-x="${esc(p.id)}">Delete</button></td></tr>`).join("")||'<tr><td colspan="7" class="muted">No products yet – click “Add clothing”.</td></tr>';
  }
  $("#ptb").addEventListener("click",e=>{
    const ed=e.target.closest("[data-e]"),dl=e.target.closest("[data-x]");
    if(ed) openForm(products.find(p=>p.id===ed.dataset.e));
    if(dl&&confirm("Delete this product permanently?")) guarded(async()=>{ products=products.filter(p=>p.id!==dl.dataset.x); draw(); await commit("Delete product"); });
  });

  let editing=null, imageData="", clearImg=false;
  const dlg=$("#dlg");
  function fillCats(sel){ const cats=[...new Set([...CFG.CATEGORIES,...products.map(p=>p.category)])]; $("#f_cat").innerHTML=cats.map(c=>`<option${c===sel?" selected":""}>${esc(c)}</option>`).join(""); }
  function preview(src){ const i=$("#f_prev"); i.hidden=!src; $("#f_clear").hidden=!src; if(src) i.src=src; }
  function openForm(p){
    editing=p||null; imageData=""; clearImg=false; $("#ferr").innerHTML="";
    $("#dt").textContent=p?"Edit clothing":"Add clothing";
    fillCats(p&&p.category);
    $("#f_name").value=p?p.name:""; $("#f_newcat").value=""; $("#f_price").value=p?p.price:""; $("#f_mrp").value=p&&p.mrp?p.mrp:"";
    $("#f_stock").value=p?p.stock:10; $("#f_sizes").value=p?(p.sizes||[]).join(", "):"S, M, L, XL";
    $("#f_colors").value=p?(p.colors||[]).map(c=>c.n+":"+c.h).join(", "):""; $("#f_desc").value=p?p.desc||"":"";
    $("#f_feat").checked=!!(p&&p.featured); $("#f_act").checked=p?p.active!==false:true; $("#f_file").value="";
    preview(p&&p.image?"../"+p.image:""); dlg.showModal();
  }
  $("#addp").onclick=()=>openForm(null); $("#cancel").onclick=()=>dlg.close();
  $("#f_clear").onclick=()=>{imageData="";clearImg=true;$("#f_file").value="";preview("");};
  $("#f_file").addEventListener("change",e=>{
    const f=e.target.files[0]; if(!f) return;
    if(!/^image\//.test(f.type)) return alert("Please choose an image file.");
    const im=new Image(), url=URL.createObjectURL(f);
    im.onload=()=>{ const s=Math.min(1,800/Math.max(im.width,im.height)), c=document.createElement("canvas");
      c.width=Math.round(im.width*s);c.height=Math.round(im.height*s); c.getContext("2d").drawImage(im,0,0,c.width,c.height);
      imageData=c.toDataURL("image/jpeg",0.85); clearImg=false; preview(imageData); URL.revokeObjectURL(url); };
    im.onerror=()=>alert("Could not read that image."); im.src=url;
  });
  const parseColors=s=>s.split(",").map(x=>x.trim()).filter(Boolean).map(x=>{ const [n,h]=x.split(":").map(t=>t.trim()); return {n,h:(h||"").startsWith("#")?h:"#"+h}; });
  $("#pf").addEventListener("submit",e=>{
    e.preventDefault();
    const err=m=>bad($("#ferr"),m);
    const name=$("#f_name").value.trim(), price=Math.round(+$("#f_price").value), mrp=Math.round(+$("#f_mrp").value)||0, stock=Math.round(+$("#f_stock").value);
    const category=$("#f_newcat").value.trim()||$("#f_cat").value, colors=parseColors($("#f_colors").value);
    if(name.length<2) return err("Name is required."); if(!(price>0)) return err("Enter a selling price."); if(mrp&&mrp<price) return err("MRP must be at least the selling price.");
    if(!(stock>=0)) return err("Stock cannot be negative."); if(colors.some(c=>!c.n||!/^#[0-9a-f]{6}$/i.test(c.h))) return err("Colours must look like Rose:#e8a0b0");
    const id=editing?editing.id:"p"+uid();
    const rec={ id, name, category, price, mrp:mrp||price, stock, sizes:$("#f_sizes").value.split(",").map(s=>s.trim()).filter(Boolean), colors,
      desc:$("#f_desc").value.trim(), featured:$("#f_feat").checked, active:$("#f_act").checked, image:clearImg?"":(editing?editing.image||"":""), createdAt:editing?editing.createdAt:Date.now() };
    const b=$("#save"); b.disabled=true; b.textContent="Saving…";
    guarded(async()=>{
      if(imageData){ const path="img/"+id+"-"+Date.now().toString(36)+".jpg";
        await gh("/contents/"+path,{method:"PUT",body:{message:"Add photo for "+name,content:imageData.split(",")[1],branch:GH.branch}}); rec.image=path; }
      const i=products.findIndex(p=>p.id===id); if(i>=0) products[i]=rec; else products.unshift(rec);
      await commit((editing?"Update ":"Add ")+name); draw(); dlg.close();
    }).finally(()=>{b.disabled=false;b.textContent="Save";});
  });
  show();
})();
