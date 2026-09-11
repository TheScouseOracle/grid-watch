"""Validate manifests, regional records, provenance and nationwide coverage."""
import json
import math
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def validate():
    manifest=json.loads((ROOT/'electricity.json').read_text(encoding='utf-8'))
    if manifest.get('schema_version')!=2: return # existing Kent snapshot during rollout
    assert manifest['items']==[]
    assert len({s['path'] for s in manifest['shards']})==len(manifest['shards'])
    rows=[]
    for shard in manifest['shards']:
        path=shard['path']
        assert path.startswith('electricity/') and '..' not in path and path.endswith('.json')
        records=json.loads((ROOT/path).read_text(encoding='utf-8'))['items']
        assert len(records)==shard['count']
        bb=shard['bounds'];assert len(bb)==4 and all(math.isfinite(v) for v in bb)
        assert bb[0]<=bb[2] and bb[1]<=bb[3]
        for row in records:
            for lat,lng in row.get('geometry',[[row['lat'],row['lng']]]):
                assert bb[0]<=lat<=bb[2] and bb[1]<=lng<=bb[3]
        rows.extend(records)
    assert len(rows)==manifest['count'] and len(rows)>2000
    ids=set()
    for r in rows:
        assert r['id'] not in ids;ids.add(r['id'])
        assert r['category'] in ('generate','store','transmit')
        assert r['stage'] in ('operational','construction','proposed','closed','inactive','unknown')
        assert 49<=r['lat']<=62 and -9<=r['lng']<=4
        assert r['source'].startswith('https://') and r['licence_url'].startswith('https://')
        assert any(v in r['licence'] for v in ('ODbL','Open Government Licence'))
        assert r['checked'] and r['basis'] and r['location_note']
    countries=Counter(r['nation'] for r in rows)
    assert dict(countries)==manifest['country_counts']
    assert dict(Counter(r['category'] for r in rows))==manifest['category_counts']
    for nation in ('England','Scotland','Wales','Northern Ireland'):
        assert countries[nation]>10
        assert any(r['nation']==nation and r['category']=='generate' for r in rows)
        assert any(r['nation']==nation and r['category']=='transmit' for r in rows)
    assert any(r['category']=='store' for r in rows)
    summary={'count':len(rows),'countries':dict(countries),'categories':dict(Counter(r['category'] for r in rows)),'examples':{n:[{'name':r['name'],'lat':r['lat'],'lng':r['lng'],'status':r['status'],'source_ref':r.get('source_ref')} for r in rows if r['nation']==n and r['category']=='generate'][:3] for n in countries}}
    print(json.dumps(summary,indent=2))
if __name__=='__main__':validate()
