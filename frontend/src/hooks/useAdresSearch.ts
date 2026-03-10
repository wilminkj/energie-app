import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { SearchResult } from '../types'

export function useAdresSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (q: string) => {
    // Cancel previous request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const pattern = `%${trimmed}%`

    // Split query into street + house number parts (e.g. "theseusstraat 6" → "theseusstraat", "6")
    const adresMatch = trimmed.match(/^(.+?)\s+(\d+.*)$/)

    try {
      let adresQuery = supabase
        .from('sde_adres')
        .select('sde_adres_id, straat, huisnummer, postcode, woonplaats, latitude, longitude')

      if (adresMatch) {
        const straatPattern = `%${adresMatch[1]}%`
        const huisnummerPattern = `${adresMatch[2]}%`
        adresQuery = adresQuery
          .ilike('straat', straatPattern)
          .ilike('huisnummer', huisnummerPattern)
      } else {
        adresQuery = adresQuery
          .or(`straat.ilike.${pattern},postcode.ilike.${pattern},woonplaats.ilike.${pattern}`)
      }

      const [adresRes, sdeRes, allocRes] = await Promise.all([
        adresQuery.limit(5),
        supabase
          .from('sde_beschikking')
          .select('sde_nummer, aanvrager, sde_adres_id, sde_adres:sde_adres_id(latitude, longitude)')
          .or(`sde_nummer.ilike.${pattern},aanvrager.ilike.${pattern}`)
          .limit(5),
        supabase
          .from('allocatiepunt')
          .select('ean_code, product, netbeheerder, bag_id, nummeraanduiding:nummeraanduiding_id(sde_adres_id, sde_adres:sde_adres_id(sde_adres_id, latitude, longitude))')
          .ilike('ean_code', pattern)
          .limit(5),
      ])

      if (controller.signal.aborted) return

      const searchResults: SearchResult[] = []

      if (adresRes.data) {
        for (const a of adresRes.data) {
          searchResults.push({
            type: 'adres',
            label: `📍 ${a.straat ?? ''} ${a.huisnummer}, ${a.postcode} ${a.woonplaats ?? ''}`,
            sde_adres_id: a.sde_adres_id,
            latitude: a.latitude,
            longitude: a.longitude,
          })
        }
      }

      if (sdeRes.data) {
        for (const s of sdeRes.data) {
          // sde_adres_id is FK (many-to-one) → Supabase retourneert object, niet array
          const sdeAdres = s.sde_adres as unknown as { latitude: number | null; longitude: number | null } | null
          searchResults.push({
            type: 'sde',
            label: `⚡ ${s.sde_nummer} — ${s.aanvrager ?? 'Onbekend'}`,
            sde_adres_id: s.sde_adres_id!,
            latitude: sdeAdres?.latitude ?? null,
            longitude: sdeAdres?.longitude ?? null,
          })
        }
      }

      if (allocRes.data) {
        for (const ap of allocRes.data) {
          // nummeraanduiding_id is FK (many-to-one) → Supabase retourneert object, niet array
          const nra = ap.nummeraanduiding as unknown as {
            sde_adres_id: number | null;
            sde_adres: { sde_adres_id: number; latitude: number | null; longitude: number | null } | null;
          } | null
          const sdeAdres = nra?.sde_adres ?? null
          searchResults.push({
            type: 'allocatiepunt',
            label: `🔌 ${ap.ean_code} — ${ap.product ?? ''} (${ap.netbeheerder ?? ''})`,
            sde_adres_id: sdeAdres?.sde_adres_id ?? nra?.sde_adres_id ?? 0,
            latitude: sdeAdres?.latitude ?? null,
            longitude: sdeAdres?.longitude ?? null,
          })
        }
      }

      setResults(searchResults)
    } catch {
      if (!controller.signal.aborted) {
        setResults([])
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      search(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, search])

  return { results, loading }
}
