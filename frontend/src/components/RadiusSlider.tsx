interface RadiusSliderProps {
  value: number
  onChange: (value: number) => void
}

export function RadiusSlider({ value, onChange }: RadiusSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 whitespace-nowrap">Straal:</label>
      <input
        type="range"
        min={0}
        max={2000}
        step={50}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-blue-600"
      />
      <span className="text-sm font-medium text-gray-700 min-w-[4rem] tabular-nums">
        {value} m
      </span>
    </div>
  )
}
