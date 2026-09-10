/* Exercise the real browser client in a small DOM harness, without network calls. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const wait=()=>new Promise(r=>setTimeout(r,30));
function app({hash='',fail=[],leaflet=true}={}){
  const elements=new Map(),events={},docEvents={},popups=[];
  class Element{
    constructor(id){this.id=id;this.textContent='';this.innerHTML='';this.value='';this.disabled=false;this.events={};this.isConnected=true;const classes=new Set(['results','investigation','msg'].includes(id)?['hidden']:[]);this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,v)=>{if(v)classes.add(c);else classes.delete(c);}};}
    addEventListener(name,fn){this.events[name]=fn;}
    focus(){context.document.activeElement=this;}
  }
  for(const [,id] of read('index.html').matchAll(/\bid="([^"]+)"/g))elements.set(id,new Element(id));
  elements.set('site-heading',new Element('site-heading'));
  const location={get hash(){return hash;},set hash(value){const next=value.startsWith('#')?value:'#'+value;if(next!==hash){hash=next;queueMicrotask(()=>events.hashchange?.());}}};
  const context={console,URL,Map,Set,Promise,encodeURIComponent,decodeURIComponent,location,navigator:{},setTimeout,clearTimeout,
    document:{getElementById:id=>elements.get(id),querySelectorAll:()=>[],addEventListener:(name,fn)=>docEvents[name]=fn},
    fetch:async url=>{
      await new Promise(r=>setTimeout(r,5));
      if(url.startsWith('https://api.postcodes.io'))return {json:async()=>url.endsWith('BAD')?{status:404}:{status:200,result:{latitude:51.51,longitude:-0.59,admin_district:'Slough',country:'England',region:'South East'}}};
      if(fail.includes(url))return {ok:false,status:503};
      return {ok:true,json:async()=>JSON.parse(read(url))};
    }};
  context.window=context;context.scrollY=0;context.scrollTo=(x,y)=>context.scrollY=y;context.addEventListener=(name,fn)=>events[name]=fn;
  if(leaflet){const chain={setView(){return this;},addTo(){return this;},bindPopup(html){popups.push(html);return this;},clearLayers(){popups.length=0;},fitBounds(){},invalidateSize(){}};context.L={map:()=>chain,tileLayer:()=>chain,layerGroup:()=>chain,circleMarker:()=>Object.create(chain)};}
  vm.createContext(context);vm.runInContext(read('investigation.js'),context);vm.runInContext(read('app.js'),context);
  return {context,elements,popups,events,docEvents,run:pc=>vm.runInContext(`run(${JSON.stringify(pc)})`,context),ready:()=>vm.runInContext('DATA_READY',context)};
}
(async()=>{
  const a=app();
  await a.run('SL1 1XW');await wait(); // Search immediately, before the datasets resolve.
  assert(a.elements.get('home').classList.contains('hidden'));
  assert(!a.elements.get('results').classList.contains('hidden'));
  assert(a.elements.get('r-osm').innerHTML.includes('Investigate this site'));
  assert(a.popups.some(p=>p.includes('Investigate this site')),'Map data-centre popups must link to investigations');
  const results=a.elements.get('r-osm').innerHTML;
  const target=results.match(/href="(#site=[^"]+)"/)[1];
  const focus={isConnected:true,focus(){a.context.document.activeElement=this;}};
  a.context.scrollY=750;a.docEvents.click({target:{closest:()=>focus}});a.context.location.hash=target;await wait();
  assert(!a.elements.get('investigation').classList.contains('hidden'));
  assert(a.elements.get('results').classList.contains('hidden'));
  assert.equal((a.elements.get('site-content').innerHTML.match(/class="investigation-section"/g)||[]).length,5);
  assert.equal(a.context.document.activeElement.id,'site-heading');
  a.elements.get('investigation-back').events.click();await wait();
  assert.equal(a.context.location.hash,'#results');assert.equal(a.context.scrollY,750);
  assert.equal(a.context.document.activeElement,focus);assert.equal(a.elements.get('r-osm').innerHTML,results);
  a.context.location.hash=target;await wait(); // Browser forward/back restores the same data.
  a.context.location.hash='#results';await wait();assert.equal(a.context.scrollY,750);
  a.elements.get('back-home').events.click();await wait();assert(!a.elements.get('home').classList.contains('hidden'));
  await a.run('BAD');assert(a.elements.get('msg').textContent.includes("didn't resolve"));assert(!a.elements.get('go').disabled);
  const direct=app({hash:target,leaflet:false});await direct.ready();await wait();
  assert(direct.elements.get('site-content').innerHTML.includes('Evidence profile'));
  assert.equal(direct.elements.get('investigation-back').textContent,'← Search a postcode');
  direct.elements.get('investigation-back').events.click();await wait();assert(!direct.elements.get('home').classList.contains('hidden'));
  direct.context.location.hash='#site=%E0%A4%A';await wait();assert(direct.elements.get('site-content').innerHTML.includes('Site record unavailable'));
  const failed=app({hash:target,fail:['investigations.json','ownership.json']});await failed.ready();await wait();
  assert(failed.elements.get('site-content').innerHTML.includes('Evidence unavailable — data could not be loaded'));
  const missing=app({hash:target,fail:['datacentres-osm.json']});await missing.ready();await wait();
  assert(missing.elements.get('site-content').innerHTML.includes('Site record unavailable'));
  console.log('Navigation checks passed: initial loading, search, map links, return/focus/scroll, direct links, invalid links and failed downloads.');
})().catch(e=>{console.error(e);process.exitCode=1;});
