# Feature Implementation Plan: adres → sde_adres + nummeraanduiding

**Overall Progress:** `100%` (Alle fases afgerond)

## TLDR
De huidige `adres`-entiteit representeert soms een bereik (bijv. "42-48") uit SDE-beschikkingen. We hernoemen `adres` → `sde_adres` en voegen een nieuwe `nummeraanduiding`-tabel toe die individuele BAG-adressen representeert. De nummeraanduiding-data komt uit de EDSN API (die `bagId` + adresgegevens teruggeeft). Allocatiepunten worden gekoppeld aan nummeraanduidingen via `bag_nummeraanduiding_id`.

## Critical Decisions
- **Naamgeving**: `adres` → `sde_adres`, nieuwe entiteit heet `nummeraanduiding`
- **Nummeraanduiding PK**: `bag_nummeraanduiding_id` (TEXT) — de BAG-ID uit EDSN, is tegelijk PK en natuurlijke sleutel
- **Databron nummeraanduiding**: EDSN API (niet PDOK) — levert `bagId`, adresvelden, en meer
- **Allocatiepunt FK**: `bag_nummeraanduiding_id` → FK naar `nummeraanduiding`
- **sde_adres ↔ nummeraanduiding koppeling**: Via expand-logica (bereiken uitklappen) + match op postcode+huisnummer+toevoeging
- **Straalzoekfunctie**: Blijft op `sde_adres`-niveau
- **Geocoding nummeraanduiding**: Overslaan voor nu
- **EAN scope**: Blijft beperkt tot Tilburg
- **Nieuwe allocatiepunt-velden**: `grid_operator_ean`, `special_metering_point`, `grid_area` (uit EDSN)
- **ETL volgorde**: import_sde → import_ean (vult allocatiepunt + nummeraanduiding) → link_sde_adres (koppelt sde_adres aan nummeraanduidingen via expand-logica)

## Nieuw Datamodel

```
sde_adres (1) ←── (N) sde_beschikking
    │
    │ 1:N (via expand-logica op huisnummerbereiken)
    ▼
nummeraanduiding (1) ←── (N) allocatiepunt
```

### nummeraanduiding tabel
| Kolom | Type | Bron |
|-------|------|------|
| `bag_nummeraanduiding_id` | TEXT PK | EDSN `bagId` |
| `sde_adres_id` | BIGINT FK (nullable) | Expand-logica koppeling |
| `postcode` | TEXT | EDSN `address.postalCode` |
| `huisnummer` | TEXT | EDSN `address.streetNumber` |
| `toevoeging` | TEXT | EDSN `address.streetNumberAddition` |
| `straat` | TEXT | EDSN `address.street` |
| `woonplaats` | TEXT | EDSN `address.city` |

### allocatiepunt tabel (gewijzigd)
| Kolom | Type | Status |
|-------|------|--------|
| `ean_code` | TEXT PK | ongewijzigd |
| `bag_nummeraanduiding_id` | TEXT FK → nummeraanduiding | **nieuw** (vervangt `adres_id`) |
| `type` | TEXT | ongewijzigd |
| `product` | TEXT | ongewijzigd |
| `netbeheerder` | TEXT | ongewijzigd |
| `grid_operator_ean` | TEXT | **nieuw** |
| `special_metering_point` | TEXT | **nieuw** |
| `grid_area` | TEXT | **nieuw** |
| `linked_pap_ean` | TEXT | ongewijzigd |

## Tasks:

### Fase 1: Database Schema

- [x] 🟩 **Step 1: Nieuwe migratie schrijven (`004_sde_adres_nummeraanduiding.sql`)**
  - [x] 🟩 Hernoem tabel `adres` → `sde_adres` (inclusief PK `adres_id` → `sde_adres_id`)
  - [x] 🟩 Update FK in `sde_beschikking`: `adres_id` → `sde_adres_id REFERENCES sde_adres`
  - [x] 🟩 Maak nieuwe tabel `nummeraanduiding` (PK: `bag_nummeraanduiding_id` TEXT, FK: `sde_adres_id`, adresvelden)
  - [x] 🟩 Wijzig `allocatiepunt`: verwijder `adres_id`, voeg `bag_nummeraanduiding_id` FK toe, voeg `grid_operator_ean`, `special_metering_point`, `grid_area` toe, verwijder ongebruikte `capaciteit` en `richting`
  - [x] 🟩 Update trigger `trg_adres_geom` → `trg_sde_adres_geom` op `sde_adres`
  - [x] 🟩 Update RPC `adressen_binnen_straal` → werkt op `sde_adres` (hernoeming)
  - [x] 🟩 Update bestaande migraties (001, 002, 003) zodat ze het nieuwe schema reflecteren

### Fase 2: ETL Pipeline

- [x] 🟩 **Step 2: `import_sde.py` — hernoeming adres → sde_adres**
  - [x] 🟩 Tabel `adres` → `sde_adres` in alle queries/upserts
  - [x] 🟩 Kolom `adres_id` → `sde_adres_id` in alle references
  - [x] 🟩 Functie/variabelnamen aanpassen

- [x] 🟩 **Step 3: `import_ean.py` — herschrijven**
  - [x] 🟩 Hernoeming: `adres` → `sde_adres`, `adres_id` → `sde_adres_id`
  - [x] 🟩 Query-strategie: per postcode+product uit Tilburg sde_adressen (zonder huisnummer-expansie)
  - [x] 🟩 Alle EDSN-velden opslaan: `ean`, `product`, `organisation`, `gridOperatorEan`, `specialMeteringPoint`, `gridArea`, `bagId`, `address.*`
  - [x] 🟩 Nummeraanduiding-records aanmaken/upserten uit EDSN response (`bagId` + adresvelden)
  - [x] 🟩 Allocatiepunt opslaan met `bag_nummeraanduiding_id` FK (ipv `adres_id`)
  - [x] 🟩 Verwijder ongebruikte expand-logica uit EDSN query flow (expand is niet meer nodig voor API calls)

- [x] 🟩 **Step 4: Expand-logica verplaatsen + sde_adres ↔ nummeraanduiding koppeling**
  - [x] 🟩 Verplaats `expand_huisnummer()` en `expand_toevoeging()` naar `etl/adres_utils.py`
  - [x] 🟩 Nieuw script `etl/link_nummeraanduidingen.py`: expandeer sde_adres bereiken → match tegen bestaande nummeraanduidingen → vul `sde_adres_id` FK
  - [x] 🟩 Draait als aparte stap: `python -m etl.link_nummeraanduidingen`

- [x] 🟩 **Step 5: `geocode_bag.py` — aanpassen voor sde_adres**
  - [x] 🟩 Hernoeming: werkt op `sde_adres`-tabel (ipv `adres`)
  - [x] 🟩 Geocodet alleen sde_adres (nummeraanduiding geocoding overslaan voor nu)

### Fase 3: Frontend

- [x] 🟩 **Step 6: TypeScript types updaten**
  - [x] 🟩 `Adres` → `SdeAdres` (met `sde_adres_id`)
  - [x] 🟩 Nieuw interface `Nummeraanduiding` (met `bag_nummeraanduiding_id` PK)
  - [x] 🟩 `AdresMetRelaties` → `SdeAdresMetRelaties` (bevat `nummeraanduiding[]` met geneste `allocatiepunt[]`)
  - [x] 🟩 `Allocatiepunt`: `adres_id` → `bag_nummeraanduiding_id`, nieuwe velden toevoegen

- [x] 🟩 **Step 7: Hooks updaten**
  - [x] 🟩 `useAdresSearch`: queries naar `sde_adres`, allocatiepunt via nummeraanduiding join
  - [x] 🟩 `useFilteredAdressen`: RPC op sde_adres, nummeraanduidingen + allocatiepunten via nested select

- [x] 🟩 **Step 8: Componenten updaten**
  - [x] 🟩 `AdresTable.tsx`: flattenlogica voor sde_adres → nummeraanduiding → allocatiepunt
  - [x] 🟩 `UnifiedSearch.tsx`: hernoeming `adres_id` → `sde_adres_id` in key

### Fase 4: Documentatie

- [x] 🟩 **Step 9: CLAUDE.md updaten**
  - [x] 🟩 Datamodel, ETL pipeline, en domein-context secties bijwerken
