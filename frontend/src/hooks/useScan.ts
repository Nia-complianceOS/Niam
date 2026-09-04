import { useState, useCallback, useRef } from 'react'
import { startScan, subscribeToScan } from '@/services/api/client'

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
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [logs, setLogs] = useState<ScanEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  
  const isFinishedRef = useRef(false)

  const triggerScan = useCallback(async (repoFullName: string, ref: string = 'main') => {
    setStatus('starting')
    setLogs([])
    setError(null)
    isFinishedRef.current = false

    try {
      const { scan_id } = await startScan(repoFullName, ref)
      setStatus('running')
      
      subscribeToScan(
        scan_id,
        (event: ScanEvent) => {
          setLogs((prev) => [...prev, event])
          if (event.event === 'completed') {
            setStatus('completed')
            isFinishedRef.current = true
          } else if (event.event === 'failed') {
            setStatus('failed')
            setError(event.error || 'Scan failed during execution')
            isFinishedRef.current = true
          }
        },
        () => {
          if (!isFinishedRef.current) {
            setStatus('connection_lost')
            setError('Lost connection to the scan stream.')
          }
        },
        () => {
          isFinishedRef.current = true
        }
      )
    } catch (err: any) {
      const code = err?.response?.status
      setStatus(code === 409 || code === 429 ? 'rejected' : 'failed')
      setError(err.message || 'Failed to start scan')
    }
  }, [])

  return { status, logs, error, triggerScan }
}
