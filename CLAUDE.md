# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nederlandse webapplicatie die SDE-subsidiedata (RVO), BAG-adresgegevens (Kadaster/PDOK) en EAN-allocatiepunten (EDSN) combineert in één doorzoekbaar overzicht. Zoek op adres, SDE-nummer of EAN-code en filter op straal rond een locatie.

## Commands

### Frontend (run from `frontend/`)
- `npm run dev` — start Vite dev server
- `npm run build` — TypeScript check + production build (`tsc -b && vite build`)
- `npm run lint` — ESLint
- `npm run preview` — preview production build locally

### ETL (run from project root, in this order)
- `pip install -r requirements.txt` — install Python dependencies
- `python -m etl.import_sde --file data/<SDE-excel>.xlsx` — import RVO SDE data (landelijk)
- `python -m etl.geocode_bag` — geocode SDE-adressen via PDOK BAG API (optional `--limit N`)
- `python -m etl.import_ean` — import EAN-codes + nummeraanduidingen via EDSN (Tilburg scope, supports `--test` and `--limit N`)
- `python -m etl.link_nummeraanduidingen` — koppel nummeraanduidingen aan SDE-adressen via adres-expansie
- All ETL scripts support `--dry-run` for testing without database writes

### Database
SQL migrations are applied manually in Supabase SQL Editor, in order:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rpc_functions.sql`
3. `supabase/migrations/003_add_linked_pap_ean.sql` (leeg, opgenomen in 001)
4. `supabase/migrations/004_sde_adres_nummeraanduiding.sql` (voor bestaande databases)
5. `supabase/migrations/005_nummeraanduiding_generated_pk.sql` (gegenereerde PK voor nummeraanduiding)

### Deployment
Netlify deploys from `frontend/` with `npm run build`, publishing `dist/`. Node 20. SPA redirect configured.

## Architecture

### Data Flow
```
RVO Excel → import_sde → Supabase (sde_adres + sde_beschikking)
                              ↓
                         geocode_bag → enriches sde_adres with lat/lon + BAG metadata
                              ↓
                         import_ean → nummeraanduiding + allocatiepunt (Tilburg only in MVP)
                              ↓
                         link_nummeraanduidingen → koppelt nummeraanduiding aan sde_adres
                              ↓
                    Supabase REST API (auto-generated)
                              ↓
                    React Frontend (Netlify)
```

### Database (Supabase PostgreSQL + PostGIS)
Four core tables with `sde_adres` and `nummeraanduiding` as central dimensions:
- **`sde_adres`** — PK: `sde_adres_id`, unique on `(postcode, huisnummer, toevoeging)`. Represents SDE location (can be an address range like "42-48"). Has PostGIS `geom` column auto-synced from lat/lon via trigger.
- **`sde_beschikking`** — PK: `sde_nummer`, FK to `sde_adres`. SDE subsidy details.
- **`nummeraanduiding`** — PK: `nummeraanduiding_id` (BIGINT, auto-generated). FK to `sde_adres` (nullable, filled via expand-logica). Unique on `(postcode, huisnummer, toevoeging)`. Individual addresses with postal code, house number, street, city.
- **`allocatiepunt`** — PK: `ean_code`, FK to `nummeraanduiding` via `nummeraanduiding_id`. `bag_id` (TEXT, raw EDSN bagId, no FK). EAN metering points (PAP/SAP). Extra fields: `grid_operator_ean`, `special_metering_point`, `grid_area`.

Relationships: `sde_adres (1) ← (N) sde_beschikking`, `sde_adres (1) ← (N) nummeraanduiding (1) ← (N) allocatiepunt`.

Key RPC: `adressen_binnen_straal(center_lat, center_lon, straal_m)` — PostGIS radius query on `sde_adres` using `ST_DWithin`.

### Frontend (React + TypeScript + Vite)
Single-page app with one main view:
- **App.tsx** — root state: search selection, radius (straalM), cleared flag
- **FilterPanel** → **UnifiedSearch** (searches across sde_adres/sde_beschikking/allocatiepunt tables simultaneously) + **RadiusSlider** (0–2000m)
- **AdresTable** — AG Grid with 3 column groups (Allocatiepunten, Adres, SDE Beschikkingen). Flattens `SdeAdresMetRelaties` (3-level: sde_adres → nummeraanduiding → allocatiepunt) for row spanning.

Custom hooks:
- `useAdresSearch(query)` — parallel Supabase queries across sde_adres, sde_beschikking, allocatiepunt (via nummeraanduiding join), 300ms debounce, AbortController cancellation
- `useFilteredAdressen(selection, straalM)` — calls `adressen_binnen_straal` RPC on sde_adres, then fetches related SDE-beschikkingen + nummeraanduidingen (with nested allocatiepunten), groups by sde_adres_id

### ETL Pipeline (Python)
- `etl/config.py` — reads `SUPABASE_URL` and `SUPABASE_KEY` from `.env`
- `etl/adres_utils.py` — shared address expansion logic (`expand_huisnummer`, `expand_toevoeging`) for SDE address ranges
- `import_sde.py` — parses RVO Excel (header at row 10), converts MW→kW/MWh→kWh, deduplicates sde_adressen, batch upserts (500 records)
- `geocode_bag.py` — PDOK Locatieserver API, rate limited 10 req/sec, geocodes sde_adres with coordinates + building metadata
- `import_ean.py` — EDSN gateway API per postcode+product, rate limited 5 req/sec. Creates nummeraanduiding records from EDSN `bagId` + address fields, and allocatiepunt records with all EDSN fields
- `link_nummeraanduidingen.py` — expands sde_adres ranges and matches against nummeraanduidingen on postcode+huisnummer+toevoeging to fill `sde_adres_id` FK

## Conventions

- **Language**: Dutch for domain logic, variable names, comments, and UI text. English for generic/technical code.
- **Naming**: snake_case in Python and SQL, camelCase in TypeScript/JavaScript.
- **Environment variables**: ETL uses `SUPABASE_URL` + `SUPABASE_KEY` (root `.env`). Frontend uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (`frontend/.env`).
- **Database upserts**: use conflict resolution on natural keys (`sde_nummer`, `ean_code`, `postcode+huisnummer+toevoeging` for nummeraanduiding).
- **Data units**: vermogen stored in kW, productie in kWh (ETL converts from MW/MWh in source).

## Domain Context

- **SDE beschikking**: subsidie-besluit van RVO voor hernieuwbare energieprojecten. Called "project" in UI.
- **SDE-adres**: locatie uit SDE-beschikking, kan een adresbereik zijn (bijv. "Nozemanstraat 42-48"). Centraal voor straalzoekfunctie.
- **Nummeraanduiding**: individueel adres met gegenereerde `nummeraanduiding_id` PK, unique op postcode+huisnummer+toevoeging. Gekoppeld aan sde_adres via expand-logica. Data komt uit EDSN API.
- **Allocatiepunt**: administratief meetpunt met EAN-code, gekoppeld aan nummeraanduiding. Types: PAP (primair), SAP (secundair, has `linked_pap_ean`).
- No direct relation between SDE and allocatiepunt — linked implicitly via sde_adres → nummeraanduiding.
- EAN-codeboek scope in MVP is limited to Tilburg.
- SDE data is landelijk (nationwide).
