import type { ComponentType } from 'react'
import { motion } from 'framer-motion'
import { X, Code2, Database, Building2, Scale, AlertTriangle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dataTypeLabel } from '@/lib/gapLanguage'
import type { GraphNode, GraphEdge } from '@/types/api'

interface Props {
  node: GraphNode
  edges: GraphEdge[]
  nodes: GraphNode[]
  onClose: () => void
}

const TYPE_CONFIG: Record<string, { icon: ComponentType<{ className?: string; size?: string | number; strokeWidth?: string | number }>; color: string; label: string; badgeColor: string }> = {
  System: { 
    icon: Code2, 
    color: 'text-entity-system', 
    label: 'Source System', 
    badgeColor: 'border-entity-system/30 bg-entity-system/10 text-entity-system' 
  },
  DataType: { 
    icon: Database, 
    color: 'text-entity-datatype', 
    label: 'Data Identifier', 
    badgeColor: 'border-entity-datatype/30 bg-entity-datatype/10 text-entity-datatype' 
  },
  Vendor: { 
    icon: Building2, 
    color: 'text-entity-vendor', 
    label: 'Third-Party Processor', 
    badgeColor: 'border-entity-vendor/30 bg-entity-vendor/10 text-entity-vendor' 
  },
  DPDPClause: { 
    icon: Scale, 
    color: 'text-entity-clause', 
    label: 'DPDP Statutory Clause', 
    badgeColor: 'border-entity-clause/30 bg-entity-clause/10 text-entity-clause' 
  },
}

export function GraphDetailPanel({ node, edges, nodes, onClose }: Props) {
  const isGap = node.status === 'gap'
  const isWarning = node.status === 'warning'
  const isCompliant = node.status === 'compliant'

  const config = TYPE_CONFIG[node.node_type] || TYPE_CONFIG.System
  let Icon = config.icon
  if (isGap) Icon = AlertTriangle

  const nodeLabel = node.node_type === 'DataType' ? dataTypeLabel(node.label) : node.label

  // Find connected upstream and downstream nodes
  const upstreamEdges = edges.filter(e => e.target === node.id)
  const downstreamEdges = edges.filter(e => e.source === node.id)
  
  const upstreamNodes = upstreamEdges.map(e => nodes.find(n => n.id === e.source)).filter(Boolean) as GraphNode[]
  const downstreamNodes = downstreamEdges.map(e => nodes.find(n => n.id === e.target)).filter(Boolean) as GraphNode[]

  return (
    <motion.div
      initial={{ opacity: 0, x: 20, width: 0 }}
      animate={{ opacity: 1, x: 0, width: 360 }}
      exit={{ opacity: 0, x: 20, width: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex-shrink-0 font-sans"
    >
      <div className="w-[360px] h-[600px] flex flex-col rounded border border-border bg-surface overflow-hidden sticky top-4 shadow-md ml-4 text-xs">
        {/* Inspector Header */}
        <div className="p-4 border-b border-border flex items-start justify-between bg-bg-subtle">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className={`mt-0.5 p-1.5 rounded border border-border bg-bg flex-shrink-0 ${isGap ? 'text-status-gap' : config.color}`}>
              <Icon size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-0.5">
                {config.label}
              </div>
              <h3 className="font-medium text-sm text-text-primary truncate pr-2" title={nodeLabel}>
                {nodeLabel}
              </h3>
              <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono">
                {node.status_detail && (
                  <span className={`px-1.5 py-0.2 rounded border text-[10px] ${
                    isCompliant 
                      ? 'border-status-compliant/30 bg-status-compliant/10 text-status-compliant'
                      : isGap 
                      ? 'border-status-gap/30 bg-status-gap/10 text-status-gap'
                      : isWarning
                      ? 'border-status-warning/30 bg-status-warning/10 text-status-warning'
                      : 'border-border bg-bg text-text-tertiary'
                  }`}>
                    {node.status_detail}
                  </span>
                )}
                <span className={`px-1.5 py-0.2 rounded border text-[10px] ${config.badgeColor}`}>
                  {node.node_type}
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg transition-colors"
            title="Close inspector"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Properties */}
          {((node.data_collected && node.data_collected !== 'unknown') || node.purpose || node.retention) && (
            <div className="space-y-2">
              <span className="font-mono text-[10px] font-semibold text-text-tertiary uppercase tracking-wider block">
                Statutory Attributes
              </span>
              <div className="bg-bg rounded border border-border p-3 space-y-2.5 font-sans">
                {node.data_collected && node.data_collected !== 'unknown' && (
                  <div>
                    <div className="font-mono text-[10px] text-text-tertiary">Data Ingested</div>
                    <div className="text-xs text-text-primary mt-0.5">{node.data_collected}</div>
                  </div>
                )}
                {node.purpose && (
                  <div>
                    <div className="font-mono text-[10px] text-text-tertiary">Declared Notice Purpose</div>
                    <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">{node.purpose}</div>
                  </div>
                )}
                {node.retention && (
                  <div>
                    <div className="font-mono text-[10px] text-text-tertiary">Retention Policy</div>
                    <div className="text-xs text-text-secondary mt-0.5">{node.retention}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upstream / Receives from */}
          {upstreamNodes.length > 0 && (
            <div className="space-y-2">
              <span className="font-mono text-[10px] font-semibold text-text-tertiary uppercase tracking-wider block">
                Upstream Lineage ({upstreamNodes.length})
              </span>
              <div className="flex flex-col gap-1.5">
                {upstreamNodes.map(n => (
                  <RelatedNodeRow key={n.id} node={n} />
                ))}
              </div>
            </div>
          )}

          {/* Downstream / Sends to */}
          {downstreamNodes.length > 0 && (
            <div className="space-y-2">
              <span className="font-mono text-[10px] font-semibold text-text-tertiary uppercase tracking-wider block">
                Downstream Egress ({downstreamNodes.length})
              </span>
              <div className="flex flex-col gap-1.5">
                {downstreamNodes.map(n => (
                  <RelatedNodeRow key={n.id} node={n} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {(node.node_type === 'System' || node.node_type === 'DataType') && (
          <div className="p-3 border-t border-border bg-bg-subtle">
            <Link 
              to={`/gaps${node.node_type === 'System' ? `?search=${encodeURIComponent(node.label)}` : ''}`} 
              className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-bg text-text-primary hover:bg-surface-elevated border border-border rounded text-xs font-medium transition-colors"
            >
              <span>Examine Related Findings</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function RelatedNodeRow({ node }: { node: GraphNode }) {
  const config = TYPE_CONFIG[node.node_type] || TYPE_CONFIG.System
  const Icon = config.icon
  const label = node.node_type === 'DataType' ? dataTypeLabel(node.label) : node.label
  
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-bg border border-border/70 text-xs">
      <Icon size={13} className={`${config.color} flex-shrink-0`} />
      <span className="text-text-secondary truncate min-w-0 flex-1">{label}</span>
      {node.status === 'gap' && (
        <span className="font-mono text-[9px] uppercase px-1 py-0.2 rounded border border-status-gap/30 bg-status-gap/10 text-status-gap flex-shrink-0">
          GAP
        </span>
      )}
    </div>
  )
}
