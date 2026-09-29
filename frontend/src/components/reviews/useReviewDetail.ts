import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { actOnReview, getReview, httpStatus, isAbortError } from '@/services/api/client'
import { notifyDataChanged, useDataVersion } from '@/lib/dataEvents'
import type { ReviewActionRequest, ReviewDetail } from '@/types/api'

export type ActBody = Omit<ReviewActionRequest, 'expected_updated_at'>

export interface ActOutcome {
  ok: boolean
  review: ReviewDetail | null
}

/**
 * One review, and the one way to change it.
 *
 * Every action sends `expected_updated_at` = the updated_at of the review
 * as currently shown. If someone else acted in between, the server answers
 * 409; the latest copy is fetched and shown with a sentence saying so,
 * rather than applying this person's action on top of something they have
 * not seen. A successful action replaces the review with the server's copy
 * and tells the rest of the app (badges, lists) to refresh.
 */
export function useReviewDetail(reviewId: string | undefined) {
  const { userId } = useAuth()
  const [review, setReview] = useState<ReviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; status?: number } | null>(null)
  const [busy, setBusy] = useState<ReviewActionRequest['action'] | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const runRef = useRef(0)
  const dataVersion = useDataVersion()
  const reviewRef = useRef<ReviewDetail | null>(null)
  reviewRef.current = review
  const busyRef = useRef<ReviewActionRequest['action'] | null>(null)
  busyRef.current = busy

  // Initial load, and on a change of review or account: start from empty.
  useEffect(() => {
    const run = ++runRef.current
    setReview(null)
    setError(null)
    setActionError(null)
    setNotice(null)
    setLoading(true)
    if (!reviewId) return
    getReview(reviewId)
      .then((r) => {
        if (run === runRef.current) setReview(r)
      })
      .catch((err) => {
        if (run !== runRef.current || isAbortError(err)) return
        setError({ message: (err as Error).message, status: httpStatus(err) })
      })
      .finally(() => {
        if (run === runRef.current) setLoading(false)
      })
  }, [reviewId, userId])

  // Same review, data changed elsewhere: refresh in place, quietly.
  const firstVersion = useRef(dataVersion)
  useEffect(() => {
    if (dataVersion === firstVersion.current || !reviewId) return
    const run = runRef.current
    getReview(reviewId)
      .then((r) => {
        if (run === runRef.current && busyRef.current === null) setReview(r)
      })
      .catch(() => {
        /* keep what is on screen */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  const refetch = useCallback(async () => {
    if (!reviewId) return
    const run = runRef.current
    try {
      const r = await getReview(reviewId)
      if (run === runRef.current) setReview(r)
    } catch {
      /* the notice already says what happened */
    }
  }, [reviewId])

  const act = useCallback(
    async (body: ActBody): Promise<ActOutcome> => {
      const current = reviewRef.current
      if (!current || busyRef.current) return { ok: false, review: null }
      const run = runRef.current
      setBusy(body.action)
      busyRef.current = body.action
      setActionError(null)
      setNotice(null)
      try {
        const updated = await actOnReview(current.id, {
          ...body,
          expected_updated_at: current.updated_at,
        })
        if (run !== runRef.current) return { ok: false, review: null }
        setReview(updated)
        notifyDataChanged('review_changed')
        return { ok: true, review: updated }
      } catch (err) {
        if (run !== runRef.current || isAbortError(err)) return { ok: false, review: null }
        const status = httpStatus(err)
        const message = (err as Error).message
        if (status === 409) {
          // Either someone else acted first, or the action no longer
          // applies in the review's current state. Both: show the latest.
          await refetch()
          notifyDataChanged('review_changed')
          setNotice(
            /someone else acted/i.test(message)
              ? 'Someone else acted on this review — showing the latest.'
              : `${message} Showing the latest.`
          )
        } else if (status === 403) {
          setActionError(`${message} The server checks every action against your role.`)
        } else {
          setActionError(message)
        }
        return { ok: false, review: null }
      } finally {
        if (run === runRef.current) {
          setBusy(null)
          busyRef.current = null
        }
      }
    },
    [refetch]
  )

  return {
    review,
    loading,
    error,
    busy,
    actionError,
    notice,
    clearMessages: () => {
      setActionError(null)
      setNotice(null)
    },
    act,
  }
}
