(async function(){
  const {$,esc,CFG,API,card,art,chrome}=VIN;
  chrome("home");
  $("#cats").innerHTML=CFG.CATEGORIES.map(c=>`<a class="cat" href="shop.html?cat=${encodeURIComponent(c)}">${esc(c)}</a>`).join("");
  $("#heroArt").innerHTML=`<img src="${art("Nighties","#e8a0b0")}" alt="" width="400" height="500" style="width:100%;height:100%;object-fit:cover">`;
  try{
    const all=await API.products();
    const f=all.filter(p=>p.featured).slice(0,8);
    $("#featured").innerHTML=(f.length?f:all.slice(0,8)).map(card).join("")||'<p class="muted">Products coming soon.</p>';
  }catch(e){ $("#featured").innerHTML='<p class="msg err">Could not load products. Please refresh.</p>'; }
})();
