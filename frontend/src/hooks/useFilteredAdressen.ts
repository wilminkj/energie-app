import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { SdeAdresMetRelaties, NummeraanduidingMetAllocatiepunten, SearchResult } from '../types'

interface UseFilteredAdressenResult {
  adressen: SdeAdresMetRelaties[]
  loading: boolean
  error: string | null
  defaultSelection: SearchResult | null
}

export function useFilteredAdressen(
  selection: SearchResult | null,
  straalM: number
): UseFilteredAdressenResult {
  const [adressen, setAdressen] = useState<SdeAdresMetRelaties[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [defaultSelection, setDefaultSelection] = useState<SearchResult | null>(null)

  // Load default selection (first SDE-adres) on mount
  useEffect(() => {
    async function loadDefault() {
      const { data, error: queryError } = await supabase
        .from('sde_adres')
        .select('sde_adres_id, straat, huisnummer, postcode, woonplaats, latitude, longitude')
        .eq('postcode', '5047RH')
        .eq('huisnummer', '61')
        .not('latitude', 'is', null)
        .limit(1)
        .single()

      if (queryError) {
        console.error('Fout bij laden default SDE-adres:', queryError)
        setLoading(false)
        setError(`Kon geen standaard adres laden: ${queryError.message}`)
        return
      }

      if (data) {
        setDefaultSelection({
          type: 'adres',
          label: `📍 ${data.straat ?? ''} ${data.huisnummer}, ${data.postcode} ${data.woonplaats ?? ''}`,
          sde_adres_id: data.sde_adres_id,
          latitude: data.latitude,
          longitude: data.longitude,
        })
      } else {
        setLoading(false)
      }
    }
    loadDefault()
  }, [])

  const fetchData = useCallback(async (sel: SearchResult, radius: number) => {
    setLoading(true)
    setError(null)

    try {
      if (sel.latitude == null || sel.longitude == null) {
        setAdressen([])
        setError('Geselecteerd adres heeft geen coördinaten.')
        return
      }

      // Step 1: get SDE-adres IDs within radius via RPC
      const { data: adressenInStraal, error: rpcError } = await supabase
        .rpc('adressen_binnen_straal', {
          center_lat: sel.latitude,
          center_lon: sel.longitude,
          straal_m: radius,
        })

      if (rpcError) throw rpcError
      if (!adressenInStraal || adressenInStraal.length === 0) {
        setAdressen([])
        return
      }

      const sdeAdresIds = adressenInStraal.map((a: { sde_adres_id: number }) => a.sde_adres_id)

      // Step 2: fetch SDE-beschikkingen + nummeraanduidingen (met allocatiepunten) voor deze adressen
      const [sdeRes, nraRes] = await Promise.all([
        supabase
          .from('sde_beschikking')
          .select('*')
          .in('sde_adres_id', sdeAdresIds),
        supabase
          .from('nummeraanduiding')
          .select('*, allocatiepunt(*)')
          .in('sde_adres_id', sdeAdresIds),
      ])

      // Step 3: group by sde_adres_id
      const sdeMap = new Map<number, typeof sdeRes.data>()
      const nraMap = new Map<number, NummeraanduidingMetAllocatiepunten[]>()

      for (const sde of sdeRes.data ?? []) {
        if (sde.sde_adres_id == null) continue
        const list = sdeMap.get(sde.sde_adres_id) ?? []
        list.push(sde)
        sdeMap.set(sde.sde_adres_id, list)
      }

      for (const nra of nraRes.data ?? []) {
        if (nra.sde_adres_id == null) continue
        const list = nraMap.get(nra.sde_adres_id) ?? []
        list.push({
          ...nra,
          allocatiepunt: nra.allocatiepunt ?? [],
        })
        nraMap.set(nra.sde_adres_id, list)
      }

      const result: SdeAdresMetRelaties[] = adressenInStraal.map(
        (adres: SdeAdresMetRelaties) => ({
          ...adres,
          sde_beschikking: sdeMap.get(adres.sde_adres_id) ?? [],
          nummeraanduiding: nraMap.get(adres.sde_adres_id) ?? [],
        })
      )

      setAdressen(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er is een fout opgetreden.')
      setAdressen([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const active = selection ?? defaultSelection
    if (active) {
      fetchData(active, straalM)
    }
  }, [selection, defaultSelection, straalM, fetchData])

  return { adressen, loading, error, defaultSelection }
}
