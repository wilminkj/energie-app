"""Geocode SDE-adressen via de BAG/PDOK Locatieserver API.

Haalt SDE-adressen zonder coördinaten op uit Supabase, bevraagt de PDOK API,
en schrijft latitude, longitude, bag_id, bouwjaar, oppervlakte en gebruiksdoel terug.

Gebruik:
    python -m etl.geocode_bag
    python -m etl.geocode_bag --limit 100
"""

import argparse
import logging
import sys
import time
from typing import Any

import requests
from supabase import create_client, Client

from etl.config import get_supabase_config

logger = logging.getLogger(__name__)

PDOK_BASE_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"
REQUESTS_PER_SECOND = 10
REQUEST_INTERVAL = 1.0 / REQUESTS_PER_SECOND


def fetch_ungeoocoded_sde_adressen(client: Client, limit: int | None = None) -> list[dict[str, Any]]:
    """Haal SDE-adressen op die nog geen latitude/longitude hebben.

    Pagineert automatisch omdat Supabase standaard max 1000 rijen retourneert.
    """
    PAGE_SIZE = 1000
    all_data: list[dict[str, Any]] = []
    offset = 0

    while True:
        query = (
            client.table("sde_adres")
            .select("sde_adres_id, postcode, huisnummer, toevoeging")
            .is_("latitude", "null")
            .order("sde_adres_id")
            .range(offset, offset + PAGE_SIZE - 1)
        )
        result = query.execute()
        all_data.extend(result.data)

        if len(result.data) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    if limit:
        all_data = all_data[:limit]

    logger.info("Gevonden: %d SDE-adressen zonder coördinaten", len(all_data))
    return all_data


def geocode_adres(postcode: str, huisnummer: str, toevoeging: str | None = None) -> dict[str, Any] | None:
    """Bevraag de PDOK Locatieserver voor één adres.

    Returns:
        Dict met lat, lon, bag_id, bouwjaar, oppervlakte_m2, gebruiksdoel
        of None bij geen resultaat.
    """
    query_parts = [postcode, huisnummer]
    if toevoeging:
        query_parts.append(toevoeging)
    query = " ".join(query_parts)

    try:
        response = requests.get(
            PDOK_BASE_URL,
            params={
                "q": query,
                "fq": "type:adres",
                "rows": 1,
            },
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException:
        logger.exception("API-fout voor %s", query)
        return None

    docs = data.get("response", {}).get("docs", [])
    if not docs:
        logger.debug("Geen resultaat voor: %s", query)
        return None

    doc = docs[0]

    # Coördinaten: PDOK geeft centroide_ll als "lat lon" string
    centroide = doc.get("centroide_ll")
    lat: float | None = None
    lon: float | None = None
    if centroide:
        # Format: "POINT(lon lat)"
        try:
            coords = centroide.replace("POINT(", "").replace(")", "").split()
            lon = float(coords[0])
            lat = float(coords[1])
        except (IndexError, ValueError):
            logger.warning("Kan coördinaten niet parsen: %r", centroide)

    result: dict[str, Any] = {
        "latitude": lat,
        "longitude": lon,
        "bag_id": doc.get("nummeraanduiding_id"),
        "bouwjaar": _safe_int(doc.get("bouwjaar")),
        "oppervlakte_m2": _safe_int(doc.get("oppervlakte")),
        "gebruiksdoel": doc.get("gebruiksdoel"),
    }
    return result


def _safe_int(value: Any) -> int | None:
    """Converteer naar int, of None bij fout."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def update_sde_adres(client: Client, sde_adres_id: int, geo_data: dict[str, Any]) -> bool:
    """Werk een SDE-adres bij met geocoding-resultaten."""
    try:
        # Verwijder None-waarden zodat we bestaande data niet overschrijven
        update_data = {k: v for k, v in geo_data.items() if v is not None}
        if not update_data:
            return False

        client.table("sde_adres").update(update_data).eq("sde_adres_id", sde_adres_id).execute()
        return True
    except Exception:
        logger.exception("Fout bij updaten SDE-adres %d", sde_adres_id)
        return False


def main() -> None:
    """Hoofdfunctie: geocode alle SDE-adressen zonder coördinaten."""
    parser = argparse.ArgumentParser(
        description="Geocode SDE-adressen via PDOK BAG Locatieserver",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximaal aantal SDE-adressen om te geocoden (voor testen)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    config = get_supabase_config()
    client = create_client(config.url, config.key)

    adressen = fetch_ungeoocoded_sde_adressen(client, limit=args.limit)
    if not adressen:
        logger.info("Alle SDE-adressen zijn al geocoded. Niets te doen.")
        return

    success = 0
    failed = 0
    no_result = 0

    for i, adres in enumerate(adressen):
        sde_adres_id = adres["sde_adres_id"]
        postcode = adres["postcode"]
        huisnummer = adres["huisnummer"]
        toevoeging = adres.get("toevoeging")

        geo_data = geocode_adres(postcode, huisnummer, toevoeging)

        if geo_data and geo_data.get("latitude") is not None:
            if update_sde_adres(client, sde_adres_id, geo_data):
                success += 1
            else:
                failed += 1
        else:
            no_result += 1

        # Rate limiting
        if i < len(adressen) - 1:
            time.sleep(REQUEST_INTERVAL)

        # Voortgangslog elke 100 adressen
        if (i + 1) % 100 == 0:
            logger.info(
                "Voortgang: %d/%d verwerkt (success=%d, geen resultaat=%d, fouten=%d)",
                i + 1,
                len(adressen),
                success,
                no_result,
                failed,
            )

    logger.info(
        "Geocoding voltooid: %d/%d succesvol, %d geen resultaat, %d fouten",
        success,
        len(adressen),
        no_result,
        failed,
    )


if __name__ == "__main__":
    main()
