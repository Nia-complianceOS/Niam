import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Maximize2, Minus, Plus, Code2, Database, Building2, AlertTriangle, Search, Scale } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { GraphTooltip } from '@/components/graph/GraphTooltip'
import { dataTypeLabel } from '@/lib/gapLanguage'
import type { ComplianceStatus, GraphEdge, GraphNode } from '@/types/api'

const STATUS_COLOR: Record<ComplianceStatus, string> = {
  compliant: '#10b981', // green for compliant
  warning: '#f5a623',
  gap: '#ef4444', // red
  unknown: '#6b7280',
}

const TYPE_COLOR: Record<string, string> = {
  System: '#3b82f6', // blue
  DataType: '#a855f7', // purple
  Vendor: '#f59e0b', // amber
  DPDPClause: '#10b981', // green
}

function colorFor(status: ComplianceStatus): string {
  return STATUS_COLOR[status] ?? STATUS_COLOR.unknown
}

const COLUMNS = ['System', 'DataType', 'Vendor', 'DPDPClause'] as const
const COLUMN_LABELS: Record<string, string> = {
  System: 'Systems',
  DataType: 'Data Collected',
  Vendor: 'Vendors',
  DPDPClause: 'Regulations',
}

const ROW_HEIGHT = 42
const TOP_PAD = 60
const NODE_R = 14
const LABEL_GAP = 12
const GUTTER = 120
const FONT = '12px Inter, sans-serif'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeSelect?: (node: GraphNode | null) => void
  selectedNodeId?: string | null
}

interface Positioned extends GraphNode {
  x: number
  y: number
  col: number
  labelWidth: number
}

function displayLabel(n: GraphNode): string {
  return n.node_type === 'DataType' ? dataTypeLabel(n.label) : n.label
}

function makeMeasurer(): (text: string) => number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return (t: string) => t.length * 6.6
  ctx.font = FONT
  const cache = new Map<string, number>()
  return (text: string) => {
    const hit = cache.get(text)
    if (hit !== undefined) return hit
    const w = ctx.measureText(text).width
    cache.set(text, w)
    return w
  }
}

export function ComplianceGraphCanvas({ nodes, edges, onNodeSelect, selectedNodeId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const rootGroupRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  
  // Filters
  const [showSystems, setShowSystems] = useState(true)
  const [showDataTypes, setShowDataTypes] = useState(true)
  const [showVendors, setShowVendors] = useState(true)
  const [showClauses, setShowClauses] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const [containerSize, setContainerSize] = useState({ width: 1180, height: 560 })

  // --- Filter nodes and edges ---
  const { visibleNodes, visibleEdges } = useMemo(() => {
    let ns = nodes.filter((n) => {
      if (!showSystems && n.node_type === 'System') return false
      if (!showDataTypes && n.node_type === 'DataType') return false
      if (!showVendors && n.node_type === 'Vendor') return false
      if (!showClauses && n.node_type === 'DPDPClause') return false
      return true
    })

    const ids = new Set(ns.map((n) => n.id))
    return {
      visibleNodes: ns,
      visibleEdges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    }
  }, [nodes, edges, showSystems, showDataTypes, showVendors, showClauses])

  // --- Compute Layout (Deterministic columns) ---
  const { positioned, extent, columnsData, linksData, reachableMap } = useMemo(() => {
    const measure = makeMeasurer()
    const rank: Record<string, number> = { gap: 0, warning: 1, unknown: 2, compliant: 3 }
    
    const byCol = COLUMNS.map((type) =>
      visibleNodes
        .filter((n) => n.node_type === type)
        .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.label.localeCompare(b.label))
    )

    const usedCols = byCol.map((list, i) => ({ list, type: COLUMNS[i] })).filter(({ list }) => list.length > 0)

    const colX: number[] = []
    let cursor = 32
    usedCols.forEach(({ list }, i) => {
      colX[i] = cursor
      const widest = Math.max(...list.map((n) => measure(displayLabel(n))))
      cursor += NODE_R + LABEL_GAP + widest + GUTTER
    })

    const tallest = Math.max(0, ...usedCols.map((c) => c.list.length))
    const positionedList: Positioned[] = []
    
    usedCols.forEach(({ list }, displayCol) => {
      const offset = ((tallest - list.length) * ROW_HEIGHT) / 2
      list.forEach((n, row) => {
        positionedList.push({
          ...n,
          col: displayCol,
          x: colX[displayCol],
          y: TOP_PAD + offset + row * ROW_HEIGHT + ROW_HEIGHT / 2,
          labelWidth: measure(displayLabel(n)),
        })
      })
    })

    const pos = new Map(positionedList.map((n) => [n.id, n]))
    const lastCol = usedCols.length - 1
    const extentW = lastCol >= 0
      ? colX[lastCol] + NODE_R + LABEL_GAP + Math.max(...usedCols[lastCol].list.map((n) => measure(displayLabel(n)))) + 40
      : containerSize.width
    const extentH = TOP_PAD + tallest * ROW_HEIGHT + 60

    // Compute edges
    const linkGen = d3.linkHorizontal<unknown, [number, number]>().x((d) => d[0]).y((d) => d[1])
    const linksData = visibleEdges.map((e) => {
      const a = pos.get(e.source)
      const b = pos.get(e.target)
      if (!a || !b) return null
      
      const from: [number, number] = [a.x + NODE_R + LABEL_GAP + a.labelWidth + 6, a.y]
      const to: [number, number] = [b.x - NODE_R - 4, b.y]
      
      const worse = (rank[a.status ?? 'unknown'] ?? 9) <= (rank[b.status ?? 'unknown'] ?? 9) ? a.status : b.status
      return {
        ...e,
        sourceNode: a,
        targetNode: b,
        path: linkGen({ source: from, target: to }),
        color: colorFor(worse ?? 'unknown')
      }
    }).filter(Boolean) as (GraphEdge & { path: string, color: string, sourceNode: Positioned, targetNode: Positioned })[]

    // Reachability graph for highlighting
    const outM = new Map<string, string[]>()
    const incM = new Map<string, string[]>()
    visibleEdges.forEach((e) => {
      ;(outM.get(e.source) ?? outM.set(e.source, []).get(e.source)!).push(e.target)
      ;(incM.get(e.target) ?? incM.set(e.target, []).get(e.target)!).push(e.source)
    })

    const reachable = (startId: string) => {
      const seen = new Set<string>([startId])
      const walk = (id: string, map: Map<string, string[]>) => {
        for (const next of map.get(id) ?? []) {
          if (seen.has(next)) continue
          seen.add(next)
          walk(next, map)
        }
      }
      walk(startId, outM)
      walk(startId, incM)
      return seen
    }
    
    const reachableMap = new Map<string, Set<string>>()
    positionedList.forEach(n => reachableMap.set(n.id, reachable(n.id)))

    return { positioned: positionedList, extent: { w: extentW, h: extentH }, columnsData: usedCols.map((c, i) => ({ ...c, x: colX[i] })), linksData, reachableMap }
  }, [visibleNodes, visibleEdges, containerSize])

  // --- Zoom logic ---
  const fitToView = useCallback((duration = 400) => {
    const svg = svgRef.current
    const zoom = zoomRef.current
    if (!svg || !zoom) return
    const { width, height } = containerSize
    const { w, h } = extent
    
    // Calculate scale to fit width and height with some padding
    const scale = Math.min(1.2, Math.min(width / Math.max(1, w + 40), height / Math.max(1, h + 40)))
    const tx = (width - w * scale) / 2
    const ty = (height - h * scale) / 2
    
    d3.select(svg)
      .transition()
      .duration(duration)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }, [containerSize, extent])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setContainerSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || !rootGroupRef.current) return
    
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('start', () => d3.select(svgRef.current!).style('cursor', 'grabbing'))
      .on('zoom', (event) => {
        if (rootGroupRef.current) {
          rootGroupRef.current.setAttribute('transform', event.transform.toString())
        }
      })
      .on('end', () => d3.select(svgRef.current!).style('cursor', 'grab'))
      
    d3.select(svgRef.current).call(zoom).on('dblclick.zoom', null).on('dblclick', () => fitToView())
    zoomRef.current = zoom
    
    fitToView(0)
  }, [fitToView])
  
  // Re-fit if extent changes drastically
  useEffect(() => {
    fitToView(400)
  }, [extent.w, extent.h, fitToView])

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, factor)
  }

  // --- Searching & Selection logic ---
  const activeFocus = selectedNodeId
  const litNodes = activeFocus ? reachableMap.get(activeFocus) : null

  // Handle Search 
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      if (onNodeSelect) onNodeSelect(null)
      return
    }
    const query = searchQuery.toLowerCase()
    const found = positioned.find(n => displayLabel(n).toLowerCase().includes(query) || n.node_type.toLowerCase().includes(query))
    if (found && onNodeSelect) {
      onNodeSelect(found)
    }
  }

  return (
    <Card className="relative h-full min-h-[600px] overflow-hidden flex flex-col rounded-none border-0 sm:border sm:rounded-[10px]">
      
      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between gap-3 bg-surface/80 backdrop-blur-md border-b border-border-soft z-10 flex-wrap">
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/20 border border-border-soft rounded-full pl-8 pr-3 py-1.5 text-[12px] focus:outline-none focus:border-accent-blue/50 w-48 text-text"
            />
          </form>
          
          <div className="h-4 w-px bg-border-soft mx-1" />
          
          <FilterToggle active={showSystems} onClick={() => setShowSystems(!showSystems)}>Systems</FilterToggle>
          <FilterToggle active={showDataTypes} onClick={() => setShowDataTypes(!showDataTypes)}>Data</FilterToggle>
          <FilterToggle active={showVendors} onClick={() => setShowVendors(!showVendors)}>Vendors</FilterToggle>
          <FilterToggle active={showClauses} onClick={() => setShowClauses(!showClauses)}>Regulations</FilterToggle>
        </div>

        <div className="flex items-center gap-1.5">
          <CanvasButton label="Zoom out" onClick={() => zoomBy(1 / 1.4)}><Minus size={14} /></CanvasButton>
          <CanvasButton label="Zoom in" onClick={() => zoomBy(1.4)}><Plus size={14} /></CanvasButton>
          <CanvasButton label="Fit to view" onClick={() => fitToView()}><Maximize2 size={13} /></CanvasButton>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 w-full bg-[#0a0a0c]" onClick={() => onNodeSelect?.(null)}>
        <svg ref={svgRef} className="w-full h-full block cursor-grab">
          <defs>
            <filter id="glow-gap" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-compliant" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <g ref={rootGroupRef}>
            {/* Columns */}
            {columnsData.map((col, i) => (
              <text
                key={`col-${i}`}
                x={col.x - NODE_R}
                y={TOP_PAD - 20}
                fill="#6e6e86"
                fontSize={11}
                fontWeight={600}
                letterSpacing="0.06em"
              >
                {`${COLUMN_LABELS[col.type] ?? col.type} · ${col.list.length}`.toUpperCase()}
              </text>
            ))}

            {/* Edges */}
            <g>
              {linksData.map((e, i) => {
                const isLit = litNodes ? litNodes.has(e.source) && litNodes.has(e.target) : true
                const strokeWidth = isLit ? 1.5 : 1
                const opacity = isLit ? 0.6 : 0.1
                
                // Styling based on relationship
                let strokeDasharray = 'none'
                let strokeColor = e.color
                let extraClasses = ''
                
                if (e.relationship === 'SENT_TO') {
                  strokeDasharray = '4 4'
                } else if (e.relationship === 'GOVERNED_BY') {
                  strokeDasharray = '2 4'
                  strokeColor = STATUS_COLOR.compliant // green
                }
                
                if (isLit && e.relationship !== 'GOVERNED_BY') {
                  extraClasses = 'edge-flow-animate'
                }

                return (
                  <path
                    key={`${e.source}-${e.target}-${i}`}
                    d={e.path}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeOpacity={opacity}
                    strokeDasharray={strokeDasharray}
                    className={`transition-all duration-300 ${extraClasses}`}
                  />
                )
              })}
            </g>

            {/* Nodes */}
            <g>
              {positioned.map((n) => {
                const isLit = litNodes ? litNodes.has(n.id) : true
                const isFocused = activeFocus === n.id
                const opacity = isLit ? 1 : 0.15
                
                const isGap = n.status === 'gap'
                const isCompliant = n.status === 'compliant'
                
                let Icon = Code2
                if (n.node_type === 'DataType') Icon = Database
                if (n.node_type === 'Vendor') Icon = Building2
                if (n.node_type === 'DPDPClause') Icon = Scale
                if (isGap) Icon = AlertTriangle

                const nodeColor = isGap ? STATUS_COLOR.gap : (TYPE_COLOR[n.node_type] || STATUS_COLOR.unknown)
                
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    className="cursor-pointer transition-opacity duration-300"
                    style={{ opacity }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNodeSelect?.(isFocused ? null : n)
                    }}
                    onMouseEnter={(e) => {
                      if (!containerRef.current) return
                      const rect = containerRef.current.getBoundingClientRect()
                      setTooltip({ node: n, x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }}
                    onMouseMove={(e) => {
                      if (!containerRef.current) return
                      const rect = containerRef.current.getBoundingClientRect()
                      setTooltip({ node: n, x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {/* Invisible hit area */}
                    <rect x={-NODE_R - 6} y={-ROW_HEIGHT / 2} width={NODE_R * 2 + LABEL_GAP + n.labelWidth + 14} height={ROW_HEIGHT} fill="transparent" />
                    
                    {/* Glow ring */}
                    {(isFocused || isGap || isCompliant) && (
                      <circle 
                        r={NODE_R + (isFocused ? 6 : 4)} 
                        fill="none" 
                        stroke={isGap ? STATUS_COLOR.gap : (isCompliant ? STATUS_COLOR.compliant : nodeColor)} 
                        strokeWidth={1.5}
                        strokeOpacity={isFocused ? 0.8 : 0.4}
                        className={isGap ? 'animate-pulse' : ''}
                        filter={isGap ? 'url(#glow-gap)' : (isCompliant ? 'url(#glow-compliant)' : 'none')}
                      />
                    )}
                    
                    <circle r={NODE_R} fill="#1a1a24" stroke={nodeColor} strokeWidth={2} />
                    
                    {/* Render Lucide Icon centered inside circle using foreignObject or SVG translation */}
                    {/* For small icons it's cleaner to render SVG directly */}
                    <g transform={`translate(-7, -7)`}>
                      <Icon size={14} color={nodeColor} strokeWidth={isGap ? 2.5 : 2} />
                    </g>
                    
                    <text
                      x={NODE_R + LABEL_GAP}
                      y={4}
                      fill={isFocused ? '#ffffff' : '#c9c9de'}
                      fontSize={12}
                      fontFamily="Inter, sans-serif"
                      fontWeight={isFocused ? 600 : 400}
                    >
                      {displayLabel(n)}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        </svg>
      </div>

      {tooltip && <GraphTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} />}

      <style>{`
        .edge-flow-animate {
          stroke-dasharray: 4 6;
          animation: flow-anim 1s linear infinite;
        }
        @keyframes flow-anim {
          from { stroke-dashoffset: 10; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </Card>
  )
}

function FilterToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-accent-blue/[0.14] border-accent-blue/40 text-[#a9c1ff]'
          : 'bg-black/30 border-border-soft text-text-dim hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

function CanvasButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-7 h-7 grid place-items-center rounded bg-black/40 border border-border-soft text-text-dim hover:text-text hover:border-border transition-colors"
    >
      {children}
    </button>
  )
}
