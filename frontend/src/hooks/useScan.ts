import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { isAbortError, startScan, subscribeToScan } from '@/services/api/client'
import { notifyDataChanged } from '@/lib/dataEvents'

export type ScanEvent = {
  event: string
  message?: string
  error?: string
}

// 'rejected' is not 'failed'. The server refused to start the scan --
// one is already running, or the hourly limit is reached -- and nothing
// went wrong. Reporting that as "Scan failed" sends people looking for a
// bug that is not there.
export type ScanStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'connection_lost'

export const useScan = () => {
  const { userId } = useAuth()
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [logs, setLogs] = useState<ScanEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  // Set while the event stream is between connections. The scan itself is
  // still running on the server; only our view of it is interrupted.
  const [reconnecting, setReconnecting] = useState<{ attempt: number } | null>(null)

  const isFinishedRef = useRef(false)
  // The live event stream. An EventSource is not an axios request, so
  // abortInFlightRequests() cannot reach it -- it has to be closed here,
  // or it keeps streaming one account's scan progress into a page that
  // now belongs to somebody else.
  const closeStreamRef = useRef<(() => void) | null>(null)

  const stopStream = useCallback(() => {
    closeStreamRef.current?.()
    closeStreamRef.current = null
  }, [])

  // Unmount, and any change of signed-in account, tears the stream down
  // and empties the log.
  useEffect(() => {
    return () => {
      stopStream()
      isFinishedRef.current = true
    }
  }, [userId, stopStream])

  useEffect(() => {
    setStatus('idle')
    setLogs([])
    setError(null)
    setReconnecting(null)
  }, [userId])

  const triggerScan = useCallback(
    async (repoFullName: string, ref: string = 'main') => {
      stopStream()
      setStatus('starting')
      setLogs([])
      setError(null)
      setReconnecting(null)
      isFinishedRef.current = false

      try {
        const { scan_id } = await startScan(repoFullName, ref)
        setStatus('running')

        closeStreamRef.current = subscribeToScan(
          scan_id,
          (event: MessageEvent) => {
            const scanEvent = event as unknown as ScanEvent
            setLogs((prev) => [...prev, scanEvent])
            if (scanEvent.event === 'completed') {
              setStatus('completed')
              isFinishedRef.current = true
              // Findings, the graph, the gap count and the scanned list all
              // changed. Every mounted data hook refetches on this.
              notifyDataChanged('scan_completed')
            } else if (scanEvent.event === 'failed') {
              setStatus('failed')
              setError(scanEvent.error || 'Scan failed during execution')
              isFinishedRef.current = true
            }
          },
          () => {
            setReconnecting(null)
            if (!isFinishedRef.current) {
              setStatus('connection_lost')
              setError(
                'Lost the connection to the scan progress stream after several retries. ' +
                  'The scan may still be running on the server: check back in a minute, ' +
                  'or reload this page to see its results.'
              )
            }
          },
          () => {
            isFinishedRef.current = true
            closeStreamRef.current = null
            setReconnecting(null)
          },
          {
            onReconnecting: (attempt) => setReconnecting({ attempt }),
            onConnected: () => setReconnecting(null),
          }
        )
      } catch (err: unknown) {
        // Signing out cancels the request. Nothing to report to a person
        // who is no longer here.
        if (isAbortError(err)) return
        const code = (err as { response?: { status?: number } })?.response?.status
        // 409 here is NOT the GitHub "not connected" 409 -- POST /scan
        // answers 409 when a scan is already running for this account.
        // Both are states rather than faults, and both are said plainly.
        setStatus(code === 409 || code === 429 ? 'rejected' : 'failed')
        setError((err as Error)?.message || 'Failed to start scan')
      }
    },
    [stopStream]
  )

  return { status, logs, error, reconnecting, triggerScan }
}
