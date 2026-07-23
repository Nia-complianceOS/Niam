import { ComplianceGraphCanvas } from '@/components/graph/ComplianceGraphCanvas'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/shared/PageStates'
import { useGraph } from '@/hooks/useGraph'

export default function Graph() {
  const { data: graph, loading, error } = useGraph()

  if (loading) return <LoadingState label="Loading compliance graph…" />

  // 503 (Neo4j unreachable / query failed) vs. any other unexpected fetch
  // failure both land here — client.ts's interceptor rewrites error.message
  // to the backend's actual HTTPException detail, so this shows something
  // like "Graph data unavailable: Neo4j is unreachable — check NEO4J_URI…"
  // rather than a generic "Request failed with status code 503".
  if (error) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <PageHeader
          eyebrow="Data Flow Map"
          title="Compliance Graph"
          subtitle="Every system your data touches, and every regulation that covers it — traced end to end."
        />
        <GraphLegend />
      </div>

      {!graph || graph.nodes.length === 0 ? (
        // Neo4j reachable but empty (fresh instance, ingestion hasn't run
        // yet) is a legitimate state, not an error — graph_service.py
        // returns 200 with an empty graph for this case rather than a 503,
        // so it needs its own message here rather than falling into
        // ErrorState above.
        <EmptyState
          title="No graph data yet"
          message="Once a repository is scanned and a vendor is connected, the compliance graph will appear here."
        />
      ) : (
        <>
          <ComplianceGraphCanvas nodes={graph.nodes} edges={graph.edges} />
          <div className="text-text-faint text-[11px] font-mono mt-3">
            {graph.nodes.length} nodes · {graph.edges.length} edges · generated {new Date(graph.generated_at).toLocaleString()}
          </div>
        </>
      )}
    </div>
  )
}
