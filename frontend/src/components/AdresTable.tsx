import { useMemo, useCallback } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule,
  type ColDef,
  type ColGroupDef,
  type CellKeyDownEvent,
  type CellMouseOverEvent,
  type CellMouseOutEvent,
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community'
import type { SdeAdresMetRelaties, SdeBeschikking, Allocatiepunt } from '../types'

ModuleRegistry.registerModules([AllCommunityModule])

const theme = themeQuartz.withParams({
  headerBackgroundColor: '#f8fafc',
  oddRowBackgroundColor: '#fafbfc',
  fontSize: '11px',
  rowHeight: 28,
  headerHeight: 28,
})

interface FlatRow {
  rowId: string
  sdeAdresId: number
  // SDE-adres fields (only filled on first row of each adres group)
  adres_weergave: string | null
  postcode: string | null
  woonplaats: string | null
  isFirstRow: boolean
  isLastRow: boolean
  adresRowSpan: number
  // SDE fields
  sde_nummer: string | null
  aanvrager: string | null
  categorie: string | null
  vermogen_kw: number | null
  subsidieronde: string | null
  status: string | null
  realisatiejaar: number | null
  // Allocatiepunt fields
  ean_code: string | null
  ean_type: string | null
  product: string | null
  netbeheerder: string | null
  exacte_adres: string | null
  bag_id: string | null
}

function flattenAdressen(adressen: SdeAdresMetRelaties[]): FlatRow[] {
  const rows: FlatRow[] = []

  for (const adres of adressen) {
    const sdeList = adres.sde_beschikking ?? []
    // Flatten allocatiepunten from all nummeraanduidingen, keeping nra context
    const allocList: { ap: Allocatiepunt; exacteAdres: string | null }[] = []
    for (const nra of adres.nummeraanduiding ?? []) {
      const exacteAdres = [nra.straat, nra.huisnummer, nra.toevoeging].filter(Boolean).join(' ') || null
      for (const ap of nra.allocatiepunt ?? []) {
        allocList.push({ ap, exacteAdres })
      }
    }
    const maxRows = Math.max(1, sdeList.length, allocList.length)

    for (let i = 0; i < maxRows; i++) {
      const sde: SdeBeschikking | undefined = sdeList[i]
      const allocItem = allocList[i]

      rows.push({
        rowId: `${adres.sde_adres_id}-${i}`,
        sdeAdresId: adres.sde_adres_id,
        adres_weergave: i === 0 ? [adres.straat, adres.huisnummer, adres.toevoeging].filter(Boolean).join(' ') || null : null,
        postcode: i === 0 ? adres.postcode : null,
        woonplaats: i === 0 ? adres.woonplaats : null,
        isFirstRow: i === 0,
        isLastRow: i === maxRows - 1,
        adresRowSpan: i === 0 ? maxRows : 1,
        sde_nummer: sde?.sde_nummer ?? null,
        aanvrager: sde?.aanvrager ?? null,
        categorie: sde?.categorie ?? null,
        vermogen_kw: sde?.vermogen_kw ?? null,
        subsidieronde: sde?.subsidieronde ?? null,
        status: sde?.status ?? null,
        realisatiejaar: sde?.realisatiejaar ?? null,
        ean_code: allocItem?.ap.ean_code ?? null,
        ean_type: allocItem?.ap.type ?? null,
        product: allocItem?.ap.product ?? null,
        netbeheerder: allocItem?.ap.netbeheerder ?? null,
        exacte_adres: allocItem?.exacteAdres ?? null,
        bag_id: allocItem?.ap.bag_id ?? null,
      })
    }
  }

  return rows
}

/** Bouw een kleurmap voor alle unieke bag_id's, maximaal gespreid via de gulden hoek. */
const GOLDEN_ANGLE = 137.508
function buildBagIdColorMap(rows: FlatRow[]): Map<string, string> {
  const unique = [...new Set(rows.map(r => r.bag_id).filter((id): id is string => id != null))]
  unique.sort()
  const map = new Map<string, string>()
  for (let i = 0; i < unique.length; i++) {
    const hue = (i * GOLDEN_ANGLE) % 360
    map.set(unique[i], `hsl(${hue.toFixed(1)}, 65%, 45%)`)
  }
  return map
}

interface AdresTableProps {
  adressen: SdeAdresMetRelaties[]
  loading: boolean
}

export function AdresTable({ adressen, loading }: AdresTableProps) {
  const rowData = useMemo(() => flattenAdressen(adressen), [adressen])
  const bagIdColors = useMemo(() => buildBagIdColorMap(rowData), [rowData])

  const columnDefs = useMemo<(ColDef<FlatRow> | ColGroupDef<FlatRow>)[]>(
    () => [
      {
        headerName: 'Allocatiepunten',
        headerClass: 'alloc-group-header',
        children: [
          { headerName: 'EAN-code', field: 'ean_code', minWidth: 180 },
          { headerName: 'Type', field: 'ean_type', maxWidth: 80 },
          { headerName: 'Product', field: 'product', maxWidth: 90 },
          { headerName: 'Netbeheerder', field: 'netbeheerder', minWidth: 120 },
          { headerName: 'Exacte adres', field: 'exacte_adres', minWidth: 160 },
          {
            headerName: 'BAG',
            field: 'bag_id',
            maxWidth: 65,
            sortable: false,
            filter: false,
            cellRenderer: (params: { value: string | null }) => {
              if (!params.value) return null
              const color = bagIdColors.get(params.value) ?? 'gray'
              return (
                <a
                  href={`https://bagviewer.kadaster.nl/lvbag/bag-viewer/?objectId=${params.value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={params.value}
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z" />
                    <rect x="9" y="14" width="6" height="8" fill="white" opacity="0.5" rx="0.5" />
                  </svg>
                </a>
              )
            },
          },
        ],
      },
      {
        headerName: 'Adres',
        headerClass: 'adres-group-header',
        children: [
          {
            headerName: 'Adres(sen)',
            field: 'adres_weergave',
            minWidth: 200,
            cellStyle: { fontWeight: 500 },
            rowSpan: (params) => params.data?.isFirstRow ? params.data.adresRowSpan : 1,
            cellClassRules: {
              'spanning-cell': (params) => params.data?.isFirstRow === true && params.data.adresRowSpan > 1,
              'empty-span-cell': (params) => !params.data?.isFirstRow && !params.data?.isLastRow,
              'empty-span-cell-last': (params) => !params.data?.isFirstRow && params.data?.isLastRow === true,
            },
          },
          {
            headerName: 'Postcode',
            field: 'postcode',
            maxWidth: 100,
            cellStyle: { fontWeight: 500 },
            rowSpan: (params) => params.data?.isFirstRow ? params.data.adresRowSpan : 1,
            cellClassRules: {
              'spanning-cell': (params) => params.data?.isFirstRow === true && params.data.adresRowSpan > 1,
              'empty-span-cell': (params) => !params.data?.isFirstRow && !params.data?.isLastRow,
              'empty-span-cell-last': (params) => !params.data?.isFirstRow && params.data?.isLastRow === true,
            },
          },
          {
            headerName: 'Woonplaats',
            field: 'woonplaats',
            minWidth: 120,
            cellStyle: { fontWeight: 500 },
            rowSpan: (params) => params.data?.isFirstRow ? params.data.adresRowSpan : 1,
            cellClassRules: {
              'spanning-cell': (params) => params.data?.isFirstRow === true && params.data.adresRowSpan > 1,
              'empty-span-cell': (params) => !params.data?.isFirstRow && !params.data?.isLastRow,
              'empty-span-cell-last': (params) => !params.data?.isFirstRow && params.data?.isLastRow === true,
            },
          },
        ],
      },
      {
        headerName: 'SDE Beschikkingen',
        headerClass: 'sde-group-header',
        children: [
          { headerName: 'SDE-nummer', field: 'sde_nummer', minWidth: 130 },
          { headerName: 'Aanvrager', field: 'aanvrager', minWidth: 160 },
          { headerName: 'Categorie', field: 'categorie', minWidth: 120 },
          {
            headerName: 'Vermogen (kW)',
            field: 'vermogen_kw',
            maxWidth: 120,
            type: 'numericColumn',
            valueFormatter: (params) =>
              params.value != null ? Number(params.value).toLocaleString('nl-NL') : '–',
          },
          { headerName: 'Ronde', field: 'subsidieronde', maxWidth: 100 },
          { headerName: 'Status', field: 'status', minWidth: 120 },
          { headerName: 'Realisatie', field: 'realisatiejaar', maxWidth: 100 },
        ],
      },
    ],
    [bagIdColors]
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: false,
      resizable: true,
      filter: false,
      suppressMovable: true,
    }),
    []
  )

  const onCellMouseOver = useCallback((event: CellMouseOverEvent<FlatRow>) => {
    const sdeAdresId = event.data?.sdeAdresId
    if (sdeAdresId == null) return
    document.querySelectorAll('.adres-group-hover').forEach(el =>
      el.classList.remove('adres-group-hover')
    )
    event.api.forEachNode((node) => {
      if (node.data?.sdeAdresId === sdeAdresId) {
        const el = document.querySelector(`[row-id="${node.data!.rowId}"]`)
        el?.classList.add('adres-group-hover')
      }
    })
  }, [])

  const onCellMouseOut = useCallback((_event: CellMouseOutEvent<FlatRow>) => {
    document.querySelectorAll('.adres-group-hover').forEach(el =>
      el.classList.remove('adres-group-hover')
    )
  }, [])

  const onCellKeyDown = useCallback((event: CellKeyDownEvent<FlatRow>) => {
    const e = event.event as KeyboardEvent | undefined
    if (e && e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      const value = event.value
      if (value != null) {
        navigator.clipboard.writeText(String(value))
      }
    }
  }, [])

  return (
    <div className="flex-1 min-h-0">
      <AgGridReact<FlatRow>
        theme={theme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(params) => params.data.rowId}
        getRowStyle={(params) => !params.data?.isLastRow
          ? { borderBottom: 'none' }
          : undefined
        }
        suppressRowTransform={true}
        suppressRowHoverHighlight={true}
        enableCellTextSelection={true}
        ensureDomOrder={true}
        onCellMouseOver={onCellMouseOver}
        onCellMouseOut={onCellMouseOut}
        onCellKeyDown={onCellKeyDown}
        loading={loading}
        overlayNoRowsTemplate="<span class='text-gray-500'>Geen adressen gevonden</span>"
      />
    </div>
  )
}
