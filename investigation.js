/* Site evidence is joined by exact record key, never by name or proximity. */
(function(root){
  'use strict';
  const SECTIONS = [
    {id:'power', icon:'⚡', title:'Power', prompt:'How much power? What connection is evidenced?', fields:[['capacity','Power figure and stage'],['connection','Grid connection'],['consumption','Actual electricity use']]},
    {id:'water', icon:'💧', title:'Water', prompt:'Who supplies it? What does the site require?', fields:[['supplier','Site water supplier'],['region','Water-resource region'],['requirement','Water requirement'],['cooling','Cooling method'],['confirmation','Water-company confirmation'],['abstraction','Abstraction licence'],['discharge','Wastewater / discharge'],['planning','Planning documents mentioning water']]},
    {id:'money', icon:'💷', title:'Money / Public Support', prompt:'What public support is linked to this project?', fields:[['finance','Public funding awarded'],['energy','Electricity-price support'],['zone','AI Growth Zone link'],['tax','Tax-site eligibility'],['relief','Tax relief received'],['investment','Announced investment']]},
    {id:'planning', icon:'🏗️', title:'Planning', prompt:'What was applied for? What was decided?', fields:[['application','Linked planning application'],['decision','Planning decision'],['commitments','Local commitments']]},
    {id:'ownership', icon:'🔗', title:'Ownership', prompt:'Who operates it? What ownership links are recorded?', fields:[['operator','Recorded operator'],['owner','Recorded owner'],['chain','Open parent-organisation links'],['ultimate','Verified ultimate owner']]}
  ];
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = value => {try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  const openLicence = value => /^(ODbL|Open Government Licence|CC0)\b/.test(value||'');
  const link = (url,label) => safeURL(url)?`<a href="${escape(safeURL(url))}" target="_blank" rel="noreferrer noopener">${escape(label)} ↗</a>`:'';
  const key = (kind,site) => `${kind}:${site.id || site.source}`;
  const href = (kind,site) => `#site=${encodeURIComponent(key(kind,site))}`;
  const date = value => value ? String(value).slice(0,10) : 'Not recorded';
  function validEvidence(e, registry){
    const source=(registry?.sources||[]).find(s=>s.id===e.source_id&&s.enabled);
    return !!(source&&openLicence(source.licence)&&openLicence(e.licence)&&safeURL(e.source)&&
      safeURL(e.licence_url)&&e.value&&e.basis&&/^\d{4}-\d{2}-\d{2}$/.test(e.checked||'')&&e.scope==='site');
  }
  function model(kind,site,data={}){
    const sections=SECTIONS.map(s=>({...s,fields:s.fields.map(([id,label])=>({id,label,evidence:[]}))}));
    const add=(section,field,e)=>sections.find(s=>s.id===section).fields.find(f=>f.id===field).evidence.push(e);
    const licence=site.licence || (kind==='osm'?data.osm?.licence:null);
    const mapped=(value,basis)=>({value,basis,source:site.source,licence,checked:site.last_verified||null});
    if(safeURL(site.source)&&openLicence(licence)){
      if(site.operator)add('ownership','operator',mapped(site.operator,kind==='osm'?'Operator tag in OpenStreetMap; community mapping may be incomplete.':'Operator recorded in the open-evidence register.'));
      if(site.owner)add('ownership','owner',mapped(site.owner,kind==='osm'?'Owner tag in OpenStreetMap; this is not legal verification.':'Owner recorded in the open-evidence register.'));
      if(kind==='curated'){
        if(site.power_mw!=null||site.est_mw!=null)add('power','capacity',mapped(`${site.power_mw??site.est_mw} MW · ${site.power_status||(site.est_mw!=null?'Estimated':'Stage not established')}`,site.power_basis||'Figure in the register; capacity is not actual electricity consumption.'));
        if(site.planning_ref)add('planning','application',mapped(site.planning_ref,'Reference recorded against this site; no decision is inferred.'));
        if(site.investment_gbp!=null)add('money','investment',mapped(`£${Number(site.investment_gbp).toLocaleString('en-GB')}`,'Announced investment in the register. This is not evidence of public funding.'));
      }
    }
    const own=(data.ownership?.items||[]).find(o=>o.site_id===site.id);
    if(kind==='osm'&&own&&['operator','owner','brand'].includes(own.source_role)&&
      site[`${own.source_role}_wikidata`]===own.source_qid&&own.chain?.[0]?.qid===own.source_qid&&openLicence(own.licence)){
      const chain=own.chain.filter(c=>c.name&&safeURL(c.source));
      if(chain.length)add('ownership','chain',{value:chain.map(c=>c.name).join(' → '),source:chain[0].source,links:chain,licence:own.licence,
        basis:`Linked from the mapped ${own.source_role} identifier. Wikidata parent links may be incomplete; the last organisation shown is not a verified ultimate owner.`,checked:null});
    }
    for(const e of data.investigations?.items||[]){
      if(e.site_key!==key(kind,site)||!validEvidence(e,data.registry))continue;
      if(sections.some(s=>s.id===e.section&&s.fields.some(f=>f.id===e.field)))add(e.section,e.field,e);
    }
    const count=sections.filter(s=>s.fields.some(f=>f.evidence.length)).length;
    return {key:key(kind,site),site,kind,sections,count};
  }
  function evidenceHTML(e){
    return `<div class="evidence-value"><p>${escape(e.value)}</p><p class="evidence-note">${escape(e.basis)}</p><p class="evidence-source">${e.links?e.links.map(c=>link(c.source,c.name)).join(' · '):link(e.source,'Open evidence')} · ${escape(e.licence)}${e.checked?` · Evidence checked: ${escape(date(e.checked))}`:''}</p></div>`;
  }
  function contextsHTML(items){
    return items.filter(c=>safeURL(c.source)).map(c=>`<article class="context-record"><h4>${escape(c.title)}</h4><p class="evidence-note">${escape(c.scope)}</p><p>${escape(c.summary)}</p>${c.claim_limit?`<p class="evidence-note">${escape(c.claim_limit)}</p>`:''}<p class="evidence-source">${link(c.source,c.source_label||'Official source')}${c.licence?` · ${escape(c.licence)}`:''}${c.checked?` · Source checked: ${escape(c.checked)}`:''}</p></article>`).join('');
  }
  function render(m,data){
    const x=m.site;
    const context={
      water:`<div class="context-separator"><h3>Wider water evidence</h3><p>General reading with its own geographical scope. No water-region or supplier match has been established for this site.</p>${contextsHTML(data.investigations?.water_context||[])}${data.failures?.includes('investigations')?'<p>Water context could not be loaded. Try reloading the page.</p>':''}</div>`,
      money:`<details class="context-separator"><summary>Explore general support policies</summary><p>These are programme and regional announcements, not evidence that this site is eligible or received support. A tax-site boundary match would establish location only; receipt of relief needs separate evidence.</p>${contextsHTML((data.incentives?.items||[]).map(c=>({...c,licence:data.incentives.licence})))}</details>`,
      power:'<p class="section-limit">Nearby substations are shown on the results map as geographic context. Distance does not establish a connection. Requested, contracted, connected and estimated power figures are different from actual use.</p>',
      planning:'<p class="section-limit">Nearby planning candidates remain on the results page. Grid Watch does not attach them by distance or a similar name. A planning application does not prove approval, construction or operation. Open planning coverage is incomplete, with declared access and national coverage gaps.</p>',
      ownership:`<p class="section-limit">© OpenStreetMap contributors · ODbL. Wikidata enrichment · CC0, joined only through an explicit mapped organisation identifier.${data.ownership?.generated_at?` Ownership dataset refreshed: ${escape(date(data.ownership.generated_at))}.`:''}</p>`
    };
    const failures=data.failures||[];
    return `<header class="investigation-header"><p class="kicker">Site investigation · ${m.kind==='osm'?'OpenStreetMap record':'Open-evidence register'}</p><h1 id="site-heading" tabindex="-1">${escape(x.name||'Data centre')}</h1><p>${escape([x.area||x.city,x.postcode].filter(Boolean).join(' · ')||'Location recorded on the map')} · ${escape(x.status||'Status not recorded')}</p><p class="evidence-source">${link(x.source,'Original site record')} · ${escape(x.licence||data.osm?.licence||'Licence not recorded')}</p>${m.kind==='osm'?'<p class="evidence-note">A mapped site is a starting point. Its mapping status does not verify that it is operating.</p>':''}</header>
      <div class="evidence-profile"><b>Evidence profile: ${m.count} of 5 areas have site-linked evidence</b><p>Availability in Grid Watch’s loaded records only. This is not a risk, safety or impact rating. General policy and regional context do not count.</p>${failures.length?'<p role="status">Some evidence files could not be loaded. This profile may be incomplete; reload to try again.</p>':''}</div>
      <h2 class="investigation-question">What do you want to investigate?</h2>
      <div class="investigation-sections">${m.sections.map(s=>`<details class="investigation-section"><summary><span><span class="section-title"><span aria-hidden="true">${s.icon}</span> ${escape(s.title)}</span><span class="section-prompt">${escape(s.prompt)}</span><span class="section-availability">${s.fields.some(f=>f.evidence.length)?'Site-linked evidence available':'Site evidence not yet available'}</span></span></summary><div class="section-body">${s.id==='water'?'<h3>Follow the water</h3>':''}<dl class="evidence-fields">${s.fields.map(f=>`<div><dt>${escape(f.label)}</dt><dd>${f.evidence.length?f.evidence.map(evidenceHTML).join(''):`<span class="missing">${failures.includes('investigations')||(s.id==='ownership'&&failures.includes('ownership'))?'Evidence unavailable — data could not be loaded':'No open evidence found'}</span>`}</dd></div>`).join('')}</dl>${context[s.id]||''}</div></details>`).join('')}</div>
      <details class="disc"><summary>What does “No open evidence found” mean?</summary><div class="body"><p>No suitable site-linked evidence is recorded for that field in Grid Watch’s loaded open datasets. This is not an exhaustive search of every public record. It does not mean the site uses no water or power, has no permission, or received no support.</p><p>Dataset refresh dates describe collection, not a new investigation of this site. Evidence checks are dated individually where recorded.</p><p>Site dataset refreshed: ${escape(date((m.kind==='osm'?data.osm:data.curated)?.generated_at))}. Last site evidence review: ${escape(date(x.last_verified))}.</p></div></details>`;
  }
  const api={SECTIONS,escape,safeURL,openLicence,key,href,validEvidence,model,render};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GridInvestigation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
