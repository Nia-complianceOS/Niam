import { useCallback, useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { GraphTooltip } from '@/components/graph/GraphTooltip'
import type { ComplianceStatus, GraphEdge, GraphNode } from '@/types/api'

interface SimNode extends GraphNode, d3.SimulationNodeDatum {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string
  relationship: string
}

const STATUS_COLOR: Record<ComplianceStatus, string> = {
  compliant: '#5b8cff',
  warning: '#f5a623',
  gap: '#f0555a',
  unknown: '#5e5e72',
}

/**
 * Never index STATUS_COLOR directly. :DPDPClause nodes carry Neo4j's own
 * status vocabulary ("in_force" / "not_yet_commenced"), and a raw lookup
 * returned undefined for those -- so clause circles rendered with no stroke
 * colour at all. graph_service.py now maps every node onto the four-value
 * ComplianceStatus vocabulary the legend uses, but the fallback stays as a
 * guard against the next label that gets added on the backend.
 */
function colorFor(status: string): string {
  return STATUS_COLOR[status as ComplianceStatus] ?? STATUS_COLOR.unknown
}

const HEIGHT = 560
const MIN_ZOOM = 0.15
const MAX_ZOOM = 4

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface TooltipState {
  node: GraphNode
  x: number
  y: number
}

export function ComplianceGraphCanvas({ nodes, edges }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Handles the effect sets up, so the toolbar buttons outside it can drive
  // the same zoom behaviour the mouse does.
  const svgRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const simNodesRef = useRef<SimNode[]>([])
  const sizeRef = useRef({ width: 1180, height: HEIGHT })

  /**
   * Frame every node, whether or not it is currently on screen.
   *
   * This is the answer to the actual complaint: a force layout on a real
   * repo spreads well past a 560px box, and there was previously no way to
   * reach a node that landed outside it -- no pan, no zoom, no drag. Fit
   * computes the bounding box of the laid-out nodes and scales the whole
   * scene to it, so "there are nodes I cannot see" is always one click from
   * being false.
   */
  const fitToView = useCallback((duration = 400) => {
    const svg = svgRef.current
    const zoom = zoomRef.current
    const simNodes = simNodesRef.current
    if (!svg || !zoom || simNodes.length === 0) return

    const xs = simNodes.map((n) => n.x ?? 0)
    const ys = simNodes.map((n) => n.y ?? 0)
    // Padding covers the node radius (26), its label (sits at y+42) and a
    // little breathing room, so fitting never clips a caption.
    const pad = 70
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const boxW = Math.max(maxX - minX, 1)
    const boxH = Math.max(maxY - minY, 1)
    const { width, height } = sizeRef.current

    const scale = Math.min(MAX_ZOOM, Math.min(width / boxW, height / boxH))
    const tx = width / 2 - scale * (minX + boxW / 2)
    const ty = height / 2 - scale * (minY + boxH / 2)

    svg
      .transition()
      .duration(duration)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }, [])

  const zoomBy = useCallback((factor: number) => {
    const svg = svgRef.current
    const zoom = zoomRef.current
    if (!svg || !zoom) return
    svg.transition().duration(200).call(zoom.scaleBy, factor)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || nodes.length === 0) return

    const width = container.clientWidth || 1180
    const height = HEIGHT
    sizeRef.current = { width, height }

    // Clear any previous render (e.g. on data refresh / hot reload)
    d3.select(container).selectAll('*').remove()

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }))
    const simLinks: SimLink[] = edges.map((e) => ({
      id: e.id,
      relationship: e.relationship,
      source: e.source,
      target: e.target,
    }))
    simNodesRef.current = simNodes

    const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .style('cursor', 'grab')
    svgRef.current = svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>

    const defs = svg.append('defs')
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'edgeGrad')
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '1')
      .attr('y2', '0')
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#5b8cff').attr('stop-opacity', 0.55)
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#a56bff').attr('stop-opacity', 0.55)

    // Marching-ants flow along the dashed edges. The dasharray period is
    // 5 + 6 = 11, so shifting the offset by 22 over the cycle is two whole
    // dashes and the loop is seamless. Honoured only when the viewer has
    // not asked for reduced motion.
    defs.append('style').text(`
      @keyframes niam-edge-flow { to { stroke-dashoffset: -22; } }
      .niam-edge { animation: niam-edge-flow 1.4s linear infinite; }
      @media (prefers-reduced-motion: reduce) { .niam-edge { animation: none; } }
    `)

    // Everything the zoom behaviour transforms lives under this one group.
    const root = svg.append('g')

    const linkSelection = root
      .append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('class', 'niam-edge')
      .attr('stroke', 'url(#edgeGrad)')
      .attr('stroke-width', 1.6)
      .attr('stroke-dasharray', '5 6')

    const nodeGroup = root
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'grab')

    nodeGroup
      .append('circle')
      .attr('r', 26)
      .attr('fill', 'rgba(255,255,255,0.03)')
      .attr('stroke', (d) => colorFor(d.status))
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', 1.6)

    nodeGroup
      .append('circle')
      .attr('r', 4)
      .attr('fill', (d) => colorFor(d.status))

    nodeGroup
      .append('text')
      .attr('y', 42)
      .attr('text-anchor', 'middle')
      .attr('fill', '#c9c9de')
      .attr('font-size', 11.5)
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', 500)
      .text((d) => d.label)

    nodeGroup
      .on('mouseenter', (event: MouseEvent, d: SimNode) => {
        const rect = container.getBoundingClientRect()
        setTooltip({ node: d, x: event.clientX - rect.left, y: event.clientY - rect.top })
      })
      .on('mousemove', (event: MouseEvent, d: SimNode) => {
        const rect = container.getBoundingClientRect()
        setTooltip({ node: d, x: event.clientX - rect.left, y: event.clientY - rect.top })
      })
      .on('mouseleave', () => setTooltip(null))

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(120)
      )
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(50))

    // --- Dragging individual nodes ------------------------------------
    // d3-drag stops propagation on mousedown, so grabbing a node moves that
    // node and grabbing the background pans the scene -- the two gestures
    // do not fight. A dragged node keeps its fx/fy afterwards, i.e. it stays
    // where you put it; "Fit" releases every pin and lets the layout settle
    // again.
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
        setTooltip(null)
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        // Deliberately NOT clearing fx/fy: an arrangement you made by hand
        // should survive the simulation cooling down.
        d.fx = event.x
        d.fy = event.y
      })

    nodeGroup.call(drag)

    // --- Pan and zoom over the whole scene ----------------------------
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .on('start', () => {
        svg.style('cursor', 'grabbing')
        setTooltip(null)
      })
      .on('zoom', (event) => root.attr('transform', event.transform.toString()))
      .on('end', () => svg.style('cursor', 'grab'))

    const typedSvg = svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>
    typedSvg.call(zoom)
    // Double-click reframes rather than zooming in a step, which is the
    // gesture people reach for when they have panned somewhere and lost the
    // graph entirely.
    typedSvg.on('dblclick.zoom', null)
    typedSvg.on('dblclick', () => fitToView())
    zoomRef.current = zoom

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0)

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`)
    })

    // Frame the graph once the layout has stopped moving, so a scene wider
    // than the box arrives already visible instead of needing to be hunted
    // for. Once only: dragging a node re-heats the simulation, and refitting
    // every time it cooled again would yank the view out from under whoever
    // was arranging it.
    let hasFitted = false
    simulation.on('end', () => {
      if (hasFitted) return
      hasFitted = true
      fitToView(500)
    })

    return () => {
      simulation.stop()
      svgRef.current = null
      zoomRef.current = null
      simNodesRef.current = []
    }
  }, [nodes, edges, fitToView])

  return (
    <Card className="relative h-[560px] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <CanvasButton label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          <Minus size={14} />
        </CanvasButton>
        <CanvasButton label="Zoom in" onClick={() => zoomBy(1.4)}>
          <Plus size={14} />
        </CanvasButton>
        <CanvasButton label="Fit all nodes to view" onClick={() => fitToView()}>
          <Maximize2 size={13} />
        </CanvasButton>
      </div>

      <div className="absolute bottom-3 left-4 text-[11px] text-text-faint pointer-events-none">
        Scroll to zoom · drag the background to pan · drag a node to move it · double-click to fit
      </div>

      {tooltip && <GraphTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} />}
    </Card>
  )
}

function CanvasButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-7 h-7 grid place-items-center rounded-lg bg-black/40 border border-border-soft text-text-dim hover:text-text hover:border-border transition-colors"
    >
      {children}
    </button>
  )
}
