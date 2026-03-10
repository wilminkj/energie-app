import { Handle, Position } from '@xyflow/react'
import type { AllocatiepuntNodeData } from './treeLayout'

function DetailRij({ label, waarde }: { label: string; waarde: string | number | null | undefined }) {
  if (waarde == null || waarde === '') return null
  return (
    <div className="flex justify-between gap-2 text-[10px]">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 text-right truncate">{waarde}</span>
    </div>
  )
}

export function AllocatiepuntNode({ data }: { data: AllocatiepuntNodeData }) {
  const { allocatiepunt, isPap } = data
  const typeLabel = allocatiepunt.type ?? (isPap ? 'PAP' : 'SAP')

  return (
    <div className={`rounded-lg border-2 border-emerald-300 shadow-sm cursor-pointer transition-all ${
      isPap ? 'bg-emerald-50' : 'bg-emerald-50/70'
    } ${data.expanded ? 'min-w-[300px]' : 'min-w-[190px]'}`}>
      <div className="px-3 py-2">
        <div className="text-[11px] font-semibold text-emerald-900 truncate">{allocatiepunt.ean_code}</div>
        <div className="text-[10px] text-emerald-600">{typeLabel}</div>
      </div>

      {data.expanded && (
        <div className="px-3 pb-2 border-t border-emerald-200 pt-1.5 space-y-0.5">
          <DetailRij label="Product" waarde={allocatiepunt.product} />
          <DetailRij label="Netbeheerder" waarde={allocatiepunt.netbeheerder} />
          <DetailRij label="Exacte adres" waarde={allocatiepunt.exacteAdres} />
          <DetailRij label="BAG ID" waarde={allocatiepunt.bag_id} />
          <DetailRij label="Grid area" waarde={allocatiepunt.grid_area} />
          <DetailRij label="Grid operator EAN" waarde={allocatiepunt.grid_operator_ean} />
          <DetailRij label="Speciaal meetpunt" waarde={allocatiepunt.special_metering_point} />
          {!isPap && <DetailRij label="Linked PAP" waarde={allocatiepunt.linked_pap_ean} />}
        </div>
      )}

      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-2 !h-2" />
      {isPap && <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2 !h-2" />}
    </div>
  )
}
