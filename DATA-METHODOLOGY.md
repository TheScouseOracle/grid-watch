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
- **Scotland:** Improvement Service Spatial Hub, `Planning Applications: Official - Scotland` — Open Government Licence. The publisher states that all 34 Scottish planning authorities supply data. The publisher currently gates machine downloads behind an access key. Grid Watch supports `SPATIALHUB_AUTHKEY`; if no key is configured, the generated Scotland file declares the access gap and remains empty rather than falling back to an unlicensed source.
- **Northern Ireland:** Department for Infrastructure / OpenDataNI annual planning dataset — Open Government Licence. This is validated but annual, not a live daily feed.
- **Wales:** no national machine-readable planning-application feed with a clearly verified open licence has been identified. Grid Watch therefore publishes this as a coverage gap instead of scraping council registers whose reuse terms have not been verified.

Planning collectors search for dedicated-data-centre language such as `data centre`, `data center`, `datacentre`, `hyperscale`, `server hall` and `data hall`. Matches remain **planning candidates**, not verified built sites.

Where an openly licensed planning description itself contains a number such as `40 MW`, `60 MVA` or `132 kV`, Grid Watch may surface that as **power mentioned in planning text**. This is not automatically interpreted as actual consumption, contracted capacity, or a confirmed connection.

## 4. Electricity infrastructure — OpenStreetMap + open government context

`scripts/update_grid.py` maps OpenStreetMap substations at 132 kV and above. This gives geographic electricity-infrastructure context across Great Britain without pretending a nearby substation is a data centre's confirmed connection point.

National demand-connection context is separately attributed to Ofgem. Queue/application figures are not presented as present-day electricity consumption.

NESO publishes useful connection material and has an Open Data Licence, but Grid Watch does **not** ingest a particular NESO register merely because NESO has a general open-data policy. Each machine-readable register must have its own reuse basis verified first. The Existing Agreement Register therefore remains disabled in the source allowlist until that check is complete. The TEC Register is not used as a data-centre demand register because Transmission Entry Capacity concerns export/generation-side capacity.

Grid Watch distinguishes four power states whenever evidence exists:

- **Connected / operational** — evidence supports a live connection or operating facility.
- **Contracted / accepted** — a connection has been secured or accepted but is not evidence of current consumption.
- **Proposed / requested** — a planning, project or connection-request figure.
- **Estimated** — a derived estimate, always labelled as such.

## 5. Strict-open verified register

`datacentres.json` is retained as a verified/editorial layer, but v2 only permits a record to be promoted there when the underlying reusable evidence is itself under an explicitly compatible open licence. The older hand-curated entries are intentionally not carried into the strict-open branch because their supporting pages were not open-data datasets.

## Site investigation views

Every mapped and verified-register data-centre result links to a hash-routed investigation. The same static page works under the GitHub Pages repository path, including direct links and reloads. Results and map state remain in memory while a reader investigates a site; returning restores the results and scroll position. A directly opened investigation offers a postcode search instead.

Five sections start collapsed: Power, Water, Money / Public Support, Planning and Ownership. The evidence profile counts the number of sections with at least one site-linked evidence field in the loaded records. It does **not** count generic water context, government programmes, nearby substations or nearby planning candidates. It is neither a risk score nor an assessment of completeness, safety, impact or evidential strength. Even a mapped operator tag can make the Ownership section available; its limitations remain beside the evidence.

“No open evidence found” means no suitable site-linked evidence is recorded in the loaded Grid Watch datasets for that field, not that all public records have been searched or that the activity does not occur. Failed downloads are displayed as unavailable, not as a completed evidence search. Collection timestamps are not site-review dates, and no current review date is invented.

Existing OSM operator/owner tags retain ODbL attribution. Wikidata chains require both the exact site identifier and the matching mapped organisation identifier and role. A chain endpoint is never promoted to a legally verified ultimate owner. Existing curated figures remain attributed register entries, distinguish their power stage and do not imply consumption or public funding.

### Water and future evidence

`investigations.json` starts with no site-specific entries. Its water context is an attributed summary of the Environment Agency's explicitly OGL National Framework, section 9.4, which labels its scope as England and Wales. This is general reading, including for users elsewhere in the UK; no national, regional, supplier, catchment or pressure match is inferred for a site's coordinates or the search postcode. Third-party content from that publication is excluded. Site supplier, water requirement, cooling, confirmation, abstraction, discharge and water-planning fields remain missing until suitable evidence is recorded.

New site evidence must use the exact `site_key` (`osm:<record id>` or `curated:<record id>`; an existing source URL is the fallback for a record without an ID). It needs a unique `id`, a recognised `section` and `field` from `investigation.js`, `scope: "site"`, a human-readable `value`, a `basis` explaining the explicit site relationship and evidential limits, `source_id` from the enabled source allowlist, the precise `source` URL, a compatible `licence`, `licence_url`, and an actual `checked` date (YYYY-MM-DD).

Do not add a source merely because its publisher has a general open-data policy: verify the material's own reuse basis. Do not infer a planning match from proximity or name, turn an OSM operator tag into legal ownership, treat announced investment as public funding, or treat an eligible tax-site location as receipt of tax relief. Zone links, eligibility, awards, power stages and actual usage remain separate fields. Multiple sourced entries can coexist in a field, with their qualifications and dates; a newer claim does not silently overwrite an older one.

Further regional reading can be added to `water_context` with its scope, source, licence, checked date and claim limit. Such entries remain separate from site evidence and cannot increase the profile. Any later geographic matching requires a separately evidenced boundary and explicit limitations; no such matching is implemented in this release.

## Completeness and coverage

## Electricity-system layer — Kent pilot

The optional map view separates GENERATE, STORE, CONNECT, TRANSMIT and CONSUME. It replaces only the visible map overlays while enabled; the original result cards, data and investigation routes are retained. Category arrows describe roles, not a physical or commercial supply chain. Battery charging/discharging does not mean every generator uses storage. No proximity-based relationship is created or added to an evidence profile.

`electricity.json` is a manually reviewed snapshot collected on 11 September 2026, not part of the daily refresh. OSM extraction uses bounding box south 50.88, west 0.75, north 51.42, east 1.5: power=plant; battery generators; and power=line ways tagged 275000/400000 volts. The pilot retains solar, wind, nuclear and battery source tags. Source tags and actual line geometries are retained as discovery evidence, not operating-status verification. Plant markers use geometry bounding-box centres; lines are individual OSM segments, not counts of independent projects. The 45 km filter uses feature centres. This is not comprehensive Kent infrastructure coverage.

Substations and data centres reuse the existing postcode-filtered OSM and curated datasets. OSM provenance is linked individually, with ODbL attribution. Source snapshot dates are not independent site-review dates. General major industrial demand is not yet comprehensively inventoried.

Sea Link uses Ofgem's 1 September 2026 project-assessment page, whose Crown copyright material is explicitly OGL under the page's linked copyright policy. Its broad Minster reference point is editorial area context, not an exact converter site or route. Its 2 GW figure is proposed transfer capacity. Dungeness B uses the OGL GOV.UK closure announcement and an explicitly approximate site-area point; it is historical generation, never live supply.

South Kent and Shepway solar proposals remain linked primary-source reading leads. The council's terms do not supply an open reuse licence, so project boundaries and capacity records are not imported. National Grid reading links likewise do not license bulk ingestion or establish a data-centre supply claim. These leads do not appear in the strict-open verified register. Source review does not mean planning status was independently verified beyond the cited snapshot.

Validate with `node scripts/check_electricity.cjs` alongside the existing frontend, navigation and open-data checks. Any future extension must preserve explicit source URLs, licence basis, checked dates, location precision and status limitations. Do not draw guessed corridors or automatic supplier-to-consumer edges.

Open-data-only does **not** mean complete. No single statutory UK register lists every private, edge, enterprise, operating and proposed data centre. Grid Watch therefore reports source provenance, licensing and coverage gaps instead of claiming 100% market coverage.

## Reuse and attribution

Respect upstream licence terms and attribution. Do not wholesale-copy proprietary data-centre directories. ODbL-derived content remains attributed to OpenStreetMap; government planning datasets retain Crown/authority attribution where required; Wikidata-derived ownership is marked CC0.
