-- ============================================================
-- Energie App — Hernoem adres → sde_adres + nieuwe nummeraanduiding
-- ============================================================
-- adres wordt hernoemd naar sde_adres (representeert SDE-locatie, soms een bereik).
-- Nieuwe tabel nummeraanduiding bevat individuele BAG-adressen (bron: EDSN).
-- Allocatiepunten worden gekoppeld aan nummeraanduiding ipv sde_adres.
-- ============================================================

-- ============================================================
-- 1. Hernoem adres → sde_adres
-- ============================================================

-- Drop afhankelijke objecten die hernoemd moeten worden
DROP TRIGGER IF EXISTS trg_adres_geom ON adres;
DROP INDEX IF EXISTS idx_adres_geom;
DROP INDEX IF EXISTS idx_adres_postcode;

-- Hernoem tabel
ALTER TABLE adres RENAME TO sde_adres;

-- Hernoem primary key kolom
ALTER TABLE sde_adres RENAME COLUMN adres_id TO sde_adres_id;

-- Hernoem constraint
ALTER TABLE sde_adres RENAME CONSTRAINT uq_adres_postcode_huisnr_toev TO uq_sde_adres_postcode_huisnr_toev;

-- Hernoem comments
COMMENT ON TABLE  sde_adres IS 'SDE-locaties uit RVO-beschikkingen (kan een adresbereik zijn, bijv. 42-48)';
COMMENT ON COLUMN sde_adres.geom IS 'PostGIS punt (EPSG:4326) voor straal-queries';

-- Maak indexen opnieuw aan met nieuwe namen
CREATE INDEX idx_sde_adres_geom     ON sde_adres USING GIST (geom);
CREATE INDEX idx_sde_adres_postcode ON sde_adres (postcode);

-- Trigger opnieuw aanmaken op hernoemde tabel
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

-- Oude trigger-functie opruimen
DROP FUNCTION IF EXISTS update_adres_geom();

-- ============================================================
-- 2. Update FK in sde_beschikking
-- ============================================================
ALTER TABLE sde_beschikking RENAME COLUMN adres_id TO sde_adres_id;

-- Drop oude index en maak opnieuw aan
DROP INDEX IF EXISTS idx_sde_adres_id;
CREATE INDEX idx_sde_beschikking_sde_adres_id ON sde_beschikking (sde_adres_id);

-- ============================================================
-- 3. Nieuwe tabel: nummeraanduiding
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

CREATE INDEX idx_nummeraanduiding_sde_adres_id ON nummeraanduiding (sde_adres_id);
CREATE INDEX idx_nummeraanduiding_postcode     ON nummeraanduiding (postcode);

-- ============================================================
-- 4. Wijzig allocatiepunt: FK naar nummeraanduiding + nieuwe velden
-- ============================================================

-- Verwijder oude FK en index naar adres
DROP INDEX IF EXISTS idx_allocatie_adres_id;
ALTER TABLE allocatiepunt DROP COLUMN adres_id;

-- Verwijder ongebruikte kolommen
ALTER TABLE allocatiepunt DROP COLUMN capaciteit;
ALTER TABLE allocatiepunt DROP COLUMN richting;

-- Voeg nieuwe FK toe
ALTER TABLE allocatiepunt ADD COLUMN bag_nummeraanduiding_id TEXT REFERENCES nummeraanduiding(bag_nummeraanduiding_id);

-- Voeg nieuwe EDSN-velden toe
ALTER TABLE allocatiepunt ADD COLUMN grid_operator_ean      TEXT;
ALTER TABLE allocatiepunt ADD COLUMN special_metering_point  TEXT;
ALTER TABLE allocatiepunt ADD COLUMN grid_area               TEXT;

CREATE INDEX idx_allocatiepunt_bag_nra_id ON allocatiepunt (bag_nummeraanduiding_id);

-- ============================================================
-- 5. Update RPC functie: werkt op sde_adres
-- ============================================================
CREATE OR REPLACE FUNCTION adressen_binnen_straal(
  center_lat float,
  center_lon float,
  straal_m int
) RETURNS SETOF sde_adres AS $$
  SELECT *
  FROM sde_adres
  WHERE geom IS NOT NULL
    AND extensions.ST_DWithin(
      geom::extensions.geography,
      extensions.ST_SetSRID(extensions.ST_MakePoint(center_lon, center_lat), 4326)::extensions.geography,
      straal_m
    );
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION adressen_binnen_straal IS 'Retourneert alle SDE-adressen binnen straal_m meter van het opgegeven punt';
