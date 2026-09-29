import { useMemo } from 'react'
import type { ReviewDocument, ReviewVersion } from '@/types/api'
import { proseForRedline, redline } from './redline'

// Tracked-changes marks. Colour is never the only signal: deletions are
// struck through, insertions underlined, and both carry screen-reader text.
const DEL =
  'line-through decoration-status-gap decoration-[1.5px] text-status-gap bg-status-gap/10 rounded-[2px] px-[1px]'
const INS =
  'underline decoration-status-compliant decoration-2 underline-offset-[3px] text-status-compliant bg-status-compliant/10 rounded-[2px] px-[1px]'

/**
 * Tracked-changes view of two versions: struck-through deletions,
 * underlined insertions, everything else as plain prose. Compared per
 * document (versions normally hold one).
 */
export function RedlineView({ from, to }: { from: ReviewVersion; to: ReviewVersion }) {
  const count = Math.max(from.documents.length, to.documents.length)
  const docs = Array.from({ length: count }, (_, i) => ({
    before: from.documents[i] as ReviewDocument | undefined,
    after: to.documents[i] as ReviewDocument | undefined,
  }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-text-secondary">
        <span className="font-mono uppercase tracking-wider text-text-tertiary">Key</span>
        <span>
          <del className={DEL}>struck through</del> = removed in v{to.version_no}
        </span>
        <span>
          <ins className={INS}>underlined</ins> = added in v{to.version_no}
        </span>
      </div>
      {docs.map(({ before, after }, i) => (
        <DocumentRedline key={i} before={before} after={after} />
      ))}
    </div>
  )
}

function DocumentRedline({ before, after }: { before?: ReviewDocument; after?: ReviewDocument }) {
  const result = useMemo(
    () => redline(proseForRedline(before?.body ?? ''), proseForRedline(after?.body ?? '')),
    [before?.body, after?.body]
  )
  const title = after?.title ?? before?.title ?? 'Amendment'
  const titleChanged = before && after && before.title !== after.title
  const unchanged = result.wordsInserted === 0 && result.wordsDeleted === 0

  return (
    <section aria-label={`Changes to ${title}`} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-text-primary">
          {titleChanged ? (
            <>
              <del className={DEL}>{before!.title}</del> <ins className={INS}>{after!.title}</ins>
            </>
          ) : (
            title
          )}
          {(after?.file_path ?? before?.file_path) && (
            <span className="ml-2 font-mono text-[11px] font-normal text-text-tertiary">
              {after?.file_path ?? before?.file_path}
            </span>
          )}
        </h3>
        <span className="font-mono text-[11px] text-text-tertiary">
          {unchanged
            ? 'No wording changes'
            : `${result.wordsInserted} word${result.wordsInserted === 1 ? '' : 's'} added · ${result.wordsDeleted} removed`}
          {result.granularity === 'paragraph' ? ' · compared by paragraph (long text)' : ''}
        </span>
      </div>
      <div className="rounded border border-border bg-bg p-4 sm:p-5 font-serif text-[15px] leading-[1.75] text-text-primary whitespace-pre-wrap break-words">
        {result.segments.length === 0 ? (
          <span className="text-text-tertiary italic">Both versions are empty.</span>
        ) : (
          result.segments.map((s, i) =>
            s.kind === 'equal' ? (
              <span key={i}>{s.text}</span>
            ) : s.kind === 'delete' ? (
              <del key={i} className={DEL}>
                <span className="sr-only">[removed: </span>
                {s.text}
                <span className="sr-only">]</span>
              </del>
            ) : (
              <ins key={i} className={INS}>
                <span className="sr-only">[added: </span>
                {s.text}
                <span className="sr-only">]</span>
              </ins>
            )
          )
        )}
      </div>
    </section>
  )
}
