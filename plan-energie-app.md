# Energie Netwerk Applicatie — Technisch Plan

## 1. Visie & Probleem

Bedrijven die hernieuwbare energie opwekken in Nederland (zoals Sunrock met 300+ EANs) missen een geïntegreerd overzicht van hun netaansluitingen, groencodes en SDE-subsidies. De relevante data zit verspreid over meerdere overheidsplatforms en er bestaat geen applicatie die deze samenvoegt tot één bruikbaar geheel.

**Doelgroep MVP:** Energiebedrijven, projectontwikkelaars, asset managers en adviseurs die werken met grootschalige hernieuwbare energieprojecten.

---

## 2. MVP Scope

### 2.1 Databronnen MVP

| # | Bron | Wat het oplevert | Toegang | Prioriteit |
|---|------|-------------------|---------|------------|
| 1 | **RVO SDE-projecten (Excel)** | Alle SDE/SDE+/SDE++ projecten: locatie, categorie, vermogen, subsidieronde, realisatiestatus, aanvrager | Gratis download (CC-0 licentie) van rvo.nl/feiten-en-cijfers | Must-have |
| 2 | **BAG API (Kadaster/PDOK)** | Adressen → coördinaten (geocoding), bouwjaar, oppervlakte, gebruiksdoel, BAG-ID | Gratis REST API (geen key nodig voor PDOK) | Must-have |
| 3 | **EDSN EAN-codeboek API** | EAN-codes per adres, netbeheerder, product (elektriciteit/gas), allocatiepunt-type | Gratis publieke API (geen key nodig), base URL: gateway.edsn.nl/eancodeboek | Must-have |

**Waarom deze drie?**
- SDE-data is de rijkste dataset en direct beschikbaar als download — geen API-limieten, geen authenticatie-complexiteit.
- BAG levert de geocoding (coördinaten voor de straal-filter) én de koppelsleutel (adres/postcode) tussen de datasets.
- EAN-codeboek maakt de brug van adres naar specifieke allocatiepunten (EAN-codes), inclusief netbeheerder en product (elektriciteit/gas).

### 2.2 Features MVP

**De applicatie bestaat uit één pagina: een list view met adressen.**

**Filter paneel (boven de tabel)**
- Eén tekstveld (unified search) waarin de gebruiker kan typen. Het doorzoekt tegelijkertijd:
  - Adressen (straat, postcode, woonplaats)
  - SDE-beschikkingen (SDE-nummer, aanvrager)
  - Allocatiepunten (EAN-code)
- De gebruiker selecteert één resultaat uit de dropdown. De selectie kan ook weer leeggemaakt worden.
- **Wanneer een waarde is geselecteerd**, verschijnen naast het tekstveld:
  - **Radius-slider**: default 500m, range 0–2.000m. De tabel filtert op alle adressen binnen een cirkel met de ingestelde straal rond het adres van het geselecteerde object.
  - **Mini map view**: kleine kaart die het geselecteerde adres en het cirkelvormige gebied toont, plus de adressen die binnen de straal vallen.
- **Wanneer het tekstveld leeg is**: slider en mini map zijn verborgen, en de tabel toont alle adressen in de database. Virtualisatie/paginatie zorgt ervoor dat de pagina niet vastloopt bij grote datasets (TanStack Table of AG Grid biedt hier row virtualization voor).
- **Default state**: bij het laden van de pagina is het eerste adres uit de dataset geselecteerd met de default straal van 500m.

**Tabel (list view)**
- Primaire rijen zijn **adressen**
- Drie kolomgroepen, visueel gescheiden:
  1. **Adres-kolommen**: straat, huisnummer, postcode, woonplaats
  2. **SDE Beschikking-kolommen**: SDE-nummer, aanvrager, categorie, vermogen (kW), subsidieronde, status, realisatiejaar — meerdere rijen per adres mogelijk (0..N)
  3. **Allocatiepunt-kolommen**: EAN-code, type (PAP/SAP/VAP), product (ELK/GAS), netbeheerder — meerdere rijen per adres mogelijk (0..N)
- De SDE- en Allocatiepunt-kolomgroepen staan naast elkaar; er is geen impliciete rij-koppeling tussen een specifieke beschikking en een specifiek allocatiepunt.
- Per kolom: zoeken, filteren en sorteren

### 2.3 Datamodel MVP

#### Kernbegrippen

Het datamodel bevat drie entiteiten: **Adres**, **SDE Beschikking** en **Allocatiepunt**.

- Een **allocatiepunt** is een administratief meetpunt waar energie-uitwisseling aan een marktpartij wordt toegewezen. Elk allocatiepunt krijgt een eigen **EAN-code** (18 cijfers). Er zijn drie typen:
  - **PAP** (Primair Allocatiepunt): standaard eerste meetpunt op een aansluiting. In het EAN-codeboek is het PAP niet te onderscheiden van de fysieke aansluiting — ze delen dezelfde EAN-code. Meet verbruik en teruglevering.
  - **SAP** (Secundair Allocatiepunt): extra meetpunt op dezelfde aansluiting voor een fysiek gescheiden installatie met een eigen leverancier (MLOEA).
  - **VAP** (Virtueel Allocatiepunt): virtueel meetpunt achter de hoofdaansluiting, zonder fysieke aanpassing. Wordt gebruikt om bijv. batterij, laadpaal of productie apart te registreren.
- Een **SDE-beschikking** is een subsidiebesluit van RVO, gekoppeld aan een adres. Het projectnummer begint met "SDE" + 7 cijfers (bijv. SDE2413154). We gebruiken "beschikking" in het datamodel en "project" in de UI.
- Er is geen directe relatie tussen SDE Beschikking en Allocatiepunt — beide hangen onafhankelijk onder Adres. De koppeling is impliciet via het gedeelde adres.

**NB: Groencodes** (productie-EAN's) en **VertiCer-registraties** zijn bewust buiten de MVP scope gehouden. De groencode is niet beschikbaar via het publieke EAN-codeboek. Dit kan in een latere versie worden toegevoegd wanneer VertiCer-data ontsloten wordt.

**Relaties:**
```
Adres ←── N:1 ── SDE Beschikking
Adres ←── N:1 ── Allocatiepunt
```

#### Entiteiten

```
┌──────────────────────────┐
│         Adres             │  ← Verrijkt vanuit BAG (Kadaster)
│──────────────────────────│
│ adres_id (PK)             │
│ postcode                  │
│ huisnummer                │
│ toevoeging                │
│ straat                    │
│ woonplaats                │
│ bag_id                    │  BAG nummeraanduiding ID
│ latitude                  │
│ longitude                 │
│ bouwjaar                  │
│ oppervlakte_m2            │
│ gebruiksdoel              │  Woon / Kantoor / Industrie / etc.
└──────────────────────────┘
       ▲ N:1                    ▲ N:1
       │                        │
┌──────────────────┐    ┌──────────────────────────┐
│ SDE Beschikking   │    │     Allocatiepunt         │
│──────────────────│    │──────────────────────────│
│ sde_nummer (PK)   │    │ ean_code (PK)             │
│ adres_id (FK)     │    │ adres_id (FK)             │
│ aanvrager         │    │ type                      │  PAP / SAP / VAP
│ hoofdcategorie    │    │ product                   │  ELK / GAS
│ categorie         │    │ netbeheerder              │  Liander / Stedin / etc.
│ subcategorie      │    │ capaciteit                │  Bijv. 3x25A
│ vermogen_kw       │    │ richting                  │  AFNAME / TERUGLEV. / BEIDE
│ max_prod_kwh_jr   │    │ linked_pap_ean            │  EAN van PAP (alleen bij SAP)
│ subsidieronde     │    └──────────────────────────┘
│ status            │  In ontwikkeling / Gerealiseerd / Ingetrokken
│ realisatiejaar    │
│ looptijd_jaren    │  12 of 15 jaar
│ postcode          │
│ gemeente          │
│ provincie         │
└──────────────────┘
```

#### Data-beschikbaarheid MVP

| Entiteit | Bron | Volledigheid |
|----------|------|-------------|
| **Adres** | BAG API (PDOK) | ✅ Volledig |
| **Allocatiepunt** | EAN-codeboek (EDSN) | ⚠️ PAP + SAP zichtbaar; VAP mogelijk niet in publiek codeboek. MVP-scope: alleen Tilburg. |
| **SDE Beschikking** | RVO Excel download | ✅ Alle beschikte projecten (landelijk) |

### 2.4 Data Pipeline MVP

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  RVO Excel   │    │   BAG API    │    │ EAN-codeboek │
│  (download)  │    │   (PDOK)     │    │   (EDSN)     │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────┐
│              ETL / Data Ingestion (Python)            │
│  1. Parse SDE Excel → extract beschikkingen          │
│  2. Per beschikking: geocode adres via BAG API       │
│  3. EAN lookup per adres → allocatiepunten           │
│     (MVP: alleen adressen in Tilburg)                │
│  4. Schrijf naar Supabase (PostgreSQL + PostGIS)     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    Supabase      │
              │  (PostgreSQL +   │
              │   PostGIS)       │
              └─────────────────┘
```

**Ververstrategie:**
- **SDE-data:** RVO updatet dit ca. per kwartaal. Scheduled script om nieuwe Excel te downloaden, diffen tegen bestaande data, en upserten.
- **BAG:** Wijzigt zelden voor bestaande adressen. Eenmalige import + maandelijks delta-check.
- **EAN-codes:** MVP-scope beperkt tot Tilburg. Batch-import voor alle adressen in Tilburg die een SDE-beschikking hebben. Later uitbreiden naar andere steden/regio's.

**Koppellogica:**
De SDE-data bevat postcode + gemeente. Via postcode+huisnummer doen we een BAG-lookup voor exacte coördinaten en een EAN-codeboek lookup voor de allocatiepunten (in Tilburg).

---

## 3. Technische Stack

| Component | Technologie | Motivatie |
|-----------|-------------|-----------|
| **Frontend** | React + TypeScript | Standaard, grote ecosysteem, deploy naar Netlify/Cloudflare Pages |
| **Tabel** | TanStack Table (of AG Grid) | Krachtige filtering/sorting/search out of the box |
| **Kaart** | Leaflet of MapLibre GL | Open source, gratis, performant |
| **Backend / Database** | **Supabase** (PostgreSQL + PostGIS) | Hosted PostgreSQL met auto-generated REST API, realtime, auth indien nodig. PostGIS extensie beschikbaar voor geo-queries. Elimineert de noodzaak voor een aparte backend. |
| **ETL** | Python scripts (pandas) | Lokaal of als scheduled job: verwerken van RVO Excel + API calls naar BAG en EAN-codeboek, resultaat direct naar Supabase pushen |
| **Frontend hosting** | **Netlify** of **Cloudflare Pages** | Gratis tier ruim voldoende voor MVP. Netlify is iets simpeler in setup; Cloudflare Pages biedt edge-performance + Workers voor eventuele serverless functies |
| **Scheduled jobs** | Supabase Edge Functions of Cloudflare Workers (cron) | Periodieke data-refresh triggers |
| **Domein / CDN** | Cloudflare (DNS + CDN) | Gratis, snelle DNS, DDoS-bescherming |

### Waarom Supabase als backend?

Supabase geeft je in één keer:
- **PostgreSQL + PostGIS** — de database die je nodig hebt, inclusief geospatiale queries voor de straal-filter
- **Auto-generated REST API** — geen aparte FastAPI/Express backend nodig voor standaard CRUD
- **Row Level Security** — mocht je later gebruikersaccounts willen toevoegen
- **Realtime subscriptions** — mocht je later live updates willen
- **Dashboard** — handig voor ad-hoc queries en data-inspectie
- **Gratis tier** — 500 MB database, 50K monthly active users, ruim genoeg voor MVP

De ETL-pipeline (Python) draait lokaal of als scheduled job en schrijft direct naar Supabase via de Supabase client library of directe PostgreSQL connectie. De frontend praat rechtstreeks met de Supabase REST API.

### Architectuur overzicht

```
┌──────────────────────────────────────────────────────┐
│                    DATA BRONNEN                       │
│  RVO Excel  │  BAG API (PDOK)  │  EAN-codeboek (EDSN)│
└──────┬───────────────┬──────────────────┬────────────┘
       │               │                  │
       ▼               ▼                  ▼
┌──────────────────────────────────────────────────────┐
│              ETL Pipeline (Python)                     │
│  Draait lokaal of als scheduled Cloudflare Worker      │
│  1. Parse RVO Excel → SDE beschikkingen                │
│  2. Geocode via BAG API → coördinaten + gebouwinfo     │
│  3. EAN lookup per adres → allocatiepunten              │
│  4. Schrijf naar Supabase (PostgreSQL + PostGIS)       │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    Supabase      │
              │  PostgreSQL +    │
              │    PostGIS       │
              │  + REST API      │
              └────────┬────────┘
                       │ Auto-generated REST API
                       ▼
              ┌─────────────────┐
              │    Frontend      │
              │  React + TS      │
              │  (Netlify /      │
              │  Cloudflare      │
              │  Pages)          │
              └─────────────────┘
```

---

## 4. Bouwfasen MVP

### Fase 1: Data Pipeline + Database (week 1-2)
- [ ] Supabase project aanmaken, PostGIS extensie activeren
- [ ] Database schema opzetten (3 tabellen: adres, sde_beschikking, allocatiepunt)
- [ ] SDE Excel downloaden en parsen (Python + pandas)
- [ ] SDE-beschikkingen importeren naar Supabase (landelijk)
- [ ] BAG API integratie voor adresverrijking + geocoding (coördinaten voor straal-filter)
- [ ] EAN-codeboek API integratie (publieke API, geen key nodig) — scope: alleen adressen in Tilburg
- [ ] Basis data-validatie en logging

### Fase 2: Frontend - Tabel + Filter (week 2-4)
- [ ] React + TypeScript project opzetten
- [ ] Supabase client configureren
- [ ] Filter paneel:
  - Unified search tekstveld (doorzoekt adressen, SDE-nummers, EAN-codes)
  - Dropdown met gemengde zoekresultaten
  - Radius-slider (0–2.000m, default 500m) — conditioneel zichtbaar bij selectie
  - Mini map view (Leaflet/MapLibre) met geselecteerd adres, cirkelgebied en adressen binnen straal — conditioneel zichtbaar bij selectie
  - Geo-query via PostGIS (ST_DWithin) voor straal-filter
- [ ] Tabel component met TanStack Table of AG Grid:
  - Kolomgroep 1: Adres (straat, huisnummer, postcode, woonplaats)
  - Kolomgroep 2: SDE Beschikkingen (0..N per adres, naast elkaar)
  - Kolomgroep 3: Allocatiepunten (0..N per adres, naast elkaar)
  - Visuele scheiding tussen kolomgroepen
- [ ] Per kolom: zoeken, filteren en sorteren
- [ ] Row virtualization voor performance bij lege filter (alle adressen)
- [ ] Sorteren per kolom
- [ ] Default state: eerste adres geselecteerd, 500m straal
- [ ] Deploy naar Netlify of Cloudflare Pages

### Fase 3: Polish & Launch (week 4-5)
- [ ] Error handling en loading states
- [ ] Cloudflare DNS + CDN configuratie
- [ ] Basis monitoring (Supabase dashboard + eventueel uptime check)
- [ ] README en documentatie

---

## 5. Roadmap: Toekomstige Databronnen

Na de MVP zijn dit de databronnen die we stapsgewijs kunnen toevoegen, geordend op verwachte waarde:

### Prioriteit 1 — Hoge waarde, relatief eenvoudig

| Bron | Toevoeging | Integratie |
|------|-----------|------------|
| **EP-Online (energielabels)** | Energielabel per gebouw op detailpagina | Gratis API-key, koppeling via postcode/huisnummer |
| **Capaciteitskaart (Netbeheer NL)** | Netcongestiestatus per voedingsgebied als kaartlaag | Open data export, overlay op bestaande kaart |
| **SCE-projecten (RVO)** | Coöperatieve energieprojecten toevoegen | Zelfde format als SDE-data |

### Prioriteit 2 — Waardevolle verrijking

| Bron | Toevoeging | Integratie |
|------|-----------|------------|
| **Netbeheerders open data** (Liander, Stedin, Enexis) | Geaggregeerd verbruik per postcode, opgesteld PV-vermogen per buurt | CSV downloads, per netbeheerder apart |
| **CERES register** | Geregistreerde opwekinstallaties (kleinverbruik) | Via netbeheerders |
| **VertiCer / CertiQ data** | Garanties van Oorsprong details, certificaatstatus | Mate van openbaarheid nog te onderzoeken |

### Prioriteit 3 — Nice-to-have

| Bron | Toevoeging | Integratie |
|------|-----------|------------|
| **CBS buurt/wijkdata** | Demografische context per locatie | Open data API |
| **Klimaatmonitor** | Voortgang energietransitie per gemeente | Open data |
| **KvK Handelsregister** | Verrijking bedrijfsinformatie bij SDE-aanvragers | Deels openbaar, deels betaald |
| **overheid.io API** | Energielabels met GeoJSON radius-queries | Gratis API |
| **Nationaal Energie Dashboard (ned.nl)** | Landelijke energieproductie en -verbruik context | Publieke website data |

### Prioriteit 4 — Geavanceerde features

| Feature | Databron | Complexiteit |
|---------|----------|-------------|
| **Portfoliobeheer** | Gebruikers kunnen eigen EANs groeperen | Gebruikersaccounts nodig |
| **Alerts** | Notificatie bij wijziging subsidie-status of netcongestie | Polling + notificatie-systeem |
| **Export** | Download gefilterde data als Excel/CSV | Backend functionaliteit |
| **Vergelijkingen** | Benchmark project tegen vergelijkbare projecten | Analyse-logica |

---

## 6. Risico's & Aandachtspunten

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| EAN-codeboek API rate limits | Kan bulk-import vertragen | Caching + respecteer limieten, geleidelijke import. MVP beperkt tot Tilburg. |
| SDE Excel format wijzigt | Import breekt | Robuuste parser met validatie, alerts bij fouten |
| BAG API niet bedoeld voor bulk | Mogelijk geblokkeerd bij te veel requests | Gebruik BAG GeoPackage (bulk download) i.p.v. API voor initiële import |
| Geocoding kwaliteit | Niet alle SDE-beschikkingen hebben exact adres | Fallback naar postcode-centroïde |
| Privacy | SDE-data bevat bedrijfsnamen maar geen persoonsgegevens (RVO anonimiseert particulieren) | Alleen openbare data tonen, conform CC-0 licentie |
| Supabase gratis tier limieten | 500 MB database, rate limits op API | Ruim voldoende voor MVP; upgrade naar Pro ($25/mnd) indien nodig |

---

## 7. Concurrentievoordeel

Deze applicatie vult een duidelijke marktlacune:

- **RVO SDE-viewer**: alleen SDE-data, geen EAN-koppeling, geen filtering per kolom, legacy ArcGIS interface
- **eancodeboek.nl**: alleen EAN lookup per adres, geen kaart, geen subsidie-informatie
- **Capaciteitskaart**: alleen netcongestie, geen project- of subsidiedata

**Onze app combineert voor het eerst**: allocatiepunten (EAN) + SDE-subsidies + straal-gebaseerd zoeken — in één moderne webapplicatie.
