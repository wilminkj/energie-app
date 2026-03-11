import { Handle, Position } from '@xyflow/react'
import type { AdresNodeData } from './treeLayout'

function DetailRij({ label, waarde }: { label: string; waarde: string | number | null | undefined }) {
  if (waarde == null || waarde === '') return null
  return (
    <div className="flex justify-between gap-2 text-[10px]">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 text-right truncate">{waarde}</span>
    </div>
  )
}

export function AdresNode({ data }: { data: AdresNodeData }) {
  const { adres } = data
  const adresDeel = [adres.straat, [adres.huisnummer, adres.toevoeging].filter(Boolean).join(' ')].filter(Boolean).join(' ')
  const label = [adresDeel, adres.woonplaats].filter(Boolean).join(', ')
  const sub = adres.postcode ?? ''

  return (
    <div className={`rounded-lg border-2 border-blue-300 bg-blue-50 shadow-sm cursor-pointer transition-all ${
      data.expanded ? 'min-w-[300px]' : 'min-w-[180px]'
    }`}>
      <div className="px-3 py-2">
        <div className="text-[11px] font-semibold text-blue-900 truncate">{label || 'Onbekend adres'}</div>
        <div className="text-[10px] text-blue-600">{sub}</div>
      </div>

      {data.expanded && (
        <div className="px-3 pb-2 border-t border-blue-200 pt-1.5 space-y-0.5">
          <DetailRij label="Bouwjaar" waarde={adres.bouwjaar} />
          <DetailRij label="Oppervlakte" waarde={adres.oppervlakte_m2 ? `${adres.oppervlakte_m2} m²` : null} />
          <DetailRij label="Gebruiksdoel" waarde={adres.gebruiksdoel} />
          <DetailRij label="Lat/Lon" waarde={
            adres.latitude != null && adres.longitude != null
              ? `${adres.latitude.toFixed(4)}, ${adres.longitude.toFixed(4)}`
              : null
          } />
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-2 !h-2" />
    </div>
  )
}
