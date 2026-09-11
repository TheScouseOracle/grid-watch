/* Optional electricity-system view. No inferred edges or supply relationships. */
(function(root){
  const categories=[['generate','GENERATE','Solar, wind & nuclear','#986000'],['store','STORE','Batteries (BESS)','#713899'],['connect','CONNECT','Substations','#176875'],['transmit','TRANSMIT','Lines & reinforcement','#cc2a18'],['consume','CONSUME','Data centres & major demand','#31502a']];
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const url=s=>{try{const u=new URL(s);return u.protocol==='https:'?esc(u.href):'';}catch{return '';}};
  let group=null,ctx=null,enabled=false;
  const selected=new Set(categories.map(c=>c[0]));
  function records(data,c,o,g){return [...(data.electricity.items||[]),...g.map(x=>({...x,category:'connect',type:'Substation',status:'Community-mapped infrastructure',basis:'OpenStreetMap location; no consumer connection established.',licence:'ODbL 1.0',checked:data.grid.generated_at?.slice(0,10)})),...c.map(x=>({...x,category:'consume',type:'Data centre',kind:'curated'})),...o.map(x=>({...x,category:'consume',type:'Data centre',kind:'osm',licence:'ODbL 1.0',checked:data.osm.generated_at?.slice(0,10)}))];}
  function detail(x){return `<b>${esc(x.name||x.type)}</b><p>${esc(x.category.toUpperCase())} · ${esc(x.type)}<br>${esc(x.status||'Status not established')}</p><p>${esc(x.basis||'Mapped site; electricity consumption and supplier are not established.')}</p>${x.location_note?`<p>${esc(x.location_note)}</p>`:''}<p>${x.checked?'Source snapshot / checked: '+esc(x.checked):'Review date not recorded'}${x.licence?' · '+esc(x.licence):''}</p>${url(x.source)?`<a href="${url(x.source)}" target="_blank" rel="noreferrer">Open source ↗</a>`:'<p>Source unavailable</p>'}${x.kind?`<p><a class="investigate-link" href="${root.GridInvestigation.href(x.kind,x)}">Investigate this site →</a></p>`:''}`;}
  function paint(){
    if(!ctx)return;
    const {map,markers,data,loc,c,o,g,distance}=ctx;
    if(group)group.clearLayers();
    if(map&&enabled){if(!group)group=L.layerGroup().addTo(map);map.removeLayer(markers);}else if(map){markers.addTo(map);}
    const all=records(data,c,o,g).filter(x=>categories.some(cat=>cat[0]===x.category)&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)&&distance(loc.lat,loc.lng,x.lat,x.lng)<=45);
    const shown=all.filter(x=>selected.has(x.category));
    document.getElementById('electricity-status').textContent=enabled?(data.failures.includes('electricity')?'Electricity dataset unavailable. Existing substations and demand records remain available.':`${shown.length} mapped features in the selected categories within 45 km. Kent supply and route coverage is a starting sample; absence is not proof that no project exists.`):'Electricity-system view is off. The original map is shown.';
    document.getElementById('electricity-list').innerHTML=enabled?categories.filter(cat=>selected.has(cat[0])).map(cat=>{const rows=all.filter(x=>x.category===cat[0]);return `<details class="disc"><summary>${cat[1]} · ${rows.length} mapped features</summary><div class="body">${rows.length?rows.map(x=>`<div class="row">${detail(x)}</div>`).join(''):'<p>No suitable mapped records in this sample. This does not establish absence.</p>'}</div></details>`;}).join(''):'';
    if(!enabled||!map)return;
    L.circleMarker([loc.lat,loc.lng],{radius:6,color:'#1b1712',fillOpacity:1}).bindPopup('Search location').addTo(group);
    for(const x of shown){const color=categories.find(c=>c[0]===x.category)[3];const marker=x.geometry?.length>1?L.polyline(x.geometry,{color,weight:3,opacity:.8}):L.circleMarker([x.lat,x.lng],{radius:7,color,fillColor:color,fillOpacity:.75});marker.bindPopup(detail(x)).addTo(group);}
  }
  function mount(context){ctx=context;paint();}
  function init(){
    const box=document.getElementById('electricity-filters');
    box.innerHTML='<legend>Choose project types</legend>'+categories.map(([id,label,desc,color])=>`<label class="electricity-filter"><input type="checkbox" value="${id}" checked><span style="border-left:4px solid ${color}"><b>${label}</b><small>${desc}</small></span></label>`).join('');
    box.addEventListener('change',e=>{if(!categories.some(c=>c[0]===e.target.value))return;e.target.checked?selected.add(e.target.value):selected.delete(e.target.value);paint();});
    document.getElementById('electricity-toggle').addEventListener('change',e=>{enabled=e.target.checked;paint();});
  }
  root.GridElectricity={mount,init,records,detail,categories};
})(typeof window==='undefined'?globalThis:window);
