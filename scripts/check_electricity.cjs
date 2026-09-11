const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=JSON.parse(fs.readFileSync('electricity.json','utf8'));
if(data.schema_version===2)data.items=data.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.path,'utf8')).items);
const ids=new Set();
for(const x of data.items){
 assert(!ids.has(x.id));ids.add(x.id);
 assert(['generate','store','transmit'].includes(x.category));
 assert(Number.isFinite(x.lat)&&Number.isFinite(x.lng));
 assert(x.source.startsWith('https://')&&x.licence_url.startsWith('https://'));
 assert(x.checked&&x.basis&&x.status&&x.location_note);
 if(x.geometry)assert(x.geometry.every(p=>p.length===2&&p.every(Number.isFinite)));
}
assert(data.items.some(x=>x.category==='store'));
assert(data.items.some(x=>/wind/i.test(x.type)));
assert(data.items.some(x=>/solar/i.test(x.type)));
assert(data.items.find(x=>x.id==='dungeness-b-historical').status.includes('ended'));
const els=new Map();for(const id of ['electricity-status','electricity-list','electricity-filters','electricity-toggle'])els.set(id,{innerHTML:'',addEventListener(n,f){this[n]=f;}});
const rendered=[];let original=true;
const group={addTo(){return this;},clearLayers(){rendered.length=0;}};
const layer=()=>({bindPopup(html){this.html=html;return this;},addTo(){rendered.push(this.html);return this;}});
const ctx={URL,console,document:{getElementById:id=>els.get(id)},L:{layerGroup:()=>group,circleMarker:layer,polyline:layer}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('electricity.js','utf8'),ctx);
const E=ctx.GridElectricity;E.init();
const input={map:{removeLayer(){original=false;}},markers:{addTo(){original=true;}},data:{electricity:data,grid:{},osm:{},failures:[]},loc:{lat:51,lng:1},c:[],o:[],g:[],distance:()=>1};
E.mount(input);assert(original);assert.equal(rendered.length,0);
els.get('electricity-toggle').change({target:{checked:true}});assert(!original);assert.equal(rendered.length,data.items.length+1);
els.get('electricity-filters').change({target:{value:'transmit',checked:false}});assert(!rendered.some(s=>s.includes('TRANSMIT')));
els.get('electricity-toggle').change({target:{checked:false}});assert(original);assert.equal(rendered.length,0);
input.data.failures=['electricity'];input.data.electricity={};E.mount(input);els.get('electricity-toggle').change({target:{checked:true}});assert(els.get('electricity-status').textContent.includes('unavailable'));
assert(!E.detail({name:'<script>',category:'consume',source:'javascript:alert(1)'}).includes('<script>'));
assert(!E.detail({name:'x',category:'consume',source:'javascript:alert(1)'}).includes('href='));
console.log('Electricity checks passed: source fields, five roles, layer isolation, filters, original-map restoration, failed downloads and safe popups.');

