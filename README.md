# Grid Watch — The Scouse Oracle

Grid Watch is a free public-interest map of UK data-centre infrastructure, planning activity, open ownership links and nearby high-voltage electricity infrastructure.

## Strict open-data policy

The **v2 automated database only ingests data with an explicit open licence or public-domain dedication**. It does not scrape or republish proprietary data-centre directories, paywalled databases or council registers whose reuse terms have not been verified.

See [`sources/open-data-sources.json`](sources/open-data-sources.json) and [`DATA-METHODOLOGY.md`](DATA-METHODOLOGY.md).

## Current layers

- **Data-centre locations:** OpenStreetMap via Overpass — ODbL 1.0.
- **Ownership enrichment:** Wikidata — CC0; only when an OSM object supplies an explicit Wikidata ID. No name guessing.
- **Planning — England:** MHCLG Planning Data — Open Government Licence v3.0.
- **Planning — Scotland:** Improvement Service Spatial Hub official planning applications — Open Government Licence.
- **Planning — Northern Ireland:** Department for Infrastructure / OpenDataNI annual planning dataset — Open Government Licence.
- **Planning — Wales:** no national machine-readable planning-application feed with a clearly verified open licence has yet been identified, so this is published as a coverage gap rather than filled by unlicensed scraping.
- **Electricity infrastructure:** OpenStreetMap 132 kV+ substations — ODbL 1.0.
- **National grid-demand context:** attributed government/regulator context is kept separate from site-level connection evidence.

## Automatic refresh

`.github/workflows/update-data.yml` runs the collectors and regenerates the public JSON layers:

- `scripts/update_osm.py`
- `scripts/update_planning.py`
- `scripts/update_scotland_planning.py`
- `scripts/update_ni_planning.py`
- `scripts/merge_planning.py`
- `scripts/update_ownership.py`
- `scripts/update_grid.py`

Generated data files include:

- `datacentres-osm.json`
- `planning-england.json`
- `planning-scotland.json`
- `planning-ni.json`
- `planning.json`
- `ownership.json`
- `grid.json`

## Site behaviour

The browser uses postcodes.io to geocode a UK postcode and calculates nearby records within the configured radius. Data-centre records, planning candidates and grid infrastructure are deliberately shown as **different evidence layers**.

A nearby substation does not prove a data-centre connection. A planning application's MW/MVA/kV text does not automatically prove consumption or contracted capacity. Grid Watch distinguishes, where evidence exists:

- **Connected / operational**
- **Contracted / accepted**
- **Proposed / requested**
- **Estimated**

## Coverage and confidence

Grid Watch is not a statutory register and does not claim 100% market coverage. No single open UK dataset lists every private, enterprise, edge, operating and proposed data centre. The project aims for the broadest defensible coverage possible while publishing source provenance, licensing and known gaps.

## GitHub Pages

Each data-centre card and map popup now offers **Investigate this site**. The investigation opens five expandable sections, retains source attribution and missing-evidence states, and offers back navigation. Water starts with general open Environment Agency evidence, with no guessed site supplier or demand. The evidence profile measures availability only, never risk. See the methodology for the extensible evidence format.

This is a buildless static site. Before publishing, run:

```text
python scripts/validate_open_data.py
node scripts/check_frontend.cjs
node scripts/check_navigation.cjs
```

The `Validate Grid Watch` workflow runs these checks on branches and pull requests without collecting or changing data. Develop on a separate branch, require a successful validation run, then merge to `main`. The existing Pages version remains available during development. The scheduled data refresh also checks investigations before committing updated data.

Serve the repository from the `main` branch and `/ (root)` in **Settings → Pages**. The site is static and requires no paid backend.

## Attribution

OpenStreetMap-derived layers: © OpenStreetMap contributors, ODbL 1.0. Government planning datasets retain their OGL/Crown or publisher attribution as applicable. Wikidata-derived ownership enrichment is CC0.
