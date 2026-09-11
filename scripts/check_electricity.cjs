/* Behaviour checks for regional loading and evidence boundaries. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function main(){
 const els=new Map();for(const id of ['electricity-status','electricity-list','electricity-filters','electricity-toggle','electricity-stage'])els.set(id,{innerHTML:'',addEventListener(n,f){this[n]=f;}});
 const rendered=[];let original=true,calls=[],fail=false,release;
 const group={addTo(){return this;},clearLayers(){rendered.length=0;}};
 const layer=()=>({bindPopup(html){this.html=html;return this;},addTo(){rendered.push(this.html);return this;}});
 const record=(id,category,stage='unknown')=>({id,name:id,category,type:category,stage,status:stage,lat:51,lng:1,source:'https://example.org/source'});
 const payloads={'electricity/kent.json':[record('solar','generate','operational'),record('battery','store','proposed'),{...record('crossing route','transmit'),lat:55,lng:1,geometry:[[50,1],[60,1]]}]};
 const context={URL,console,Date,document:{getElementById:id=>els.get(id)},L:{layerGroup:()=>group,circleMarker:layer,polyline:layer},fetch:async path=>{calls.push(path);if(path==='electricity/slow.json')await new Promise(r=>release=r);if(fail)throw Error('offline');return {ok:true,json:async()=>({items:payloads[path]||[]})};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('electricity.js','utf8'),context);
 const E=context.GridElectricity;E.init();
 const shard=(path,bounds,count)=>({path:'electricity/'+path+'.json',bounds,count});
 const input={map:{removeLayer(){original=false;}},markers:{addTo(){original=true;}},data:{electricity:{schema_version:2,items:[],shards:[shard('kent',[50,0,60,2],3),shard('scotland',[56,-5,58,-3],0)]},grid:{},osm:{},failures:[]},loc:{lat:51,lng:1},c:[],o:[],g:[record('junction','connect')],distance:(a,b,c,d)=>Math.hypot(a-c,b-d)*111};
 await E.mount(input);assert(original);assert.equal(calls.length,0);
 const toggle=value=>els.get('electricity-toggle').change({target:{checked:value}});
 await toggle(true);assert(!original);assert.equal(calls.length,1);assert.equal(rendered.length,5);assert(rendered.some(s=>s.includes('crossing route')));
 els.get('electricity-stage').change({target:{value:'proposed'}});assert.equal(rendered.length,2);assert(rendered.some(s=>s.includes('battery')));
 els.get('electricity-stage').change({target:{value:'all'}});
 els.get('electricity-filters').change({target:{value:'transmit',checked:false}});assert(!rendered.some(s=>s.includes('TRANSMIT')));
 await toggle(false);assert(original);assert.equal(rendered.length,0);
 await toggle(true);assert.equal(calls.length,1,'completed shards are cached');
 els.get('electricity-filters').change({target:{value:'transmit',checked:true}});
 const regional=path=>({...input,data:{...input.data,electricity:{schema_version:2,items:[],shards:[shard(path,[50,0,52,2],0)]}}});
 const pending=E.mount(regional('slow'));await E.mount({...input,loc:{lat:57,lng:-4},g:[]});release();await pending;assert(!rendered.some(s=>s.includes('solar')),'old search cannot overwrite new results');
 fail=true;await E.mount(regional('retry'));assert(els.get('electricity-status').textContent.includes('unavailable'));
 fail=false;await toggle(false);await toggle(true);assert(!els.get('electricity-status').textContent.includes('unavailable'));
 await E.mount({...input,map:null,markers:null});assert(els.get('electricity-list').innerHTML.includes('solar'),'list works without map');
 assert(!E.detail({name:'<script>',category:'consume',source:'javascript:alert(1)'}).includes('<script>'));
 assert(!E.detail({name:'x',category:'consume',source:'javascript:alert(1)'}).includes('href='));
 assert(!E.validRecord({category:'generate',lat:NaN,lng:1}));
 assert(E.nearDistance(payloads['electricity/kent.json'][2],input.loc,input.distance)<0.001);
 console.log('Electricity checks passed: regional loading, cache, filters, crossing routes, search races, retries, map restoration and safe source links.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

