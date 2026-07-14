import { useEffect, useState } from 'react'
import { getGraph } from '@/services/api/client'
import type { GraphResponse } from '@/types/api'

interface UseGraphResult {
  graph: GraphResponse | null
  loading: boolean
  error: string | null
}

export function useGraph(): UseGraphResult {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getGraph()
      .then(setGraph)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { graph, loading, error }
}