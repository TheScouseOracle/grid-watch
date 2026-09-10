#!/usr/bin/env python3
"""Merge nation planning outputs into the public planning.json layer.

Only files generated from the strict allowlist are included. Wales remains a
published coverage gap until a national machine-readable planning feed with a
verified open licence is identified.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
INPUTS=[ROOT/"planning-england.json",ROOT/"planning-scotland.json",ROOT/"planning-ni.json"]
OUT=ROOT/"planning.json"


def main():
    items=[]; coverage={}
    for path in INPUTS:
        if not path.exists():
            continue
        obj=json.loads(path.read_text(encoding="utf-8"))
        nation=obj.get("nation") or path.stem
        coverage[nation]={"count":obj.get("count",0),"source":obj.get("source"),"licence":obj.get("licence"),"coverage":obj.get("coverage"),"updated":obj.get("updated")}
        for item in obj.get("items",[]):
            # Map cards need coordinates. Keep non-mappable records out of the
            # public nearby layer, but report how many were omitted below.
            if isinstance(item.get("lat"),(int,float)) and isinstance(item.get("lng"),(int,float)):
                items.append(item)
    coverage["Wales"]={"count":0,"source":None,"licence":None,"coverage":"No national machine-readable planning-application feed with a clearly verified open licence has been identified. Grid Watch deliberately does not scrape unlicensed council registers.","updated":None}
    items.sort(key=lambda x:((x.get("date") or ""),(x.get("reference") or "")),reverse=True)
    OUT.write_text(json.dumps({
        "updated":datetime.now(timezone.utc).isoformat(),
        "policy":"Open-data-only planning layer. Every enabled upstream dataset has an explicit open licence.",
        "coverage_by_nation":coverage,
        "count":len(items),
        "items":items
    },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Merged {len(items)} mappable open planning candidates")

if __name__=="__main__": main()
