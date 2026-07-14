import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
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

  useEffect(() => {
    const container = containerRef.current
    if (!container || nodes.length === 0) return

    const width = container.clientWidth || 1180
    const height = 560

    // Clear any previous render (e.g. on data refresh / hot reload)
    d3.select(container).selectAll('*').remove()

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }))
    const simLinks: SimLink[] = edges.map((e) => ({
      id: e.id,
      relationship: e.relationship,
      source: e.source,
      target: e.target,
    }))

    const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')

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

    const linkSelection = svg
      .append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', 'url(#edgeGrad)')
      .attr('stroke-width', 1.6)
      .attr('stroke-dasharray', '5 6')

    const nodeGroup = svg
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')

    nodeGroup
      .append('circle')
      .attr('r', 26)
      .attr('fill', 'rgba(255,255,255,0.03)')
      .attr('stroke', (d) => STATUS_COLOR[d.status])
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', 1.6)

    nodeGroup
      .append('circle')
      .attr('r', 4)
      .attr('fill', (d) => STATUS_COLOR[d.status])

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

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0)

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`)
    })

    return () => {
      simulation.stop()
    }
  }, [nodes, edges])

  return (
    <Card className="relative h-[560px] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      {tooltip && <GraphTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} />}
    </Card>
  )
}