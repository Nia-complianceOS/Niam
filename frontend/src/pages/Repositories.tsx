import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState, PageHeader } from '@/components/shared/PageStates'
import { GitHubAccountBar } from '@/components/repositories/GitHubAccountBar'
import { GitHubConnectPanel } from '@/components/repositories/GitHubConnectPanel'
import { ScanPanel } from '@/components/repositories/ScanPanel'
import { ScannedRepositories } from '@/components/repositories/ScannedRepositories'
import { useGitHubConnection } from '@/hooks/useGitHubConnection'
import { useRepos } from '@/hooks/useRepos'
import { useScannedRepositories } from '@/hooks/useScannedRepositories'
import { useScan } from '@/hooks/useScan'
import { describeConnectFailure } from '@/lib/githubMessages'
import type { Repository } from '@/types/api'

interface Banner {
  tone: 'success' | 'error'
  title: string
  message: string
  retryable: boolean
}

/**
 * The on-ramp for the whole product.
 *
 * Three states, and the page is only ever in one of them:
 *
 *   NOT CONNECTED — what connecting does and why, one Connect button, and
 *     a collapsed paste-a-token fallback. No repository list, no empty
 *     grid: "you have not connected" and "you have no repositories" are
 *     different sentences, and the backend answers 409 rather than an
 *     empty list precisely so this page can tell them apart.
 *   CONNECTING — the hand-off to GitHub, or a pasted token being checked.
 *   CONNECTED — whose account it is, how to disconnect, the searchable
 *     picker, what this account has already scanned (and how to remove
 *     it), and the repositories themselves.
 *
 * It is also where GitHub sends the browser back to. The backend cannot
 * render anything at the end of the OAuth flow (the browser is on the API
 * origin with no app loaded), so it redirects here with ?github=connected
 * or ?github=error&reason=<slug>. Those slugs never reach the screen —
 * lib/githubMessages.ts turns each one into a sentence — and the query is
 * stripped afterwards so a refresh does not replay a stale result.
 */
export default function Repositories() {
  const {
    phase,
    connection,
    actionError,
    loadError,
    beginOAuth,
    submitToken,
    disconnect,
    refresh,
  } = useGitHubConnection()

  const connected = phase === 'connected'
  const repos = useRepos(connected)
  // Two different lists, fetched separately because they answer different
  // questions: `repos` is what exists on GitHub, `scanned` is what this
  // account has actually mapped. Both are owned here rather than by the
  // panels that render them -- the same reason ScanPanel takes its
  // repositories as a prop: two copies of one request can disagree.
  const scanned = useScannedRepositories(connected)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [params, setParams] = useSearchParams()

  // Anything that changes the graph -- a scan finishing, a repository
  // being removed -- invalidates both lists at once: the scanned list
  // itself, and the scores and scan dates hanging off the GitHub list.
  const refreshGraphData = useCallback(() => {
    scanned.refetch()
    repos.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned.refetch, repos.refetch])

  // Runs once, on arrival. Everything it reads is removed from the URL in
  // the same pass, so a reload is a clean page rather than yesterday's
  // failure shown again as though it just happened.
  useEffect(() => {
    const result = params.get('github')
    if (!result) return

    if (result === 'connected') {
      setBanner({
        tone: 'success',
        title: 'GitHub connected',
        message:
          'Your GitHub account is connected. Choose a repository below and scan it to see what personal data it handles.',
        retryable: false,
      })
      refresh()
    } else {
      const failure = describeConnectFailure(params.get('reason'))
      setBanner({ tone: 'error', ...failure })
    }

    const next = new URLSearchParams(params)
    next.delete('github')
    next.delete('reason')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // We could not even ask whether this account is connected. Reporting
  // that as "not connected" would invite someone to reconnect an account
  // that is perfectly fine.
  if (phase === 'unavailable') {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Code Inventory"
          title="Repositories"
          subtitle="Scan a repository to map the personal data its code handles."
        />
        <ErrorState message={loadError} />
      </div>
    )
  }

  if (phase === 'checking') {
    return <LoadingState label="Checking your GitHub connection…" />
  }

  // The connection said yes, then listing repositories came back 409 —
  // the token was revoked at GitHub since. Same state, same fix.
  //
  // 'connecting' keeps the panel mounted rather than swapping it for a
  // spinner: the panel shows its own in-flight state, and unmounting it
  // would throw away a half-typed token and collapse the fallback the
  // person had just opened.
  const needsConnection =
    phase === 'disconnected' ||
    repos.notConnected ||
    (phase === 'connecting' && !connection?.connected)

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Code Inventory"
        title="Repositories"
        subtitle="Scan a repository to map the personal data its code handles."
      />

      {banner && <ResultBanner banner={banner} onRetry={beginOAuth} />}

      {needsConnection ? (
        <GitHubConnectPanel
          connecting={phase === 'connecting'}
          actionError={actionError}
          onConnect={() => void beginOAuth()}
          onSubmitToken={submitToken}
        />
      ) : phase === 'connecting' ? (
        <Card className="p-6 flex items-center gap-3 max-w-[720px]">
          <Loader2 size={17} className="animate-spin text-accent-blue" />
          <div className="text-[13.5px] text-text-dim">
            Connecting your GitHub account…
          </div>
        </Card>
      ) : (
        <>
          {connection && (
            <GitHubAccountBar
              connection={connection}
              actionError={actionError}
              onDisconnect={() => void disconnect()}
            />
          )}

          <ScanPanel
            repositories={repos.data?.repositories ?? []}
            truncated={repos.data?.truncated ?? false}
            onScanComplete={refreshGraphData}
          />

          <ScannedRepositories
            repositories={scanned.data?.repositories ?? []}
            loading={scanned.loading}
            error={scanned.error}
            onRemoved={refreshGraphData}
          />

          <RepoList
            repositories={repos.data?.repositories ?? []}
            loading={repos.loading}
            error={repos.error}
          />
        </>
      )}
    </div>
  )
}

function ResultBanner({ banner, onRetry }: { banner: Banner; onRetry: () => void }) {
  const success = banner.tone === 'success'
  return (
    <div
      className={`mb-4 flex items-start gap-2.5 px-4 py-3 rounded-[10px] border text-[12.5px] leading-relaxed max-w-[720px] ${
        success
          ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
          : 'bg-accent-red/10 border-accent-red/30 text-accent-red'
      }`}
    >
      {success ? (
        <CheckCircle2 size={16} className="mt-[1px] flex-shrink-0" />
      ) : (
        <AlertTriangle size={16} className="mt-[1px] flex-shrink-0" />
      )}
      <div>
        <div className="font-semibold">{banner.title}</div>
        <div className={success ? 'text-accent-green/80' : 'text-accent-red/80'}>
          {banner.message}
        </div>
        {banner.retryable && (
          <button
            onClick={onRetry}
            className="mt-2 underline underline-offset-2 font-semibold"
          >
            Try connecting again
          </button>
        )}
      </div>
    </div>
  )
}

function RepoList({
  repositories,
  loading,
  error,
}: {
  repositories: Repository[]
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="text-[13px] text-text-dim font-mono py-6">
        Loading your repositories…
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-5 border-accent-amber/30">
        <div className="text-accent-amber font-semibold text-[13.5px] mb-1">
          We couldn't list your repositories
        </div>
        <div className="text-text-dim text-[12.5px] leading-relaxed">
          {error} You can still scan any repository by typing its owner and
          name above.
        </div>
      </Card>
    )
  }

  if (repositories.length === 0) {
    return (
      <Card className="p-5 border-white/5">
        <div className="font-semibold mb-1">No repositories in this account</div>
        <div className="text-text-dim text-sm max-w-[560px] leading-relaxed">
          The GitHub account you connected has no repositories we can see. If
          the code lives in an organisation, you may need to grant Niam access
          to it on GitHub — or type the owner and repository name above to
          scan it directly.
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-3">
      {repositories.map((repo) => (
        <RepoItem key={repo.id} repo={repo} />
      ))}
    </div>
  )
}

function RepoItem({ repo }: { repo: Repository }) {
  const { status, logs, error, triggerScan } = useScan()
  const busy = status === 'starting' || status === 'running'

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold truncate">{repo.full_name}</div>
          <div className="text-[12.5px] text-text-dim">
            Branch {repo.branch}
            {repo.last_scanned_at
              ? ` · Last scanned ${formatWhen(repo.last_scanned_at)}`
              : ' · Not scanned yet'}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {repo.status_detail && (
            <Badge
              tone={
                repo.status === 'compliant'
                  ? 'good'
                  : repo.status === 'gap'
                    ? 'gap'
                    : 'muted'
              }
            >
              {repo.status_detail}
            </Badge>
          )}
          {typeof repo.score === 'number' && (
            <div className="text-sm font-semibold">{repo.score}%</div>
          )}
          <Button
            variant="ghost"
            onClick={() => triggerScan(repo.full_name, repo.branch)}
            disabled={busy}
          >
            {busy ? 'Scanning…' : 'Scan repository'}
          </Button>
        </div>
      </div>

      {status !== 'idle' && (
        <div className="rounded-[10px] bg-black/30 border border-border-soft p-3 text-sm max-h-[320px] overflow-y-auto">
          <div className="font-mono text-text-dim space-y-1">
            {logs.map((log, i) => (
              <div key={i}>
                <span className="text-accent-blue">[{log.event}]</span>{' '}
                {log.message || log.error || 'event received'}
              </div>
            ))}
            {busy && <div className="animate-pulse text-text-faint">_</div>}
          </div>

          {status === 'completed' && (
            <div className="mt-3 text-accent-green font-semibold text-sm">
              Scan completed. The graph now reflects this repository.
            </div>
          )}
          {status === 'failed' && (
            <div className="mt-3 text-accent-red font-semibold text-sm">
              Scan failed: {error}
            </div>
          )}
          {status === 'rejected' && (
            <div className="mt-3 text-accent-amber font-semibold text-sm">{error}</div>
          )}
          {status === 'connection_lost' && (
            <div className="mt-3 text-accent-amber font-semibold text-sm">
              Lost the scan stream. The scan may still be running.
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
