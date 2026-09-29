import { useSyncExternalStore } from 'react'

/**
 * An app-wide "the account's data just changed" signal.
 *
 * Several hooks hold their own copy of server data -- the sidebar's gap
 * badge keeps a useGaps() instance of its own, the Repositories page holds
 * the scanned-repository list, the graph page holds the graph -- and none
 * of them could know that a scan had just finished somewhere else on the
 * screen. They showed the old numbers until a full reload.
 *
 * Anything that changes findings calls notifyDataChanged() once it has
 * succeeded (a scan completing, a fix being drafted, a pull request being
 * opened, a repository being removed, a workspace reset). Every mounted
 * data hook reads useDataVersion() and refetches when it moves.
 *
 * It is a counter rather than a payload on purpose: the server is the only
 * source of truth, and "go and ask again" cannot go stale.
 */

export type DataChangeReason =
  | 'scan_completed'
  | 'fix_generated'
  | 'pr_opened'
  | 'repository_removed'
  | 'workspace_reset'
  | 'review_changed'

let version = 0
const listeners = new Set<() => void>()

// `reason` documents the call site; listeners do not branch on it.
export function notifyDataChanged(_reason: DataChangeReason): void {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): number {
  return version
}

/** Increments every time notifyDataChanged() is called. */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
