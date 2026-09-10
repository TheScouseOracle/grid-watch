/* Dependency-free checks for the static Pages bundle and evidence boundaries. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const I=require('../investigation.js');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const json=f=>JSON.parse(read(f));
const data={osm:json('datacentres-osm.json'),curated:json('datacentres.json'),ownership:json('ownership.json'),investigations:json('investigations.json'),registry:json('sources/open-data-sources.json'),incentives:json('incentives.json'),failures:[]};
const records=[...data.osm.items.map(s=>['osm',s]),...data.curated.datacentres.map(s=>['curated',s])];
const keys=new Set();
for(const [kind,s] of records){
  assert(s.id||I.safeURL(s.source),'A site needs a stable ID or source URL');
  const key=I.key(kind,s);assert(!keys.has(key),`Duplicate route: ${key}`);keys.add(key);
  const m=I.model(kind,s,data);assert.equal(m.sections.length,5);
  assert(m.count>=0&&m.count<=5);
  assert.equal(decodeURIComponent(I.href(kind,s).slice(6)),key);
  assert(I.render(m,data).includes('not a risk, safety or impact rating'));
}
assert.equal(data.investigations.schema_version,1);
const dates=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!isNaN(Date.parse(value));
const evidenceIds=new Set();
for(const e of data.investigations.items){
  assert(e.id&&!evidenceIds.has(e.id),'Evidence IDs must be unique');evidenceIds.add(e.id);
  assert(keys.has(e.site_key),`Unknown site: ${e.site_key}`);
  assert(I.validEvidence(e,data.registry),`Invalid evidence: ${e.id}`);
  assert(dates(e.checked));
  assert(I.SECTIONS.some(s=>s.id===e.section&&s.fields.some(([id])=>id===e.field)),'Unknown evidence field');
}
for(const c of data.investigations.water_context){
  assert(c.scope&&c.claim_limit&&c.summary&&c.title&&dates(c.checked));
  assert(I.safeURL(c.source)&&I.safeURL(c.licence_url)&&I.openLicence(c.licence));
  assert(data.registry.sources.some(s=>s.id===c.source_id&&s.enabled&&I.openLicence(s.licence)));
}
const bare={id:'test',name:'Test site',lat:51,lng:0,source:'https://www.openstreetmap.org/node/1',licence:'ODbL 1.0'};
let m=I.model('osm',bare,data);
assert.equal(m.count,0,'General water/policy evidence must not increase the profile');
assert(m.sections.every(s=>s.fields.every(f=>!f.evidence.length)),'Nearby records must never be attached');
const full={...bare,operator:'Mapped operator',operator_wikidata:'Q1'};
const linked={...data,ownership:{items:[{site_id:'test',source_role:'operator',source_qid:'Q2',licence:'CC0',chain:[{qid:'Q2',name:'Wrong identity',source:'https://www.wikidata.org/wiki/Q2'}]}]}};
assert.equal(I.model('osm',full,linked).sections[4].fields[2].evidence.length,0,'Mismatched explicit identifiers must not link ownership');
linked.ownership.items[0].source_qid='Q1';linked.ownership.items[0].chain[0].qid='Q1';
assert.equal(I.model('osm',full,linked).sections[4].fields[2].evidence.length,1);
assert.equal(I.model('osm',full,linked).sections[4].fields[3].evidence.length,0,'A partial chain does not verify ultimate ownership');
const evidence={id:'fixture',site_key:'osm:test',section:'water',field:'requirement',value:'100 litres/day — proposed',scope:'site',basis:'Fixture explicitly identifies this record and proposed demand.',source_id:'ea-water-framework',source:'https://www.gov.uk/example',licence:'Open Government Licence v3.0',licence_url:'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',checked:'2026-09-10'};
const enriched={...data,investigations:{...data.investigations,items:[evidence]}};
assert.equal(I.model('osm',bare,enriched).count,1,'Explicit site evidence should deepen a section');
for(const bad of [{site_key:'osm:other'},{scope:'regional'},{source:'javascript:alert(1)'},{licence:'Proprietary'},{source_id:'unknown'},{checked:null},{basis:''}]){
  assert.equal(I.model('osm',bare,{...enriched,investigations:{items:[{...evidence,...bad}]}}).count,0);
}
const html=I.render(I.model('osm',{...bare,name:'<img src=x onerror=alert(1)>'},data),data);
assert(!html.includes('<img'));
assert(html.includes('&lt;img'));
assert(!html.includes('<details open'));
assert(html.includes('No open evidence found'));
const failed=I.render(m,{...data,failures:['investigations','ownership']});
assert(failed.includes('Evidence unavailable — data could not be loaded'));
assert(failed.includes('profile may be incomplete'));
const index=read('index.html');
const ids=[...index.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate HTML IDs');
for(const [,asset] of index.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(!/^[a-z]+:/i.test(asset))assert(fs.existsSync(path.join(root,asset)),`Missing asset ${asset}`);
}
assert(index.indexOf('src="investigation.js"')<index.indexOf('src="app.js"'));
new vm.Script(read('app.js'));new vm.Script(read('investigation.js'));
console.log(`Frontend checks passed: ${records.length} site routes, evidence guardrails, safe rendering and static assets.`);
