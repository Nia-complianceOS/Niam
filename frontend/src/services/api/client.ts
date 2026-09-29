import axios from 'axios'
import { readToken, clearStoredSession, readWorkspaceId } from '@/lib/session'
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
  InviteCreated,
  InvitePreview,
  InviteSummary,
  PoliciesResponse,
  PRsResponse,
  RegulationsResponse,
  RemovalResponse,
  ReposResponse,
  ScannedRepositoriesResponse,
  VendorsResponse,
  ReviewActionRequest,
  ReviewCounts,
  ReviewDetail,
  ReviewSummary,
  TeamResponse,
  WorkspaceInfo,
  WorkspaceRole,
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

/**
 * Every request gives up after this long unless it says otherwise. Without
 * a ceiling a request to a backend that accepted the connection and then
 * hung (a cold start stuck on a database, a proxy holding the socket) spins
 * forever and the page never leaves its loading state.
 *
 * The event stream is not an axios request and is unaffected. The calls
 * that legitimately take longer (drafting a fix with the model, opening a
 * pull request, deleting a workspace) pass LONG_REQUEST_TIMEOUT_MS.
 */
export const DEFAULT_TIMEOUT_MS = 30_000
export const LONG_REQUEST_TIMEOUT_MS = 120_000

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  // Makes a timeout reject with code ETIMEDOUT instead of ECONNABORTED.
  // ECONNABORTED is what isAbortError() treats as "we cancelled this on
  // purpose" -- without this flag a timeout would be dropped silently
  // exactly like a sign-out cancellation.
  transitional: { clarifyTimeoutError: true },
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

/** True when a request gave up waiting (see DEFAULT_TIMEOUT_MS). */
export function isTimeoutError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ETIMEDOUT'
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

/**
 * Requests whose 401 means "those credentials are wrong", not "your
 * session has expired". The login and signup forms show that answer
 * themselves; the session interceptor below must leave them alone.
 */
const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/signup', '/auth/github/exchange']

function isCredentialRequest(url: string | undefined): boolean {
  if (!url) return false
  const path = url.split('?')[0].replace(/\/+$/, '')
  return CREDENTIAL_ENDPOINTS.some((endpoint) => path.endsWith(endpoint))
}

/** Pages a signed-out visitor may be on. No redirect is needed from these. */
const PUBLIC_PATHS = ['/', '/login', '/signup', '/auth/github/complete']

function onPublicPage(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  // An invite link is opened signed out as often as signed in.
  return PUBLIC_PATHS.includes(path) || path.startsWith('/invite/')
}

client.interceptors.request.use((config) => {
  const token = readToken()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const workspaceId = readWorkspaceId()
  if (workspaceId && config.headers) {
    config.headers['X-Niam-Workspace'] = workspaceId
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

    // A 401 from anything but the credential forms means the stored token
    // is no longer accepted (expired, JWT secret rotated, account deleted).
    // The session is cleared either way; the hard redirect only happens
    // from a page that needs a session. A wrong password on /auth/login
    // falls through to the detail rewrite below so the form can show it --
    // redirecting there reloaded the login page and lost the message.
    if (error?.response?.status === 401 && !isCredentialRequest(error?.config?.url)) {
      clearStoredSession()
      if (!onPublicPage()) {
        window.location.assign('/login')
        return Promise.reject(error)
      }
    }

    if (isTimeoutError(error)) {
      const seconds = Math.round((error?.config?.timeout ?? DEFAULT_TIMEOUT_MS) / 1000)
      error.message = `The server did not respond within ${seconds} seconds. Please try again; if it keeps happening the backend may be overloaded or restarting.`
      return Promise.reject(error)
    }

    const detail = error?.response?.data?.detail
    if (typeof detail === 'string' && detail.length > 0) {
      error.message = detail
    } else if (Array.isArray(detail) && detail.length > 0 && typeof detail[0].msg === 'string') {
      error.message = detail[0].msg
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
  // True only when a GitHub sign-in created the account just now.
  new_account?: boolean
}

export interface MeResponse {
  user_id: string
  email: string
  name: string | null
  // False for an account created with GitHub that has not set a password.
  has_password: boolean
  // The GitHub login linked for sign-in, if any.
  github_login: string | null
  // The workspace this request acted in, and the user's role there.
  workspace_id: string
  role: WorkspaceRole
  workspaces: WorkspaceInfo[]
}

export const login = (email: string, password: string) =>
  client.post<TokenResponse>('/auth/login', { email, password }).then((r) => r.data)

export const signup = (email: string, password: string, name: string) =>
  client.post<TokenResponse>('/auth/signup', { email, password, name }).then((r) => r.data)

// Validates a stored token against the server rather than trusting
// whatever user object happens to be in localStorage.
export const getMe = () => client.get<MeResponse>('/auth/me').then((r) => r.data)

export const getSseToken = () =>
  client.post<{ sse_token: string }>('/auth/sse-token').then((r) => r.data)

export const getHealth = () => client.get('/health').then((r) => r.data)

export const getDashboardSummary = () =>
  client.get<DashboardSummaryResponse>('/dashboard/summary').then((r) => r.data)

export const getGraph = () => client.get<GraphResponse>('/graph').then((r) => r.data)

export const getGaps = () => client.get<GapsResponse>('/gaps').then((r) => r.data)
export const getGap = (gapId: string) => client.get<Gap>(`/gaps/${gapId}`).then((r) => r.data)
// Both call out to slow services (the model drafting the fix; GitHub
// creating a branch, commit and pull request), so they get the long timeout.
export const generateFix = (gapId: string) =>
  client
    .post<GenerateFixResponse>(`/gaps/${gapId}/generate-fix`, undefined, {
      timeout: LONG_REQUEST_TIMEOUT_MS,
    })
    .then((r) => r.data)
/**
 * Only works for a finding whose review has owner approval: the server
 * refuses (409) otherwise. It exists to RETRY a pull request that GitHub
 * refused after approval. Returns the review.
 */
export const openPR = (gapId: string) =>
  client
    .post<ReviewDetail>(`/gaps/${gapId}/open-pr`, undefined, {
      timeout: LONG_REQUEST_TIMEOUT_MS,
    })
    .then((r) => r.data)

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
export const startGitHubOAuth = (binding: string) =>
  client
    .get<GitHubOAuthStartResponse>('/github/oauth/start', { params: { binding } })
    .then((r) => r.data)

/**
 * Step two of connecting GitHub: after GitHub sends the browser back to
 * /auth/github/complete?code=...&purpose=connect, POST that code with the
 * verifier this browser generated at step one (lib/githubFlow.ts). The
 * server checks the verifier's hash and that the signed-in user is the
 * one who started the flow.
 */
export const finishGitHubConnect = (code: string, verifier: string) =>
  client
    .post<{ login: string | null; linked_for_signin: boolean }>('/github/oauth/exchange', {
      code,
      verifier,
    })
    .then((r) => r.data)

// --- sign in with GitHub ---------------------------------------------------

/** Public. Returns GitHub's authorize URL for a sign-in (purpose=login). */
export const startGitHubSignIn = (binding: string) =>
  client
    .get<GitHubOAuthStartResponse>('/auth/github/start', { params: { binding } })
    .then((r) => r.data)

/**
 * Public. Swap the completion code (plus this browser's verifier) for a
 * session. Failures carry a reason code in error.message:
 * account_exists_link_required, email_unverified, expired_code,
 * browser_mismatch, invalid_state, storage_failed.
 */
export const finishGitHubSignIn = (code: string, verifier: string) =>
  client
    .post<TokenResponse>('/auth/github/exchange', { code, verifier })
    .then((r) => r.data)

/** Set or change the password (how a GitHub-only account adds one). */
export const setPassword = (password: string) =>
  client.post('/auth/password', { password }).then(() => undefined)

/** Stop signing in with GitHub. 409 if it is the only sign-in method. */
export const unlinkGitHubSignIn = () => client.delete('/auth/github').then(() => undefined)

/** The paste-a-token fallback, for instances with no OAuth app registered. */
export const connectGitHubToken = (token: string) =>
  client.post<GitHubConnection>('/github/connect-token', { token }).then((r) => r.data)

export const disconnectGitHub = () =>
  client.delete<GitHubDisconnectResponse>('/github/connection').then((r) => r.data)
export const getPullRequests = () => client.get<PRsResponse>('/github/prs').then((r) => r.data)

export const startScan = (repoFullName: string, ref: string = 'main') =>
  client.post<{ scan_id: string }>('/scan', { repo_full_name: repoFullName, ref }).then((r) => r.data)

/**
 * How long to wait before each reconnection attempt. Five attempts, about
 * 31 seconds of waiting in total, before the stream is reported lost.
 */
const SCAN_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000]

export interface ScanStreamOptions {
  /**
   * Called before each reconnection attempt (1-based) with the delay before
   * it. Lets the UI say "reconnecting" instead of looking frozen.
   */
  onReconnecting?: (attempt: number, delayMs: number) => void
  /** Called when a (re)connection is open again. */
  onConnected?: () => void
}

/**
 * Follow one scan's progress over Server-Sent Events.
 *
 * THE CONTRACT WITH THE BACKEND (GET /scan/{id}/events):
 *  - Each connection needs a fresh single-use ticket from POST
 *    /auth/sse-token (EventSource cannot send an Authorization header, and
 *    the ticket expires quickly), so every reconnect fetches a new one.
 *  - Every connection replays the scan's whole progress log from the
 *    first entry, then streams new entries as they are appended. Entries
 *    are `data: {"event": ..., "message"?: ..., "error"?: ...}` lines.
 *    Replayed entries are dropped here by position: the client counts how
 *    many entries it has already delivered and skips that many on the next
 *    connection. If an entry carries a numeric `index`, that is used
 *    instead of the position.
 *  - `completed` or `failed` is terminal: the stream is closed and
 *    `onComplete` runs. Comment lines (`: ping` heartbeats) are ignored by
 *    EventSource itself.
 *  - Anything else ending the connection (network drop, proxy timeout,
 *    server restart, expired ticket) is retried with backoff. `onError` is
 *    only called once the retries are used up. A connection that delivers
 *    at least one new entry resets the retry budget, so a long scan that
 *    loses its connection now and then is followed to the end.
 *
 * Returns a function that stops following the scan (on unmount/sign-out).
 */
export const subscribeToScan = (
  scanId: string,
  onMessage: (event: MessageEvent) => void,
  onError: (error: Event) => void,
  onComplete: () => void,
  options: ScanStreamOptions = {}
) => {
  let isCancelled = false
  let eventSource: EventSource | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  // Log entries already handed to onMessage, across every connection.
  let delivered = 0
  // Consecutive failed connections since the last one that made progress.
  let failures = 0

  const closeCurrent = () => {
    if (eventSource) {
      eventSource.onmessage = null
      eventSource.onerror = null
      eventSource.onopen = null
      eventSource.close()
      eventSource = null
    }
  }

  const scheduleReconnect = (cause: Event) => {
    closeCurrent()
    if (isCancelled) return
    if (failures >= SCAN_RECONNECT_DELAYS_MS.length) {
      onError(cause)
      return
    }
    const delay = SCAN_RECONNECT_DELAYS_MS[failures]
    failures += 1
    options.onReconnecting?.(failures, delay)
    retryTimer = setTimeout(() => {
      retryTimer = null
      connect()
    }, delay)
  }

  const connect = () => {
    if (isCancelled) return
    getSseToken()
      .then(({ sse_token }) => {
        if (isCancelled) return

        const source = new EventSource(
          `${API_BASE_URL}/scan/${scanId}/events?token=${encodeURIComponent(sse_token)}` +
            (readWorkspaceId() ? `&ws=${encodeURIComponent(readWorkspaceId() as string)}` : '')
        )
        eventSource = source
        // Position of the next entry within THIS connection's replay.
        let position = 0
        let madeProgress = false

        source.onopen = () => {
          options.onConnected?.()
        }

        source.onmessage = (e) => {
          const index = position
          position += 1
          let data: { event?: string; index?: unknown }
          try {
            data = JSON.parse(e.data)
          } catch (err) {
            console.error('Failed to parse scan event', err)
            return
          }
          const at = typeof data.index === 'number' ? data.index : index
          if (at < delivered) return // replayed from an earlier connection

          delivered = at + 1
          if (!madeProgress) {
            madeProgress = true
            failures = 0
          }
          onMessage(data as unknown as MessageEvent)
          if (data.event === 'completed' || data.event === 'failed') {
            closeCurrent()
            onComplete()
          }
        }

        source.onerror = (e) => {
          // The browser would retry on its own with the same, by now
          // expired, ticket. Take over instead.
          scheduleReconnect(e)
        }
      })
      .catch((err) => {
        if (isCancelled || isAbortError(err)) return
        scheduleReconnect(new Event('error'))
      })
  }

  connect()

  return () => {
    isCancelled = true
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    closeCurrent()
  }
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
    .delete<RemovalResponse>(`/workspace/repositories/${encodeURIComponent(systemName)}`, {
      timeout: LONG_REQUEST_TIMEOUT_MS,
    })
    .then((r) => r.data)

/**
 * Delete every finding on this account. The account itself and the GitHub
 * connection survive -- this is "start over", not "close my account".
 */
export const resetWorkspace = () =>
  client
    .post<RemovalResponse>('/workspace/reset', undefined, { timeout: LONG_REQUEST_TIMEOUT_MS })
    .then((r) => r.data)

export default client

// --- two-stage review ------------------------------------------------------
// Legal reviews a drafted fix first; the owner gives final approval, which
// opens the pull request with the approved version. See review_service.py.

export const getReviews = (state?: string) =>
  client
    .get<{ reviews: ReviewSummary[] }>('/reviews', state ? { params: { state } } : undefined)
    .then((r) => r.data.reviews)

export const getReviewCounts = () =>
  client.get<ReviewCounts>('/reviews/counts').then((r) => r.data)

export const getReview = (reviewId: string) =>
  client.get<ReviewDetail>(`/reviews/${reviewId}`).then((r) => r.data)

/**
 * One action on a review. 409 means either "not possible in this state"
 * or "someone else acted first" (the detail says which) -- refetch and
 * show the latest. 403 means the caller's role cannot take this action.
 * owner_approve and open_pr talk to GitHub; redo calls the model.
 */
export const actOnReview = (reviewId: string, body: ReviewActionRequest) =>
  client
    .post<ReviewDetail>(`/reviews/${reviewId}/actions`, body, {
      timeout: LONG_REQUEST_TIMEOUT_MS,
    })
    .then((r) => r.data)

// --- team / workspaces -----------------------------------------------------

export const getTeam = () => client.get<TeamResponse>('/team').then((r) => r.data)

export const updateTeam = (patch: { name?: string; require_distinct_approvers?: boolean }) =>
  client.patch('/team', patch).then((r) => r.data)

export const createInvite = (role: WorkspaceRole) =>
  client.post<InviteCreated>('/team/invites', { role }).then((r) => r.data)

export const getInvites = () =>
  client.get<{ invites: InviteSummary[] }>('/team/invites').then((r) => r.data.invites)

export const revokeInvite = (inviteId: string) =>
  client.delete(`/team/invites/${inviteId}`).then(() => undefined)

export const changeMemberRole = (userId: string, role: WorkspaceRole) =>
  client.patch(`/team/members/${userId}`, { role }).then(() => undefined)

export const removeMember = (userId: string) =>
  client.delete(`/team/members/${userId}`).then(() => undefined)

/** Public: what an invite link is for, before accepting. 404 if unusable. */
export const previewInvite = (token: string) =>
  client.get<InvitePreview>(`/invites/${encodeURIComponent(token)}`).then((r) => r.data)

/** Signed in: join the workspace. Returns the workspace joined. */
export const acceptInvite = (token: string) =>
  client
    .post<{ workspace_id: string; workspace_name: string; role: WorkspaceRole }>(
      `/invites/${encodeURIComponent(token)}/accept`
    )
    .then((r) => r.data)
