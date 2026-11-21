# GIS overlay implementation plan

**Status: plan only. RiverGuard ships no GIS geometry today and this document does not add any.**

This plan records what would be needed to draw geographic overlays on the
RiverGuard map, what licences apply, and — just as important — what must not
happen. No file named here has been downloaded, verified or added by this
document. Every dataset below needs a human to confirm licence, provenance and
fitness before it is used.

---

## 1. Current architecture (what exists, verified in this repo)

| Piece | Where | State |
| --- | --- | --- |
| Basemap | `apps/web/src/components/map/RiverMap.tsx` via `NEXT_PUBLIC_MAP_TILE_PROVIDER` / `NEXT_PUBLIC_MAP_TILE_URL` | OpenStreetMap Standard raster tiles by default, with mandatory attribution; tile policy limits |
| Verified overlay pipeline | `data/gis/manifest.json`, `scripts/verify_gis_layers.mjs` (`npm run gis:verify`) | Implemented and working; refuses to serve anything that fails verification |
| Generated artifact | `apps/web/src/generated/gis-layers.json` | `layers: []` — **zero verified layers** |
| Manifest schema | `data/gis/manifest.example.json` | Documents every required field (see §5) |
| Geometry in git | `.gitignore` excludes `data/gis/*.geojson` | Deliberate: licence-bound geometry is not committed by accident |
| Map layer panel | `useGisLayers`, `RiverMap` | Renders verified layers with legend + credit line; rejected layers are listed as rejected, never drawn |

Three different things live under the word "overlay" in this project, and they
must stay distinguishable in the UI and in code:

1. **City-level ML predictions** — the model scores each of the four supported
   cities (Quezon City, Marikina, Manila, Pasig; `apps/web/src/lib/locations.ts`).
   These are *numbers per city*, keyed by city code. There is no geometry
   anywhere in this path and there must never be geometry derived from it.
2. **Verified static hazard layers** — GeoJSON files that passed
   `npm run gis:verify`. Drawn with the legend and credit line the manifest
   declares. They describe *static susceptibility*, not the model's forecast.
3. **Experimental/forecast overlays** — **not offered**. The model has no
   barangay-, street- or pixel-level output, so there is nothing honest to draw.

## 2. What the current model output supports — and what it does not

**City-level.** Each forecast is for one city code. The model input window
(today's rain, antecedent 3/7/30-day rain, soil moisture from Open-Meteo) and
its training data (`data/daily_observations.csv`, city-level daily rows) are
both city-scoped. A city-level "choropleth" is *technically* drawable once a
city-boundary polygon exists, in the strict sense that each polygon would be
filled with that city's single value. See §6 for the conditions and the
honesty requirements; it is not on by default and must not ship without the
boundary file.

**Barangay-level (or finer): not supported, in three independent ways.**

1. No barangay features: the model knows nothing about barangays.
2. No barangay supervision: labels are city-level daily rows.
3. No barangay validation: no metric exists at that granularity.

Painting a city probability across barangay polygons — with or without
boundaries — would fabricate per-barangay precision. **City prediction values
must never be distributed across barangays.** A barangay-capable product
would require: barangay-resolved rainfall/tide/river inputs, barangay-level
labels or a defensible downscaling method, retraining, and barangay-level
validation — a research project, not an overlay task.

## 3. Boundary geometry: formats and candidate sources

Required format for every layer: **GeoJSON `FeatureCollection`, WGS84
(`EPSG:4326`), closed polygon rings, coordinates within the declared bbox.**
Shapefiles, KML and GeoPackage are acceptable starting points but must be
reprojected and converted (QGIS: *Export → Save features as → GeoJSON*) before
verification. Files usually are not committed to git (see `data/gis/README.md`).

Minimum geometry needed for each use case:

| Use case | Geometry needed | Finest sane resolution |
| --- | --- | --- |
| City choropleth (§6) | 4 polygons: one each for Quezon City, Marikina, Manila, Pasig | City boundary |
| Barangay view (future, not planned) | ~1,700 NCR barangay polygons with barangay PSGC codes | Barangay |
| Rivers/catchments | LineString/Polygon for Marikina River system | Catchment |
| Static hazard susceptibility | Scenario polygons as published | As published by the agency — do not resample |

Candidate sources (all require a human licence + provenance check at retrieval
time; licences change):

| Source | What | Licence posture to verify | Notes |
| --- | --- | --- | --- |
| PSA — PSGC (Philippine Statistics Authority) | Administrative boundaries (city, barangay) matching official codes | PSA open-data terms; attribution | The canonical boundary set; codes match `PSGC` used nationally. Format typically shapefile → reproject |
| NAMRIA (National Mapping and Resource Information Authority) | Topographic/coastline/admin base | Government use; redistribution usually restricted — verify | Authoritative but licence-bound; expect "request and keep local" |
| OpenStreetMap extracts (Geofabrik / Overpass / OSM data dumps) | Admin boundaries, rivers, roads | ODbL — share-alike, attribution mandatory | Practical choice for rivers; boundaries vary in quality vs PSA |
| DOST-ASTI / Project NOAH (UP NOAH) | Flood hazard maps (5/25/100-yr), susceptibility | Check the specific product page; terms vary by product | The earlier Phase 5 plan pointed at a remote PMTiles build from a third-party mirror; **that was never integrated, and this repo contains no NOAH data**. Any NOAH use must start from the publisher's own distribution, with licence recorded verbatim |
| DENR — MGB (Mines and Geosciences Bureau) | Geohazard susceptibility (landslide/flood) | Usually government open data with attribution; verify | National coverage, coarse (1:10,000–1:50,000 class depending on sheet) |
| PAGASA | Rainfall normals, monitoring stations | Attribution; verify | Station coordinates, not forecast polygons |
| Local DRRM offices (Marikina CDRRMO etc.) | City-specific risk studies | Negotiated; expect non-standard terms | Best authority for Marikina-specific work |

Resolution reality check: published hazard products are basin/scenario-based,
not barangay-based. A 1:50,000 susceptibility polygon is not a per-house risk
statement. The legend and the manifest `description` must say so.

## 4. Provenance, licence, resolution, update — required per layer

Every manifest entry must carry all of the following (enforced by
`scripts/verify_gis_layers.mjs` for the structural parts; a human owns the rest):

| Field group | Fields | Requirement |
| --- | --- | --- |
| Identity | `id`, `title`, `classification` | `classification` ∈ `hazard` / `boundary` / `stations` (see `data/gis/manifest.example.json`) |
| File | `file`, `sha256`, `bbox`, `geometry` | sha256 filled via `npm run gis:verify -- --write-hashes`; geometry must parse and rings must be closed |
| Classification | `requiredProperties`, `classProperty`, `classColors` | Every feature carries the class property; every class value has a colour |
| **Source** | `source.publisher`, `source.url`, `source.license`, `source.retrievedAt`, `source.note` | Licence recorded **verbatim**; URL must be the page you downloaded from (HTTPS); retrieval date honest |
| Review | `verifiedBy`, `verifiedAt` | The person who checked the file against the publisher's copy; dates real, not future |
| Presentation | `description`, `fillOpacity`, `strokeColor` | Description must state what the layer is **and is not** (e.g. "static susceptibility, not a forecast") |
| Operation | (process requirement, not a field) | Update cadence agreed per layer; re-verify on every file replacement |

Update/maintenance requirements:

- Re-download from the publisher; never edit a layer by hand.
- Replace the file → run `--write-hashes` → review the manifest diff → run
  `npm run gis:verify` → it must print ✓.
- Licence re-check on every refresh (terms change).
- Store the retrieval date honestly; the map credits it.
- Layers rejected by the verifier stay rejected; fix the cause, don't loosen
  the verifier without a written reason and review.

## 5. City-level choropleth — conditions and design (only if boundary geometry is verified)

**Do not implement until a `city-boundaries` layer passes `npm run gis:verify`.**
When it does, a choropleth is legitimate *only under all of these rules*:

1. One polygon per supported city, filled with that city's stored
   `latestOutlook` value (probability band), via a new dynamic source in the
   map — geometry from the verified file, **values from the run at render
   time**. (The current verifier pipeline only draws static layers; binding a
   live run to geometry is new code that must be written and reviewed — it
   does not exist.)
2. Every polygon is labelled "<city> — city-level estimate". Uniform fill
   over a large city (Quezon City ≈ 161 km², Manila ≈ 43 km²) is not
   neighbourhood risk information, and the legend must not imply it.
3. Cities with no stored/current run render as "no run" (neutral), never as
   0% risk.
4. The layer is separate from hazard layers in the panel: one is the model's
   current output, the other is a static published product. They are never
   merged into one legend.
5. Missing/invalid data never renders as a red-looking zero.
6. The always-on disclaimer stays: water level is a model-predicted proxy,
   not a gauge reading; probability is not a probability of drowning or of
   any specific address flooding.

**Even with verified geometry, do not offer a choropleth toggle unless the
UI above ships with it.** A coloured map without those labels reintroduces
the fabrication this plan exists to prevent.

## 6. Barangay-level: what would actually be needed

Blocked on all of the following, none of which exists here:

1. Verified barangay polygons (PSA PSGC or OSM, licence as per §3).
2. Barangay-resolved inputs: rainfall fields (radar/satellite), tide, local
   river levels — Open-Meteo's city-smoothed window is not that.
3. Labels at barangay granularity or a published, validated downscaling
   method — `data/daily_observations.csv` is city-level.
4. Retraining and validation with barangay-level holdout; error metrics per
   barangay.
5. A decision that the added precision is real — typically false for flood
   onset on this timescale.

Until then the map carries **no** barangay capability implication. Copy rules:
"city-level", "per city", "not barangay or street level".

## 7. Suggested delivery order (unauthorised until requested)

1. Obtain PSA city-boundary shapefile for the four cities; reproject to
   WGS84; simplify (keep topology) to a web-sane size; export GeoJSON.
2. Record provenance; manifest entry; `npm run gis:verify -- --write-hashes`;
   review diff; re-run clean.
3. Only then: dynamic choropleth source in the map (code change, review,
   tests), legend, disclaimers, per-city "no run" state.
4. Static hazard layer (e.g. MGB susceptibility) as a *separate* layer with
   its own legend, only from the publisher's file, only after licence review.
5. Nothing barangay-shaped. Ever, without §6.

## 8. Explicit non-goals

- No remote tile/PMTiles source for hazard data without its own licence and
  privacy review (the orphaned Phase 5 plan referenced an unvetted mirror;
  it stays unimplemented).
- No GeoJSON committed to git without a deliberate, written licence decision.
- No interpolated "risk surfaces", heatmaps, or smoothed fields between the
  four cities — they would invent spatial data that does not exist.
- No weakening of `verify_gis_layers` checks to make a file pass.
- No barangay names in risk copy until §6 is fully satisfied.
