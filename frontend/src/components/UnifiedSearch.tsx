import { useState, useRef, useEffect } from 'react'
import { useAdresSearch } from '../hooks/useAdresSearch'
import type { SearchResult } from '../types'

interface UnifiedSearchProps {
  selection: SearchResult | null
  onSelect: (result: SearchResult | null) => void
}

export function UnifiedSearch({ selection, onSelect }: UnifiedSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const { results, loading } = useAdresSearch(query)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(result: SearchResult) {
    onSelect(result)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    onSelect(null)
    setQuery('')
  }

  if (selection) {
    return (
      <div className="flex items-center gap-2 min-w-80">
        <div className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm truncate">
          {selection.label}
        </div>
        <button
          onClick={handleClear}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          title="Selectie wissen"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative min-w-80">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Zoek op adres, SDE-nummer of EAN-code..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
          Zoeken...
        </div>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {results.map((r) => (
            <li key={`${r.type}-${r.sde_adres_id}-${r.label}`}>
              <button
                onClick={() => handleSelect(r)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors cursor-pointer"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-500">
          Geen resultaten gevonden
        </div>
      )}
    </div>
  )
}
