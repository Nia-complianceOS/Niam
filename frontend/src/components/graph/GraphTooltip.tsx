import type { GraphNode } from '@/types/api'

interface Props {
  node: GraphNode
  x: number
  y: number
}

export function GraphTooltip({ node, x, y }: Props) {
  return (
    <div
      className="absolute pointer-events-none p-3.5 min-w-[190px] bg-bg-elevated/95 border border-border rounded-xl backdrop-blur-[16px] text-xs shadow-[0_12px_30px_rgba(0,0,0,0.5)] z-10"
      style={{ left: x + 18, top: y - 10 }}
    >
      <h4 className="font-display text-[13px] mb-2 text-text">{node.label}</h4>
      <TooltipRow label="Collected Data" value={node.data_collected || '—'} />
      <TooltipRow label="Purpose" value={node.purpose || '—'} />
      <TooltipRow label="Retention" value={node.retention || '—'} />
      <TooltipRow label="Legal Coverage" value={node.status_detail || node.status} />
    </div>
  )
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3.5 py-[3px] text-text-dim">
      <span>{label}</span>
      <b className="text-text font-medium text-right">{value}</b>
    </div>
  )
}