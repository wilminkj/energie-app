"""Import EAN-codes uit het EDSN EAN-codeboek naar Supabase.

Haalt allocatiepunten op via de publieke EAN-codeboek API per postcode+product
voor alle postcodes uit SDE-adressen en upsert nummeraanduidingen en allocatiepunten naar Supabase.

De EDSN API levert per allocatiepunt ook een bagId en adresgegevens, waarmee
de nummeraanduiding-tabel wordt gevuld.

Gebruik:
    python -m etl.import_ean
    python -m etl.import_ean --test
    python -m etl.import_ean --dry-run
    python -m etl.import_ean --limit 10
    python -m etl.import_ean --skip-existing
"""

import argparse
import json
import logging
import sys
import time
from typing import Any

import requests
from supabase import create_client, Client

from etl.config import get_supabase_config

logger = logging.getLogger(__name__)

EDSN_BASE_URL = "https://gateway.edsn.nl/eancodeboek/v1/ecbinfoset"
PRODUCTS = ["ELK", "GAS"]
PAGE_SIZE = 100
REQUESTS_PER_SECOND = 5
REQUEST_INTERVAL = 1.0 / REQUESTS_PER_SECOND
BATCH_SIZE = 500


def fetch_sde_postcodes(client: Client, limit: int | None = None) -> list[str]:
    """Haal unieke postcodes op van alle SDE-adressen.

    Pagineert automatisch omdat Supabase standaard max 1000 rijen retourneert.
    """
    PAGE = 1000
    all_data: list[dict[str, Any]] = []
    offset = 0

    while True:
        result = (
            client.table("sde_adres")
            .select("postcode")
            .order("postcode")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        all_data.extend(result.data)

        if len(result.data) < PAGE:
            break
        offset += PAGE

    # Deduplicate postcodes
    seen: set[str] = set()
    postcodes: list[str] = []
    for row in all_data:
        pc = row["postcode"]
        if pc and pc not in seen:
            seen.add(pc)
            postcodes.append(pc)

    if limit:
        postcodes = postcodes[:limit]

    logger.info("Gevonden: %d unieke postcodes uit SDE-adressen", len(postcodes))
    return postcodes


def fetch_verwerkte_postcodes(client: Client) -> set[str]:
    """Haal postcodes op die al nummeraanduidingen hebben in de database."""
    PAGE = 1000
    all_data: list[dict[str, Any]] = []
    offset = 0

    while True:
        result = (
            client.table("nummeraanduiding")
            .select("postcode")
            .order("postcode")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        all_data.extend(result.data)

        if len(result.data) < PAGE:
            break
        offset += PAGE

    postcodes = {row["postcode"] for row in all_data if row.get("postcode")}
    logger.info("Gevonden: %d unieke postcodes al verwerkt in nummeraanduiding", len(postcodes))
    return postcodes


def fetch_ean_page(
    postal_code: str,
    product: str,
    offset: int = 0,
) -> dict[str, Any] | None:
    """Haal één pagina allocatiepunten op uit de EAN-codeboek API.

    Bevraagt alleen op postcode+product (geen huisnummer), zodat we alle
    allocatiepunten voor een postcode in één keer ophalen.

    Returns:
        Dict met 'meteringPoints' lijst, of None bij fout.
    """
    params: dict[str, Any] = {
        "product": product,
        "postalCode": postal_code,
        "limit": PAGE_SIZE,
        "offset": offset,
    }

    try:
        response = requests.get(EDSN_BASE_URL, params=params, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        logger.exception(
            "API-fout voor %s (product=%s, offset=%d)",
            postal_code, product, offset,
        )
        return None


def fetch_all_ean_for_postcode(
    postal_code: str,
    product: str,
) -> list[dict[str, Any]]:
    """Haal alle allocatiepunten op voor één postcode+product, met paginatie."""
    all_points: list[dict[str, Any]] = []
    offset = 0

    while True:
        data = fetch_ean_page(postal_code, product, offset)
        time.sleep(REQUEST_INTERVAL)

        if data is None:
            break

        points = data.get("meteringPoints", [])
        all_points.extend(points)

        if len(points) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return all_points


def nra_dedup_key(postcode: Any, huisnummer: Any, toevoeging: Any) -> str:
    """Maak een dedup-sleutel voor nummeraanduidingen op basis van adresvelden."""
    return f"{postcode}|{huisnummer}|{toevoeging or ''}"


def map_metering_point(point: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None, str | None]:
    """Map een EDSN meteringPoint naar allocatiepunt + nummeraanduiding records.

    Returns:
        Tuple van (allocatiepunt_record, nummeraanduiding_record of None, nra_key of None).
        nummeraanduiding_record is None als er geen adresgegevens beschikbaar zijn.
        nra_key is de dedup-sleutel (postcode|huisnummer|toevoeging) voor koppeling.
    """
    linked_pap = point.get("linkedPrimaryAccessPoint")
    ap_type = "PAP" if not linked_pap else "SAP"

    bag_id = point.get("bagId")
    address = point.get("address") or {}
    postcode = address.get("postalCode")
    huisnummer = address.get("streetNumber")
    toevoeging = address.get("streetNumberAddition") or ""

    allocatiepunt: dict[str, Any] = {
        "ean_code": point["ean"],
        "bag_id": bag_id,
        "type": ap_type,
        "product": point.get("product"),
        "netbeheerder": point.get("organisation"),
        "linked_pap_ean": linked_pap if linked_pap else None,
        "grid_operator_ean": point.get("gridOperatorEan"),
        "special_metering_point": point.get("specialMeteringPoint"),
        "grid_area": point.get("gridArea"),
    }

    nummeraanduiding: dict[str, Any] | None = None
    nra_key: str | None = None
    if postcode and huisnummer:
        nra_key = nra_dedup_key(postcode, huisnummer, toevoeging)
        nummeraanduiding = {
            "postcode": postcode,
            "huisnummer": huisnummer,
            "toevoeging": toevoeging,
            "straat": address.get("street"),
            "woonplaats": address.get("city"),
        }

    return allocatiepunt, nummeraanduiding, nra_key


def upsert_nummeraanduidingen(client: Client, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Upsert nummeraanduidingen naar Supabase. Retourneert records met gegenereerde IDs."""
    all_results: list[dict[str, Any]] = []

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        try:
            result = client.table("nummeraanduiding").upsert(
                batch, on_conflict="postcode,huisnummer,toevoeging"
            ).execute()
            all_results.extend(result.data)
        except Exception:
            logger.exception(
                "Fout bij upsert nummeraanduiding-batch %d-%d", i, i + len(batch)
            )

    return all_results


def upsert_allocatiepunten(client: Client, records: list[dict[str, Any]]) -> int:
    """Upsert allocatiepunten naar Supabase. Retourneert aantal succesvol."""
    success = 0

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        try:
            client.table("allocatiepunt").upsert(batch, on_conflict="ean_code").execute()
            success += len(batch)
        except Exception:
            logger.exception("Fout bij upsert allocatiepunt-batch %d-%d", i, i + len(batch))

    return success


def run_test(client: Client) -> None:
    """Test-modus: doe één request voor de eerste postcode en log de response."""
    postcodes = fetch_sde_postcodes(client, limit=1)
    if not postcodes:
        logger.error("Geen postcodes gevonden in SDE-adressen.")
        sys.exit(1)

    postcode = postcodes[0]
    logger.info("Test-request voor postcode: %s", postcode)

    data = fetch_ean_page(postcode, "ELK")
    print("\n=== TEST RESPONSE ===")
    print(json.dumps(data, indent=2, ensure_ascii=False))
    print("=== EINDE TEST ===\n")


def main() -> None:
    """Hoofdfunctie: parse argumenten en voer import uit."""
    parser = argparse.ArgumentParser(
        description="Importeer EAN-codes uit EDSN EAN-codeboek naar Supabase",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Doe één test-request (ELK voor de eerste postcode) en log de JSON response",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Haal data op maar schrijf niet naar database",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Verwerk maximaal N postcodes",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Sla postcodes over die al nummeraanduidingen hebben in de database",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    config = get_supabase_config()
    client = create_client(config.url, config.key)

    if args.test:
        run_test(client)
        return

    # Haal unieke postcodes op
    postcodes = fetch_sde_postcodes(client, limit=args.limit)
    if not postcodes:
        logger.info("Geen postcodes gevonden in SDE-adressen. Niets te doen.")
        return

    if args.skip_existing:
        verwerkt = fetch_verwerkte_postcodes(client)
        oorspronkelijk = len(postcodes)
        postcodes = [pc for pc in postcodes if pc not in verwerkt]
        logger.info(
            "Skip bestaande: %d → %d postcodes over (%d al verwerkt)",
            oorspronkelijk, len(postcodes), oorspronkelijk - len(postcodes),
        )
        if not postcodes:
            logger.info("Alle postcodes zijn al verwerkt. Niets te doen.")
            return

    all_allocatiepunten: list[dict[str, Any]] = []
    all_nummeraanduidingen: dict[str, dict[str, Any]] = {}  # dedup op postcode|huisnummer|toevoeging
    alloc_to_nra_key: dict[str, str] = {}  # ean_code → nra dedup key
    errors = 0

    for i, postcode in enumerate(postcodes):
        punten_voor = len(all_allocatiepunten)
        try:
            for product in PRODUCTS:
                points = fetch_all_ean_for_postcode(postcode, product)
                for point in points:
                    alloc_record, nra_record, nra_key = map_metering_point(point)
                    all_allocatiepunten.append(alloc_record)
                    if nra_record and nra_key:
                        if nra_key not in all_nummeraanduidingen:
                            all_nummeraanduidingen[nra_key] = nra_record
                        alloc_to_nra_key[alloc_record["ean_code"]] = nra_key
        except Exception:
            errors += 1
            logger.exception("Fout bij verwerken postcode %s", postcode)

        punten_nieuw = len(all_allocatiepunten) - punten_voor
        logger.info(
            "[%d/%d] Postcode %s — %d punten opgehaald (totaal: %d AP, %d NRA)",
            i + 1, len(postcodes), postcode, punten_nieuw,
            len(all_allocatiepunten), len(all_nummeraanduidingen),
        )

    logger.info(
        "Ophalen klaar: %d allocatiepunten, %d nummeraanduidingen, %d postcodes met fouten",
        len(all_allocatiepunten), len(all_nummeraanduidingen), errors,
    )

    if args.dry_run:
        print("\n=== DRY RUN RAPPORT ===")
        print(f"Postcodes verwerkt:      {len(postcodes):>6}")
        print(f"Allocatiepunten:         {len(all_allocatiepunten):>6}")
        print(f"Nummeraanduidingen:      {len(all_nummeraanduidingen):>6}")
        print(f"Fouten:                  {errors:>6}")

        # Tel per type en product
        types: dict[str, int] = {}
        products: dict[str, int] = {}
        for r in all_allocatiepunten:
            t = r.get("type") or "Onbekend"
            types[t] = types.get(t, 0) + 1
            p = r.get("product") or "Onbekend"
            products[p] = products.get(p, 0) + 1

        print("\nPer type:")
        for t, count in sorted(types.items()):
            print(f"  {t:<10} {count:>6}")

        print("\nPer product:")
        for p, count in sorted(products.items()):
            print(f"  {p:<10} {count:>6}")

        if all_allocatiepunten:
            print("\nVoorbeeld allocatiepunt (eerste 3):")
            for r in all_allocatiepunten[:3]:
                print(f"  {r}")

        nra_list = list(all_nummeraanduidingen.values())
        if nra_list:
            print("\nVoorbeeld nummeraanduiding (eerste 3):")
            for r in nra_list[:3]:
                print(f"  {r}")

        print("\n=== EINDE DRY RUN ===")
        return

    # Dedupliceer allocatiepunten op ean_code
    seen: set[str] = set()
    unique_alloc: list[dict[str, Any]] = []
    for r in all_allocatiepunten:
        if r["ean_code"] not in seen:
            seen.add(r["ean_code"])
            unique_alloc.append(r)
    if len(unique_alloc) < len(all_allocatiepunten):
        logger.info(
            "Deduplicatie allocatiepunten: %d → %d uniek",
            len(all_allocatiepunten), len(unique_alloc),
        )

    # Fase 1: upsert nummeraanduidingen en haal gegenereerde IDs op
    nra_list = list(all_nummeraanduidingen.values())
    nra_id_lookup: dict[str, int] = {}  # nra dedup key → nummeraanduiding_id
    if nra_list:
        upserted_nra = upsert_nummeraanduidingen(client, nra_list)
        for row in upserted_nra:
            key = nra_dedup_key(row["postcode"], row["huisnummer"], row.get("toevoeging"))
            nra_id_lookup[key] = row["nummeraanduiding_id"]
        logger.info(
            "Upsert nummeraanduidingen: %d/%d geschreven", len(upserted_nra), len(nra_list)
        )

    # Fase 2: vul nummeraanduiding_id in op allocatiepunten
    for alloc in unique_alloc:
        nra_key = alloc_to_nra_key.get(alloc["ean_code"])
        if nra_key:
            alloc["nummeraanduiding_id"] = nra_id_lookup.get(nra_key)

    if unique_alloc:
        alloc_success = upsert_allocatiepunten(client, unique_alloc)
        logger.info(
            "Upsert allocatiepunten: %d/%d geschreven", alloc_success, len(unique_alloc)
        )

    logger.info("Import voltooid.")


if __name__ == "__main__":
    main()
