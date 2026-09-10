#!/usr/bin/env python3
"""Fail the build if a generated public layer violates Grid Watch's open-data policy."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = ("ODbL", "Open Government Licence", "CC0")


def read(name):
    path = ROOT / name
    if not path.exists():
        raise SystemExit(f"Missing generated file: {name}")
    return json.loads(path.read_text(encoding="utf-8"))


def licence_ok(value):
    return bool(value) and any(token in str(value) for token in ALLOWED)


def coord_ok(item):
    lat, lng = item.get("lat"), item.get("lng")
    return isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and math.isfinite(lat) and math.isfinite(lng) and 48 <= lat <= 62 and -11 <= lng <= 4


def check_items(name, obj, require_coords=True):
    top = obj.get("licence")
    if name != "planning.json" and not licence_ok(top):
        raise SystemExit(f"{name}: missing/unsupported top-level open licence: {top!r}")
    items = obj.get("items")
    if not isinstance(items, list):
        raise SystemExit(f"{name}: items is not a list")
    ids = set()
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            raise SystemExit(f"{name}: item {i} is not an object")
        ident = item.get("id") or item.get("site_id")
        if ident and ident in ids:
            raise SystemExit(f"{name}: duplicate id {ident}")
        if ident:
            ids.add(ident)
        lic = item.get("licence")
        if lic and not licence_ok(lic):
            raise SystemExit(f"{name}: item {ident or i} has unsupported licence {lic}")
        if require_coords and not coord_ok(item):
            raise SystemExit(f"{name}: item {ident or i} has invalid/out-of-UK coordinates")


def validate_allowlist():
    src = read("sources/open-data-sources.json")
    enabled = [s for s in src.get("sources", []) if s.get("enabled")]
    if not enabled:
        raise SystemExit("Source allowlist contains no enabled sources")
    for source in enabled:
        # postcodes.io is a transient lookup service. Its source code is MIT and
        # its upstream datasets have source-specific open/public licences, so it
        # is documented but not ingested into generated repository datasets.
        if source.get("id") == "postcodes-io":
            if "MIT" not in str(source.get("licence")):
                raise SystemExit("postcodes.io source licence is not documented")
            continue
        if not licence_ok(source.get("licence")):
            raise SystemExit(f"Enabled source {source.get('id')} has no supported explicit open licence")
        if not source.get("licence_url"):
            raise SystemExit(f"Enabled source {source.get('id')} has no licence URL")
    # Guardrails: these gaps must stay disabled until an explicit compatible
    # licence is recorded in the allowlist.
    by_id = {s.get("id"): s for s in src.get("sources", [])}
    for guarded in ("neso-ea-register", "wales-national-planning"):
        if by_id.get(guarded, {}).get("enabled"):
            raise SystemExit(f"{guarded} cannot be enabled without a separately verified compatible licence")


def main():
    validate_allowlist()
    osm = read("datacentres-osm.json")
    grid = read("grid.json")
    planning = read("planning.json")
    ownership = read("ownership.json")
    curated = read("datacentres.json")

    check_items("datacentres-osm.json", osm)
    check_items("grid.json", grid)
    check_items("planning.json", planning)
    check_items("ownership.json", ownership, require_coords=False)

    for item in curated.get("datacentres", []):
        if not licence_ok(item.get("licence")):
            raise SystemExit(f"datacentres.json: curated item {item.get('name')} lacks a supported open licence")

    coverage = planning.get("coverage_by_nation", {})
    for nation in ("England", "Scotland", "Northern Ireland", "Wales"):
        if nation not in coverage:
            raise SystemExit(f"planning.json: missing declared coverage for {nation}")
    if coverage["Wales"].get("count") != 0 or coverage["Wales"].get("licence") is not None:
        raise SystemExit("planning.json: Wales must remain a declared gap until a verified open national feed is added")

    print("Open-data validation passed")
    print(f"OSM data centres: {len(osm.get('items', []))}")
    print(f"Planning candidates: {len(planning.get('items', []))}")
    print(f"Open ownership links: {len(ownership.get('items', []))}")
    print(f"132kV+ substations: {len(grid.get('items', []))}")


if __name__ == "__main__":
    main()
