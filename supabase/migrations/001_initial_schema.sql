-- ============================================================
-- Energie App — Initial Schema
-- Supabase migration: PostGIS + kerntabellen
-- ============================================================

-- Enable PostGIS extension (in extensions schema op Supabase)
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ============================================================
-- 1. sde_adres
-- ============================================================
CREATE TABLE sde_adres (
    sde_adres_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    postcode     TEXT NOT NULL,
    huisnummer   TEXT NOT NULL,
    toevoeging   TEXT,
    straat       TEXT,
    woonplaats   TEXT,
    bag_id       TEXT,
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    bouwjaar     INTEGER,
    oppervlakte_m2 INTEGER,
    gebruiksdoel   TEXT,
    geom         extensions.GEOMETRY(Point, 4326),

    CONSTRAINT uq_sde_adres_postcode_huisnr_toev
        UNIQUE (postcode, huisnummer, toevoeging)
);

COMMENT ON TABLE  sde_adres IS 'SDE-locaties uit RVO-beschikkingen (kan een adresbereik zijn, bijv. 42-48)';
COMMENT ON COLUMN sde_adres.geom IS 'PostGIS punt (EPSG:4326) voor straal-queries';

-- ============================================================
-- 2. sde_beschikking
-- ============================================================
CREATE TABLE sde_beschikking (
    sde_nummer          TEXT PRIMARY KEY,
    sde_adres_id        BIGINT REFERENCES sde_adres(sde_adres_id),
    aanvrager           TEXT,
    hoofdcategorie      TEXT,
    categorie           TEXT,
    subcategorie        TEXT,
    vermogen_kw         DOUBLE PRECISION,
    max_productie_kwh_jr DOUBLE PRECISION,
    subsidieronde       TEXT,
    status              TEXT,
    realisatiejaar      INTEGER,
    looptijd_jaren      INTEGER,
    postcode            TEXT,
    gemeente            TEXT,
    provincie           TEXT
);

COMMENT ON TABLE sde_beschikking IS 'SDE/SDE+/SDE++ beschikkingen (bron: RVO)';

-- ============================================================
-- 3. nummeraanduiding
-- ============================================================
CREATE TABLE nummeraanduiding (
    bag_nummeraanduiding_id TEXT PRIMARY KEY,
    sde_adres_id            BIGINT REFERENCES sde_adres(sde_adres_id),
    postcode                TEXT,
    huisnummer              TEXT,
    toevoeging              TEXT,
    straat                  TEXT,
    woonplaats              TEXT
);

COMMENT ON TABLE  nummeraanduiding IS 'Individuele BAG-adressen (bron: EDSN EAN-codeboek)';
COMMENT ON COLUMN nummeraanduiding.bag_nummeraanduiding_id IS 'BAG nummeraanduiding ID (van EDSN bagId)';
COMMENT ON COLUMN nummeraanduiding.sde_adres_id IS 'Koppeling naar SDE-locatie (via expand-logica op huisnummerbereiken)';

-- ============================================================
-- 4. allocatiepunt
-- ============================================================
CREATE TABLE allocatiepunt (
    ean_code                TEXT PRIMARY KEY,
    bag_nummeraanduiding_id TEXT REFERENCES nummeraanduiding(bag_nummeraanduiding_id),
    type                    TEXT,
    product                 TEXT,
    netbeheerder            TEXT,
    linked_pap_ean          TEXT,
    grid_operator_ean       TEXT,
    special_metering_point  TEXT,
    grid_area               TEXT
);

COMMENT ON TABLE allocatiepunt IS 'EAN-codes / allocatiepunten (bron: EDSN codeboek)';

-- ============================================================
-- Indexen
-- ============================================================
CREATE INDEX idx_sde_adres_geom              ON sde_adres USING GIST (geom);
CREATE INDEX idx_sde_adres_postcode          ON sde_adres (postcode);
CREATE INDEX idx_sde_beschikking_sde_adres_id ON sde_beschikking (sde_adres_id);
CREATE INDEX idx_nummeraanduiding_sde_adres_id ON nummeraanduiding (sde_adres_id);
CREATE INDEX idx_nummeraanduiding_postcode     ON nummeraanduiding (postcode);
CREATE INDEX idx_allocatiepunt_bag_nra_id      ON allocatiepunt (bag_nummeraanduiding_id);

-- ============================================================
-- Trigger: automatisch geom vullen bij lat/lon wijziging
-- ============================================================
CREATE OR REPLACE FUNCTION update_sde_adres_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    ELSE
        NEW.geom := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sde_adres_geom
    BEFORE INSERT OR UPDATE OF latitude, longitude ON sde_adres
    FOR EACH ROW
    EXECUTE FUNCTION update_sde_adres_geom();
