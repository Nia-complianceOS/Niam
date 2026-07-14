import { Card } from '@/components/ui/Card'
import { ComplianceGraphCanvas } from '@/components/graph/ComplianceGraphCanvas'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { useGraph } from '@/hooks/useGraph'

export default function Graph() {
  const { graph, loading, error } = useGraph()

  if (loading) {
    return (
      <div className="max-w-[1280px] flex items-center justify-center h-[60vh] text-text-dim text-sm font-mono">
        Loading compliance graph…
      </div>
    )
  }

  if (error || !graph) {
    return (
      <div className="max-w-[1280px]">
        <Card className="p-6 border-accent-red/30">
          <div className="text-accent-red font-semibold mb-1">Couldn't reach the backend</div>
          <div className="text-text-dim text-sm">{error}</div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px]">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-blue uppercase tracking-wide mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green" style={{ boxShadow: '0 0 8px #33d17a' }} />
            Data Flow Map
          </div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight">Compliance Graph</h1>
          <div className="text-text-dim text-sm mt-1.5 max-w-[560px]">
            Every system your data touches, and every regulation that covers it — traced end to end.
          </div>
        </div>
        <GraphLegend />
      </div>

      <ComplianceGraphCanvas nodes={graph.nodes} edges={graph.edges} />

      <div className="text-text-faint text-[11px] font-mono mt-3">
        {graph.nodes.length} nodes · {graph.edges.length} edges · generated {new Date(graph.generated_at).toLocaleString()}
      </div>
    </div>
  )
}