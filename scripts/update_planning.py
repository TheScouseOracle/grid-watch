#!/usr/bin/env python3
"""Refresh Grid Watch's England planning-application discovery layer.

Source: planning.data.gov.uk planning-application dataset (OGL v3.0).
This is a discovery feed, not a verified data-centre register.
"""
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://www.planning.data.gov.uk/entity.json"
OUT = Path(__file__).resolve().parents[1] / "planning.json"
LIMIT = 500
MAX_PAGES = 500

# Deliberately conservative. Broad enough to catch likely projects while trying
# not to match ordinary offices merely mentioning a small server room.
TERMS = [
    r"\bdata\s*centre\b",
    r"\bdata\s*center\b",
    r"\bdatacentre\b",
    r"\bdatacenter\b",
    r"\bhyperscale\b",
    r"\bserver\s+hall\b",
    r"\bserver\s+halls\b",
    r"\bdata\s+hall\b",
    r"\bdata\s+halls\b",
    r"\bcomputer\s+data\s+centre\b",
]
PATTERN = re.compile("|".join(TERMS), re.I)

# Terms which often indicate an incidental internal IT room rather than a
# dedicated data-centre development. These are not automatically excluded; they
# lower the candidate score so the raw record remains auditable.
INCIDENTAL = re.compile(r"\b(server\s+room|communications?\s+room|comms\s+room|IT\s+room)\b", re.I)


def request_json(params):
    url = BASE + "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={
        "User-Agent": "GridWatch-TheScouseOracle/2.0 (public-interest planning monitor)"
    })
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r), url


def get_rows(payload):
    for key in ("entities", "items", "results"):
        if isinstance(payload.get(key), list):
            return payload[key]
    return []


def point_to_latlng(point):
    if not point:
        return None, None
    # Planning Data uses WKT POINT(lon lat)
    m = re.search(r"POINT\s*\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)\s*\)", str(point), re.I)
    if not m:
        return None, None
    return float(m.group(2)), float(m.group(1))


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


def official_entity_url(entity):
    return f"https://www.planning.data.gov.uk/entity/{entity}" if entity else None


def normalise(row):
    description = first(row, "description", "name", "notes") or ""
    address = first(row, "address-text", "address")
    lat, lng = point_to_latlng(row.get("point"))
    entity = row.get("entity")
    ref = first(row, "reference", "planning-application-reference")
    status = first(row, "planning-application-status", "status")
    decision = first(row, "planning-decision-type", "decision")
    start_date = first(row, "start-date", "application-date", "valid-date")
    score = score_candidate(" ".join(str(x) for x in (description, address or "", row.get("name") or "")))
    return {
        "id": f"planning-data-{entity or ref}",
        "source_dataset": "planning-application",
        "source_type": "Planning Data (MHCLG)",
        "licence": "Open Government Licence v3.0",
        "entity": entity,
        "reference": ref,
        "description": description,
        "address": address,
        "postcode": first(row, "postcode"),
        "authority": first(row, "organisation", "local-planning-authority", "organisation-name"),
        "status": status,
        "decision": decision,
        "date": start_date,
        "decision_date": first(row, "decision-date"),
        "application_type": first(row, "planning-application-type"),
        "lat": lat,
        "lng": lng,
        "url": official_entity_url(entity),
        "candidate_score": score,
        "verified": False,
    }


def main():
    offset = 0
    candidates = {}
    scanned = 0
    pages = 0

    while pages < MAX_PAGES:
        params = {
            "dataset": "planning-application",
            "limit": LIMIT,
            "offset": offset,
        }
        payload, _ = request_json(params)
        rows = get_rows(payload)
        if not rows:
            break
        scanned += len(rows)
        for row in rows:
            haystack = " ".join(str(row.get(k) or "") for k in ("description", "name", "notes", "address-text"))
            if not PATTERN.search(haystack):
                continue
            item = normalise(row)
            key = item["id"]
            candidates[key] = item
        pages += 1
        if len(rows) < LIMIT:
            break
        offset += LIMIT
        time.sleep(0.15)

    items = list(candidates.values())
    items.sort(key=lambda x: ((x.get("date") or ""), (x.get("reference") or "")), reverse=True)
    payload = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "source": "https://www.planning.data.gov.uk/dataset/planning-application",
        "licence": "Open Government Licence v3.0 — © Crown copyright and database right",
        "coverage": "England only; Planning Data's planning-application specification is in development and participating-authority coverage is incomplete.",
        "method": "Keyword discovery across the published planning-application dataset. Records are candidates until independently verified.",
        "keywords": TERMS,
        "scanned_records": scanned,
        "count": len(items),
        "items": items,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Scanned {scanned} planning records; wrote {len(items)} candidates to {OUT}")


if __name__ == "__main__":
    main()
