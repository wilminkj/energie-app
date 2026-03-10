import { Handle, Position } from '@xyflow/react'
import type { BeschikkingNodeData } from './treeLayout'

function DetailRij({ label, waarde }: { label: string; waarde: string | number | null | undefined }) {
  if (waarde == null || waarde === '') return null
  return (
    <div className="flex justify-between gap-2 text-[10px]">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 text-right truncate">{waarde}</span>
    </div>
  )
}

export function BeschikkingNode({ data }: { data: BeschikkingNodeData }) {
  const { beschikking } = data

  return (
    <div className={`rounded-lg border-2 border-amber-300 bg-amber-50 shadow-sm cursor-pointer transition-all ${
      data.expanded ? 'min-w-[280px]' : 'min-w-[180px]'
    }`}>
      <div className="px-3 py-2">
        <div className="text-[11px] font-semibold text-amber-900 truncate">{beschikking.sde_nummer}</div>
      </div>

      {data.expanded && (
        <div className="px-3 pb-2 border-t border-amber-200 pt-1.5 space-y-0.5">
          <DetailRij label="Aanvrager" waarde={beschikking.aanvrager} />
          <DetailRij label="Categorie" waarde={beschikking.categorie} />
          <DetailRij label="Vermogen" waarde={beschikking.vermogen_kw != null ? `${beschikking.vermogen_kw.toLocaleString('nl-NL')} kW` : null} />
          <DetailRij label="Max productie" waarde={beschikking.max_productie_kwh_jr != null ? `${beschikking.max_productie_kwh_jr.toLocaleString('nl-NL')} kWh/jr` : null} />
          <DetailRij label="Ronde" waarde={beschikking.subsidieronde} />
          <DetailRij label="Status" waarde={beschikking.status} />
          <DetailRij label="Realisatie" waarde={beschikking.realisatiejaar} />
          <DetailRij label="Looptijd" waarde={beschikking.looptijd_jaren ? `${beschikking.looptijd_jaren} jaar` : null} />
          <DetailRij label="Gemeente" waarde={beschikking.gemeente} />
          <DetailRij label="Provincie" waarde={beschikking.provincie} />
        </div>
      )}

      <Handle type="target" position={Position.Left} className="!bg-amber-400 !w-2 !h-2" />
    </div>
  )
}
