#!/usr/bin/env python3
"""Refresh Grid Watch's England planning-application discovery layer.

Source: planning.data.gov.uk planning-application dataset (OGL v3.0).
This is a discovery feed, not a verified data-centre register. The API is paged
with a small bounded worker pool so a 100k+ record snapshot can refresh within a
normal GitHub Actions run without hammering the service.
"""
import json
import math
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://www.planning.data.gov.uk/entity.json"
OUT = Path(__file__).resolve().parents[1] / "planning-england.json"
LIMIT = 500
MAX_PAGES = 500
WORKERS = 4
TERMS = [r"\bdata\s*centre\b",r"\bdata\s*center\b",r"\bdatacentre\b",r"\bdatacenter\b",r"\bhyperscale\b",r"\bserver\s+halls?\b",r"\bdata\s+halls?\b",r"\bcomputer\s+data\s+centre\b"]
PATTERN = re.compile("|".join(TERMS), re.I)
INCIDENTAL = re.compile(r"\b(server\s+room|communications?\s+room|comms\s+room|IT\s+room)\b", re.I)
POWER = re.compile(r"(?<!\d)(\d+(?:\.\d+)?)\s*(MW|MVA|kV)\b", re.I)
UA = "GridWatch-TheScouseOracle/2.0 (public-interest planning monitor; contact via GitHub repository)"


def request_json(params, retries=4):
    url = BASE + "?" + urllib.parse.urlencode(params, doseq=True)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Planning Data request failed after {retries} attempts: {url}: {last}")


def get_rows(payload):
    for key in ("entities", "items", "results"):
        if isinstance(payload.get(key), list):
            return payload[key]
    return []


def point_to_latlng(point):
    if not point:
        return None, None
    m = re.search(r"POINT\s*\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)\s*\)", str(point), re.I)
    return (float(m.group(2)), float(m.group(1))) if m else (None, None)


def first(row, *keys):
    for k in keys:
        v = row.get(k)
        if v not in (None, "", []):
            return v
    return None


def score_candidate(text):
    t = text or ""
    if not PATTERN.search(t):
        return 0
    score = 2
    if re.search(r"\b(data\s*centre|data\s*center|datacentre|datacenter)\b", t, re.I):
        score += 2
    if re.search(r"\b(hyperscale|data\s+halls?|server\s+halls?)\b", t, re.I):
        score += 1
    if INCIDENTAL.search(t) and not re.search(r"\b(data\s*centre|data\s*center|datacentre|datacenter|hyperscale)\b", t, re.I):
        score -= 1
    return max(score, 1)


def power_mentions(text):
    return [{"value": float(v), "unit": u.upper(), "basis": "planning-description text"} for v, u in POWER.findall(text or "")]


def normalise(row):
    description = first(row, "description", "name", "notes") or ""
    address = first(row, "address-text", "address")
    lat, lng = point_to_latlng(row.get("point"))
    entity = row.get("entity")
    ref = first(row, "reference", "planning-application-reference")
    return {
        "id": f"england-{entity or ref}",
        "nation": "England",
        "source_dataset": "planning-application",
        "source_type": "Planning Data (MHCLG)",
        "licence": "Open Government Licence v3.0",
        "entity": entity,
        "reference": ref,
        "description": description,
        "address": address,
        "postcode": first(row, "postcode"),
        "authority": first(row, "organisation", "local-planning-authority", "organisation-name", "organisation-entity"),
        "status": first(row, "planning-application-status", "status"),
        "decision": first(row, "planning-decision-type", "decision"),
        "date": first(row, "start-date", "application-date", "valid-date", "entry-date"),
        "decision_date": first(row, "decision-date"),
        "application_type": first(row, "planning-application-type"),
        "lat": lat,
        "lng": lng,
        "url": f"https://www.planning.data.gov.uk/entity/{entity}" if entity else None,
        "candidate_score": score_candidate(" ".join(str(x) for x in (description, address or "", row.get("name") or ""))),
        "power_mentions": power_mentions(description),
        "verified": False
    }


def scan_rows(rows, candidates):
    for row in rows:
        haystack = " ".join(str(row.get(k) or "") for k in ("description", "name", "notes", "address-text"))
        if PATTERN.search(haystack):
            item = normalise(row)
            candidates[item["id"]] = item


def fetch_page(offset):
    return request_json({"dataset": "planning-application", "limit": LIMIT, "offset": offset})


def main():
    first_payload = fetch_page(0)
    first_rows = get_rows(first_payload)
    total = int(first_payload.get("count") or len(first_rows))
    pages = min(MAX_PAGES, max(1, math.ceil(total / LIMIT)))
    offsets = [i * LIMIT for i in range(1, pages)]
    candidates = {}
    scan_rows(first_rows, candidates)
    scanned = len(first_rows)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_page, offset): offset for offset in offsets}
        for future in as_completed(futures):
            payload = future.result()
            rows = get_rows(payload)
            scanned += len(rows)
            scan_rows(rows, candidates)

    items = list(candidates.values())
    items.sort(key=lambda x: ((x.get("date") or ""), (x.get("reference") or "")), reverse=True)
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(),
        "nation": "England",
        "source": "https://www.planning.data.gov.uk/dataset/planning-application",
        "licence": "Open Government Licence v3.0 — © Crown copyright and database right",
        "coverage": "Planning Data planning-application specification is in development and participating-authority coverage is incomplete.",
        "method": "Keyword discovery across the complete Planning Data API snapshot returned at refresh time; records remain candidates until independently verified.",
        "api_reported_count": total,
        "scanned_records": scanned,
        "count": len(items),
        "items": items
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Planning Data reported {total} records; scanned {scanned}; wrote {len(items)} England candidates")


if __name__ == "__main__":
    main()
