import axios from 'axios'
import { readToken } from '@/lib/session'
import type {
  AuditResponse,
  DashboardSummaryResponse,
  Gap,
  GapsResponse,
  GenerateFixResponse,
  GitHubConnection,
  GitHubDisconnectResponse,
  GitHubOAuthStartResponse,
  GraphResponse,
  OpenPRResponse,
  PoliciesResponse,
  PRsResponse,
  RegulationsResponse,
  RemovalResponse,
  ReposResponse,
  ScannedRepositoriesResponse,
  VendorsResponse,
} from '@/types/api'

/**
 * VITE_API_BASE_URL is baked in at BUILD time, not read at runtime -- so
 * setting it in Vercel after a deploy changes nothing until the next
 * build. Two consumers need it (this client and the EventSource in
 * subscribeToScan), so it is resolved once here.
 *
 * The localhost fallback is right for development and catastrophic in
 * production: a deployed build missing the variable calls the visitor's
 * own machine, and every request fails with a connection error that
 * looks like the backend is down. In a production build there is no
 * fallback -- the console says exactly what is unset.
 */
export const API_BASE_URL = (() => {
  const configured = import.meta.env.VITE_API_BASE_URL
  if (configured) return configured
  if (import.meta.env.PROD) {
    console.error(
      'VITE_API_BASE_URL is not set. This build cannot reach any backend. ' +
        'Set it in the Vercel project settings and redeploy — it is read at ' +
        'build time, so changing it does not affect an existing deployment.'
    )
    return ''
  }
  return 'http://localhost:8000/api/v1'
})()

const client = axios.create({
  baseURL: API_BASE_URL,
})

/**
 * Every request made while one person is signed in shares this
 * controller. `abortInFlightRequests()` fires it on sign-out, so a
 * response that was already on the wire cannot land in a component
 * mounted for the NEXT person. Replacing the controller afterwards is
 * what makes the client usable again for the next session -- an aborted
 * signal stays aborted forever.
 */
let sessionAbort = new AbortController()

export function abortInFlightRequests(): void {
  sessionAbort.abort()
  sessionAbort = new AbortController()
}

/** True for a request this app cancelled, not a failure worth showing. */
export function isAbortError(error: unknown): boolean {
  if (axios.isCancel(error)) return true
  const code = (error as { code?: string } | null)?.code
  return code === 'ERR_CANCELED' || code === 'ECONNABORTED'
}

/** The HTTP status of a failed request, or undefined if it never got one. */
export function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status
}

/**
 * 409 from any GitHub read means one thing: this account has not connected
 * GitHub yet (or the stored token was revoked, which needs the same action
 * from the user). It is a state to render a Connect panel for, NOT an
 * error -- see the docstring on GET /github/repos in the backend.
 *
 * Deliberately not applied to POST /scan, which also answers 409, but for
 * an unrelated reason ("a scan is already running"). useScan handles that
 * one itself.
 */
export function isNotConnectedError(error: unknown): boolean {
  return httpStatus(error) === 409
}

client.interceptors.request.use((config) => {
  const token = readToken()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (!config.signal) {
    config.signal = sessionAbort.signal
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
    // A cancelled request is not a failure and must not be rewritten into
    // one -- the hooks drop these on the floor.
    if (isAbortError(error)) return Promise.reject(error)
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

/**
 * The signed-in user's own repositories.
 *
 * Answers 409 ("Connect your GitHub account first") when this account has
 * no GitHub connection. Callers must treat that with
 * isNotConnectedError() and render the Connect panel -- an empty list and
 * "we cannot see your repositories" are different sentences with
 * different fixes.
 */
export const getRepos = (q?: string) =>
  client
    .get<ReposResponse>('/github/repos', q ? { params: { q } } : undefined)
    .then((r) => r.data)

// --- github connection -------------------------------------------------
// One GitHub account per Niam account. There is no shared instance token
// any more: scans read the signed-in user's repositories with the
// signed-in user's credential, and pull requests are opened as them.

export const getGitHubConnection = () =>
  client.get<GitHubConnection>('/github/connection').then((r) => r.data)

/**
 * Step one of the OAuth flow. Returns the URL to send the browser to --
 * the backend deliberately does NOT redirect, because a 302 out of an XHR
 * is either followed opaquely or dropped by CORS, and either way the user
 * never sees GitHub's consent screen. The caller does
 * `window.location.assign(authorize_url)`.
 */
export const startGitHubOAuth = () =>
  client.get<GitHubOAuthStartResponse>('/github/oauth/start').then((r) => r.data)

/** The paste-a-token fallback, for instances with no OAuth app registered. */
export const connectGitHubToken = (token: string) =>
  client.post<GitHubConnection>('/github/connect-token', { token }).then((r) => r.data)

export const disconnectGitHub = () =>
  client.delete<GitHubDisconnectResponse>('/github/connection').then((r) => r.data)
export const getPullRequests = () => client.get<PRsResponse>('/github/prs').then((r) => r.data)

export const startScan = (repoFullName: string, ref: string = 'main') =>
  client.post<{ scan_id: string }>('/scan', { repo_full_name: repoFullName, ref }).then((r) => r.data)

export const subscribeToScan = (
  scanId: string,
  onMessage: (event: any) => void,
  onError: (error: Event) => void,
  onComplete: () => void
) => {
  const token = readToken() || ''
  const eventSource = new EventSource(
    `${API_BASE_URL}/scan/${scanId}/events?token=${encodeURIComponent(token)}`
  )

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

// --- workspace ---------------------------------------------------------
// What this ACCOUNT has scanned, and how to unscan it. Deliberately not
// part of the github section above: /github/repos answers "what exists on
// GitHub", these answer "what has been mapped into your graph". A user who
// scanned the wrong repository needs the second list, and until these
// existed there was no way back from that at all.

export const getScannedRepositories = () =>
  client.get<ScannedRepositoriesResponse>('/workspace/repositories').then((r) => r.data)

/**
 * Remove one scanned repository's findings from this account.
 *
 * Takes the `system_name` off a ScannedRepository, never a name typed by a
 * person. It is encoded because it is a path segment, and answers 404 when
 * the account has no repository by that name -- which in practice means
 * the list on screen is stale, not that anything is broken.
 */
export const removeScannedRepository = (systemName: string) =>
  client
    .delete<RemovalResponse>(`/workspace/repositories/${encodeURIComponent(systemName)}`)
    .then((r) => r.data)

/**
 * Delete every finding on this account. The account itself and the GitHub
 * connection survive -- this is "start over", not "close my account".
 */
export const resetWorkspace = () =>
  client.post<RemovalResponse>('/workspace/reset').then((r) => r.data)

export default client
