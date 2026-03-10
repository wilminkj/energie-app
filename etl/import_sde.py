"""Import RVO SDE Excel naar Supabase.

Leest de SDE-projecten-in-beheer Excel, extraheert unieke SDE-adressen,
en upsert zowel sde_adressen als SDE-beschikkingen naar Supabase.

Gebruik:
    python -m etl.import_sde --file data/SDE-projecten-in-beheer-januari-2026.xlsx
    python -m etl.import_sde --file data/SDE-projecten-in-beheer-januari-2026.xlsx --dry-run
"""

import argparse
import logging
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd
from supabase import create_client, Client

from etl.config import get_supabase_config

logger = logging.getLogger(__name__)

# RVO Excel kolomnamen (0-indexed, kolom A is leeg)
EXCEL_COLUMNS: dict[str, str] = {
    "SDE ronde": "subsidieronde",
    "Referentie": "sde_nummer",
    "Categorie": "hoofdcategorie",
    "Thema": "categorie",
    "Aanvrager Naam": "aanvrager",
    "Adres": "adres_raw",
    "Postcode": "postcode",
    "Plaats lokatie": "woonplaats",
    "Gemeente": "gemeente",
    "Provincie": "provincie",
    "Vermogen": "vermogen_mw",
    "Eenheid vermogen": "eenheid_vermogen",
    "Beschikte productie per jaar": "productie_per_jaar",
    "Eenheid productie": "eenheid_productie",
    "Looptijd [jr.]": "looptijd_jaren",
    "Gerealiseerd": "gerealiseerd",
    "Ingebruikname jaar ": "realisatiejaar",
}

# Batch size voor Supabase upserts
BATCH_SIZE = 500


def parse_adres(adres_raw: str | None) -> tuple[str | None, str | None, str | None]:
    """Splits een adresregel in straat, huisnummer en toevoeging.

    Voorbeelden:
        'Nozemanstraat 13'     -> ('Nozemanstraat', '13', None)
        'Nozemanstraat 42-48'  -> ('Nozemanstraat', '42-48', None)
        'Kerkweg 1 A'          -> ('Kerkweg', '1', 'A')
        '***'                  -> (None, None, None)
    """
    if not adres_raw or adres_raw.strip() == "***":
        return None, None, None

    adres_raw = adres_raw.strip()

    # Match: straat + huisnummer + optionele toevoeging
    match = re.match(
        r"^(.+?)\s+(\d+[\d\-]*)\s*(.*)$",
        adres_raw,
    )
    if not match:
        logger.warning("Kan adres niet parsen: %r", adres_raw)
        return adres_raw, None, None

    straat = match.group(1).strip()
    huisnummer = match.group(2).strip()
    toevoeging = match.group(3).strip() or None

    return straat, huisnummer, toevoeging


def clean_postcode(postcode: str | None) -> str | None:
    """Normaliseer postcode: verwijder spaties, uppercase, skip geanonimiseerde.

    '3023 TK' -> '3023TK'
    '4141**'  -> None (geanonimiseerd)
    """
    if not postcode:
        return None
    postcode = str(postcode).strip().upper().replace(" ", "")
    if "*" in postcode:
        return None
    if not re.match(r"^\d{4}[A-Z]{2}$", postcode):
        logger.warning("Ongeldige postcode: %r", postcode)
        return None
    return postcode


def read_excel(file_path: Path) -> pd.DataFrame:
    """Lees de RVO SDE Excel en retourneer een opgeschoond DataFrame."""
    logger.info("Lezen van Excel: %s", file_path)

    df = pd.read_excel(
        file_path,
        sheet_name=0,
        header=9,  # Rij 10 (0-indexed: 9) bevat de kolomnamen
        dtype=str,  # Alles als string inlezen, we converteren later
    )

    # Verwijder de eerste lege kolom (kolom A is leeg in de Excel)
    if df.columns[0] is None or str(df.columns[0]).startswith("Unnamed"):
        df = df.iloc[:, 1:]

    # Hernoem kolommen naar ons schema
    rename_map = {}
    for excel_col, our_col in EXCEL_COLUMNS.items():
        # Zoek case-insensitive match
        for col in df.columns:
            if col.strip().lower() == excel_col.strip().lower():
                rename_map[col] = our_col
                break

    df = df.rename(columns=rename_map)

    # Filter rijen zonder referentienummer
    df = df.dropna(subset=["sde_nummer"])

    logger.info("Aantal rijen ingelezen: %d", len(df))
    return df


def transform_data(df: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Transformeer het DataFrame naar lijsten van adres- en beschikking-records.

    Returns:
        Tuple van (adressen, beschikkingen)
    """
    adressen: dict[str, dict[str, Any]] = {}  # key: postcode|huisnummer|toevoeging
    beschikkingen: list[dict[str, Any]] = []
    skipped = 0

    for _, row in df.iterrows():
        try:
            sde_nummer = str(row["sde_nummer"]).strip()
            postcode = clean_postcode(row.get("postcode"))

            # Parse adres
            straat, huisnummer, toevoeging = parse_adres(row.get("adres_raw"))

            # Vermogen: MW -> kW
            vermogen_kw: float | None = None
            try:
                vermogen_mw = float(row.get("vermogen_mw", 0) or 0)
                vermogen_kw = round(vermogen_mw * 1000, 3)
            except (ValueError, TypeError):
                logger.warning("Ongeldig vermogen voor %s: %r", sde_nummer, row.get("vermogen_mw"))

            # Productie per jaar: MWh -> kWh (alleen voor MWh, niet voor ton CO2)
            max_productie_kwh_jr: float | None = None
            try:
                productie = float(row.get("productie_per_jaar", 0) or 0)
                eenheid = str(row.get("eenheid_productie", "")).strip().lower()
                if eenheid == "mwh":
                    max_productie_kwh_jr = round(productie * 1000, 3)
                # ton CO2 -> sla op als NULL (niet vergelijkbaar met kWh)
            except (ValueError, TypeError):
                pass

            # Looptijd
            looptijd: int | None = None
            try:
                looptijd = int(float(row.get("looptijd_jaren", 0) or 0))
            except (ValueError, TypeError):
                pass

            # Realisatiejaar
            realisatiejaar: int | None = None
            try:
                val = row.get("realisatiejaar")
                if val and str(val).strip():
                    realisatiejaar = int(float(val))
            except (ValueError, TypeError):
                pass

            # Status afleiden uit 'Gerealiseerd' kolom
            gerealiseerd = str(row.get("gerealiseerd", "")).strip().lower()
            status = "Gerealiseerd" if gerealiseerd == "ja" else "In ontwikkeling"

            # Adres record (alleen als we postcode + huisnummer hebben)
            adres_key: str | None = None
            if postcode and huisnummer:
                adres_key = f"{postcode}|{huisnummer}|{toevoeging or ''}"
                if adres_key not in adressen:
                    adressen[adres_key] = {
                        "postcode": postcode,
                        "huisnummer": huisnummer,
                        "toevoeging": toevoeging,
                        "straat": straat,
                        "woonplaats": str(row.get("woonplaats", "")).strip() or None,
                    }

            # Beschikking record
            beschikking: dict[str, Any] = {
                "sde_nummer": sde_nummer,
                "aanvrager": str(row.get("aanvrager", "")).strip() or None,
                "hoofdcategorie": str(row.get("hoofdcategorie", "")).strip() or None,
                "categorie": str(row.get("categorie", "")).strip() or None,
                "vermogen_kw": vermogen_kw,
                "max_productie_kwh_jr": max_productie_kwh_jr,
                "subsidieronde": str(row.get("subsidieronde", "")).strip() or None,
                "status": status,
                "realisatiejaar": realisatiejaar,
                "looptijd_jaren": looptijd,
                "postcode": postcode,
                "gemeente": str(row.get("gemeente", "")).strip() or None,
                "provincie": str(row.get("provincie", "")).strip() or None,
                "_adres_key": adres_key,  # tijdelijk, voor FK-koppeling
            }

            # Anonieme aanvragers opschonen
            if beschikking["aanvrager"] == "***":
                beschikking["aanvrager"] = None

            beschikkingen.append(beschikking)

        except Exception:
            skipped += 1
            logger.exception("Fout bij verwerken rij %s", row.get("sde_nummer", "?"))

    logger.info(
        "Transformatie klaar: %d adressen, %d beschikkingen, %d overgeslagen",
        len(adressen),
        len(beschikkingen),
        skipped,
    )
    return list(adressen.values()), beschikkingen


def upsert_sde_adressen(client: Client, adressen: list[dict[str, Any]]) -> dict[str, int]:
    """Upsert SDE-adressen naar Supabase en retourneer mapping van adres_key -> sde_adres_id."""
    logger.info("Upserting %d SDE-adressen naar Supabase...", len(adressen))
    adres_key_to_id: dict[str, int] = {}

    for i in range(0, len(adressen), BATCH_SIZE):
        batch = adressen[i : i + BATCH_SIZE]
        try:
            result = (
                client.table("sde_adres")
                .upsert(batch, on_conflict="postcode,huisnummer,toevoeging")
                .execute()
            )
            for record in result.data:
                key = f"{record['postcode']}|{record['huisnummer']}|{record.get('toevoeging') or ''}"
                adres_key_to_id[key] = record["sde_adres_id"]
        except Exception:
            logger.exception("Fout bij upsert sde_adres-batch %d-%d", i, i + len(batch))

    logger.info("SDE-adressen upsert klaar: %d succesvol", len(adres_key_to_id))
    return adres_key_to_id


def upsert_beschikkingen(
    client: Client,
    beschikkingen: list[dict[str, Any]],
    adres_key_to_id: dict[str, int],
) -> int:
    """Upsert beschikkingen naar Supabase. Retourneert aantal succesvol."""
    logger.info("Upserting %d beschikkingen naar Supabase...", len(beschikkingen))
    success = 0

    # Koppel sde_adres_id en verwijder tijdelijke key
    records: list[dict[str, Any]] = []
    for b in beschikkingen:
        record = {k: v for k, v in b.items() if k != "_adres_key"}
        adres_key = b.get("_adres_key")
        record["sde_adres_id"] = adres_key_to_id.get(adres_key) if adres_key else None
        records.append(record)

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        try:
            client.table("sde_beschikking").upsert(batch, on_conflict="sde_nummer").execute()
            success += len(batch)
        except Exception:
            logger.exception("Fout bij upsert beschikking-batch %d-%d", i, i + len(batch))

    logger.info("Beschikkingen upsert klaar: %d/%d succesvol", success, len(records))
    return success


def dry_run_report(
    adressen: list[dict[str, Any]],
    beschikkingen: list[dict[str, Any]],
) -> None:
    """Print een samenvatting van de data die geïmporteerd zou worden."""
    print("\n=== DRY RUN RAPPORT ===\n")
    print(f"Adressen:      {len(adressen):>6}")
    print(f"Beschikkingen: {len(beschikkingen):>6}")

    # Beschikkingen per hoofdcategorie
    cats: dict[str, int] = {}
    for b in beschikkingen:
        cat = b.get("hoofdcategorie") or "Onbekend"
        cats[cat] = cats.get(cat, 0) + 1
    print("\nBeschikkingen per hoofdcategorie:")
    for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {cat:<30} {count:>6}")

    # Status verdeling
    statuses: dict[str, int] = {}
    for b in beschikkingen:
        s = b.get("status") or "Onbekend"
        statuses[s] = statuses.get(s, 0) + 1
    print("\nBeschikkingen per status:")
    for s, count in sorted(statuses.items(), key=lambda x: -x[1]):
        print(f"  {s:<30} {count:>6}")

    # Voorbeeld records
    print("\nVoorbeeld adres (eerste 3):")
    for a in adressen[:3]:
        print(f"  {a}")

    print("\nVoorbeeld beschikking (eerste 3):")
    for b in beschikkingen[:3]:
        display = {k: v for k, v in b.items() if k != "_adres_key"}
        print(f"  {display}")

    print("\n=== EINDE DRY RUN ===")


def main() -> None:
    """Hoofdfunctie: parse argumenten en voer import uit."""
    parser = argparse.ArgumentParser(
        description="Importeer RVO SDE Excel naar Supabase",
    )
    parser.add_argument(
        "--file",
        type=Path,
        required=True,
        help="Pad naar de SDE Excel (bijv. data/SDE-projecten-in-beheer-januari-2026.xlsx)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Toon de data die geïmporteerd zou worden zonder te schrijven",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    if not args.file.exists():
        logger.error("Bestand niet gevonden: %s", args.file)
        sys.exit(1)

    # Lees en transformeer
    df = read_excel(args.file)
    adressen, beschikkingen = transform_data(df)

    if args.dry_run:
        dry_run_report(adressen, beschikkingen)
        return

    # Schrijf naar Supabase
    config = get_supabase_config()
    client = create_client(config.url, config.key)

    adres_key_to_id = upsert_sde_adressen(client, adressen)
    upsert_beschikkingen(client, beschikkingen, adres_key_to_id)

    logger.info("Import voltooid.")


if __name__ == "__main__":
    main()
