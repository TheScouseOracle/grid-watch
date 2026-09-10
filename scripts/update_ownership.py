#!/usr/bin/env python3
"""Build an open ownership-enrichment layer from OSM-linked Wikidata IDs.

Wikidata is CC0. This script never guesses an operator identity from a name.
It only enriches records where OSM contributors supplied an explicit Wikidata
identifier and follows Wikidata's parent-organisation property (P749).
"""
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IN = ROOT / "datacentres-osm.json"
OUT = ROOT / "ownership.json"
ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{}.json"
UA = "GridWatch-TheScouseOracle/2.0 (open-data ownership enrichment)"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def value_qid(entity, prop):
    claims = entity.get("claims", {}).get(prop, [])
    for claim in claims:
        snak = claim.get("mainsnak", {})
        value = (snak.get("datavalue") or {}).get("value")
        if isinstance(value, dict) and value.get("entity-type") == "item":
            return "Q" + str(value.get("numeric-id"))
    return None


def label(entity, qid):
    labels = entity.get("labels", {})
    return (labels.get("en") or labels.get("en-gb") or {}).get("value") or qid


def fetch_entity(qid, cache):
    if not qid:
        return None
    if qid not in cache:
        payload = get_json(ENTITY.format(qid))
        cache[qid] = payload.get("entities", {}).get(qid, {})
        time.sleep(0.08)
    return cache[qid]


def parent_chain(start, cache, max_depth=6):
    chain = []
    seen = set()
    q = start
    while q and q not in seen and len(chain) < max_depth:
        seen.add(q)
        ent = fetch_entity(q, cache)
        if not ent:
            break
        country_qid = value_qid(ent, "P17")
        hq_qid = value_qid(ent, "P159")
        chain.append({
            "qid": q,
            "name": label(ent, q),
            "country_qid": country_qid,
            "headquarters_qid": hq_qid,
            "source": f"https://www.wikidata.org/wiki/{q}"
        })
        q = value_qid(ent, "P749")
    return chain


def resolve_labels(chain, cache):
    for item in chain:
        cq = item.get("country_qid")
        hq = item.get("headquarters_qid")
        if cq:
            ce = fetch_entity(cq, cache)
            item["country"] = label(ce, cq) if ce else cq
        if hq:
            he = fetch_entity(hq, cache)
            item["headquarters"] = label(he, hq) if he else hq
    return chain


def main():
    src = json.loads(IN.read_text(encoding="utf-8"))
    cache = {}
    rows = []
    for site in src.get("items", []):
        start = site.get("operator_wikidata") or site.get("owner_wikidata") or site.get("brand_wikidata")
        if not start:
            continue
        chain = resolve_labels(parent_chain(start, cache), cache)
        if not chain:
            continue
        rows.append({
            "site_id": site.get("id"),
            "source_qid": start,
            "source_role": "operator" if site.get("operator_wikidata") else ("owner" if site.get("owner_wikidata") else "brand"),
            "chain": chain,
            "ultimate_parent": chain[-1].get("name"),
            "ultimate_parent_qid": chain[-1].get("qid"),
            "ultimate_parent_country": chain[-1].get("country"),
            "licence": "CC0 1.0",
            "confidence": "open-linked-data; no name guessing"
        })
    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Wikidata",
        "licence": "CC0 1.0",
        "method": "Only OSM records with explicit Wikidata identifiers are enriched; parent chains follow P749. Missing or ambiguous ownership remains unknown.",
        "count": len(rows),
        "items": rows
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} open ownership links to {OUT}")


if __name__ == "__main__":
    main()
