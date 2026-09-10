#!/usr/bin/env python3
"""Collect Scotland planning candidates from the Improvement Service Spatial Hub.

Source dataset: Planning Applications: Official - Scotland (OGL).
All 34 planning authorities are represented according to the publisher.
"""
import csv
import io
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "planning-scotland.json"
PACKAGE = "https://data.spatialhub.scot/api/3/action/package_show?id=planning_applications_official-is"
POINT_RESOURCE_ID = "50d9f0a8-3040-43e0-9468-39e21fbc6767"
UA = "GridWatch-TheScouseOracle/2.0 (open planning data collector)"
TERMS = re.compile(r"\b(data\s*centre|data\s*center|datacentre|datacenter|hyperscale|server\s+halls?|data\s+halls?|computer\s+data\s+centre)\b", re.I)
POWER = re.compile(r"(?<!\d)(\d+(?:\.\d+)?)\s*(MW|MVA|kV)\b", re.I)
BNG_TO_WGS84 = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)


def get_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read(), r.headers.get("Content-Type", "")


def get_json(url):
    raw, _ = get_bytes(url)
    return json.loads(raw.decode("utf-8"))


def find_resource_url():
    pkg = get_json(PACKAGE)
    if not pkg.get("success"):
        raise RuntimeError("Spatial Hub package lookup failed")
    resources = pkg.get("result", {}).get("resources", [])
    # Prefer the known official point resource.
    for r in resources:
        if r.get("id") == POINT_RESOURCE_ID:
            url = r.get("url")
            if url:
                return url
    for r in resources:
        name = (r.get("name") or "").lower()
        fmt = (r.get("format") or "").lower()
        if "point" in name and fmt in {"csv", "geojson", "json", "wfs"} and r.get("url"):
            return r["url"]
    raise RuntimeError("No open official Scotland planning point resource found")


def rows_from_datastore():
    rows = []
    offset = 0
    while True:
        params = urllib.parse.urlencode({"resource_id": POINT_RESOURCE_ID, "limit": 5000, "offset": offset})
        url = "https://data.spatialhub.scot/api/3/action/datastore_search?" + params
        data = get_json(url)
        if not data.get("success"):
            return None
        batch = data.get("result", {}).get("records", [])
        rows.extend(batch)
        if len(batch) < 5000:
            break
        offset += len(batch)
    return rows


def rows_from_resource(url):
    # CKAN resource URLs may already be direct downloads. If not, the /download
    # endpoint is a stable fallback used by CKAN portals.
    attempts = [url]
    if "/resource/" in url and not url.rstrip("/").endswith("download"):
        attempts.append(url.rstrip("/") + "/download")
    last = None
    for u in attempts:
        try:
            raw, ctype = get_bytes(u)
            text = raw.decode("utf-8-sig", errors="replace")
            if "json" in ctype or text.lstrip().startswith("{"):
                obj = json.loads(text)
                if isinstance(obj, dict) and isinstance(obj.get("features"), list):
                    return [dict(f.get("properties") or {}, __geometry=f.get("geometry")) for f in obj["features"]]
                if isinstance(obj, list):
                    return obj
            return list(csv.DictReader(io.StringIO(text)))
        except Exception as exc:
            last = exc
    raise RuntimeError(f"Could not read Scotland planning resource: {last}")


def first(row, *keys):
    lower = {str(k).lower(): v for k, v in row.items()}
    for key in keys:
        v = lower.get(key.lower())
        if v not in (None, "", "None"):
            return v
    return None


def parse_latlng(row):
    geom = row.get("__geometry")
    if isinstance(geom, dict) and geom.get("type") == "Point":
        coords = geom.get("coordinates") or []
        if len(coords) >= 2:
            x, y = float(coords[0]), float(coords[1])
            if -10 <= x <= 5 and 49 <= y <= 62:
                return y, x
            lon, lat = BNG_TO_WGS84.transform(x, y)
            return lat, lon
    lat = first(row, "lat", "latitude")
    lon = first(row, "lon", "lng", "longitude")
    try:
        if lat is not None and lon is not None:
            return float(lat), float(lon)
    except Exception:
        pass
    e = first(row, "easting", "x", "xcoord", "x_coord")
    n = first(row, "northing", "y", "ycoord", "y_coord")
    try:
        if e is not None and n is not None:
            lon, lat = BNG_TO_WGS84.transform(float(str(e).replace(",", "")), float(str(n).replace(",", "")))
            return lat, lon
    except Exception:
        pass
    # Some exports include WKT geometry.
    for value in row.values():
        m = re.search(r"POINT\s*\(\s*([-+0-9.]+)\s+([-+0-9.]+)\s*\)", str(value), re.I)
        if m:
            x, y = float(m.group(1)), float(m.group(2))
            if -10 <= x <= 5 and 49 <= y <= 62:
                return y, x
            lon, lat = BNG_TO_WGS84.transform(x, y)
            return lat, lon
    return None, None


def power_mentions(text):
    out = []
    for value, unit in POWER.findall(text or ""):
        out.append({"value": float(value), "unit": unit.upper(), "basis": "planning-description text"})
    return out


def main():
    try:
        rows = rows_from_datastore()
    except Exception:
        rows = None
    if rows is None:
        rows = rows_from_resource(find_resource_url())
    items = []
    seen = set()
    for row in rows:
        proposal = first(row, "proposal", "description", "development_description") or ""
        if not TERMS.search(proposal):
            continue
        ref = first(row, "reference", "ref")
        auth = first(row, "local_auth", "local_authority", "planning_authority")
        key = (str(auth), str(ref), proposal[:120])
        if key in seen:
            continue
        seen.add(key)
        lat, lng = parse_latlng(row)
        items.append({
            "id": f"scotland-{ref or len(items)+1}",
            "nation": "Scotland",
            "authority": auth,
            "reference": ref,
            "description": proposal,
            "address": first(row, "address", "site_address", "location"),
            "postcode": first(row, "postcode"),
            "status": first(row, "status", "decision", "application_status"),
            "date": first(row, "date_valid", "valid_date", "received_date", "date_received", "year"),
            "lat": lat,
            "lng": lng,
            "url": first(row, "url", "case_url"),
            "power_mentions": power_mentions(proposal),
            "source_type": "Improvement Service Spatial Hub",
            "source_dataset": "Planning Applications: Official - Scotland",
            "licence": "Open Government Licence v3.0",
            "verified": False
        })
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(),
        "nation": "Scotland",
        "source": "https://data.spatialhub.scot/en/dataset/planning_applications_official-is",
        "licence": "Open Government Licence v3.0",
        "coverage": "Official Scotland planning-application dataset; publisher states all 34 planning authorities provide data daily.",
        "count": len(items),
        "items": items
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(items)} Scotland planning candidates")


if __name__ == "__main__":
    main()
