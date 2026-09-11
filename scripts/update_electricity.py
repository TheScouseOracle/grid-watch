#!/usr/bin/env python3
"""Collect national REPD projects and OSM nuclear/high-voltage routes atomically.

The public manifest references immutable, content-addressed regional files.
Failed downloads never replace the last complete published snapshot.
"""
import csv
import hashlib
import io
import json
import math
import re
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPD_PAGE = 'https://www.gov.uk/government/publications/renewable-energy-planning-database-quarterly-extract'
REPD_LICENCE = 'https://www.data.gov.uk/dataset/a5b0ed13-c960-49ce-b1f6-3a6bbe0db1b7/repd'
NATIONS = {'England':'GB-ENG','Scotland':'GB-SCT','Wales':'GB-WLS','Northern Ireland':'GB-NIR'}
ENDPOINTS = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']

def download(url, data=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent':'GridWatch-TheScouseOracle/3.0 (open-data public-interest mapping)'})
    with urllib.request.urlopen(req, timeout=260) as response:
        return response.read()

def clean(value):
    s = str(value or '').strip()
    return '' if s.lower() in ('not set','n/a','null','none') else s

def stage(status):
    s=status.lower()
    if 'decommission' in s or 'disused' in s or 'demolished' in s or 'closed' in s: return 'closed'
    if any(v in s for v in ['refused','withdrawn','abandoned','expired','revised']): return 'inactive'
    if 'operational' in s: return 'operational'
    if 'construction' in s and 'awaiting' not in s: return 'construction'
    if any(v in s for v in ['planning','application','consent','awaiting','proposed','appeal']): return 'proposed'
    return 'unknown'

def repd_records(raw, csv_url, checked):
    from pyproj import Transformer
    # REPD supplies British National Grid eastings/northings, including NI.
    transform=Transformer.from_crs('EPSG:27700','EPSG:4326',always_xy=True)
    try: decoded=raw.decode('utf-8-sig',errors='strict')
    except UnicodeDecodeError: decoded=raw.decode('cp1252',errors='strict')
    reader=csv.DictReader(io.StringIO(decoded))
    required={'Ref ID','Site Name','Technology Type','Development Status','Country','X-coordinate','Y-coordinate'}
    if not required.issubset(reader.fieldnames or []): raise ValueError('REPD columns changed')
    rows=[]; omitted=Counter(); seen=set()
    for r in reader:
        technology=clean(r['Technology Type']); storage=clean(r.get('Storage Type'))
        if 'solar' in technology.lower() or 'wind' in technology.lower(): category='generate'
        elif 'battery' in (technology+' '+storage).lower(): category='store'
        else: continue
        nation=clean(r['Country'])
        if nation not in NATIONS: omitted['unrecognised_country']+=1; continue
        try:
            east,north=float(r['X-coordinate']),float(r['Y-coordinate'])
            if not math.isfinite(east+north) or east==0 or north==0: raise ValueError()
            lng,lat=transform.transform(east,north)
            if not (49<=lat<=62 and -9<=lng<=4): raise ValueError()
            if nation=='Northern Ireland' and not (53.9<=lat<=55.5 and -8.3<=lng<=-5.3): raise ValueError()
        except (ValueError,TypeError): omitted['invalid_coordinates_'+nation]+=1; continue
        ident='repd-'+clean(r['Ref ID'])
        if ident=='repd-' or ident in seen: raise ValueError('Missing/duplicate REPD reference '+ident)
        seen.add(ident)
        status=clean(r['Development Status']) or 'Not recorded'
        row=dict(id=ident,name=clean(r['Site Name']) or 'Unnamed REPD project',category=category,type=technology+((' / '+storage) if storage else ''),lat=round(lat,6),lng=round(lng,6),nation=nation,status=status,stage=stage(status),source=REPD_PAGE,download=csv_url,source_id='repd',source_ref=clean(r['Ref ID']),source_updated=clean(r.get('Record Last Updated (dd/mm/yyyy)')),licence='Open Government Licence v3.0 — © Crown copyright',licence_url=REPD_LICENCE,checked=checked,basis='DESNZ planning-database record. Status is as reported in the extract, not independent verification. No supply relationship to a data centre is established.',location_note='Approximate database point converted from British National Grid, not a site boundary.',operator=clean(r.get('Operator (or Applicant)')),planning_reference=clean(r.get('Planning Application Reference')))
        capacity=clean(r.get('Installed Capacity (MWelec)'))
        if capacity: row['capacity_note']='REPD capacity field: '+capacity+' MW. Interpret alongside project status; not measured output, demand or battery energy (MWh).'
        rows.append(row)
    counts=Counter(r['nation'] for r in rows)
    if any(counts[n]<10 for n in NATIONS): raise ValueError('REPD national coverage incomplete: '+str(counts))
    return rows,dict(omitted)

def fetch_osm(nation, code):
    query=f'''[out:json][timeout:220];area["ISO3166-2"="{code}"]->.region;
    (nwr["plant:source"="nuclear"](area.region);nwr["disused:plant:source"="nuclear"](area.region););out center tags;
    (way["power"~"^(line|cable)$"]["voltage"~"(^|;)(110000|132000|220000|275000|400000)(;|$)"](area.region);
    way["construction:power"~"^(line|cable)$"]["voltage"](area.region);way["proposed:power"~"^(line|cable)$"]["voltage"](area.region););out geom;'''
    last=None
    for attempt in range(4):
        endpoint=ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            raw=json.loads(download(endpoint,urllib.parse.urlencode({'data':query}).encode()))
            if raw.get('remark') or not raw.get('elements'): raise ValueError('Empty or partial Overpass response')
            return raw
        except Exception as exc:
            last=exc; print('Retrying',nation,str(exc),flush=True); time.sleep(30*(attempt+1))
    raise RuntimeError(f'{nation}: {last}')

def osm_records(raw,nation,checked):
    rows=[]
    for e in raw['elements']:
        t=e.get('tags',{}); geometry=e.get('geometry',[])
        nuclear=t.get('plant:source',t.get('disused:plant:source'))=='nuclear'
        if nuclear:
            centre=e.get('center',e); lat,lng=centre.get('lat'),centre.get('lon')
        elif len(geometry)>1:
            lat=sum(p['lat'] for p in geometry)/len(geometry);lng=sum(p['lon'] for p in geometry)/len(geometry)
        else: continue
        if lat is None or lng is None: continue
        status='Community-mapped; operating status not independently verified'; phase='unknown'
        for prefix,label,st in [('decommissioned:','Mapped decommissioned','closed'),('demolished:','Mapped demolished','closed'),('disused:','Mapped disused','closed'),('abandoned:','Mapped abandoned','inactive'),('construction:','Mapped under construction','construction'),('proposed:','Mapped proposal','proposed')]:
            if any(k in t for k in (prefix+'power',prefix+'plant:source')): status,phase=label,st;break
        if t.get('power') in ('construction','proposed'): phase=t['power'];status='Mapped '+phase
        row=dict(id=f"osm-{e['type']}-{e['id']}",name=t.get('name') or ('Nuclear site' if nuclear else 'High-voltage route segment'),category='generate' if nuclear else 'transmit',type='Nuclear' if nuclear else 'High-voltage '+t.get('power','route')+' segment',lat=round(lat,6),lng=round(lng,6),nation=nation,status=status,stage=phase,source=f"https://www.openstreetmap.org/{e['type']}/{e['id']}",source_id='osm',licence='ODbL 1.0 — © OpenStreetMap contributors',licence_url='https://www.openstreetmap.org/copyright',checked=checked,basis='OpenStreetMap tags and geometry. No named consumer or supply relationship is inferred. High-voltage routes can include distribution infrastructure.',location_note='Approximate mapped centre; not a surveyed site boundary.' if nuclear else 'Mapped route geometry; individual segments are not separate projects.')
        if not nuclear: row['geometry']=[[round(p['lat'],6),round(p['lon'],6)] for p in geometry];row['voltage']=t.get('voltage','Not mapped')
        rows.append(row)
    if not any(r['category']=='transmit' for r in rows): raise ValueError('No routes returned for '+nation)
    return rows

def bounds(row):
    points=row.get('geometry',[[row['lat'],row['lng']]])
    return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]

def publish(rows,metadata):
    groups=defaultdict(list)
    for row in rows: groups[(math.floor(row['lat']),math.floor(row['lng']))].append(row)
    directory=ROOT/'electricity';directory.mkdir(exist_ok=True)
    shards=[]
    for tile,items in sorted(groups.items()):
        items.sort(key=lambda r:r['id'])
        content=json.dumps({'items':items},ensure_ascii=False,separators=(',',':'))+'\n'
        digest=hashlib.sha256(content.encode()).hexdigest()[:16]
        path=f'electricity/{tile[0]}_{tile[1]}_{digest}.json'
        (ROOT/path).write_text(content,encoding='utf-8')
        bb=[bounds(r) for r in items]
        shards.append(dict(path=path,count=len(items),bounds=[min(b[0] for b in bb),min(b[1] for b in bb),max(b[2] for b in bb),max(b[3] for b in bb)]))
    manifest=dict(schema_version=2,items=[],shards=shards,count=len(rows),licence='Mixed attributed OGL and ODbL records',coverage='United Kingdom',country_counts=dict(Counter(r['nation'] for r in rows)),category_counts=dict(Counter(r['category'] for r in rows)),**metadata)
    temp=ROOT/'electricity.tmp.json';temp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temp.replace(ROOT/'electricity.json')
    keep={s['path'] for s in shards}
    for old in directory.glob('*.json'):
        if old.relative_to(ROOT).as_posix() not in keep: old.unlink()
    print(json.dumps({k:manifest[k] for k in ['count','country_counts','category_counts']},indent=2),flush=True)

def main():
    checked=datetime.now(timezone.utc).date().isoformat()
    page=download(REPD_PAGE).decode()
    links=re.findall(r'https://assets\.publishing\.service\.gov\.uk/[^"<>\s]+\.csv',page)
    if not links: raise ValueError('Official REPD CSV link not found')
    csv_url=links[0]
    rows,omitted=repd_records(download(csv_url),csv_url,checked)
    print('REPD:',len(rows),'mapped records; omissions:',omitted,flush=True)
    seen={r['id'] for r in rows};snapshots={}
    for nation,code in NATIONS.items():
        time.sleep(20) # Respect public Overpass capacity between country queries.
        print('Collecting routes and nuclear sites:',nation,flush=True)
        raw=fetch_osm(nation,code);snapshots[nation]=raw.get('osm3s',{}).get('timestamp_osm_base')
        for row in osm_records(raw,nation,checked):
            if row['id'] not in seen: rows.append(row);seen.add(row['id'])
    context=json.loads((ROOT/'sources/electricity-context.json').read_text())
    for row in context['items']:
        rows.append(row)
    if len(rows)<2000: raise ValueError('Suspiciously small nationwide dataset')
    publish(rows,dict(generated_at=datetime.now(timezone.utc).isoformat(),repd_download=csv_url,osm_snapshots=snapshots,omitted=omitted,coverage_note='UK REPD solar, wind and battery records, OSM nuclear sites and high-voltage route segments. Records are not unique projects. Offshore routes and unreported projects may be missing.'))

if __name__=='__main__': main()
