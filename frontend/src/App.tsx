import { useState, useCallback } from 'react'
import { FilterPanel } from './components/FilterPanel'
import { AdresTable } from './components/AdresTable'
import { TreeView } from './components/tree/TreeView'
import { useFilteredAdressen } from './hooks/useFilteredAdressen'
import type { SearchResult } from './types'

type ViewMode = 'table' | 'tree'

function App() {
  const [selection, setSelection] = useState<SearchResult | null>(null)
  const [cleared, setCleared] = useState(false)
  const [straalM, setStraalM] = useState(500)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const { adressen, loading, error, defaultSelection } = useFilteredAdressen(selection, straalM)

  const activeSelection = cleared ? selection : (selection ?? defaultSelection)

  const handleSelectionChange = useCallback((result: SearchResult | null) => {
    setSelection(result)
    setCleared(result === null)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-800">
          Energie Netwerk Overzicht
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Overzicht van alle allocatiepunten die horen bij de adressen genoemd in SDE-Beschikkingen
        </p>
        <div className="flex gap-1 mt-1.5">
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
      </header>

      <FilterPanel
        selection={activeSelection}
        onSelectionChange={handleSelectionChange}
        straalM={straalM}
        onStraalChange={setStraalM}
      />

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
        <AdresTable adressen={adressen} loading={loading} />
      ) : (
        <TreeView adressen={adressen} loading={loading} />
      )}
    </div>
  )
}

export default App
