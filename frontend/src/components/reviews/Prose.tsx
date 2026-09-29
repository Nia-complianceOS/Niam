import type { ReactNode } from 'react'

/**
 * A deliberately tiny Markdown renderer for amendment text: headings,
 * paragraphs, bullet and numbered lists, block quotes, and inline bold,
 * italic, code and links. Everything becomes React elements, so text is
 * escaped by React; there is no innerHTML anywhere. Links render only for
 * http(s) and mailto targets. Anything it does not recognise shows as a
 * plain paragraph, which for a legal reader is the honest fallback.
 */

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' }

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []

  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    if (list) blocks.push(list)
    if (quote.length) blocks.push({ kind: 'quote', text: quote.join(' ') })
    para = []
    list = null
    quote = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      flush()
      blocks.push({ kind: 'h', level: h[1].length, text: h[2] })
      continue
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      blocks.push({ kind: 'hr' })
      continue
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol'
      if (para.length || quote.length || (list && list.kind !== kind)) flush()
      if (!list) list = { kind, items: [] }
      list.items.push((ul ?? ol)![1])
      continue
    }
    const q = /^\s{0,3}>\s?(.*)$/.exec(line)
    if (q) {
      if (para.length || list) flush()
      quote.push(q[1])
      continue
    }
    if (list) {
      // A continuation line of the last list item.
      const items = (list as { items: string[] }).items
      items[items.length - 1] += ' ' + line.trim()
      continue
    }
    if (quote.length) flush()
    para.push(line.trim())
  }
  flush()
  return blocks
}

// Asterisks only: underscores appear inside data-type names (credit_card).
const INLINE_RE = /\*\*(.+?)\*\*|\*(?!\s)([^*]+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g

export function renderInline(text: string, keyPrefix = ''): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let k = 0
  INLINE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyPrefix}${k++}`
    if (m[1] !== undefined) out.push(<strong key={key} className="font-semibold text-text-primary">{renderInline(m[1], key + '.')}</strong>)
    else if (m[2] !== undefined) out.push(<em key={key}>{renderInline(m[2], key + '.')}</em>)
    else if (m[3] !== undefined)
      out.push(
        <code key={key} className="font-mono text-[0.85em] px-1 py-0.5 rounded-sm bg-bg-subtle border border-border">
          {m[3]}
        </code>
      )
    else if (m[4] !== undefined) {
      const href = m[5]
      out.push(
        /^(https?:|mailto:)/i.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {m[4]}
          </a>
        ) : (
          <span key={key}>{m[4]}</span>
        )
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Prose({ markdown, className = '' }: { markdown: string; className?: string }) {
  const blocks = parseBlocks(markdown)
  if (blocks.length === 0) {
    return <p className="text-text-tertiary italic">This version has no text.</p>
  }
  return (
    <div className={`font-serif text-[15px] leading-[1.7] text-text-primary space-y-3 ${className}`}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h': {
            const cls =
              b.level <= 1
                ? 'text-xl font-medium tracking-tight'
                : b.level === 2
                  ? 'text-lg font-medium tracking-tight'
                  : 'text-base font-semibold'
            const Tag = (`h${Math.min(b.level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6')
            return (
              <Tag key={i} className={`${cls} text-text-primary pt-1`}>
                {renderInline(b.text, `${i}-`)}
              </Tag>
            )
          }
          case 'p':
            return <p key={i}>{renderInline(b.text, `${i}-`)}</p>
          case 'ul':
            return (
              <ul key={i} className="list-disc pl-6 space-y-1 marker:text-text-tertiary">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${i}-${j}-`)}</li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} className="list-decimal pl-6 space-y-1 marker:text-text-tertiary">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${i}-${j}-`)}</li>
                ))}
              </ol>
            )
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-border pl-4 text-text-secondary italic">
                {renderInline(b.text, `${i}-`)}
              </blockquote>
            )
          case 'hr':
            return <hr key={i} className="border-border" />
        }
      })}
    </div>
  )
}
