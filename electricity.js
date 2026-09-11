/* Source-labelled electricity records; geography never creates supply links. */
(function(root){
  const categories=[['generate','GENERATE','Solar, wind & nuclear','#986000'],['store','STORE','Batteries (BESS)','#713899'],['connect','CONNECT','Substations','#176875'],['transmit','TRANSMIT','Routes & reinforcement','#cc2a18'],['consume','CONSUME','Data centres & major demand','#31502a']];
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const url=s=>{try{const u=new URL(s);return u.protocol==='https:'?esc(u.href):'';}catch{return '';}};
  const selected=new Set(categories.map(c=>c[0])),cache=new Map();
  let group=null,ctx=null,enabled=false,regional=[],loading=false,failed=false,revision=0,phase='all';
  const limits=Object.fromEntries(categories.map(c=>[c[0],50]));
  function records(data,c,o,g){return [...(data.electricity.items||[]),...g.map(x=>({...x,category:'connect',type:'Substation',stage:'unknown',status:'Community-mapped infrastructure',basis:'OpenStreetMap location; no consumer connection established.',licence:'ODbL 1.0',checked:data.grid.generated_at?.slice(0,10)})),...c.map(x=>({...x,category:'consume',type:'Data centre',kind:'curated',stage:'unknown'})),...o.map(x=>({...x,category:'consume',type:'Data centre',kind:'osm',stage:'unknown',licence:'ODbL 1.0',checked:data.osm.generated_at?.slice(0,10)}))];}
  function detail(x){return `<b>${esc(x.name||x.type)}</b><p>${esc(x.category.toUpperCase())} · ${esc(x.type)}<br>${esc(x.status||'Status not established')}</p>${x.source_ref?`<p>REPD reference: ${esc(x.source_ref)}${x.source_updated?' · Record updated: '+esc(x.source_updated):''}</p>`:''}${x.capacity_note?`<p>${esc(x.capacity_note)}</p>`:''}${x.voltage?`<p>Mapped voltage: ${esc(x.voltage)} V</p>`:''}<p>${esc(x.basis||'Mapped site; electricity consumption and supplier are not established.')}</p>${x.location_note?`<p>${esc(x.location_note)}</p>`:''}<p>${x.checked?'Source retrieved / reviewed: '+esc(x.checked):'Review date not recorded'}${x.licence?' · '+esc(x.licence):''}</p>${url(x.source)?`<a href="${url(x.source)}" target="_blank" rel="noreferrer">Open source ↗</a>`:'<p>Source unavailable</p>'}${url(x.download)?` · <a href="${url(x.download)}" target="_blank" rel="noreferrer">Source extract ↗</a>`:''}${x.kind?`<p><a class="investigate-link" href="${root.GridInvestigation.href(x.kind,x)}">Investigate this site →</a></p>`:''}`;}
  function searchBounds(loc){const dy=45/110,dx=45/(110*Math.cos(loc.lat*Math.PI/180));return [loc.lat-dy,loc.lng-dx,loc.lat+dy,loc.lng+dx];}
  function overlaps(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
  function nearDistance(x,loc,distance){
    if(!Array.isArray(x.geometry)||x.geometry.length<2)return distance(loc.lat,loc.lng,x.lat,x.lng);
    const sx=111.32*Math.cos(loc.lat*Math.PI/180),sy=111.32;let best=Infinity;
    for(let i=1;i<x.geometry.length;i++){const a=x.geometry[i-1],b=x.geometry[i],ax=(a[1]-loc.lng)*sx,ay=(a[0]-loc.lat)*sy,bx=(b[1]-loc.lng)*sx,by=(b[0]-loc.lat)*sy,dx=bx-ax,dy=by-ay,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/d)):0;best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));}
    return best;
  }
  function validRecord(x){return x&&categories.some(c=>c[0]===x.category)&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)&&(!x.geometry||(Array.isArray(x.geometry)&&x.geometry.length>1&&x.geometry.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))));}
  function currentRows(){const {data,loc,c,o,g,distance}=ctx,unique=new Map();for(const x of [...records(data,c,o,g),...regional])if(validRecord(x)&&!unique.has(x.id))unique.set(x.id,x);return [...unique.values()].map(x=>({...x,km:nearDistance(x,loc,distance)})).filter(x=>x.km<=45&&(phase==='all'||(x.stage||'unknown')===phase)).sort((a,b)=>a.km-b.km);}
  function paint(){
    if(!ctx)return;const {map,markers,data,loc}=ctx;
    if(group)group.clearLayers();
    if(map&&enabled){if(!group)group=L.layerGroup().addTo(map);map.removeLayer(markers);}else if(map){markers.addTo(map);}
    const all=currentRows(),shown=all.filter(x=>selected.has(x.category));
    const manifest=data.electricity,stamp=manifest.generated_at?.slice(0,10),stale=stamp&&Date.now()-Date.parse(stamp)>14*86400000;
    const state=!enabled?'Electricity-system view is off. The original map is shown.':loading?'Loading electricity records near your postcode…':failed||data.failures.includes('electricity')?'Some electricity records are unavailable. Results are incomplete; switch this view off and on to retry.':`${shown.length} source records in the selected categories and stages within 45 km. Records and line segments are not counts of unique projects. ${manifest.schema_version===2?'UK coverage':'Kent pilot coverage'}${stamp?' · Data retrieved '+stamp:''}.${stale?' The snapshot is over two weeks old; a refresh may be overdue.':''} Missing records do not prove absence.`;
    document.getElementById('electricity-status').textContent=state;
    document.getElementById('electricity-list').innerHTML=enabled?categories.filter(cat=>selected.has(cat[0])).map(cat=>{const rows=all.filter(x=>x.category===cat[0]),limit=limits[cat[0]];return `<details class="disc" data-category="${cat[0]}"><summary>${cat[1]} · ${rows.length} records</summary><div class="body">${rows.length?rows.slice(0,limit).map(x=>`<div class="row"><p>~${Math.round(x.km)} km from search</p>${detail(x)}</div>`).join(''):'<p>No records in this area match the selected stage. This does not establish absence.</p>'}${rows.length>limit?`<p>Showing the nearest ${limit} of ${rows.length} records. All matching records are on the map.</p><button class="btn ghost" type="button" data-more="${cat[0]}">Show 50 more</button>`:''}</div></details>`;}).join(''):'';
    if(!enabled||!map)return;
    L.circleMarker([loc.lat,loc.lng],{radius:6,color:'#1b1712',fillOpacity:1}).bindPopup('Search location').addTo(group);
    for(const x of shown){const color=categories.find(c=>c[0]===x.category)[3],tentative=['proposed','construction'].includes(x.stage),old=['closed','inactive'].includes(x.stage);const style={color,weight:3,opacity:old ? .45 : .8,dashArray:tentative?'6 5':null};const marker=x.geometry?.length>1?L.polyline(x.geometry,style):L.circleMarker([x.lat,x.lng],{radius:7,color,fillColor:color,fillOpacity:old ? .15 : .7,dashArray:tentative?'3 3':null});marker.bindPopup(detail(x)).addTo(group);}
  }
  async function loadRegion(){
    if(!ctx||!enabled)return;const ticket=++revision,context=ctx,manifest=context.data.electricity;
    if(manifest.schema_version!==2){regional=[];loading=false;failed=false;paint();return;}
    loading=true;failed=false;paint();
    const area=searchBounds(context.loc),shards=(manifest.shards||[]).filter(s=>overlaps(s.bounds,area));
    const results=await Promise.all(shards.map(async s=>{
      if(!/^electricity\/[a-zA-Z0-9_-]+\.json$/.test(s.path))return {error:true};
      try{if(!cache.has(s.path))cache.set(s.path,(async()=>{const r=await fetch(s.path,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('download');const v=await r.json();if(!Array.isArray(v.items)||v.items.length!==s.count||!v.items.every(validRecord))throw new Error('schema');return v.items;})());return {items:await cache.get(s.path)};}catch{cache.delete(s.path);return {error:true};}
    }));
    if(ticket!==revision||ctx!==context||!enabled)return;
    regional=results.flatMap(r=>r.items||[]);failed=results.some(r=>r.error);loading=false;paint();
  }
  function mount(context){revision++;ctx=context;regional=[];failed=false;loading=false;for(const key in limits)limits[key]=50;paint();return enabled?loadRegion():Promise.resolve();}
  function init(){
    const box=document.getElementById('electricity-filters');
    box.innerHTML='<legend>Choose project types</legend>'+categories.map(([id,label,desc,color])=>`<label class="electricity-filter"><input type="checkbox" value="${id}" checked><span style="border-left:4px solid ${color}"><b>${label}</b><small>${desc}</small></span></label>`).join('');
    box.addEventListener('change',e=>{if(!categories.some(c=>c[0]===e.target.value))return;e.target.checked?selected.add(e.target.value):selected.delete(e.target.value);paint();});
    document.getElementById('electricity-stage')?.addEventListener('change',e=>{phase=e.target.value;paint();});
    document.getElementById('electricity-list').addEventListener('click',e=>{const key=e.target.dataset?.more;if(!categories.some(c=>c[0]===key))return;limits[key]+=50;paint();const details=document.querySelector(`#electricity-list [data-category="${key}"]`);if(details){details.open=true;details.querySelector('summary').focus();}});
    document.getElementById('electricity-toggle').addEventListener('change',e=>{enabled=e.target.checked;revision++;if(enabled)return loadRegion();loading=false;paint();});
  }
  root.GridElectricity={mount,init,records,detail,categories,searchBounds,overlaps,nearDistance,validRecord};
})(typeof window==='undefined'?globalThis:window);
