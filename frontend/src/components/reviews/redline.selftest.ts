/**
 * Self-check for redline.ts. NOT imported by the app (there is no test
 * runner in this package). Run it with:
 *
 *   npx tsx src/components/reviews/redline.selftest.ts
 *   # or, on Node 22.6+:
 *   node --experimental-strip-types src/components/reviews/redline.selftest.ts
 *
 * Exits non-zero on the first failure.
 */
import {
  afterText,
  beforeText,
  proseForRedline,
  redline,
  splitParagraphs,
  tokenize,
  type Segment,
} from './redline.ts'

let failures = 0
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`ok   ${name}`)
  } else {
    failures++
    console.error(`FAIL ${name}`, detail ?? '')
  }
}

const show = (s: Segment[]) =>
  s.map((x) => (x.kind === 'equal' ? x.text : x.kind === 'insert' ? `{+${x.text}+}` : `[-${x.text}-]`)).join('')

// 1. Identical text: one equal segment, no changes.
{
  const r = redline('We share your email with Mixpanel.', 'We share your email with Mixpanel.')
  check('identical', r.segments.length === 1 && r.segments[0].kind === 'equal' && r.wordsInserted === 0 && r.wordsDeleted === 0, r)
}

// 2. A single word replaced.
{
  const r = redline('We share your email with Mixpanel.', 'We share your phone with Mixpanel.')
  check('word replaced', show(r.segments) === 'We share your [-email -]{+phone +}with Mixpanel.', show(r.segments))
  check('word counts', r.wordsInserted === 1 && r.wordsDeleted === 1, r)
}

// 3. Insertion only, punctuation split from words.
{
  const r = redline('Data is kept.', 'Data is kept securely, and encrypted.')
  check('insertion', r.wordsDeleted === 0 && r.wordsInserted === 3, show(r.segments))
  check('after round-trip', afterText(r.segments) === 'Data is kept securely, and encrypted.', afterText(r.segments))
}

// 4. Deletion only; before text reconstructs.
{
  const a = 'We may, at our discretion, share data.'
  const b = 'We may share data.'
  const r = redline(a, b)
  check('deletion', r.wordsInserted === 0 && r.wordsDeleted === 3, show(r.segments))
  check('deletion reads like tracked changes', show(r.segments) === 'We may[-, at our discretion, -]share data.', show(r.segments))
  check('before round-trip', beforeText(r.segments) === a, beforeText(r.segments))
}

// 5. Re-wrapping a line is not a change; a new paragraph break is.
{
  const r1 = redline('one two three four', 'one two\nthree four')
  check('rewrap ignored', r1.segments.every((s) => s.kind === 'equal'), show(r1.segments))
  const r2 = redline('one two three four', 'one two\n\nthree four')
  check('paragraph break detected', r2.segments.some((s) => s.kind !== 'equal'), show(r2.segments))
}

// 6. Empty sides.
{
  check('empty → text', show(redline('', 'Hello world').segments) === '{+Hello world+}')
  check('text → empty', show(redline('Hello world', '').segments) === '[-Hello world-]')
  check('empty → empty', redline('', '').segments.length === 0)
}

// 7. Tokenizer keeps every character.
{
  const s = '  Section 8(5): retain for 30 days — “then” delete.\n\nNext para.'
  check('tokenize lossless', tokenize(s).map((t) => t.text).join('') === s)
}

// 8. Large input falls back to paragraphs and stays correct.
{
  const para = (k: number) => Array.from({ length: 60 }, (_, i) => `w${k}_${i}`).join(' ')
  const a = Array.from({ length: 50 }, (_, k) => para(k)).join('\n\n') // 3,000 words
  const bParas = Array.from({ length: 50 }, (_, k) => para(k))
  bParas[10] = bParas[10].replace('w10_5', 'CHANGED')
  bParas.splice(30, 1)
  const b = bParas.join('\n\n')
  const t0 = Date.now()
  // Force the fallback with a small cell limit; also time the default path.
  const small = redline(a, b, 200_000)
  check('fallback granularity', small.granularity === 'paragraph', small.granularity)
  check('fallback after round-trip', afterText(small.segments) === b)
  check('fallback finds the word', small.wordsInserted >= 1 && small.segments.some((s) => s.kind === 'insert' && s.text.includes('CHANGED')))
  const full = redline(a, b)
  const ms = Date.now() - t0
  check('default path after round-trip', afterText(full.segments) === b)
  check(`3k words under 1.5s (${ms}ms)`, ms < 1500, ms)
}

// 9. Worst case for the word table: two unrelated ~2k-word texts.
{
  const a = Array.from({ length: 2000 }, (_, i) => `alpha${i}`).join(' ')
  const b = Array.from({ length: 2000 }, (_, i) => `beta${i}`).join(' ')
  const t0 = Date.now()
  const r = redline(a, b)
  const ms = Date.now() - t0
  check(`2k x 2k unrelated under 1.5s (${ms}ms, ${r.granularity})`, ms < 1500 && afterText(r.segments) === b, ms)
}

// 10. Markdown to prose.
{
  const md = '## Sharing with Mixpanel\n\n<!-- niam -->\nWe share **email** with [Mixpanel](https://x).\n\n- one\n* two'
  const p = proseForRedline(md)
  check('prose strips markup', p === 'Sharing with Mixpanel\n\nWe share email with Mixpanel.\n\n• one\n• two', JSON.stringify(p))
}

// 11. Paragraph split keeps separators.
{
  const s = 'a\n\nb\n \nc'
  check('splitParagraphs lossless', splitParagraphs(s).join('') === s && splitParagraphs(s).length === 3, splitParagraphs(s))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).process?.exit(1)
} else {
  console.log('\nall redline checks passed')
}
