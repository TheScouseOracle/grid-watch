#!/usr/bin/env python3
"""Refresh Grid Watch's UK electricity-infrastructure layer.

This deliberately maps electricity infrastructure, not confidential customer
connections. It pulls OpenStreetMap substations at transmission/high-voltage
distribution scale and publishes national demand-connection context separately.
"""
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "grid.json"
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
QUERY = r'''[out:json][timeout:180];
area["ISO3166-1"="GB"][admin_level=2]->.gb;
(
  nwr["power"="substation"]["voltage"](area.gb);
);
out center tags;'''

OF_GEM_SOURCE = "https://www.ofgem.gov.uk/press-release/ofgem-acts-free-grid-capacity-tackling-speculative-data-centre-projects"

def fetch_overpass():
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
                time.sleep(3 + 4 * attempt)
    raise RuntimeError(f"All Overpass endpoints failed: {last}")


def parse_voltage(value):
    vals = []
    for part in str(value or "").replace(",", ";").split(";"):
        try:
            vals.append(int(float(part.strip())))
        except Exception:
            pass
    return max(vals) if vals else None


def main():
    raw = fetch_overpass()
    rows = []
    seen = set()
    for e in raw.get("elements", []):
        key = (e.get("type"), e.get("id"))
        if key in seen:
            continue
        seen.add(key)
        tags = e.get("tags", {})
        volts = parse_voltage(tags.get("voltage"))
        # Keep 132 kV+ to avoid swamping the public map with local substations.
        if volts is None or volts < 132000:
            continue
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lng = e.get("lon") or (e.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        typ, oid = e.get("type"), e.get("id")
        rows.append({
            "id": f"osm-grid-{typ}-{oid}",
            "name": tags.get("name") or tags.get("operator") or "High-voltage substation",
            "operator": tags.get("operator"),
            "voltage_v": volts,
            "voltage_label": f"{volts/1000:g} kV",
            "lat": lat,
            "lng": lng,
            "source": f"https://www.openstreetmap.org/{typ}/{oid}",
            "source_type": "OpenStreetMap",
            "licence": "ODbL 1.0",
        })
    rows.sort(key=lambda x: (-x["voltage_v"], (x.get("name") or "").lower()))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "coverage_note": "Mapped 132 kV+ substations from OpenStreetMap. A nearby substation does not prove a data centre is connected to it.",
        "source": "OpenStreetMap via Overpass API",
        "licence": "ODbL 1.0 — © OpenStreetMap contributors",
        "count": len(rows),
        "national_context": {
            "as_of": "2026-07-29",
            "demand_connection_applications_gw": 125,
            "data_centre_component_at_least_gw": 80,
            "previous_demand_connection_applications_gw": 41,
            "interpretation": "These are demand-connection applications/queue figures, not current electricity consumption and not a forecast that every project will be built.",
            "source": OF_GEM_SOURCE,
            "source_name": "Ofgem"
        },
        "items": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} high-voltage substations to {OUT}")

if __name__ == "__main__":
    main()
