// Grid Watch — browser client
const DONATE_URL="https://buymeacoffee.com/TheScouseOracle";
const TIP_URL="";
const TIP_EMAIL="dailysigns333@gmail.com";
const RADIUS_KM=45;
let MAP=null,MARKERS=null,CURATED=[],LIVE=[],OSM=[],GRID=[],INCENTIVES=[],OWNERSHIP=new Map(),GRID_CONTEXT=null;
const el=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function dist(a,b,c,d){const R=6371,r=x=>x*Math.PI/180,p=r(c-a),q=r(d-b),s=Math.sin(p/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(q/2)**2;return 2*R*Math.asin(Math.sqrt(s));}
function money(n){if(n==null)return null;if(n>=1e9)return `£${(n/1e9).toFixed(n%1e9?1:0)}bn`;if(n>=1e6)return `£${Math.round(n/1e6)}m`;return `£${Number(n).toLocaleString("en-GB")}`;}
let DATA={}, HAS_RESULTS=false, RESULT_SCROLL=0, RESULT_FOCUS=null;
async function loadData(){
  const files={curated:'datacentres.json',planning:'planning.json',osm:'datacentres-osm.json',grid:'grid.json',ownership:'ownership.json',incentives:'incentives.json',investigations:'investigations.json',registry:'sources/open-data-sources.json',electricity:'electricity.json'};
  const failures=[];
  const entries=await Promise.all(Object.entries(files).map(async([key,path])=>{
    try{const r=await fetch(path);if(!r.ok)throw new Error(path);const data=await r.json();
      const list=key==='curated'?'datacentres':key==='registry'?'sources':'items';
      if(!Array.isArray(data[list]))throw new Error(path);
      if(key==='electricity'&&data.schema_version===2&&(!Array.isArray(data.shards)||!data.shards.length||!data.shards.every(s=>/^electricity\/[a-zA-Z0-9_-]+\.json$/.test(s.path)&&Number.isInteger(s.count)&&s.count>0&&Array.isArray(s.bounds)&&s.bounds.length===4&&s.bounds.every(Number.isFinite))))throw new Error(path);
      if(key==='investigations'&&(data.schema_version!==1||!Array.isArray(data.water_context)))throw new Error(path);
      return [key,data];
    }catch{failures.push(key);return [key,{}];}
  }));
  DATA={...Object.fromEntries(entries),failures};
  const coords=a=>(a||[]).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng));
  CURATED=coords(DATA.curated.datacentres);LIVE=coords(DATA.planning.items);OSM=coords(DATA.osm.items);GRID=coords(DATA.grid.items);
  GRID_CONTEXT=DATA.grid.national_context||null;OWNERSHIP=new Map((DATA.ownership.items||[]).map(x=>[x.site_id,x]));INCENTIVES=DATA.incentives.items||[];
}
function investigateAction(kind,x){return `<a class="investigate-link" href="${GridInvestigation.href(kind,x)}">Investigate this site <span aria-hidden="true">→</span><span class="sr-only">: ${esc(x.name||'Data centre')}</span></a>`;}
function showMsg(t){el("msg").textContent=t;el("msg").classList.remove("hidden");}function hideMsg(){el("msg").classList.add("hidden");}
async function run(raw){const pc=(raw||"").trim();if(!pc){showMsg("Pop a postcode in first.");return;}hideMsg();el("go").disabled=true;el("go").textContent="Looking…";await DATA_READY;let loc;try{const r=await fetch("https://api.postcodes.io/postcodes/"+encodeURIComponent(pc)),j=await r.json();if(j.status!==200||!j.result)throw 0;loc={lat:j.result.latitude,lng:j.result.longitude,place:j.result.admin_district||j.result.parish||"your area",country:j.result.country||"",region:j.result.region||""};}catch(e){el("go").disabled=false;el("go").textContent="Explore my area";showMsg("That postcode didn't resolve. Check it and try again.");return;}el("go").disabled=false;el("go").textContent="Explore my area";const near=a=>a.map(x=>({...x,km:dist(loc.lat,loc.lng,x.lat,x.lng)})).filter(x=>x.km<=RADIUS_KM).sort((a,b)=>a.km-b.km);render(loc,near(CURATED),near(LIVE),near(OSM),near(GRID));}
function powerLabel(x){const mw=x.power_mw??x.est_mw;if(mw==null)return "";const st=(x.power_status||(x.est_mw!=null?"Estimated":"Unknown"));const icon=/connected|operational/i.test(st)?"⚡":/contracted|accepted/i.test(st)?"🔌":/proposed|requested/i.test(st)?"🟡":"◌";return `<div class="meta"><b>${icon} Power:</b> ${esc(mw)} MW · ${esc(st)}${x.power_basis?` · ${esc(x.power_basis)}`:""}</div>`;}
function ownerLine(x){const chain=[x.operator,x.owner,x.ultimate_owner].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);const country=x.ownership_country||x.country;return chain.length?`<div class="op"><b>Operator / ownership:</b> ${chain.map(esc).join(" → ")}${country?` · ${esc(country)}`:""}</div>`:"";}
function curatedRow(x){return `<div class="row site-card"><div class="top"><div class="nm">${esc(x.name||'Data centre')}</div><div class="dist">~${Math.round(x.km)}km</div></div><div class="op">${esc(x.operator||'Operator not recorded')}</div><div class="meta">${esc([x.area,x.status].filter(Boolean).join(' · ')||'Status not recorded')}</div>${investigateAction('curated',x)}</div>`;}
function liveRow(x){const pm=(x.power_mentions||[]).map(p=>`${p.value} ${p.unit}`).join(", ");return `<div class="row"><div class="top"><div class="nm">${esc(x.authority||"Planning application")}</div><div class="dist">~${Math.round(x.km)}km</div></div><div class="note">${esc((x.description||"").slice(0,260))}${(x.description||"").length>260?"…":""}</div><div class="meta">${esc(x.nation||"")}${x.address?" · "+esc(x.address):""}${x.date?" · "+esc(x.date):""}${x.status?" · "+esc(x.status):""}</div>${pm?`<div class="meta"><b>Power mentioned in planning text:</b> ${esc(pm)} <span class="flag">unverified context</span></div>`:""}${x.url?`<a class="src" href="${esc(x.url)}" target="_blank" rel="noreferrer">Open planning source ↗</a>`:""}</div>`;}
function osmRow(x){return `<div class="row site-card"><div class="top"><div class="nm">${esc(x.name||'Data centre')}</div><div class="dist">~${Math.round(x.km)}km</div></div><div class="op">${esc(x.operator||'Operator not mapped')} <span class="flag osm">OpenStreetMap</span></div><div class="meta">${esc([x.city,x.status||'Status not mapped'].filter(Boolean).join(' · '))}</div>${investigateAction('osm',x)}</div>`;}
function gridRow(x){return `<div class="row"><div class="top"><div class="nm">${esc(x.name||"High-voltage substation")}</div><div class="dist">~${Math.round(x.km)}km</div></div><div class="meta"><b>Mapped voltage:</b> ${esc(x.voltage_label||"")}${x.operator?` · ${esc(x.operator)}`:""}</div><div class="note">Geographic grid context only. Proximity does not prove a data centre connects to this substation.</div>${x.source?`<a class="src" href="${esc(x.source)}" target="_blank" rel="noreferrer">OpenStreetMap source ↗</a>`:""}</div>`;}
function gridContext(){if(!GRID_CONTEXT)return "";const c=GRID_CONTEXT;return `<div class="context"><b>Britain's demand-connection queue:</b> Ofgem reported ${esc(c.demand_connection_applications_gw)} GW of demand-connection applications on ${esc(c.as_of)}, up from ${esc(c.previous_demand_connection_applications_gw)} GW in under a year, with data-centre projects accounting for at least ${esc(c.data_centre_component_at_least_gw)} GW. <b>These are applications/queue figures, not current consumption.</b> <a href="${esc(c.source)}" target="_blank" rel="noreferrer">Ofgem source ↗</a></div>`;}
function incentiveRow(x){return `<div class="row"><div class="top"><div class="nm">${esc(x.icon||"📌")} ${esc(x.title||x.category||"Public support")}</div></div><div class="meta"><b>${esc(x.category||"Policy")}</b> · ${esc(x.scope||"")} · ${esc(x.status||"")}</div><div class="note">${esc(x.summary||"")}</div>${x.claim_limit?`<div class="context"><b>What this does NOT prove:</b> ${esc(x.claim_limit)}</div>`:""}${x.source?`<a class="src" href="${esc(x.source)}" target="_blank" rel="noreferrer">${esc(x.source_label||"Official source")} ↗</a>`:""}</div>`;}
function incentiveContext(loc){const place=[loc.place,loc.region,loc.country].filter(Boolean).join(" · ");return `<div class="context"><b>New layer: public support & incentives.</b> These are documented government mechanisms that can support AI Growth Zone/data-centre development. They are shown as policy context for ${esc(place||"your area")}; <b>Grid Watch does not assume a nearby data centre actually received a tax break, subsidy, planning advantage or priority connection.</b> Individual project support will only be labelled when an open source explicitly links it to that project.</div>`;}
function render(loc,c,l,o,g){HAS_RESULTS=true;RESULT_SCROLL=0;RESULT_FOCUS=null;el("investigation").classList.add("hidden");if(location.hash!=="#results")location.hash="results";el("home").classList.add("hidden");el("results").classList.remove("hidden");window.scrollTo(0,0);const inv=c.reduce((s,x)=>s+(x.investment_gbp||0),0),total=c.length+o.length+l.length;el("r-lead").textContent=`Within ${RADIUS_KM}km of ${loc.place}:`;el("r-big").textContent=inv?money(inv):String(total);el("r-say").innerHTML=inv?`of announced investment appears in the <b>verified register</b> near you. Open-map, planning and electricity-infrastructure records are shown separately below.`:total?`${total===1?"mapped data-centre/planning record sits":"mapped data-centre/planning records sit"} near you. Grid infrastructure is shown separately and is not counted as a data centre.`:`no data-centre or planning record is currently returned within ${RADIUS_KM}km. That does not prove none exists or is planned.`;el("r-curated").innerHTML=c.length?c.map(curatedRow).join(""):`<div class="empty">No open-evidence verified register entries within ${RADIUS_KM}km yet.</div>`;el("r-grid-context").innerHTML=gridContext();el("r-grid").innerHTML=g.length?g.slice(0,75).map(gridRow).join(""):`<div class="empty">No 132 kV+ OpenStreetMap substations returned within ${RADIUS_KM}km.</div>`;el("r-live").innerHTML=l.length?l.slice(0,75).map(liveRow).join(""):`<div class="empty">No mappable open-licensed planning candidates near you in the current feeds.</div>`;el("r-osm").innerHTML=o.length?o.map(osmRow).join(""):`<div class="empty">No OpenStreetMap data-centre features returned near you.</div>`;el("r-incentive-context").innerHTML=incentiveContext(loc);el("r-incentives").innerHTML=INCENTIVES.length?INCENTIVES.map(incentiveRow).join(""):`<div class="empty">No open public-support policy records loaded.</div>`;el("data-status").textContent=DATA.failures.length?"Some data files could not be loaded. Results may be incomplete; reload to try again.":"";drawMap(loc,c,l,o,g);if(typeof GridElectricity!=="undefined")GridElectricity.mount({map:MAP,markers:MARKERS,data:DATA,loc,c,o,g,distance:dist});el("donate").href=DONATE_URL;const share=`Grid Watch maps open data on data-centre infrastructure, planning and high-voltage grid context around ${loc.place}. #TheScouseOracle`;el("share").onclick=()=>navigator.share?navigator.share({text:share}).catch(()=>{}):navigator.clipboard?.writeText(share);}
function drawMap(loc,c,l,o,g){if(typeof L==="undefined")return;if(!MAP){MAP=L.map("map",{scrollWheelZoom:false,preferCanvas:true}).setView([loc.lat,loc.lng],9);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"&copy; OpenStreetMap contributors",maxZoom:18}).addTo(MAP);MARKERS=L.layerGroup().addTo(MAP);}MARKERS.clearLayers();const b=[[loc.lat,loc.lng]];L.circleMarker([loc.lat,loc.lng],{radius:7}).bindPopup("You").addTo(MARKERS);c.forEach(x=>{L.circleMarker([x.lat,x.lng],{radius:9}).bindPopup(`<b>${esc(x.name)}</b><br>Verified register<br>${investigateAction('curated',x)}`).addTo(MARKERS);b.push([x.lat,x.lng]);});l.slice(0,100).forEach(x=>{L.circleMarker([x.lat,x.lng],{radius:5}).bindPopup(`<b>Planning candidate</b><br>${esc(x.reference||"")}`).addTo(MARKERS);b.push([x.lat,x.lng]);});o.slice(0,300).forEach(x=>{L.circleMarker([x.lat,x.lng],{radius:5}).bindPopup(`<b>${esc(x.name||"Data centre")}</b><br>OpenStreetMap<br>${investigateAction('osm',x)}`).addTo(MARKERS);b.push([x.lat,x.lng]);});g.slice(0,100).forEach(x=>{L.circleMarker([x.lat,x.lng],{radius:4}).bindPopup(`<b>${esc(x.name||"Substation")}</b><br>${esc(x.voltage_label||"")}<br>Grid context only`).addTo(MARKERS);});if(b.length>1)MAP.fitBounds(b,{padding:[40,40],maxZoom:11});setTimeout(()=>MAP.invalidateSize(),60);}
function sendTip(){if(TIP_URL){window.open(TIP_URL,"_blank","noopener");return;}location.href=`mailto:${TIP_EMAIL}?subject=${encodeURIComponent("Grid Watch evidence tip")}&body=${encodeURIComponent("Location / postcode:\n\nPlanning reference:\n\nOperator / developer:\n\nOpen-data / primary source link:\n\nNotes:\n")}`;}
el("tip").addEventListener("click",sendTip);el("go").addEventListener("click",()=>run(el("pc").value));el("pc").addEventListener("keydown",e=>{if(e.key==="Enter")run(el("pc").value);});document.querySelectorAll(".examples button").forEach(b=>b.addEventListener("click",()=>{el("pc").value=b.dataset.pc;run(b.dataset.pc);}));function showHome(){location.hash="home";el("investigation").classList.add("hidden");el("results").classList.add("hidden");el("home").classList.remove("hidden");el("pc").value="";window.scrollTo(0,0);}
el("again").addEventListener("click",showHome);el("back-home").addEventListener("click",showHome);
document.addEventListener('click',e=>{
  const a=e.target.closest('a.investigate-link');
  if(a&&!el('results').classList.contains('hidden')){RESULT_SCROLL=window.scrollY;RESULT_FOCUS=a;}
});
async function route(){
  await DATA_READY;
  const hash=location.hash;
  el('investigation').classList.add('hidden');
  if(hash.startsWith('#site=')){
    el('home').classList.add('hidden');el('results').classList.add('hidden');el('investigation').classList.remove('hidden');
    let id;try{id=decodeURIComponent(hash.slice(6));}catch{id=null;}
    const found=[...CURATED.map(x=>['curated',x]),...OSM.map(x=>['osm',x])].find(([kind,x])=>GridInvestigation.key(kind,x)===id);
    el('investigation-back').textContent=HAS_RESULTS?'← Back to your results':'← Search a postcode';
    el('site-content').innerHTML=found?GridInvestigation.render(GridInvestigation.model(...found,DATA),DATA):'<h1 id="site-heading" tabindex="-1">Site record unavailable</h1><p>This link may be outdated, or the site data could not be loaded. Return to search or reload to try again.</p>';
    document.title=found?`${found[1].name||'Data centre'} — Grid Watch`:'Site unavailable — Grid Watch';
    window.scrollTo(0,0);el('site-heading').focus({preventScroll:true});
  }else{
    document.title='Grid Watch — The Scouse Oracle';
    const results=hash==='#results'&&HAS_RESULTS;
    el('home').classList.toggle('hidden',results);el('results').classList.toggle('hidden',!results);
    if(results){MAP?.invalidateSize();window.scrollTo(0,RESULT_SCROLL);if(RESULT_FOCUS?.isConnected)RESULT_FOCUS.focus({preventScroll:true});}
    else{window.scrollTo(0,0);el('pc').focus({preventScroll:true});}
  }
}
el('investigation-back').addEventListener('click',()=>{location.hash=HAS_RESULTS?'results':'home';});
window.addEventListener('hashchange',route);
const DATA_READY=loadData();
DATA_READY.then(route);

if(typeof GridElectricity!=="undefined")GridElectricity.init();
