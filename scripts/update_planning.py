#!/usr/bin/env python3
"""Refresh Grid Watch's England planning-application discovery layer.

Source: planning.data.gov.uk planning-application dataset (OGL v3.0).
Only applications where the proposal appears to create, move, extend or alter
data-centre infrastructure are retained. Incidental references to an existing
data centre are discarded.
"""
import json, math, re, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BASE="https://www.planning.data.gov.uk/entity.json"; OUT=Path(__file__).resolve().parents[1]/"planning-england.json"
LIMIT=500; MAX_PAGES=500; WORKERS=4
TERM=r"(?:data\s*cent(?:re|er)s?|datacent(?:re|er)s?|hyperscale|server\s+halls?|data\s+halls?)"
PATTERN=re.compile(rf"\b{TERM}\b",re.I)
# A data-centre term must be tied to a development action, or be a direct noun
# such as 'construction of 2 data centre cabins'. This removes records that
# merely say 'beside/excluding/between the existing data centre'.
DIRECT=re.compile(rf"(?:construction|construct|erection|erect|development|develop|redevelopment|redevelop|provision|provide|installation|install|creation|create|extension|extend|expansion|expand|relocation|relocate|relocated|conversion|convert|change\s+of\s+use|demolition|replacement|replace|new)\b.{{0,140}}\b{TERM}\b|\b{TERM}\b.{{0,100}}\b(?:campus|facility|facilities|building|buildings|hall|halls|cabin|cabins|development|extension|expansion|construction|installation|substation|generator|generators|cooling)\b",re.I|re.S)
NEGATIVE=re.compile(r"\b(?:excluding|excepting|between|adjacent\s+to|beside|within\s+the\s+existing)\b.{0,80}\bdata\s*cent(?:re|er)\b",re.I|re.S)
POWER=re.compile(r"(?<!\d)(\d+(?:\.\d+)?)\s*(MW|MVA|kV)\b",re.I)
UA="GridWatch-TheScouseOracle/2.0 (public-interest planning monitor; contact via GitHub repository)"

def request_json(params,retries=4):
    url=BASE+"?"+urllib.parse.urlencode(params,doseq=True); last=None
    for attempt in range(retries):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
            with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)
        except Exception as exc:last=exc;time.sleep(1.5*(attempt+1))
    raise RuntimeError(f"Planning Data request failed: {last}")

def get_rows(p):
    for k in ("entities","items","results"):
        if isinstance(p.get(k),list):return p[k]
    return []
def point_to_latlng(p):
    if not p:return None,None
    m=re.search(r"POINT\s*\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)\s*\)",str(p),re.I)
    return (float(m.group(2)),float(m.group(1))) if m else (None,None)
def first(row,*keys):
    for k in keys:
        v=row.get(k)
        if v not in (None,"",[]):return v
    return None
def relevant(text):
    return bool(PATTERN.search(text or "") and DIRECT.search(text or "") and not NEGATIVE.search(text or ""))
def power_mentions(text):return [{"value":float(v),"unit":u.upper(),"basis":"planning-description text"} for v,u in POWER.findall(text or "")]
def normalise(row):
    d=first(row,"description","name","notes") or ""; a=first(row,"address-text","address"); lat,lng=point_to_latlng(row.get("point")); entity=row.get("entity"); ref=first(row,"reference","planning-application-reference")
    return {"id":f"england-{entity or ref}","nation":"England","source_dataset":"planning-application","source_type":"Planning Data (MHCLG)","licence":"Open Government Licence v3.0","entity":entity,"reference":ref,"description":d,"address":a,"postcode":first(row,"postcode"),"authority":first(row,"organisation","local-planning-authority","organisation-name","organisation-entity"),"status":first(row,"planning-application-status","status"),"decision":first(row,"planning-decision-type","decision"),"date":first(row,"start-date","application-date","valid-date","entry-date"),"decision_date":first(row,"decision-date"),"application_type":first(row,"planning-application-type"),"lat":lat,"lng":lng,"url":f"https://www.planning.data.gov.uk/entity/{entity}" if entity else None,"candidate_basis":"proposal text directly describes data-centre development/alteration","power_mentions":power_mentions(d),"verified":False}
def scan(rows,out):
    for row in rows:
        text=" ".join(str(row.get(k) or "") for k in ("description","name","notes","address-text"))
        if relevant(text):
            item=normalise(row);out[item["id"]]=item
def fetch_page(offset):return request_json({"dataset":"planning-application","limit":LIMIT,"offset":offset})
def main():
    first_payload=fetch_page(0); first_rows=get_rows(first_payload); total=int(first_payload.get("count") or len(first_rows)); pages=min(MAX_PAGES,max(1,math.ceil(total/LIMIT))); candidates={};scan(first_rows,candidates);scanned=len(first_rows)
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        fs=[pool.submit(fetch_page,i*LIMIT) for i in range(1,pages)]
        for f in as_completed(fs):
            rows=get_rows(f.result());scanned+=len(rows);scan(rows,candidates)
    items=list(candidates.values());items.sort(key=lambda x:((x.get("date") or ""),(x.get("reference") or "")),reverse=True)
    OUT.write_text(json.dumps({"updated":datetime.now(timezone.utc).isoformat(),"nation":"England","source":"https://www.planning.data.gov.uk/dataset/planning-application","licence":"Open Government Licence v3.0 — © Crown copyright and database right","coverage":"Planning Data planning-application specification is in development and participating-authority coverage is incomplete.","method":"Full API snapshot scanned; only proposals whose text directly describes creation, relocation, extension, conversion or other development of data-centre infrastructure are retained. Records remain candidates until independently verified.","api_reported_count":total,"scanned_records":scanned,"count":len(items),"items":items},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Planning Data reported {total} records; scanned {scanned}; wrote {len(items)} direct England candidates")
if __name__=="__main__":main()
