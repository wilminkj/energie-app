-- ============================================================
-- 005: Nummeraanduiding gegenereerde PK
--
-- Vervangt bag_nummeraanduiding_id (TEXT) als PK door een
-- gegenereerde nummeraanduiding_id (BIGINT IDENTITY).
-- bag_nummeraanduiding_id wordt verwijderd van nummeraanduiding
-- (is eigenschap van allocatiepunt, niet van het adres).
-- Allocatiepunt krijgt bag_id als plain TEXT-veld en een
-- FK naar de nieuwe nummeraanduiding_id.
-- ============================================================

-- 1. Voeg gegenereerde PK-kolom toe aan nummeraanduiding
ALTER TABLE nummeraanduiding
    ADD COLUMN nummeraanduiding_id BIGINT GENERATED ALWAYS AS IDENTITY;

-- 2. Voeg nieuwe kolom toe aan allocatiepunt
ALTER TABLE allocatiepunt
    ADD COLUMN nummeraanduiding_id BIGINT;

-- 3. Backfill: koppel bestaande allocatiepunten aan nummeraanduiding via bag_id
UPDATE allocatiepunt ap
SET nummeraanduiding_id = nra.nummeraanduiding_id
FROM nummeraanduiding nra
WHERE ap.bag_nummeraanduiding_id = nra.bag_nummeraanduiding_id;

-- 4. Drop oude FK EERST, zodat duplicaat-opruiming niet geblokkeerd wordt
ALTER TABLE allocatiepunt
    DROP CONSTRAINT allocatiepunt_bag_nummeraanduiding_id_fkey;

-- 5. Bij duplicaat-adressen: wijs allocatiepunten om naar het laagste nummeraanduiding_id
--    zodat we de duplicaten daarna kunnen verwijderen
--    (Betreft 2 gevallen: 5048TD|2 en 5046GA|27)
WITH dupes AS (
    SELECT postcode, huisnummer, COALESCE(toevoeging, '') AS toev,
           MIN(nummeraanduiding_id) AS keep_id
    FROM nummeraanduiding
    GROUP BY postcode, huisnummer, COALESCE(toevoeging, '')
    HAVING COUNT(*) > 1
),
to_remove AS (
    SELECT nra.nummeraanduiding_id AS old_id, d.keep_id
    FROM nummeraanduiding nra
    JOIN dupes d ON nra.postcode = d.postcode
                AND nra.huisnummer::text = d.huisnummer::text
                AND COALESCE(nra.toevoeging, '') = d.toev
    WHERE nra.nummeraanduiding_id != d.keep_id
)
UPDATE allocatiepunt ap
SET nummeraanduiding_id = tr.keep_id
FROM to_remove tr
WHERE ap.nummeraanduiding_id = tr.old_id;

-- Verwijder de duplicaat-nummeraanduidingen
WITH dupes AS (
    SELECT postcode, huisnummer, COALESCE(toevoeging, '') AS toev,
           MIN(nummeraanduiding_id) AS keep_id
    FROM nummeraanduiding
    GROUP BY postcode, huisnummer, COALESCE(toevoeging, '')
    HAVING COUNT(*) > 1
)
DELETE FROM nummeraanduiding nra
USING dupes d
WHERE nra.postcode = d.postcode
  AND nra.huisnummer::text = d.huisnummer::text
  AND COALESCE(nra.toevoeging, '') = d.toev
  AND nra.nummeraanduiding_id != d.keep_id;

-- 6. Drop oude PK op nummeraanduiding, zet nieuwe PK
ALTER TABLE nummeraanduiding
    DROP CONSTRAINT nummeraanduiding_pkey;

ALTER TABLE nummeraanduiding
    ADD PRIMARY KEY (nummeraanduiding_id);

-- 7. Hernoem allocatiepunt.bag_nummeraanduiding_id → bag_id
ALTER TABLE allocatiepunt
    RENAME COLUMN bag_nummeraanduiding_id TO bag_id;

-- 8. Verwijder bag_nummeraanduiding_id van nummeraanduiding (is eigenschap van allocatiepunt)
ALTER TABLE nummeraanduiding
    DROP COLUMN bag_nummeraanduiding_id;

-- 9. Voeg nieuwe FK toe
ALTER TABLE allocatiepunt
    ADD CONSTRAINT fk_allocatiepunt_nummeraanduiding
    FOREIGN KEY (nummeraanduiding_id) REFERENCES nummeraanduiding(nummeraanduiding_id);

-- 10. Maak toevoeging NOT NULL met default '' (zodat gewone UNIQUE constraint werkt met PostgREST)
UPDATE nummeraanduiding SET toevoeging = '' WHERE toevoeging IS NULL;
ALTER TABLE nummeraanduiding ALTER COLUMN toevoeging SET DEFAULT '';
ALTER TABLE nummeraanduiding ALTER COLUMN toevoeging SET NOT NULL;

-- 11. Unique constraint op adresvelden (voor dedup in ETL via on_conflict)
ALTER TABLE nummeraanduiding ADD CONSTRAINT uq_nummeraanduiding_adres UNIQUE (postcode, huisnummer, toevoeging);

-- 11. Update indexen
DROP INDEX IF EXISTS idx_allocatiepunt_bag_nra_id;

CREATE INDEX idx_allocatiepunt_nummeraanduiding_id ON allocatiepunt (nummeraanduiding_id);
CREATE INDEX idx_allocatiepunt_bag_id ON allocatiepunt (bag_id);

-- 12. Comments
COMMENT ON COLUMN nummeraanduiding.nummeraanduiding_id IS 'Gegenereerde PK (auto-increment)';
COMMENT ON COLUMN allocatiepunt.bag_id IS 'EDSN bagId (eigenschap van allocatiepunt, geen FK)';
COMMENT ON COLUMN allocatiepunt.nummeraanduiding_id IS 'FK naar nummeraanduiding';
