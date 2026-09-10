# Grid Watch data methodology

Grid Watch is a public-interest map of UK data-centre infrastructure. It does **not** copy or republish proprietary data-centre directories.

## Layers

### 1. OpenStreetMap discovery layer
`scripts/update_osm.py` queries UK OpenStreetMap features explicitly tagged as data centres and writes `datacentres-osm.json`. This layer is refreshed automatically and is attributed to © OpenStreetMap contributors under ODbL 1.0.

OSM is a discovery/geographic layer, not proof that every site exists, is operational, or has a particular capacity. Coverage can contain omissions or contributor errors.

### 2. Curated evidence register
`datacentres.json` is the editorial evidence layer. A record should only be promoted here when a human-verifiable source supports it. Prefer, in order: planning authority documents; grid/network operator records; government publications; company/operator primary sources; reputable secondary reporting.

### 3. Planning layer
`scripts/update_planning.py` scans the official Planning Data `planning-application` dataset and writes keyword-matched candidates to `planning.json`. The dataset is licensed under the Open Government Licence v3.0 and is attributed to © Crown copyright and database right.

The collector currently covers **England only**. The national planning-application specification is still in development and local planning authorities are not currently required to publish into it, so this is not a complete UK planning register. Scotland, Wales, Northern Ireland and missing English authorities require additional reusable sources.

The automatic search looks for dedicated-data-centre language such as `data centre`, `data center`, `datacentre`, `hyperscale`, `server hall` and `data hall`. Matches remain **unverified planning candidates** until independently checked. A planning application is evidence of an application, **not** evidence that a data centre has been built.

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
