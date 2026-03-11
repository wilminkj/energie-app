# Energie Netwerk Overzicht

Nederlandse webapplicatie die SDE-subsidiedata (RVO), BAG-adresgegevens (Kadaster/PDOK) en EAN-allocatiepunten (EDSN) combineert in één doorzoekbaar overzicht. Zoek op adres, SDE-nummer of EAN-code en filter op straal rond een locatie.

![Screenshots](docs/screenshots/)

---

## Tech stack

- **Frontend:** React + TypeScript, AG Grid, Tailwind CSS, Vite
- **Backend:** Supabase (PostgreSQL + PostGIS + auto-generated REST API)
- **ETL:** Python (pandas, requests, supabase-py)
- **Hosting:** Netlify (of Cloudflare Pages)

## Projectstructuur

```
energie-app/
├── frontend/              # React + TypeScript applicatie
│   ├── src/
│   │   ├── components/    # FilterPanel, AdresTable, UnifiedSearch, RadiusSlider
│   │   ├── hooks/         # useFilteredAdressen, useAdresSearch
│   │   ├── lib/           # Supabase client
│   │   └── types/         # TypeScript interfaces
│   ├── .env.example       # Frontend environment variabelen
│   └── package.json
├── etl/                   # Python ETL scripts
│   ├── config.py          # Supabase configuratie
│   ├── import_sde.py      # RVO SDE Excel → Supabase
│   ├── geocode_bag.py     # PDOK BAG API → geocoding
│   └── import_ean.py      # EDSN EAN-codeboek → allocatiepunten
├── supabase/
│   └── migrations/        # SQL migraties (001, 002, 003)
├── data/                  # RVO Excel bronbestanden
├── .env.example           # ETL environment variabelen
├── requirements.txt       # Python dependencies
└── netlify.toml           # Netlify deploy configuratie
```

## Prerequisites

- **Node.js** >= 18
- **Python** >= 3.11
- **Supabase account** (gratis tier is voldoende)

## Installatie & setup

### 1. Database

Maak een Supabase project aan en draai de migraties in volgorde:

```sql
-- In de Supabase SQL Editor:
-- 1. supabase/migrations/001_initial_schema.sql
-- 2. supabase/migrations/002_rpc_functions.sql
-- 3. supabase/migrations/003_add_linked_pap_ean.sql
```

### 2. ETL scripts

```bash
# Environment variabelen instellen
cp .env.example .env
# Vul SUPABASE_URL en SUPABASE_KEY in

# Python dependencies installeren
pip install -r requirements.txt

# Stap 1: SDE-data importeren
python -m etl.import_sde --file data/SDE-projecten-in-beheer-januari-2026.xlsx

# Stap 2: Adressen geocoden via BAG
python -m etl.geocode_bag

# Stap 3: EAN-codes ophalen (alleen Tilburg)
python -m etl.import_ean
```

Elk script ondersteunt `--dry-run` om te testen zonder te schrijven. `import_ean` heeft daarnaast `--test` (één test-request) en `--limit N`.

### 3. Frontend

```bash
cd frontend

# Environment variabelen instellen
cp .env.example .env
# Vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in

# Dependencies installeren
npm install

# Development server starten
npm run dev

# Productie build
npm run build
```


### 4. Testing

Voor het testen van de front end kan het handig zijn om de volgende voorbeelden paraat te hebben:
- verschillende bag-id's onder hetzelfde nummeraanduiding: Vloeiveldweg 2
- Verschillende SDE's onder een adres: Vrijheidsweg 4t
- Verschillende SAPs onder een adres: Theseusstraat 63 b
- Meerdere adressen onder een sde-adres: Athenastraat 4-10


## Licentie

Data: SDE-data is CC-0 (RVO). BAG en EAN-codeboek zijn publiek toegankelijk.
