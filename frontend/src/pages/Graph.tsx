import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ComplianceGraphCanvas } from '@/components/graph/ComplianceGraphCanvas'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { GraphDetailPanel } from '@/components/graph/GraphDetailPanel'
import { GraphSkeleton } from '@/components/skeletons/GraphSkeleton'
import { useGraph } from '@/hooks/useGraph'
import { useSEO } from '@/hooks/useSEO'
import { Link } from 'react-router-dom'
import { ArrowRight, AlertTriangle } from 'lucide-react'
import type { GraphNode } from '@/types/api'

export default function Graph() {
  useSEO({
    title: 'Compliance Knowledge Graph — Niam Statutory Ledger',
    description: 'Direct AST directional graph mapping personal data from codebases to DPDP Act 2023 clauses.'
  })
  
  const { data: graph, loading, error } = useGraph()
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  if (error) {
    return (
      <div className="max-w-[1280px] w-full font-sans space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-text-tertiary uppercase mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-status-gap" />
              <span>ONTOLOGY SERVICE FAULT</span>
            </div>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-text-primary">Compliance Graph</h1>
          </div>
        </div>

        <div className="p-5 rounded border border-status-gap/30 bg-status-gap/5 text-xs text-text-secondary">
          <div className="text-status-gap font-medium mb-1">Graph Database Query Fault</div>
          <div>{error} Verify that the Neo4j ontology graph store is reachable.</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px] w-full font-sans space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-text-tertiary uppercase mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-entity-system" />
              <span>TRAVERSING AST ONTOLOGY</span>
            </div>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-text-primary">Compliance Graph</h1>
          </div>
          <GraphLegend />
        </div>
        <GraphSkeleton />
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] w-full font-sans space-y-5">
      {/* 1. SECTION HEADER & LEGEND */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-text-tertiary uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
            <span>DPDP STATUTORY ONTOLOGY // 4-LANE PROVENANCE</span>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-text-primary">Compliance Knowledge Graph</h1>
          <p className="text-text-secondary text-xs mt-0.5">
            Directional data flow traced from source AST tokens through third-party processors to statutory DPDP Act clauses.
          </p>
        </div>
        <GraphLegend />
      </div>

      {/* 2. GRAPH CANVAS & DETAIL INSPECTOR */}
      {!graph || graph.nodes.length === 0 ? (
        <div className="p-8 rounded border border-border bg-surface max-w-xl text-xs text-text-secondary space-y-3">
          <div className="font-mono text-[10px] text-text-tertiary uppercase tracking-wider">
            Graph Unpopulated
          </div>
          <h2 className="font-serif text-xl font-medium text-text-primary">
            No Codebase Lineage Recorded
          </h2>
          <p className="leading-relaxed">
            Connect a GitHub repository and initiate a scan to extract personal data identifiers, third-party network egress points, and applicable DPDP obligations.
          </p>
          <div className="pt-2">
            <Link 
              to="/repositories" 
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-text-primary text-bg hover:opacity-90 transition-opacity"
            >
              <span>Scan Repositories</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-4 items-start w-full relative h-[600px]">
            <div className="flex-1 min-w-0 h-full">
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
          
          {/* Metadata Footer */}
          <div className="flex items-center justify-between font-mono text-[11px] text-text-tertiary pt-2 border-t border-border/60">
            <div>
              {graph.truncated
                ? `${graph.nodes.length} OF ${graph.total_nodes} NODES (LIMIT ${graph.node_limit})`
                : `${graph.nodes.length} ONTOLOGY NODES`}
              {' · '}
              {graph.edges.length} ARBITRATION EDGES
              {' · '}
              GENERATED {new Date(graph.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            {graph.truncated && (
              <div className="text-status-warning flex items-center gap-1">
                <AlertTriangle size={12} />
                <span>BOUNDED GRAPH SLICE</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
