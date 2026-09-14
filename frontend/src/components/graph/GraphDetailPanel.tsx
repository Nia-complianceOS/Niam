import { motion } from 'framer-motion'
import { X, Code2, Database, Building2, Scale, AlertTriangle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { dataTypeLabel } from '@/lib/gapLanguage'
import type { GraphNode, GraphEdge } from '@/types/api'

interface Props {
  node: GraphNode
  edges: GraphEdge[]
  nodes: GraphNode[]
  onClose: () => void
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  System: { icon: Code2, color: 'text-accent-blue', label: 'System' },
  DataType: { icon: Database, color: 'text-accent-purple', label: 'Data Type' },
  Vendor: { icon: Building2, color: 'text-accent-amber', label: 'Vendor' },
  DPDPClause: { icon: Scale, color: 'text-accent-green', label: 'Regulation' },
}

export function GraphDetailPanel({ node, edges, nodes, onClose }: Props) {
  const isGap = node.status === 'gap'
  const isWarning = node.status === 'warning'
  const isCompliant = node.status === 'compliant'

  const config = TYPE_CONFIG[node.node_type] || TYPE_CONFIG.System
  let Icon = config.icon
  if (isGap) Icon = AlertTriangle

  const nodeLabel = node.node_type === 'DataType' ? dataTypeLabel(node.label) : node.label

  // Find related nodes
  const upstreamEdges = edges.filter(e => e.target === node.id)
  const downstreamEdges = edges.filter(e => e.source === node.id)
  
  const upstreamNodes = upstreamEdges.map(e => nodes.find(n => n.id === e.source)).filter(Boolean) as GraphNode[]
  const downstreamNodes = downstreamEdges.map(e => nodes.find(n => n.id === e.target)).filter(Boolean) as GraphNode[]

  return (
    <motion.div
      initial={{ opacity: 0, x: 20, width: 0 }}
      animate={{ opacity: 1, x: 0, width: 380 }}
      exit={{ opacity: 0, x: 20, width: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex-shrink-0"
    >
      <Card className="w-[380px] h-[600px] flex flex-col border-border-soft overflow-hidden sticky top-4 shadow-xl ml-4">
        {/* Header */}
        <div className="p-4 border-b border-border-soft flex items-start justify-between bg-black/20">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-1 p-2 rounded-lg bg-black/40 border border-border-soft flex-shrink-0 ${isGap ? 'text-accent-red' : config.color}`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-1">
                {config.label}
              </div>
              <h3 className="font-semibold text-[16px] text-text truncate pr-2" title={nodeLabel}>
                {nodeLabel}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {node.status_detail && (
                  <Badge tone={isCompliant ? 'good' : isGap ? 'gap' : isWarning ? 'warn' : 'muted'}>
                    {node.status_detail}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-text-faint hover:text-text hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          
          {/* Properties */}
          {((node.data_collected && node.data_collected !== 'unknown') || node.purpose || node.retention) && (
            <div className="space-y-3">
              <h4 className="text-[12px] font-semibold text-text-dim uppercase tracking-wider">Properties</h4>
              <div className="bg-black/20 rounded-lg border border-border-soft p-3 space-y-3">
                {node.data_collected && node.data_collected !== 'unknown' && (
                  <div>
                    <div className="text-[11px] text-text-faint mb-0.5">Data Collected</div>
                    <div className="text-[13px] text-text-dim">{node.data_collected}</div>
                  </div>
                )}
                {node.purpose && (
                  <div>
                    <div className="text-[11px] text-text-faint mb-0.5">Purpose</div>
                    <div className="text-[13px] text-text-dim leading-relaxed">{node.purpose}</div>
                  </div>
                )}
                {node.retention && (
                  <div>
                    <div className="text-[11px] text-text-faint mb-0.5">Retention</div>
                    <div className="text-[13px] text-text-dim">{node.retention}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upstream */}
          {upstreamNodes.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[12px] font-semibold text-text-dim uppercase tracking-wider">Receives from</h4>
              <div className="flex flex-col gap-2">
                {upstreamNodes.map(n => (
                  <RelatedNodeRow key={n.id} node={n} />
                ))}
              </div>
            </div>
          )}

          {/* Downstream */}
          {downstreamNodes.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[12px] font-semibold text-text-dim uppercase tracking-wider">Sends to</h4>
              <div className="flex flex-col gap-2">
                {downstreamNodes.map(n => (
                  <RelatedNodeRow key={n.id} node={n} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {(node.node_type === 'System' || node.node_type === 'DataType') && (
          <div className="p-4 border-t border-border-soft bg-black/20">
            <Link 
              to={`/gaps${node.node_type === 'System' ? `?search=${node.label}` : ''}`} 
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 hover:text-accent-blue border border-accent-blue/20 rounded-lg text-[13px] font-semibold transition-colors"
            >
              View related findings <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </Card>
    </motion.div>
  )
}

function RelatedNodeRow({ node }: { node: GraphNode }) {
  const config = TYPE_CONFIG[node.node_type] || TYPE_CONFIG.System
  const Icon = config.icon
  const label = node.node_type === 'DataType' ? dataTypeLabel(node.label) : node.label
  
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-md bg-white/5 border border-white/5">
      <Icon size={14} className={config.color} />
      <span className="text-[13px] text-text-dim truncate">{label}</span>
      {node.status === 'gap' && <AlertTriangle size={12} className="text-accent-red ml-auto flex-shrink-0" />}
    </div>
  )
}
