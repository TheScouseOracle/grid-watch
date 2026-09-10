# Grid Watch data methodology

Grid Watch is a public-interest map of UK data-cententre infrastructure. It does **not** copy or republish proprietary data-centre directories.

## Layers

### 1. OpenStreetMap discovery layer
`scripts/update_osm.py` queries UK OpenStreetMap features explicitly tagged as data centres and writes `datacentres-osm.json`. This layer is refreshed automatically and is attributed to © OpenStreetMap contributors under ODbL 1.0.

OSM is a discovery/geographic layer, not proof that every site exists, is operational, or has a particular capacity. Coverage can contain omissions or contributor errors.

### 2. Curated evidence register
`datacentres.json` is the editorial evidence layer. A record should only be promoted here when a human-verifiable source supports it. Prefer, in order: planning authority documents; grid/network operator records; government publications; company/operator primary sources; reputable secondary reporting.

### 3. Planning layer
`planning.json` is reserved for planning applications collected from sources that permit public reuse. A planning application is evidence of an application, **not** evidence that a data centre has been built.

### 4. Grid layer
Grid capacity should distinguish:
- **Connected / operational** — evidence supports actual connection or operation.
- **Contracted / accepted** — a grid connection has been secured/accepted but is not evidence of current consumption.
- **Proposed / requested** — a planning, developer or connection figure; not current consumption.
- **Estimated** — an editorial estimate and visibly labelled as such.

## Evidence fields
For curated records, use fields such as `source`, `source_type`, `last_verified`, `power_mw`, `power_status`, `power_basis`, `operator`, `owner`, `ultimate_owner`, `ownership_country`, `planning_ref`, `planning_url`, `grid_operator`, and `confidence` when evidence exists. Unknown values stay `null`; Grid Watch does not infer missing facts merely to fill a card.

## Completeness
The goal is broad UK coverage by combining independent open/public sources. No public source can guarantee a complete list of every private, edge, enterprise, operational and proposed data centre. Grid Watch therefore publishes source provenance and a last-updated date rather than claiming a definitive statutory register.

## Reuse and attribution
Respect the licence and terms of every upstream source. Do not scrape or wholesale-copy proprietary directories. Keep attribution visible wherever a licence requires it.
