import type { GraphNode } from '@/types/api'

interface Props {
  node: GraphNode
  x: number
  y: number
}

export function GraphTooltip({ node, x, y }: Props) {
  return (
    <div
      className="absolute pointer-events-none p-3 min-w-[200px] bg-surface-elevated/95 border border-border rounded text-xs shadow-md z-30 font-sans"
      style={{ left: x + 16, top: y - 10 }}
    >
      <div className="font-mono text-[10px] uppercase text-text-tertiary mb-1">{node.node_type}</div>
      <h4 className="font-medium text-xs text-text-primary mb-2.5">{node.label}</h4>
      <div className="space-y-1 font-mono text-[11px]">
        <TooltipRow label="DATA INGESTED" value={node.data_collected || '—'} />
        <TooltipRow label="PURPOSE" value={node.purpose || '—'} />
        <TooltipRow label="RETENTION" value={node.retention || '—'} />
        <TooltipRow label="STATUS" value={node.status_detail || node.status} />
      </div>
    </div>
  )
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-text-secondary">
      <span className="text-text-tertiary text-[10px]">{label}</span>
      <span className="text-text-primary text-right truncate max-w-[120px]">{value}</span>
    </div>
  )
}