#!/usr/bin/env python3
"""Collect Northern Ireland planning candidates from OpenDataNI's annual OGL dataset."""
import csv
import io
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "planning-ni.json"
PACKAGE = "https://admin.opendatani.gov.uk/api/3/action/package_show?id=northern-ireland-planning-statistics-annual-dataset"
UA = "GridWatch-TheScouseOracle/2.0 (open planning data collector)"
TERMS = re.compile(r"\b(data\s*centre|data\s*center|datacentre|datacenter|hyperscale|server\s+halls?|data\s+halls?|computer\s+data\s+centre)\b", re.I)
POWER = re.compile(r"(?<!\d)(\d+(?:\.\d+)?)\s*(MW|MVA|kV)\b", re.I)
IRISH_GRID_TO_WGS84 = Transformer.from_crs("EPSG:29903", "EPSG:4326", always_xy=True)


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def get_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read().decode("utf-8-sig", errors="replace")


def latest_csv_url():
    pkg = get_json(PACKAGE)
    if not pkg.get("success"):
        raise RuntimeError("OpenDataNI package lookup failed")
    resources = pkg.get("result", {}).get("resources", [])
    csvs = [r for r in resources if (r.get("format") or "").upper() == "CSV" and r.get("url")]
    if not csvs:
        raise RuntimeError("No CSV resource found in OpenDataNI planning dataset")
    # CKAN places the newest annual file first; use timestamps as a secondary guard.
    csvs.sort(key=lambda r: (r.get("last_modified") or r.get("created") or ""), reverse=True)
    return csvs[0]["url"], csvs[0].get("name")


def num(v):
    try:
        return float(str(v).replace(",", "").strip())
    except Exception:
        return None


def power_mentions(text):
    return [{"value": float(v), "unit": u.upper(), "basis": "planning-description text"} for v, u in POWER.findall(text or "")]


def main():
    url, resource_name = latest_csv_url()
    rows = csv.DictReader(io.StringIO(get_text(url)))
    items = []
    for row in rows:
        proposal = row.get("Proposal") or row.get("proposal") or ""
        if not TERMS.search(proposal):
            continue
        e, n = num(row.get("Easting")), num(row.get("Northing"))
        lat = lng = None
        if e is not None and n is not None:
            lng, lat = IRISH_GRID_TO_WGS84.transform(e, n)
        ref = row.get("ID") or row.get("Reference")
        items.append({
            "id": f"ni-{ref or len(items)+1}",
            "nation": "Northern Ireland",
            "authority": row.get("Authority") or row.get("LPA19NM"),
            "reference": ref,
            "description": proposal,
            "address": row.get("SiteAddress"),
            "postcode": None,
            "status": row.get("Status@31Mar") or row.get("Decision_Withdrawal"),
            "decision": row.get("Decision_Withdrawal"),
            "date": row.get("DateValid") or row.get("DateReceived"),
            "decision_date": row.get("DecisionIssuedDate"),
            "application_type": row.get("AppType"),
            "lat": lat,
            "lng": lng,
            "url": "https://www.infrastructure-ni.gov.uk/articles/planning-activity-statistics",
            "power_mentions": power_mentions(proposal),
            "source_type": "OpenDataNI / Department for Infrastructure",
            "source_dataset": resource_name,
            "licence": "Open Government Licence v3.0",
            "verified": False
        })
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(),
        "nation": "Northern Ireland",
        "source": "https://admin.opendatani.gov.uk/dataset/northern-ireland-planning-statistics-annual-dataset",
        "licence": "Open Government Licence v3.0",
        "coverage": "Validated annual planning dataset. It is not a live daily planning feed.",
        "count": len(items),
        "items": items
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(items)} Northern Ireland planning candidates")


if __name__ == "__main__":
    main()
