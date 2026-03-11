import { useState, useCallback, useMemo } from 'react'
import { FilterPanel } from './components/FilterPanel'
import { AdresTable } from './components/AdresTable'
import { TreeView } from './components/tree/TreeView'
import { HamburgerMenu } from './components/HamburgerMenu'
import { InfoPage } from './components/InfoPage'
import { useFilteredAdressen } from './hooks/useFilteredAdressen'
import { exporteerCsv } from './utils/exportCsv'
import type { SearchResult } from './types'

type ViewMode = 'table' | 'tree'
type Page = 'app' | 'info'

function App() {
  const [selection, setSelection] = useState<SearchResult | null>(null)
  const [cleared, setCleared] = useState(false)
  const [straalM, setStraalM] = useState(100)
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [verbergGas, setVerbergGas] = useState(true)
  const [activePage, setActivePage] = useState<Page>('app')
  const { adressen, loading, error, defaultSelection } = useFilteredAdressen(selection, straalM)

  const gefilterdeAdressen = useMemo(() => {
    if (!verbergGas) return adressen
    return adressen.map(adres => ({
      ...adres,
      nummeraanduiding: adres.nummeraanduiding.map(nra => ({
        ...nra,
        allocatiepunt: nra.allocatiepunt.filter(ap =>
          ap.product?.toUpperCase() !== 'GAS'
        ),
      })),
    }))
  }, [adressen, verbergGas])

  const activeSelection = cleared ? selection : (selection ?? defaultSelection)

  const handleSelectionChange = useCallback((result: SearchResult | null) => {
    setSelection(result)
    setCleared(result === null)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <HamburgerMenu activePage={activePage} onNavigate={setActivePage} />
          <div>
            <h1 className="text-lg font-semibold text-gray-800">
              {activePage === 'app' ? 'Energie Netwerk Overzicht' : 'Info & feedback'}
            </h1>
            {activePage === 'app' && (
              <p className="text-xs text-gray-500 mt-0.5">
                Vind alle EAN-codes en SDE-beschikkingen in de buurt van een bekend adres, EAN-code of SDE-beschikking.
              </p>
            )}
          </div>
        </div>
      </header>

      {activePage === 'info' ? (
        <InfoPage />
      ) : (
        <>
          <FilterPanel
            selection={activeSelection}
            onSelectionChange={handleSelectionChange}
            straalM={straalM}
            onStraalChange={setStraalM}
            verbergGas={verbergGas}
            onVerbergGasChange={setVerbergGas}
          />

          <div className="flex items-center px-4 py-1.5 border-b border-gray-200 bg-white">
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  viewMode === 'table' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tabel
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  viewMode === 'tree' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Boomstructuur
              </button>
            </div>
            <button
              onClick={() => exporteerCsv(gefilterdeAdressen)}
              className="ml-auto px-3 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              title="Exporteer als CSV (opent in Excel)"
            >
              Exporteer CSV
            </button>
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">
              Fout bij laden: {error}
            </div>
          )}

          {!loading && !error && adressen.length === 0 && activeSelection && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              Geen adressen gevonden binnen {straalM}m
            </div>
          )}

          {viewMode === 'table' ? (
            <AdresTable adressen={gefilterdeAdressen} loading={loading} />
          ) : (
            <TreeView adressen={gefilterdeAdressen} loading={loading} />
          )}
        </>
      )}
    </div>
  )
}

export default App
