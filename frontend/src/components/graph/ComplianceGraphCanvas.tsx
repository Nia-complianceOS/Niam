import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Maximize2, Minus, Plus, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { GraphTooltip } from '@/components/graph/GraphTooltip'
import { dataTypeLabel } from '@/lib/gapLanguage'
import type { ComplianceStatus, GraphEdge, GraphNode } from '@/types/api'

const STATUS_COLOR: Record<ComplianceStatus, string> = {
  compliant: '#5b8cff',
  warning: '#f5a623',
  gap: '#f0555a',
  unknown: '#5e5e72',
}

function colorFor(status: string): string {
  return STATUS_COLOR[status as ComplianceStatus] ?? STATUS_COLOR.unknown
}

/**
 * Columns, left to right, in the order data actually moves:
 * the system collects data types, which are sent to vendors, and are
 * governed by clauses.
 */
const COLUMNS = ['System', 'DataType', 'Vendor', 'DPDPClause'] as const
const COLUMN_LABELS: Record<string, string> = {
  System: 'System',
  DataType: 'Data collected',
  Vendor: 'Sent to',
  DPDPClause: 'Governed by',
}

const ROW_HEIGHT = 34
const TOP_PAD = 44
const NODE_R = 6
const LABEL_GAP = 8   // dot -> start of its label
const GUTTER = 96     // end of a column's longest label -> next column's dot
const FONT = '12px Inter, sans-serif'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
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

/**
 * Measure label widths before laying anything out, so column positions
 * follow the text rather than a guessed constant. The previous version
 * used a fixed 260px column and started every edge 60px to the right of
 * its source -- a number related to nothing, which is why the lines
 * began in the middle of one label and stopped in empty space short of
 * the next dot. An edge now leaves the right edge of the source's text
 * and lands on the target's circle.
 */
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

/**
 * The compliance graph, laid out rather than simulated.
 *
 * A force simulation placed forty labelled nodes wherever physics put
 * them: overlapping text, no grouping, and no way to tell a vendor from a
 * clause without reading every label. This is a deterministic column
 * layout instead -- which column a node is in tells you what it is, and
 * every edge runs left to right along the path data actually takes.
 *
 * Edges carry the worse of their two endpoints' colours and flow, so a
 * red line from a data type to a vendor reads as a problem at a glance
 * rather than after inspecting both ends. Clicking a node isolates it:
 * everything upstream and downstream of it stays lit and the rest of the
 * picture goes dark, which is the only way to answer "where does THIS
 * actually go" on a graph with forty nodes in it.
 */
export function ComplianceGraphCanvas({ nodes, edges }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{
    node: GraphNode
    x: number
    y: number
  } | null>(null)
  const [showClauses, setShowClauses] = useState(false)
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [selected, setSelected] = useState<GraphNode | null>(null)

  // d3 owns the DOM inside the effect; the selection callbacks need to
  // read the current selection without re-running the whole layout.
  const selectedRef = useRef<string | null>(null)
  const applyRef = useRef<(focus: string | null) => void>(() => {})

  const svgRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const sizeRef = useRef({ width: 1180, height: 560 })
  const extentRef = useRef({ w: 1180, h: 560 })

  const { visibleNodes, visibleEdges } = useMemo(() => {
    let ns = nodes
    if (!showClauses) ns = ns.filter((n) => n.node_type !== 'DPDPClause')
    if (problemsOnly)
      ns = ns.filter(
        (n) => n.status === 'gap' || n.status === 'warning' || n.node_type === 'System'
      )
    const ids = new Set(ns.map((n) => n.id))
    return {
      visibleNodes: ns,
      visibleEdges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    }
  }, [nodes, edges, showClauses, problemsOnly])

  const fitToView = useCallback((duration = 400) => {
    const svg = svgRef.current
    const zoom = zoomRef.current
    if (!svg || !zoom) return
    const { width, height } = sizeRef.current
    const { w, h } = extentRef.current
    const scale = Math.min(1.2, Math.min(width / (w + 40), height / (h + 40)))
    const tx = (width - w * scale) / 2
    const ty = (height - h * scale) / 2
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

  const clearSelection = useCallback(() => {
    selectedRef.current = null
    setSelected(null)
    applyRef.current(null)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || visibleNodes.length === 0) return

    const width = container.clientWidth || 1180
    const height = 560
    sizeRef.current = { width, height }
    d3.select(container).selectAll('*').remove()

    const measure = makeMeasurer()

    // --- deterministic layout ---------------------------------------
    // Within a column: worst status first, then alphabetical. So the
    // problems are always at the top of each column and the ordering does
    // not move between renders.
    const rank: Record<string, number> = { gap: 0, warning: 1, unknown: 2, compliant: 3 }
    const byCol = COLUMNS.map((type) =>
      visibleNodes
        .filter((n) => n.node_type === type)
        .sort(
          (a, b) =>
            (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
            a.label.localeCompare(b.label)
        )
    )

    const usedCols = byCol
      .map((list, i) => ({ list, i }))
      .filter(({ list }) => list.length > 0)

    // Column x positions follow the widest label in the column before it.
    const colX: number[] = []
    let cursor = 24
    usedCols.forEach(({ list }, i) => {
      colX[i] = cursor
      const widest = Math.max(...list.map((n) => measure(displayLabel(n))))
      cursor += NODE_R + LABEL_GAP + widest + GUTTER
    })

    const tallest = Math.max(...usedCols.map((c) => c.list.length))
    const positioned: Positioned[] = []
    usedCols.forEach(({ list }, displayCol) => {
      const offset = ((tallest - list.length) * ROW_HEIGHT) / 2
      list.forEach((n, row) => {
        positioned.push({
          ...n,
          col: displayCol,
          x: colX[displayCol],
          y: TOP_PAD + offset + row * ROW_HEIGHT + ROW_HEIGHT / 2,
          labelWidth: measure(displayLabel(n)),
        })
      })
    })

    const pos = new Map(positioned.map((n) => [n.id, n]))
    const lastCol = usedCols.length - 1
    const extentW =
      colX[lastCol] +
      NODE_R +
      LABEL_GAP +
      Math.max(...usedCols[lastCol].list.map((n) => measure(displayLabel(n)))) +
      24
    const extentH = TOP_PAD + tallest * ROW_HEIGHT + 32
    extentRef.current = { w: extentW, h: extentH }

    const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .style('cursor', 'grab')
    svgRef.current = svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>

    // The flow animation, as CSS so the browser drives it rather than a
    // JS ticker: dashes travel source -> target along each path. Muted
    // edges stop moving, so motion itself carries the highlight.
    svg.append('style').text(`
      .flow { stroke-dasharray: 5 9; animation: niam-flow 1.6s linear infinite; }
      .flow.muted { animation: none; }
      @keyframes niam-flow { to { stroke-dashoffset: -14; } }
      @media (prefers-reduced-motion: reduce) { .flow { animation: none; } }
    `)

    const root = svg.append('g')

    // Clicking the background clears an isolation.
    svg.on('click', (event: MouseEvent) => {
      if (event.target === svg.node()) {
        selectedRef.current = null
        setSelected(null)
        apply(null)
      }
    })

    // --- column headings ---------------------------------------------
    usedCols.forEach(({ list }, displayCol) => {
      root
        .append('text')
        .attr('x', colX[displayCol] - NODE_R)
        .attr('y', 20)
        .attr('fill', '#6e6e86')
        .attr('font-size', 11)
        .attr('font-weight', 600)
        .attr('letter-spacing', '0.06em')
        .text(
          `${COLUMN_LABELS[list[0].node_type] ?? list[0].node_type} · ${list.length}`.toUpperCase()
        )
    })

    // --- edges ---------------------------------------------------------
    // Leave the right edge of the source's label, arrive at the left edge
    // of the target's circle. Both endpoints are computed from measured
    // text, so a line always starts and ends on something visible.
    const link = d3.linkHorizontal<unknown, [number, number]>()
      .x((d) => d[0])
      .y((d) => d[1])

    const edgeSel = root
      .append('g')
      .selectAll('path')
      .data(visibleEdges)
      .join('path')
      .attr('class', 'flow')
      .attr('fill', 'none')
      .attr('stroke', (e) => {
        const a = pos.get(e.source)
        const b = pos.get(e.target)
        const worse =
          (rank[a?.status ?? 'unknown'] ?? 9) <= (rank[b?.status ?? 'unknown'] ?? 9)
            ? a?.status
            : b?.status
        return colorFor(worse ?? 'unknown')
      })
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1.2)
      .attr('d', (e) => {
        const a = pos.get(e.source)
        const b = pos.get(e.target)
        if (!a || !b) return null
        const from: [number, number] = [a.x + NODE_R + LABEL_GAP + a.labelWidth + 6, a.y]
        const to: [number, number] = [b.x - NODE_R - 3, b.y]
        return link({ source: from, target: to })
      })

    // --- nodes ---------------------------------------------------------
    const nodeSel = root
      .append('g')
      .selectAll<SVGGElement, Positioned>('g')
      .data(positioned)
      .join('g')
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
      .style('cursor', 'pointer')

    // A wider invisible target: a 6px circle is a hard thing to hit, and
    // the label is the part people actually aim at.
    nodeSel
      .append('rect')
      .attr('x', -NODE_R - 6)
      .attr('y', -ROW_HEIGHT / 2)
      .attr('width', (d) => NODE_R + LABEL_GAP + d.labelWidth + 14)
      .attr('height', ROW_HEIGHT)
      .attr('rx', 6)
      .attr('fill', 'transparent')

    const halo = nodeSel
      .append('circle')
      .attr('r', NODE_R + 5)
      .attr('fill', 'none')
      .attr('stroke', (d) => colorFor(d.status))
      .attr('stroke-width', 1.4)
      .attr('stroke-opacity', 0)

    nodeSel
      .append('circle')
      .attr('r', NODE_R)
      .attr('fill', (d) => colorFor(d.status))
      .attr('fill-opacity', 0.9)

    nodeSel
      .append('text')
      .attr('x', NODE_R + LABEL_GAP)
      .attr('y', 4)
      .attr('fill', '#c9c9de')
      .attr('font-size', 12)
      .attr('font-family', 'Inter, sans-serif')
      .text(displayLabel)

    // --- who is connected to whom --------------------------------------
    // Directed, because the columns are: System -> DataType -> Vendor,
    // and DataType -> DPDPClause. Isolating a vendor should light the
    // data types feeding it and the system behind those, not every other
    // vendor that happens to share the same system.
    const out = new Map<string, string[]>()
    const inc = new Map<string, string[]>()
    visibleEdges.forEach((e) => {
      ;(out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e.target)
      ;(inc.get(e.target) ?? inc.set(e.target, []).get(e.target)!).push(e.source)
    })

    function reachable(startId: string): Set<string> {
      const seen = new Set<string>([startId])
      const walk = (id: string, map: Map<string, string[]>) => {
        for (const next of map.get(id) ?? []) {
          if (seen.has(next)) continue
          seen.add(next)
          walk(next, map)
        }
      }
      walk(startId, out)
      walk(startId, inc)
      return seen
    }

    /**
     * One place that decides what is lit. `focus` null means everything.
     * Hover and click both route through here so they cannot disagree.
     */
    function apply(focus: string | null) {
      if (!focus) {
        nodeSel.style('opacity', 1)
        halo.attr('stroke-opacity', 0)
        edgeSel.attr('stroke-opacity', 0.3).classed('muted', false).attr('stroke-width', 1.2)
        return
      }
      const lit = reachable(focus)
      nodeSel.style('opacity', (o) => (lit.has(o.id) ? 1 : 0.08))
      halo.attr('stroke-opacity', (o) => (o.id === focus ? 0.85 : 0))
      edgeSel
        .attr('stroke-opacity', (e) =>
          lit.has(e.source) && lit.has(e.target) ? 0.85 : 0.03
        )
        .attr('stroke-width', (e) =>
          lit.has(e.source) && lit.has(e.target) ? 1.8 : 1
        )
        .classed('muted', (e) => !(lit.has(e.source) && lit.has(e.target)))
    }
    applyRef.current = apply

    nodeSel
      .on('mouseenter', (event: MouseEvent, d) => {
        const rect = container.getBoundingClientRect()
        setTooltip({
          node: d,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
        if (!selectedRef.current) apply(d.id)
      })
      .on('mousemove', (event: MouseEvent, d) => {
        const rect = container.getBoundingClientRect()
        setTooltip({
          node: d,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      })
      .on('mouseleave', () => {
        setTooltip(null)
        if (!selectedRef.current) apply(null)
      })
      .on('click', (event: MouseEvent, d) => {
        event.stopPropagation()
        const next = selectedRef.current === d.id ? null : d.id
        selectedRef.current = next
        setSelected(next ? d : null)
        apply(next)
      })

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('start', () => svg.style('cursor', 'grabbing'))
      .on('zoom', (event) => root.attr('transform', event.transform.toString()))
      .on('end', () => svg.style('cursor', 'grab'))

    const typedSvg = svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>
    typedSvg.call(zoom)
    typedSvg.on('dblclick.zoom', null)
    typedSvg.on('dblclick', () => fitToView())
    zoomRef.current = zoom

    fitToView(0)

    // A filter change can remove the isolated node from the picture.
    if (selectedRef.current && !pos.has(selectedRef.current)) {
      selectedRef.current = null
      setSelected(null)
    } else if (selectedRef.current) {
      apply(selectedRef.current)
    }
  }, [visibleNodes, visibleEdges, fitToView])

  const clauseCount = nodes.filter((n) => n.node_type === 'DPDPClause').length

  return (
    <Card className="relative h-[560px] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute top-3 left-4 flex items-center gap-2 flex-wrap">
        <Toggle active={problemsOnly} onClick={() => setProblemsOnly((v) => !v)}>
          Problems only
        </Toggle>
        {clauseCount > 0 && (
          <Toggle active={showClauses} onClick={() => setShowClauses((v) => !v)}>
            Show {clauseCount} clauses
          </Toggle>
        )}
        {selected && (
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-full border bg-accent-blue/[0.14] border-accent-blue/40 text-[#a9c1ff]"
          >
            Isolating {displayLabel(selected)}
            <X size={11} />
          </button>
        )}
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <CanvasButton label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          <Minus size={14} />
        </CanvasButton>
        <CanvasButton label="Zoom in" onClick={() => zoomBy(1.4)}>
          <Plus size={14} />
        </CanvasButton>
        <CanvasButton label="Fit to view" onClick={() => fitToView()}>
          <Maximize2 size={13} />
        </CanvasButton>
      </div>

      <div className="absolute bottom-3 left-4 text-[11px] text-text-faint pointer-events-none">
        {selected
          ? 'Showing everything this connects to · click it again, or the background, to show all'
          : 'Click a node to isolate its path · hover to trace · scroll to zoom · drag to pan'}
      </div>

      {tooltip && <GraphTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} />}
    </Card>
  )
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11.5px] px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-accent-blue/[0.14] border-accent-blue/40 text-[#a9c1ff]'
          : 'bg-black/30 border-border-soft text-text-dim hover:text-text'
      }`}
    >
      {children}
    </button>
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
