import type { RemovalCounts, ScannedRepository } from '@/types/api'

/**
 * Plain English for the two destructive things a person can do to their
 * own data: remove one scanned repository, or delete everything.
 *
 * Both are irreversible, and both are described here rather than in the
 * components so the two flows cannot drift into saying different things
 * about the same operation. The audience is a compliance or legal
 * reviewer: no slugs, no node labels, no counts of things they have never
 * heard of.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`
}

/**
 * "2 hours ago", and for anything older than about a month, "on 4 Mar
 * 2026" -- "63 days ago" is arithmetic, not an answer.
 */
export function timeAgo(value: string): string {
  const then = new Date(value)
  if (Number.isNaN(then.getTime())) return 'at an unknown time'

  const diff = Date.now() - then.getTime()
  // A clock skew between the browser and the server can put a fresh
  // timestamp very slightly in the future. "in -3 minutes" is nonsense;
  // "just now" is both truer and kinder.
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${plural(Math.floor(diff / MINUTE), 'minute')} ago`
  if (diff < DAY) return `${plural(Math.floor(diff / HOUR), 'hour')} ago`
  if (diff < WEEK) return `${plural(Math.floor(diff / DAY), 'day')} ago`
  if (diff < 5 * WEEK) return `${plural(Math.floor(diff / WEEK), 'week')} ago`

  return `on ${then.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`
}

/**
 * When this repository was last scanned.
 *
 * `last_scan` is null for a repository loaded by a command-line run rather
 * than scanned through the app. That is not an error and not "never
 * scanned", so it gets its own sentence instead of a blank column.
 */
export function describeLastScan(repo: ScannedRepository): string {
  if (!repo.last_scan) return 'Loaded from the command line'
  return `Last scanned ${timeAgo(repo.last_scan)}`
}

/** "a, b and c" — an Oxford-comma-free list for reading aloud. */
function joinList(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * What was actually deleted, from the counts the server returns after the
 * fact — not from what the UI expected to happen.
 *
 * Zero counts are left out: "0 vendors" is noise in a sentence someone
 * reads once to check the right thing went. An all-zero result returns an
 * empty string, and the caller says so in its own words.
 *
 * `system`/`systems` are handled differently on purpose. Removing one
 * repository always reports `system: 1`, and repeating "1 repository" back
 * to someone who just named that repository adds nothing; a reset reports
 * `systems: n`, which is the headline number there.
 */
export function summariseRemoval(
  removed: RemovalCounts,
  options: { includeRepositories?: boolean } = {}
): string {
  const parts: string[] = []
  const add = (n: number | undefined, singular: string, pluralForm?: string) => {
    if (n && n > 0) parts.push(plural(n, singular, pluralForm))
  }

  if (options.includeRepositories) add(removed.systems ?? removed.system, 'repository', 'repositories')
  add(removed.gaps, 'finding')
  add(removed.drafts, 'drafted fix')
  add(removed.pull_requests, 'recorded pull request')
  add(removed.data_types, 'data type')
  add(removed.vendors, 'vendor')
  add(removed.policy_documents, 'policy document')
  add(removed.scans, 'scan record')

  return joinList(parts)
}
