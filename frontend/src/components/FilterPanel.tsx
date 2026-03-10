import { UnifiedSearch } from './UnifiedSearch'
import { RadiusSlider } from './RadiusSlider'
import type { SearchResult } from '../types'

interface FilterPanelProps {
  selection: SearchResult | null
  onSelectionChange: (result: SearchResult | null) => void
  straalM: number
  onStraalChange: (value: number) => void
}

export function FilterPanel({
  selection,
  onSelectionChange,
  straalM,
  onStraalChange,
}: FilterPanelProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 border-b border-gray-200">
      <UnifiedSearch selection={selection} onSelect={onSelectionChange} />
      <RadiusSlider value={straalM} onChange={onStraalChange} />
    </div>
  )
}
