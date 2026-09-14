import { ComplianceGraphCanvas } from '@/components/graph/ComplianceGraphCanvas'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { GraphSkeleton } from '@/components/skeletons/GraphSkeleton'
import { GraphDetailPanel } from '@/components/graph/GraphDetailPanel'
import { useGraph } from '@/hooks/useGraph'
import { useSEO } from '@/hooks/useSEO'
import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { GraphNode } from '@/types/api'

export default function Graph() {
  useSEO({
    title: 'Compliance Graph',
    description: 'Visual data flow graph showing systems, data types, and vendors'
  })
  
  const { data: graph, loading, error } = useGraph()
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <PageHeader
            eyebrow="Data Flow Map"
            title="Compliance Graph"
            subtitle="Every system your data touches, and every regulation that covers it — traced end to end."
          />
        </div>
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
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
        <GraphSkeleton />
      </div>
    )
  }

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
          <div className="flex gap-4 items-start w-full relative h-[600px]">
            <div className="flex-1 min-w-0 transition-all duration-300 h-full border border-border-soft/50 rounded-[10px]">
              <ComplianceGraphCanvas 
                nodes={graph.nodes} 
                edges={graph.edges} 
                onNodeSelect={setSelectedNode}
                selectedNodeId={selectedNode?.id}
              />
            </div>
            
            <AnimatePresence>
              {selectedNode && (
                <GraphDetailPanel 
                  node={selectedNode} 
                  edges={graph.edges} 
                  nodes={graph.nodes} 
                  onClose={() => setSelectedNode(null)} 
                />
              )}
            </AnimatePresence>
          </div>
          
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
