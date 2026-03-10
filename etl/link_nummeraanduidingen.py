"""Koppel nummeraanduidingen aan SDE-adressen via adres-expansie.

Expandeert huisnummerbereiken uit sde_adres (bijv. "42-48") naar individuele
huisnummers en matcht deze tegen bestaande nummeraanduidingen op basis van
postcode + huisnummer + toevoeging.

Gebruik:
    python -m etl.link_nummeraanduidingen
    python -m etl.link_nummeraanduidingen --dry-run
"""

import argparse
import logging
from typing import Any

from supabase import create_client, Client

from etl.adres_utils import expand_huisnummer, expand_toevoeging
from etl.config import get_supabase_config

logger = logging.getLogger(__name__)

BATCH_SIZE = 500


def fetch_sde_adressen(client: Client) -> list[dict[str, Any]]:
    """Haal alle SDE-adressen op uit Supabase (met paginatie)."""
    PAGE = 1000
    all_data: list[dict[str, Any]] = []
    offset = 0

    while True:
        result = (
            client.table("sde_adres")
            .select("sde_adres_id, postcode, huisnummer, toevoeging")
            .order("sde_adres_id")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        all_data.extend(result.data)

        if len(result.data) < PAGE:
            break
        offset += PAGE

    logger.info("Gevonden: %d SDE-adressen", len(all_data))
    return all_data


def fetch_ongekoppelde_nummeraanduidingen(client: Client) -> list[dict[str, Any]]:
    """Haal nummeraanduidingen op die nog geen sde_adres_id hebben (met paginatie)."""
    PAGE = 1000
    all_data: list[dict[str, Any]] = []
    offset = 0

    while True:
        result = (
            client.table("nummeraanduiding")
            .select("nummeraanduiding_id, postcode, huisnummer, toevoeging")
            .is_("sde_adres_id", "null")
            .order("nummeraanduiding_id")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        all_data.extend(result.data)

        if len(result.data) < PAGE:
            break
        offset += PAGE

    logger.info("Gevonden: %d ongekoppelde nummeraanduidingen", len(all_data))
    return all_data


def build_nra_lookup(
    nummeraanduidingen: list[dict[str, Any]],
) -> dict[str, list[int]]:
    """Bouw een lookup van postcode|huisnummer|toevoeging → nummeraanduiding_ids."""
    lookup: dict[str, list[int]] = {}
    for nra in nummeraanduidingen:
        key = f"{nra['postcode']}|{nra['huisnummer']}|{(nra.get('toevoeging') or '').lower()}"
        lookup.setdefault(key, []).append(nra["nummeraanduiding_id"])
    return lookup


def link_sde_adres_to_nummeraanduidingen(
    sde_adressen: list[dict[str, Any]],
    nra_lookup: dict[str, list[int]],
) -> dict[int, int]:
    """Match geëxpandeerde SDE-adressen tegen nummeraanduidingen.

    Returns:
        Mapping van nummeraanduiding_id → sde_adres_id.
    """
    koppeling: dict[int, int] = {}

    for adres in sde_adressen:
        sde_adres_id = adres["sde_adres_id"]
        huisnummer = adres["huisnummer"]
        toevoeging = adres.get("toevoeging")
        postcode = adres["postcode"]

        # Expandeer het bereik naar individuele huisnummers
        expanded = expand_toevoeging(huisnummer, toevoeging)
        if expanded is None:
            expanded = expand_huisnummer(huisnummer, toevoeging)

        for nr, toev in expanded:
            key = f"{postcode}|{nr}|{(toev or '').lower()}"
            nra_ids = nra_lookup.get(key, [])
            for nra_id in nra_ids:
                koppeling[nra_id] = sde_adres_id

    return koppeling


def update_nummeraanduidingen(
    client: Client, koppeling: dict[int, int]
) -> int:
    """Update sde_adres_id op nummeraanduidingen. Retourneert aantal succesvol."""
    success = 0

    # Groepeer per sde_adres_id voor efficiëntere batch-updates
    per_sde_adres: dict[int, list[int]] = {}
    for nra_id, sde_adres_id in koppeling.items():
        per_sde_adres.setdefault(sde_adres_id, []).append(nra_id)

    for sde_adres_id, nra_ids in per_sde_adres.items():
        for i in range(0, len(nra_ids), BATCH_SIZE):
            batch = nra_ids[i : i + BATCH_SIZE]
            try:
                client.table("nummeraanduiding").update(
                    {"sde_adres_id": sde_adres_id}
                ).in_("nummeraanduiding_id", batch).execute()
                success += len(batch)
            except Exception:
                logger.exception(
                    "Fout bij updaten nummeraanduidingen voor sde_adres_id %d",
                    sde_adres_id,
                )

    return success


def main() -> None:
    """Hoofdfunctie: koppel nummeraanduidingen aan SDE-adressen."""
    parser = argparse.ArgumentParser(
        description="Koppel nummeraanduidingen aan SDE-adressen via adres-expansie",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Toon koppelingen maar schrijf niet naar database",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    config = get_supabase_config()
    client = create_client(config.url, config.key)

    sde_adressen = fetch_sde_adressen(client)
    nummeraanduidingen = fetch_ongekoppelde_nummeraanduidingen(client)

    if not nummeraanduidingen:
        logger.info("Alle nummeraanduidingen zijn al gekoppeld. Niets te doen.")
        return

    nra_lookup = build_nra_lookup(nummeraanduidingen)
    koppeling = link_sde_adres_to_nummeraanduidingen(sde_adressen, nra_lookup)

    logger.info(
        "Koppeling gevonden: %d van %d nummeraanduidingen gekoppeld aan een SDE-adres",
        len(koppeling), len(nummeraanduidingen),
    )

    if args.dry_run:
        print(f"\n=== DRY RUN RAPPORT ===")
        print(f"SDE-adressen:                {len(sde_adressen):>6}")
        print(f"Ongekoppelde nummeraand.:    {len(nummeraanduidingen):>6}")
        print(f"Koppelingen gevonden:        {len(koppeling):>6}")
        ongekoppeld = len(nummeraanduidingen) - len(koppeling)
        print(f"Niet gekoppeld:              {ongekoppeld:>6}")
        print(f"\n=== EINDE DRY RUN ===")
        return

    if koppeling:
        success = update_nummeraanduidingen(client, koppeling)
        logger.info("Update voltooid: %d/%d nummeraanduidingen gekoppeld", success, len(koppeling))
    else:
        logger.info("Geen koppelingen gevonden.")

    logger.info("Koppeling voltooid.")


if __name__ == "__main__":
    main()
