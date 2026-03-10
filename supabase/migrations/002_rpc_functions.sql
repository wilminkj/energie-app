-- ============================================================
-- Energie App — RPC Functions
-- Supabase migration: geo-query functies voor straal-filter
-- ============================================================

-- SDE-adressen binnen een straal (in meters) rond een punt
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
