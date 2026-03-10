"""Gedeelde adres-utilities voor ETL-scripts.

Bevat logica voor het expanderen van huisnummerbereiken en toevoegingen
uit SDE-beschikkingen naar individuele adressen.
"""

import re


def expand_huisnummer(huisnummer: str, toevoeging: str | None = None) -> list[tuple[str, str | None]]:
    """Expandeer een huisnummerbereik naar individuele (huisnummer, toevoeging) paren.

    SDE-data bevat soms bereiken zoals:
        '42-48'    → [('42',None), ('44',None), ('46',None), ('48',None)]  (even/oneven stap)
        '13-17'    → [('13',None), ('15',None), ('17',None)]  (even/oneven stap)
        '20-21'    → [('20',None), ('21',None)]  (verschil 1, beide nummers)
        '14-1'     → [('14',None)]  (tweede kleiner → negeren)
        '35-1-2'   → [('35',None)]  (tweede kleiner → rest negeren)
        '6-8-10'   → [('6',None), ('8',None), ('10',None)]  (drie losse nummers, oplopend)
        '1-'       → [('1',None)]  (trailing dash, toevoeging apart)
        '38'       → [('38',None)]  (normaal nummer, ongewijzigd)

    Bereiken met zelfde pariteit worden even/oneven geëxpandeerd.
    Bereiken met gemengde pariteit en verschil 1 leveren beide nummers op.
    Als het tweede getal kleiner is dan het eerste, wordt het genegeerd.
    """
    # Verwijder trailing dash (bijv. "1-" → "1")
    cleaned = huisnummer.rstrip("-")
    if not cleaned:
        return [(huisnummer, toevoeging)]

    # Geen dash → gewoon nummer
    if "-" not in cleaned:
        return [(cleaned, toevoeging)]

    # Split op dash en filter lege/ongeldige delen
    parts = [p.strip() for p in cleaned.split("-") if p.strip()]
    numbers: list[int] = []
    for p in parts:
        try:
            numbers.append(int(p))
        except ValueError:
            # Niet-numeriek deel, geef origineel terug
            return [(huisnummer, toevoeging)]

    if not numbers:
        return [(huisnummer, toevoeging)]

    # Dedupliceer nummers (bijv. "21-21" → alleen [21])
    seen_nums: list[int] = []
    for n in numbers:
        if n not in seen_nums:
            seen_nums.append(n)
    numbers = seen_nums

    if len(numbers) == 1:
        return [(str(numbers[0]), toevoeging)]

    # Bij 3+ nummers: als het tweede kleiner is dan het eerste, negeer de rest
    if len(numbers) >= 3 and numbers[1] < numbers[0]:
        return [(str(numbers[0]), toevoeging)]

    # Bij 3+ nummers (oplopend): losse nummers
    if len(numbers) >= 3:
        return [(str(n), None) for n in numbers]

    # Twee getallen: als het tweede kleiner is, negeer het
    a, b = numbers[0], numbers[1]
    if b < a:
        return [(str(a), toevoeging)]

    # Verschil 1 (gemengde pariteit): beide nummers
    if b - a == 1:
        return [(str(a), None), (str(b), None)]

    # Zelfde pariteit: even/oneven stap (stap 2)
    if a % 2 == b % 2:
        return [(str(n), None) for n in range(a, b + 1, 2)]

    # Gemengde pariteit met verschil > 1: beide nummers als losse nummers
    return [(str(a), None), (str(b), None)]


def _expand_numeriek_bereik(start: int, end: int) -> list[tuple[str, str | None]]:
    """Expandeer een numeriek bereik met even/oneven logica.

    Zelfde pariteit → stap 2 (even/oneven). Verschil 1 → beide nummers.
    Gemengde pariteit met verschil > 1 → beide als losse nummers.
    """
    if end - start == 1:
        return [(str(start), None), (str(end), None)]
    if start % 2 == end % 2:
        return [(str(n), None) for n in range(start, end + 1, 2)]
    return [(str(start), None), (str(end), None)]


def expand_toevoeging(huisnummer: str, toevoeging: str | None) -> list[tuple[str, str | None]] | None:
    """Expandeer exotische toevoegingen naar individuele (huisnummer, toevoeging) paren.

    Herkent de volgende patronen in het toevoeging-veld:
        Cat 1: "t/m 14", "tm 26", "- 165 ."  → numeriek bereik (inclusief)
        Cat 7: "tot 111"                      → numeriek bereik (exclusief)
        Cat 4: "a t/m d", "a, b", "d/e/f"    → letter-bereik of -lijst
        Cat 5: "a + b"                        → letter-toevoegingen
        Cat 2: "en 12", "a en b", "a en 105"  → extra huisnummer(s)
        Cat 5: "+ 23"                         → extra huisnummer
               "/158"                         → extra huisnummer
        Cat 6: ", 40, 60", ",3,5,7"           → komma-gescheiden huisnummers

    Returns None als de toevoeging geen herkenbaar patroon bevat.
    """
    if not toevoeging:
        return None

    t = toevoeging.strip()
    if not t:
        return None

    # Bepaal basis huisnummer als getal
    base_str = huisnummer.rstrip("-")
    try:
        base_nr = int(base_str)
    except ValueError:
        return None

    # --- Cat 1: "t/m N" of "tm N" bereik (inclusief) ---
    tm_match = re.match(r'^t/?m\s*(\d+)', t, re.IGNORECASE)
    if tm_match:
        eind_nr = int(tm_match.group(1))
        if eind_nr > base_nr:
            return _expand_numeriek_bereik(base_nr, eind_nr)
        return None

    # --- Cat 1 variant: "- N ." (bijv. "- 165 .") ---
    dash_dot_match = re.match(r'^-\s*(\d+)\s*\.?$', t)
    if dash_dot_match:
        eind_nr = int(dash_dot_match.group(1))
        if eind_nr > base_nr:
            return _expand_numeriek_bereik(base_nr, eind_nr)
        return None

    # --- Cat 7: "tot N" bereik (exclusief eindnummer) ---
    tot_match = re.match(r'^tot\s+(\d+)$', t, re.IGNORECASE)
    if tot_match:
        eind_nr = int(tot_match.group(1))
        if eind_nr > base_nr:
            # Exclusief: range met stap 2 (stopt vanzelf voor eind_nr)
            return [(str(n), None) for n in range(base_nr, eind_nr, 2)]
        return None

    # --- Cat 4: Letter-bereik "a t/m d", "a tm e", "a - c" ---
    letter_range = re.match(r'^([a-z])\s*(?:t/?m|tm|-)\s*([a-z])$', t, re.IGNORECASE)
    if letter_range:
        start_l = letter_range.group(1).lower()
        end_l = letter_range.group(2).lower()
        if end_l >= start_l:
            return [(str(base_nr), chr(c)) for c in range(ord(start_l), ord(end_l) + 1)]
        return None

    # --- Cat 4: Letter-lijst "a, b, c" of "d/e/f" of "a b" ---
    if re.match(r'^[a-z](\s*[,/\s]\s*[a-z])+$', t, re.IGNORECASE):
        letters = re.findall(r'[a-z]', t, re.IGNORECASE)
        if len(letters) >= 2:
            return [(str(base_nr), l.lower()) for l in letters]

    # --- Cat 5: "a + b" letter-toevoegingen ---
    letter_plus = re.match(r'^([a-z])\s*\+\s*([a-z])$', t, re.IGNORECASE)
    if letter_plus:
        return [
            (str(base_nr), letter_plus.group(1).lower()),
            (str(base_nr), letter_plus.group(2).lower()),
        ]

    # --- Cat 2: "a en b" twee letter-toevoegingen ---
    a_en_b = re.match(r'^([a-z])\s+en\s+([a-z])$', t, re.IGNORECASE)
    if a_en_b:
        return [
            (str(base_nr), a_en_b.group(1).lower()),
            (str(base_nr), a_en_b.group(2).lower()),
        ]

    # --- Cat 2: "a en N" letter-toevoeging + extra huisnummer ---
    a_en_nr = re.match(r'^([a-z])\s+en\s+(\d+)([a-z]?)$', t, re.IGNORECASE)
    if a_en_nr:
        extra_toev = a_en_nr.group(3).lower() or None
        return [
            (str(base_nr), a_en_nr.group(1).lower()),
            (a_en_nr.group(2), extra_toev),
        ]

    # --- Cat 2: "en N" extra huisnummer (bijv. "en 12", "en 9a") ---
    en_match = re.match(r'^en\s+(\d+)([a-z]?)$', t, re.IGNORECASE)
    if en_match:
        extra_toev = en_match.group(2).lower() or None
        return [(str(base_nr), None), (en_match.group(1), extra_toev)]

    # --- Cat 5: "+ N" extra huisnummer (bijv. "+ 23") ---
    plus_match = re.match(r'^\+\s*(\d+)([a-z]?)$', t)
    if plus_match:
        extra_toev = plus_match.group(2).lower() or None
        return [(str(base_nr), None), (plus_match.group(1), extra_toev)]

    # --- Cat 5: "/N" extra huisnummer (bijv. "/158") ---
    slash_match = re.match(r'^/(\d+)$', t)
    if slash_match:
        return [(str(base_nr), None), (slash_match.group(1), None)]

    # --- Cat 6: Komma-gescheiden (bijv. ", 40, 60" of ",3,5,7") ---
    if ',' in t:
        parts = [p.strip() for p in t.split(',') if p.strip()]
        if parts:
            results: list[tuple[str, str | None]] = [(str(base_nr), None)]
            for part in parts:
                nr_match = re.match(r'^(\d+)([a-z]?)$', part, re.IGNORECASE)
                if nr_match:
                    tv = nr_match.group(2).lower() or None
                    results.append((nr_match.group(1), tv))
                elif re.match(r'^[a-z]$', part, re.IGNORECASE):
                    results.append((str(base_nr), part.lower()))
                else:
                    return None  # Onherkenbaar deel, geef op
            if len(results) > 1:
                return results

    return None
