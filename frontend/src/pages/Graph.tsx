import { ComplianceGraphCanvas } from '@/components/graph/ComplianceGraphCanvas'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { LoadingState, ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
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
        <GetStartedState
          title="No map to show yet"
          message="Connect GitHub and scan a repository to get started. The map is built from your own code: every place personal data is collected, every service it is sent to, and the rules that cover each one."
        />
      ) : (
        <>
          <ComplianceGraphCanvas nodes={graph.nodes} edges={graph.edges} />
          <div className="text-text-faint text-[11px] font-mono mt-3">
            {graph.truncated
              ? `${graph.nodes.length} of ${graph.total_nodes} nodes (limit ${graph.node_limit})`
              : `${graph.nodes.length} nodes`}{' '}
            · {graph.edges.length} edges · generated{' '}
            {new Date(graph.generated_at).toLocaleString()}
          </div>
          {graph.truncated && (
            <div className="text-accent-amber text-[11px] mt-1.5">
              Showing a bounded slice of the graph. DPDP clause nodes are dropped first, so the
              system → data type → vendor flow stays intact.
            </div>
          )}
        </>
      )}
    </div>
  )
}
