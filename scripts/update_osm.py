#!/usr/bin/env python3
"""Refresh the UK OpenStreetMap data-centre layer for Grid Watch.

Uses the public Overpass API and only OSM features whose tags explicitly mark
a data centre. Output is intentionally descriptive rather than editorial.
"""
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "datacentres-osm.json"
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
QUERY = r'''[out:json][timeout:180];
area["ISO3166-1"="GB"][admin_level=2]->.gb;
(
  nwr["telecom"="data_center"](area.gb);
  nwr["building"="data_center"](area.gb);
  nwr["industrial"="data_centre"](area.gb);
  nwr["proposed:telecom"="data_center"](area.gb);
  nwr["construction:telecom"="data_center"](area.gb);
);
out center tags;'''


def fetch():
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for endpoint in OVERPASS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(endpoint, data=body, headers={
                    "User-Agent": "GridWatch-TheScouseOracle/2.0 (public-interest map; GitHub Pages)"
                })
                with urllib.request.urlopen(req, timeout=210) as r:
                    return json.load(r)
            except Exception as exc:
                last = exc
                time.sleep(3 + attempt * 4)
    raise RuntimeError(f"All Overpass endpoints failed: {last}")


def status(tags):
    if tags.get("proposed:telecom") == "data_center":
        return "Proposed"
    if tags.get("construction:telecom") == "data_center":
        return "Under construction"
    return "Mapped existing site"


def main():
    raw = fetch()
    rows = []
    seen = set()
    for e in raw.get("elements", []):
        key = (e.get("type"), e.get("id"))
        if key in seen:
            continue
        seen.add(key)
        tags = e.get("tags", {})
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lng = e.get("lon") or (e.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        osm_type, osm_id = e.get("type"), e.get("id")
        rows.append({
            "id": f"osm-{osm_type}-{osm_id}",
            "name": tags.get("name") or tags.get("operator") or "Data centre",
            "operator": tags.get("operator"),
            "owner": tags.get("owner"),
            "ref": tags.get("ref"),
            "status": status(tags),
            "lat": lat,
            "lng": lng,
            "postcode": tags.get("addr:postcode"),
            "city": tags.get("addr:city") or tags.get("addr:place"),
            "source": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
            "source_type": "OpenStreetMap",
            "licence": "ODbL 1.0",
            "verified": False,
        })
    rows.sort(key=lambda x: ((x.get("name") or "").lower(), x["id"]))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OpenStreetMap via Overpass API",
        "licence": "ODbL 1.0 — © OpenStreetMap contributors",
        "coverage_note": "UK-wide community-mapped data-centre features. Coverage is substantial but not guaranteed complete.",
        "count": len(rows),
        "items": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} OSM records to {OUT}")


if __name__ == "__main__":
    main()
