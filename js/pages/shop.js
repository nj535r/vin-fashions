(async function(){
  const {$,$$,esc,CFG,API,card,chrome,money}=VIN;
  chrome("shop");
  const qs=new URLSearchParams(location.search);
  const st={cat:qs.get("cat")||"",q:(qs.get("q")||"").trim().toLowerCase(),price:"",sizes:new Set(),colors:new Set(),stock:false,sort:"new"};
  const RANGES=[["","Any price"],["0-499","Under ₹500"],["500-999","₹500 – ₹999"],["1000-1999","₹1,000 – ₹1,999"],["2000-99999","₹2,000 & above"]];
  let all=[];
  try{ all=await API.products(); }catch(e){ $("#grid").innerHTML='<p class="msg err">Could not load products. Please refresh.</p>'; return; }
  const cats=[...new Set([...CFG.CATEGORIES,...all.map(p=>p.category)])];
  const count=(f)=>all.filter(f).length;
  function build(){
    $("#fCat").innerHTML=[["","All"],...cats.map(c=>[c,c])].map(([v,t])=>`<label><input type="radio" name="cat" value="${esc(v)}"${st.cat===v?" checked":""}> ${esc(t)} <span class="muted">(${v?count(p=>p.category===v):all.length})</span></label>`).join("");
    $("#fPrice").innerHTML=RANGES.map(([v,t])=>`<label><input type="radio" name="price" value="${v}"${st.price===v?" checked":""}> ${t}</label>`).join("");
    const sizes=[...new Set(all.flatMap(p=>p.sizes||[]))], colors=new Map();
    all.forEach(p=>(p.colors||[]).forEach(c=>colors.set(c.n,c.h)));
    $("#fSize").innerHTML=sizes.map(s=>`<button class="chip" type="button" data-size="${esc(s)}" aria-pressed="${st.sizes.has(s)}">${esc(s)}</button>`).join("");
    $("#fColor").innerHTML=[...colors].map(([n,h])=>`<button class="sw" type="button" data-color="${esc(n)}" title="${esc(n)}" aria-label="${esc(n)}" aria-pressed="${st.colors.has(n)}" style="background:${VIN.safeColor(h)}"></button>`).join("");
  }
  function render(){
    let r=all.filter(p=>{
      if(st.cat&&p.category!==st.cat) return false;
      if(st.q&&!(p.name+" "+p.category+" "+(p.desc||"")).toLowerCase().includes(st.q)) return false;
      if(st.price){const [a,b]=st.price.split("-").map(Number); if(p.price<a||p.price>b) return false;}
      if(st.sizes.size&&!(p.sizes||[]).some(s=>st.sizes.has(s))) return false;
      if(st.colors.size&&!(p.colors||[]).some(c=>st.colors.has(c.n))) return false;
      if(st.stock&&!(p.stock>0)) return false;
      return true;
    });
    const off=p=>p.mrp>p.price?1-p.price/p.mrp:0;
    r.sort({new:(a,b)=>(b.createdAt||0)-(a.createdAt||0),plh:(a,b)=>a.price-b.price,phl:(a,b)=>b.price-a.price,disc:(a,b)=>off(b)-off(a)}[st.sort]);
    $("#grid").innerHTML=r.length?r.map(card).join(""):'<div class="empty" style="grid-column:1/-1"><p>No clothing matches these filters.</p></div>';
    $("#count").textContent=r.length+" item"+(r.length===1?"":"s");
    const t=st.q?`Results for “${qs.get("q")}”`:(st.cat||"All clothing");
    $("#ttl").textContent=t; $("#crumb").textContent=t; document.title=t+" – VIN Fashions";
    $$("[data-size]").forEach(b=>b.setAttribute("aria-pressed",st.sizes.has(b.dataset.size)));
    $$("[data-color]").forEach(b=>b.setAttribute("aria-pressed",st.colors.has(b.dataset.color)));
  }
  build(); render();
  const toggle=(set,v)=>set.has(v)?set.delete(v):set.add(v);
  $("#filters").addEventListener("click",e=>{
    const s=e.target.closest("[data-size]"),c=e.target.closest("[data-color]");
    if(s){toggle(st.sizes,s.dataset.size);render();} if(c){toggle(st.colors,c.dataset.color);render();}
  });
  $("#filters").addEventListener("change",e=>{
    if(e.target.name==="cat") st.cat=e.target.value;
    if(e.target.name==="price") st.price=e.target.value;
    if(e.target.id==="fStock") st.stock=e.target.checked;
    render();
  });
  $("#sort").addEventListener("change",e=>{st.sort=e.target.value;render();});
  $("#reset").addEventListener("click",()=>{st.cat="";st.q="";st.price="";st.sizes.clear();st.colors.clear();st.stock=false;$("#fStock").checked=false;qs.delete("q");build();render();});
  $("#fbtn").addEventListener("click",e=>{const o=$("#filters").classList.toggle("open");e.target.setAttribute("aria-expanded",o);});
})();
