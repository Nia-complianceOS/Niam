const LEGEND_ITEMS: { label: string; color: string }[] = [
  { label: 'Compliant', color: '#5b8cff' },
  { label: 'Warning', color: '#f5a623' },
  { label: 'Gap', color: '#f0555a' },
  { label: 'Unknown', color: '#5e5e72' },
]

export function GraphLegend() {
  return (
    <div className="flex items-center gap-5 text-xs text-text-dim">
      {LEGEND_ITEMS.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: color, backgroundColor: `${color}22` }} />
          {label}
        </div>
      ))}
    </div>
  )
}