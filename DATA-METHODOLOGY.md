# Grid Watch data methodology

Grid Watch is a public-interest map of UK data-centre infrastructure. **The v2 automated data layers ingest only data with an explicit open licence or public-domain dedication.** Proprietary directories, paywalled databases and unlicensed council scraping are excluded.

The machine-readable allowlist lives at `sources/open-data-sources.json`.

## 1. Data-centre discovery — OpenStreetMap

`scripts/update_osm.py` queries UK OpenStreetMap features explicitly tagged as data centres and writes `datacentres-osm.json`. OpenStreetMap data is ODbL 1.0 and requires attribution to © OpenStreetMap contributors.

OSM is a discovery/geographic layer, not proof that every site exists, is operational, or has a particular capacity. Coverage may contain omissions or contributor errors.

## 2. Ownership — Wikidata CC0

`scripts/update_ownership.py` builds `ownership.json` from **explicit Wikidata identifiers already attached to OSM objects**. Grid Watch does not guess a corporate identity from a similar-looking company name. Parent chains follow Wikidata property P749 and remain visibly labelled as Wikidata-derived open linked data.

Wikidata is CC0. Missing or ambiguous ownership remains unknown rather than being filled from proprietary corporate-intelligence products.

## 3. Planning — open-government datasets only

The planning layer is assembled from nation-specific open sources and merged by `scripts/merge_planning.py`.

- **England:** MHCLG Planning Data `planning-application` dataset — Open Government Licence v3.0. Its national specification remains in development and authority coverage is incomplete.
- **Scotland:** Improvement Service Spatial Hub, `Planning Applications: Official - Scotland` — Open Government Licence. The publisher states that all 34 Scottish planning authorities supply data.
- **Northern Ireland:** Department for Infrastructure / OpenDataNI annual planning dataset — Open Government Licence. This is validated but annual, not a live daily feed.
- **Wales:** no national machine-readable planning-application feed with a clearly verified open licence has been identified. Grid Watch therefore publishes this as a coverage gap instead of scraping council registers whose reuse terms have not been verified.

Planning collectors search for dedicated-data-centre language such as `data centre`, `data center`, `datacentre`, `hyperscale`, `server hall` and `data hall`. Matches remain **planning candidates**, not verified built sites.

Where an openly licensed planning description itself contains a number such as `40 MW`, `60 MVA` or `132 kV`, Grid Watch may surface that as **power mentioned in planning text**. This is not automatically interpreted as actual consumption, contracted capacity, or a confirmed connection.

## 4. Electricity infrastructure — OpenStreetMap + open government context

`scripts/update_grid.py` maps OpenStreetMap substations at 132 kV and above. This gives geographic electricity-infrastructure context across Great Britain without pretending a nearby substation is a data centre's confirmed connection point.

National demand-connection context is separately attributed to Ofgem. Queue/application figures are not presented as present-day electricity consumption.

Grid Watch distinguishes four power states whenever evidence exists:

- **Connected / operational** — evidence supports a live connection or operating facility.
- **Contracted / accepted** — a connection has been secured or accepted but is not evidence of current consumption.
- **Proposed / requested** — a planning, project or connection-request figure.
- **Estimated** — a derived estimate, always labelled as such.

## 5. Strict-open verified register

`datacentres.json` is retained as a verified/editorial layer, but v2 only permits a record to be promoted there when the underlying reusable evidence is itself under an explicitly compatible open licence. The older hand-curated entries are intentionally not carried into the strict-open branch because their supporting pages were not open-data datasets.

## Completeness

Open-data-only does **not** mean complete. No single statutory UK register lists every private, edge, enterprise, operating and proposed data centre. Grid Watch therefore reports source provenance, licensing and coverage gaps instead of claiming 100% market coverage.

## Reuse and attribution

Respect upstream licence terms and attribution. Do not wholesale-copy proprietary data-centre directories. ODbL-derived content remains attributed to OpenStreetMap; government planning datasets retain Crown/authority attribution where required; Wikidata-derived ownership is marked CC0.
