import { useState, useCallback, useRef } from 'react'
import { startScan, subscribeToScan } from '@/services/api/client'

export type ScanEvent = {
  event: string
  message?: string
  error?: string
}

export type ScanStatus = 'idle' | 'starting' | 'running' | 'completed' | 'failed' | 'connection_lost'

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
      setStatus('failed')
      setError(err.message || 'Failed to start scan')
    }
  }, [])

  return { status, logs, error, triggerScan }
}
