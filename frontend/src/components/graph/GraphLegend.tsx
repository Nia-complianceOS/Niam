const ONTOLOGY_ITEMS: { label: string; color: string }[] = [
  { label: 'System', color: 'var(--entity-system)' },
  { label: 'Data Type', color: 'var(--entity-datatype)' },
  { label: 'Processor', color: 'var(--entity-vendor)' },
  { label: 'DPDP Clause', color: 'var(--entity-clause)' },
]

const STATUS_ITEMS: { label: string; color: string }[] = [
  { label: 'Compliant', color: 'var(--status-compliant)' },
  { label: 'Warning', color: 'var(--status-warning)' },
  { label: 'Statutory Gap', color: 'var(--status-gap)' },
]

export function GraphLegend() {
  return (
    <div className="flex items-center gap-6 text-[11px] font-mono text-text-secondary flex-wrap">
      <div className="flex items-center gap-3">
        <span className="text-text-tertiary uppercase">Lanes:</span>
        {ONTOLOGY_ITEMS.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="h-3 w-[1px] bg-border hidden sm:block" />

      <div className="flex items-center gap-3">
        <span className="text-text-tertiary uppercase">Status:</span>
        {STATUS_ITEMS.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}