import type { SdeAdresMetRelaties } from '../types'

const HEADERS = [
  'EAN-code', 'Type', 'Product', 'Netbeheerder', 'Exacte adres', 'BAG ID',
  'Adres(sen)', 'Postcode', 'Woonplaats',
  'SDE-nummer', 'Aanvrager', 'Categorie', 'Vermogen (kW)', 'Ronde', 'Status', 'Realisatie',
]

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(';') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exporteerCsv(adressen: SdeAdresMetRelaties[]) {
  const lines: string[] = [HEADERS.join(';')]

  for (const adres of adressen) {
    const sdeList = adres.sde_beschikking ?? []
    const allocList: { ean_code: string | null; type: string | null; product: string | null; netbeheerder: string | null; exacteAdres: string | null; bag_id: string | null }[] = []

    for (const nra of adres.nummeraanduiding ?? []) {
      const exacteAdres = [nra.straat, nra.huisnummer, nra.toevoeging].filter(Boolean).join(' ') || null
      for (const ap of nra.allocatiepunt ?? []) {
        allocList.push({
          ean_code: ap.ean_code,
          type: ap.type,
          product: ap.product,
          netbeheerder: ap.netbeheerder,
          exacteAdres,
          bag_id: ap.bag_id,
        })
      }
    }

    const adresWeergave = [adres.straat, adres.huisnummer, adres.toevoeging].filter(Boolean).join(' ') || null
    const maxRows = Math.max(1, sdeList.length, allocList.length)

    for (let i = 0; i < maxRows; i++) {
      const sde = sdeList[i]
      const alloc = allocList[i]
      const row = [
        alloc?.ean_code, alloc?.type, alloc?.product, alloc?.netbeheerder, alloc?.exacteAdres, alloc?.bag_id,
        i === 0 ? adresWeergave : null, i === 0 ? adres.postcode : null, i === 0 ? adres.woonplaats : null,
        sde?.sde_nummer, sde?.aanvrager, sde?.categorie, sde?.vermogen_kw, sde?.subsidieronde, sde?.status, sde?.realisatiejaar,
      ].map(csvEscape)
      lines.push(row.join(';'))
    }
  }

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'energie-netwerk-export.csv'
  a.click()
  URL.revokeObjectURL(url)
}
