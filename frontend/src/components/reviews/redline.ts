/**
 * Prose redline: a word-level comparison of two versions of an amendment,
 * shown the way a lawyer reads tracked changes (deletions struck through,
 * insertions underlined), not as a line diff.
 *
 * Everything here is pure and synchronous, so it can be checked without a
 * browser (see redline.selftest.ts).
 *
 * How it works
 *   1. Both texts are split into tokens: a word (letters, digits and the
 *      joiners ' ’ - _), or a single punctuation mark, each carrying the
 *      whitespace that follows it. Tokens compare by their text alone, so
 *      re-wrapping a line does not show up as a change; a paragraph break
 *      does (it is part of the key).
 *   2. The common prefix and suffix are peeled off first. Most edits are
 *      local, so the part that needs real work is usually small.
 *   3. The middle is compared with a longest-common-subsequence table.
 *      The table is (n+1)(m+1) cells, so it is only built when that stays
 *      under WORD_DIFF_CELL_LIMIT (about 2,000 x 2,000 words).
 *   4. Above that, the comparison drops to paragraphs: paragraphs are
 *      matched by LCS, and each changed pair that is small enough is then
 *      compared word by word. Anything still too big shows as the whole
 *      paragraph removed and the new one inserted.
 */

export type SegmentKind = 'equal' | 'insert' | 'delete'

export interface Segment {
  kind: SegmentKind
  text: string
}

export interface Redline {
  segments: Segment[]
  /** 'word' normally; 'paragraph' when the texts were too large. */
  granularity: 'word' | 'paragraph'
  wordsInserted: number
  wordsDeleted: number
}

export interface Token {
  /** What is compared. */
  key: string
  /** What is shown: the token plus the whitespace after it. */
  text: string
}

/** ~2,000 words on each side after trimming the shared prefix/suffix. */
export const WORD_DIFF_CELL_LIMIT = 4_500_000

const TOKEN_RE = /([\p{L}\p{N}][\p{L}\p{N}'’_-]*|[^\s\p{L}\p{N}])(\s*)/gu

/** Leading whitespace is kept as its own token so no text is lost. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const lead = /^\s+/.exec(text)
  if (lead) tokens.push({ key: lead[0].includes('\n\n') ? '\n\n' : ' ', text: lead[0] })
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const ws = m[2]
    // A blank line (paragraph break) is part of the key; plain spaces and
    // single newlines are not, so re-flowed text still matches.
    const brk = ws.includes('\n\n') || /\n\s*\n/.test(ws) ? '¶' : ''
    tokens.push({ key: m[1] + brk, text: m[1] + ws })
  }
  return tokens
}

function isWord(key: string): boolean {
  return /[\p{L}\p{N}]/u.test(key)
}

/** Appends, merging with the previous segment of the same kind. */
function push(out: Segment[], kind: SegmentKind, text: string): void {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.kind === kind) last.text += text
  else out.push({ kind, text })
}

/**
 * LCS over two token arrays. Returns null when the table would be too
 * large (caller falls back to paragraphs).
 */
export function diffTokens(
  a: Token[],
  b: Token[],
  cellLimit: number = WORD_DIFF_CELL_LIMIT
): Segment[] | null {
  // Edit script first, text second: an unchanged word takes its trailing
  // whitespace from the OLD text when a deletion follows it and from the
  // new text otherwise, so "may, at our discretion, share" -> "may share"
  // reads "may[, at our discretion, ]share" rather than "may [, at ...".
  type Op = { kind: SegmentKind; i: number; j: number }
  const ops: Op[] = []

  let start = 0
  while (start < a.length && start < b.length && a[start].key === b[start].key) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1].key === b[endB - 1].key) {
    endA--
    endB--
  }

  for (let k = 0; k < start; k++) ops.push({ kind: 'equal', i: k, j: k })

  const n = endA - start
  const m = endB - start
  if (n > 0 && m > 0) {
    if ((n + 1) * (m + 1) > cellLimit) return null
    // table[i][j] = LCS length of a[start+i..endA) and b[start+j..endB).
    // Built from the end so the walk below can go forwards.
    const w = m + 1
    const table = new Uint16Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      const ka = a[start + i].key
      for (let j = m - 1; j >= 0; j--) {
        table[i * w + j] =
          ka === b[start + j].key
            ? table[(i + 1) * w + j + 1] + 1
            : Math.max(table[(i + 1) * w + j], table[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (a[start + i].key === b[start + j].key) {
        ops.push({ kind: 'equal', i: start + i++, j: start + j++ })
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
        ops.push({ kind: 'delete', i: start + i++, j: -1 })
      } else {
        ops.push({ kind: 'insert', i: -1, j: start + j++ })
      }
    }
    while (i < n) ops.push({ kind: 'delete', i: start + i++, j: -1 })
    while (j < m) ops.push({ kind: 'insert', i: -1, j: start + j++ })
  } else {
    for (let k = start; k < endA; k++) ops.push({ kind: 'delete', i: k, j: -1 })
    for (let k = start; k < endB; k++) ops.push({ kind: 'insert', i: -1, j: k })
  }

  for (let k = 0; k < a.length - endA; k++) {
    ops.push({ kind: 'equal', i: endA + k, j: endB + k })
  }

  const out: Segment[] = []
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]
    if (op.kind === 'delete') push(out, 'delete', a[op.i].text)
    else if (op.kind === 'insert') push(out, 'insert', b[op.j].text)
    else {
      const next = ops[k + 1]
      push(out, 'equal', next && next.kind === 'delete' ? a[op.i].text : b[op.j].text)
    }
  }
  return out
}

/** Splits on blank lines, keeping the separators attached. */
export function splitParagraphs(text: string): string[] {
  const parts = text.split(/(?<=\n[ \t]*\n)/)
  return parts.filter((p) => p.length > 0)
}

function diffParagraphs(a: string, b: string, cellLimit: number): Segment[] {
  const pa = splitParagraphs(a)
  const pb = splitParagraphs(b)
  const ka = pa.map((p) => p.trim())
  const kb = pb.map((p) => p.trim())
  const n = pa.length
  const m = pb.length
  const w = m + 1
  const table = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] =
        ka[i] === kb[j]
          ? table[(i + 1) * w + j + 1] + 1
          : Math.max(table[(i + 1) * w + j], table[i * w + j + 1])
    }
  }

  const out: Segment[] = []
  let delRun: string[] = []
  let insRun: string[] = []
  const flush = () => {
    // Pair removed and inserted paragraphs in order; a pair small enough
    // is compared word by word, the rest shows whole.
    const pairs = Math.min(delRun.length, insRun.length)
    for (let k = 0; k < pairs; k++) {
      const segs = diffTokens(tokenize(delRun[k]), tokenize(insRun[k]), cellLimit)
      if (segs) for (const s of segs) push(out, s.kind, s.text)
      else {
        push(out, 'delete', delRun[k])
        push(out, 'insert', insRun[k])
      }
    }
    for (let k = pairs; k < delRun.length; k++) push(out, 'delete', delRun[k])
    for (let k = pairs; k < insRun.length; k++) push(out, 'insert', insRun[k])
    delRun = []
    insRun = []
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      flush()
      push(out, 'equal', pb[j])
      i++
      j++
    } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
      delRun.push(pa[i++])
    } else {
      insRun.push(pb[j++])
    }
  }
  while (i < n) delRun.push(pa[i++])
  while (j < m) insRun.push(pb[j++])
  flush()
  return out
}

function countWords(text: string): number {
  let c = 0
  for (const t of tokenize(text)) if (isWord(t.key)) c++
  return c
}

/** Compare two versions of prose. `before` → `after`. */
export function redline(
  before: string,
  after: string,
  cellLimit: number = WORD_DIFF_CELL_LIMIT
): Redline {
  let segments = diffTokens(tokenize(before), tokenize(after), cellLimit)
  let granularity: Redline['granularity'] = 'word'
  if (segments === null) {
    segments = diffParagraphs(before, after, cellLimit)
    granularity = 'paragraph'
  }
  let wordsInserted = 0
  let wordsDeleted = 0
  for (const s of segments) {
    if (s.kind === 'insert') wordsInserted += countWords(s.text)
    else if (s.kind === 'delete') wordsDeleted += countWords(s.text)
  }
  return { segments, granularity, wordsInserted, wordsDeleted }
}

/**
 * The new / old text reassembled from a redline, for checks. Exact except
 * for whitespace next to a change (see the note in diffTokens).
 */
export function afterText(segments: Segment[]): string {
  return segments.filter((s) => s.kind !== 'delete').map((s) => s.text).join('')
}

export function beforeText(segments: Segment[]): string {
  return segments.filter((s) => s.kind !== 'insert').map((s) => s.text).join('')
}

/**
 * Markdown to the plain prose a reader sees, for comparison: HTML comments
 * dropped, heading hashes, emphasis markers and link syntax removed, list
 * markers normalised to a bullet. Paragraph breaks are kept.
 */
export function proseForRedline(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^(\s*)[-*+]\s+/, '$1• ')
        .replace(/^\s{0,3}>\s?/, '')
        .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
        .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
