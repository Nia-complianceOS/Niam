import { useId } from 'react'

/**
 * Niam brand mark: the "Graph N" — an N drawn as a path graph (four vertices, three edges).
 * Drawn on a 48-unit grid with currentColor, so it follows the surrounding text colour
 * (e.g. `text-text-primary`) in both themes.
 *
 * Two optical sizes share the same construction:
 *  - display (> 20px): vertices on 10/38, edges 4u, nodes r5u
 *  - small  (<= 20px): vertices on 12/36 (whole pixels at 16px), edges 5u, nodes r6u
 */

type Geometry = { lo: number; hi: number; stroke: number; r: number }

const DISPLAY: Geometry = { lo: 10, hi: 38, stroke: 4, r: 5 }
const SMALL: Geometry = { lo: 12, hi: 36, stroke: 5, r: 6 }

export interface NiamMarkProps {
  /** Rendered width and height in px. Default 24. */
  size?: number
  className?: string
  /** Accessible name. Pass an empty string to mark the SVG as decorative. Default "Niam". */
  title?: string
}

export function NiamMark({ size = 24, className, title = 'Niam' }: NiamMarkProps) {
  const titleId = useId()
  const { lo, hi, stroke, r } = size <= 20 ? SMALL : DISPLAY
  const decorative = title === ''

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : titleId}
      focusable="false"
    >
      {!decorative && <title id={titleId}>{title}</title>}
      <path
        d={`M${lo} ${hi}V${lo}L${hi} ${hi}V${lo}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <circle cx={lo} cy={lo} r={r} />
        <circle cx={lo} cy={hi} r={r} />
        <circle cx={hi} cy={hi} r={r} />
        <circle cx={hi} cy={lo} r={r} />
      </g>
    </svg>
  )
}

export interface NiamLogoProps {
  /** Mark size in px. Default 20 (pairs with the 17px wordmark). */
  size?: number
  /** Show the small mono "DPDP" tag after the wordmark. Default true. */
  showTag?: boolean
  className?: string
}

/**
 * Mark + "Niam" wordmark (live text in Newsreader via `font-serif`) + optional DPDP tag.
 * Classes match the Sidebar brand header.
 */
export function NiamLogo({ size = 20, showTag = true, className = '' }: NiamLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 text-text-primary ${className}`}>
      <NiamMark size={size} title="" className="flex-shrink-0" />
      <span className="flex items-baseline gap-2">
        <span className="font-serif font-semibold text-[17px] tracking-tight text-text-primary">Niam</span>
        {showTag && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary px-1 py-0.5 rounded border border-border bg-bg">
            DPDP
          </span>
        )}
      </span>
    </span>
  )
}

export default NiamMark
