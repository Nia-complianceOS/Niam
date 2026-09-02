import axios from 'axios'
import type {
  AuditResponse,
  DashboardSummaryResponse,
  Gap,
  GapsResponse,
  GenerateFixResponse,
  GraphResponse,
  OpenPRResponse,
  PoliciesResponse,
  PRsResponse,
  RegulationsResponse,
  ReposResponse,
  VendorsResponse,
} from '@/types/api'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Every page-level hook does `.catch((err: Error) => setError(err.message))`
// (see useAsync.ts / useGraph.ts). Without this interceptor, err.message for
// an HTTP error response is axios's generic "Request failed with status code
// 503" — it never surfaces the actual `detail` string FastAPI's
// HTTPException sends back (e.g. "Graph data unavailable: ..."). This
// rewrites error.message to that detail when present, and gives a clear
// message for the "backend isn't running at all" case (a request that never
// got a response), so every page's ErrorState shows something actionable.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error?.response?.data?.detail
    if (typeof detail === 'string' && detail.length > 0) {
      error.message = detail
    } else if (error?.request && !error?.response) {
      error.message = 'Could not reach the backend — is it running?'
    }
    return Promise.reject(error)
  }
)

// --- auth ------------------------------------------------------------
// These are the only way in now. The app used to skip them entirely and
// write a fixed bypass token into localStorage.

export interface TokenResponse {
  access_token: string
  token_type: string
  user_id: string
  email: string
  name: string | null
}

export interface MeResponse {
  user_id: string
  email: string
  name: string | null
}

export const login = (email: string, password: string) =>
  client.post<TokenResponse>('/auth/login', { email, password }).then((r) => r.data)

export const signup = (email: string, password: string, name: string) =>
  client.post<TokenResponse>('/auth/signup', { email, password, name }).then((r) => r.data)

// Validates a stored token against the server rather than trusting
// whatever user object happens to be in localStorage.
export const getMe = () => client.get<MeResponse>('/auth/me').then((r) => r.data)

export const getHealth = () => client.get('/health').then((r) => r.data)

export const getDashboardSummary = () =>
  client.get<DashboardSummaryResponse>('/dashboard/summary').then((r) => r.data)

export const getGraph = () => client.get<GraphResponse>('/graph').then((r) => r.data)

export const getGaps = () => client.get<GapsResponse>('/gaps').then((r) => r.data)
export const getGap = (gapId: string) => client.get<Gap>(`/gaps/${gapId}`).then((r) => r.data)
export const generateFix = (gapId: string) =>
  client.post<GenerateFixResponse>(`/gaps/${gapId}/generate-fix`).then((r) => r.data)
export const openPR = (gapId: string) =>
  client.post<OpenPRResponse>(`/gaps/${gapId}/open-pr`).then((r) => r.data)

export const getVendors = () => client.get<VendorsResponse>('/compliance/vendors').then((r) => r.data)
export const getRegulations = () => client.get<RegulationsResponse>('/compliance/regulations').then((r) => r.data)
export const getPolicies = () => client.get<PoliciesResponse>('/compliance/policies').then((r) => r.data)
export const getAuditTrail = () => client.get<AuditResponse>('/compliance/audit').then((r) => r.data)

export const getRepos = () => client.get<ReposResponse>('/github/repos').then((r) => r.data)
export const getPullRequests = () => client.get<PRsResponse>('/github/prs').then((r) => r.data)

export const startScan = (repoFullName: string, ref: string = 'main') =>
  client.post<{ scan_id: string }>('/scan', { repo_full_name: repoFullName, ref }).then((r) => r.data)

export const subscribeToScan = (
  scanId: string,
  onMessage: (event: any) => void,
  onError: (error: Event) => void,
  onComplete: () => void
) => {
  const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'
  const token = localStorage.getItem('token') || ''
  const eventSource = new EventSource(`${baseURL}/scan/${scanId}/events?token=${token}`)

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onMessage(data)
      if (data.event === 'completed' || data.event === 'failed') {
        eventSource.close()
        onComplete()
      }
    } catch (err) {
      console.error('Failed to parse scan event', err)
    }
  }

  eventSource.onerror = (e) => {
    eventSource.close()
    onError(e)
  }

  return () => eventSource.close()
}

export default client
