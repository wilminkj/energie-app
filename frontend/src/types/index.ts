export interface SdeAdres {
  sde_adres_id: number;
  postcode: string;
  huisnummer: string;
  toevoeging: string | null;
  straat: string | null;
  woonplaats: string | null;
  bag_id: string | null;
  latitude: number | null;
  longitude: number | null;
  bouwjaar: number | null;
  oppervlakte_m2: number | null;
  gebruiksdoel: string | null;
}

export interface SdeBeschikking {
  sde_nummer: string;
  sde_adres_id: number | null;
  aanvrager: string | null;
  hoofdcategorie: string | null;
  categorie: string | null;
  subcategorie: string | null;
  vermogen_kw: number | null;
  max_productie_kwh_jr: number | null;
  subsidieronde: string | null;
  status: string | null;
  realisatiejaar: number | null;
  looptijd_jaren: number | null;
  postcode: string | null;
  gemeente: string | null;
  provincie: string | null;
}

export interface Nummeraanduiding {
  nummeraanduiding_id: number;
  sde_adres_id: number | null;
  postcode: string | null;
  huisnummer: string | null;
  toevoeging: string | null;
  straat: string | null;
  woonplaats: string | null;
}

export interface Allocatiepunt {
  ean_code: string;
  nummeraanduiding_id: number | null;
  bag_id: string | null;
  type: string | null;
  product: string | null;
  netbeheerder: string | null;
  linked_pap_ean: string | null;
  grid_operator_ean: string | null;
  special_metering_point: string | null;
  grid_area: string | null;
}

export interface NummeraanduidingMetAllocatiepunten extends Nummeraanduiding {
  allocatiepunt: Allocatiepunt[];
}

export interface SdeAdresMetRelaties extends SdeAdres {
  sde_beschikking: SdeBeschikking[];
  nummeraanduiding: NummeraanduidingMetAllocatiepunten[];
}

export type SearchResultType = 'adres' | 'sde' | 'allocatiepunt';

export interface SearchResult {
  type: SearchResultType;
  label: string;
  sde_adres_id: number;
  latitude: number | null;
  longitude: number | null;
}
