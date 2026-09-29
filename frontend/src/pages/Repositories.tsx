import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, Lock, Globe, GitBranch, ArrowRight } from 'lucide-react'
import { GitHubAccountBar } from '@/components/repositories/GitHubAccountBar'
import { GitHubConnectPanel } from '@/components/repositories/GitHubConnectPanel'
import { ScanPanel } from '@/components/repositories/ScanPanel'
import { ScannedRepositories } from '@/components/repositories/ScannedRepositories'
import { useGitHubConnection } from '@/hooks/useGitHubConnection'
import { useRepos } from '@/hooks/useRepos'
import { useScannedRepositories } from '@/hooks/useScannedRepositories'
import { useScan, type ScanEvent, type ScanStatus } from '@/hooks/useScan'
import { useSEO } from '@/hooks/useSEO'
import { describeConnectFailure } from '@/lib/githubMessages'
import { notifyDataChanged } from '@/lib/dataEvents'
import { timeAgo } from '@/lib/workspaceMessages'
import type { Repository, ScannedRepository } from '@/types/api'

interface Banner {
  tone: 'success' | 'error'
  title: string
  message: string
  retryable: boolean
}

export default function Repositories() {
  useSEO({
    title: 'Repositories & Scanning — Niam Statutory Ledger',
    description: 'Connect and scan GitHub repositories for continuous DPDP Act 2023 compliance.',
  })

  const {
    phase,
    connection,
    actionError,
    beginOAuth,
    submitToken,
    disconnect,
    refresh,
  } = useGitHubConnection()

  const connected = phase === 'connected'
  const repos = useRepos(connected)
  const scanned = useScannedRepositories(connected)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [params, setParams] = useSearchParams()

  // Removing a repository changes the scanned list, the graph, the gaps
  // and the sidebar badge. Every mounted data hook listens for this (see
  // lib/dataEvents.ts); a completed scan sends the same signal from useScan.
  const onRepositoryRemoved = useCallback(() => {
    notifyDataChanged('repository_removed')
  }, [])

  // What this account has already scanned, keyed by `owner/repo`, so each
  // GitHub repository card can say whether it has been scanned and what
  // was found. /github/repos itself knows nothing about scans.
  const scannedByName = useMemo(() => {
    const map = new Map<string, ScannedRepository>()
    for (const r of scanned.data?.repositories ?? []) map.set(r.repo.toLowerCase(), r)
    return map
  }, [scanned.data])

  useEffect(() => {
    const result = params.get('github')
    if (!result) return

    if (result === 'connected') {
      setBanner({
        tone: 'success',
        title: 'GitHub authorization confirmed',
        message:
          'Your GitHub account is connected. Choose a repository below to scan it against the DPDP Act.',
        retryable: false,
      })
      refresh()
    } else if (result === 'error') {
      const reason = params.get('reason')
      const failure = describeConnectFailure(reason)
      setBanner({
        tone: 'error',
        title: failure.title,
        message: failure.message,
        retryable: failure.retryable,
      })
    }

    setParams({}, { replace: true })
  }, [params, refresh, setParams])

  return (
    <div className="max-w-[1280px] w-full font-sans space-y-6">
      {/* 1. SECTION HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-text-tertiary uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-entity-system" />
            <span>SOURCE CODE INGESTION ENGINE</span>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-text-primary">Source Repositories</h1>
          <p className="text-text-secondary text-xs mt-0.5">
            Connect codebases, scan them for personal data and third-party processors, and review what each scan found.
          </p>
        </div>

        <div className="font-mono text-[11px] text-text-tertiary">
          STATUS: {phase.toUpperCase()}
        </div>
      </div>

      {banner && (
        <ResultBanner banner={banner} onRetry={() => void beginOAuth()} />
      )}

      {phase === 'checking' ? (
        <div className="py-12 flex items-center justify-center font-mono text-xs text-text-tertiary gap-2">
          <Loader2 size={14} className="animate-spin" />
          <span>Verifying GitHub connection state…</span>
        </div>
      ) : phase !== 'connected' ? (
        <GitHubConnectPanel
          connecting={phase === 'connecting'}
          actionError={actionError}
          onConnect={() => void beginOAuth()}
          onSubmitToken={submitToken}
        />
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
            repositories={repos.data?.repositories}
            truncated={repos.data?.truncated}
          />

          <ScannedRepositories
            repositories={scanned.data?.repositories ?? []}
            loading={scanned.loading}
            error={scanned.error}
            onRemoved={onRepositoryRemoved}
          />

          <div className="pt-2">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
              <div>
                <h2 className="font-medium text-sm text-text-primary">Discovered GitHub Repositories</h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Available repositories under the connected authorization token.
                </p>
              </div>
              <span className="font-mono text-[10px] text-text-tertiary">
                {repos.data?.repositories ? `${repos.data.repositories.length} TOTAL` : 'LOADING'}
              </span>
            </div>

            <RepoList
              repositories={repos.data?.repositories ?? []}
              scannedByName={scannedByName}
              loading={repos.loading}
              error={repos.error}
            />
          </div>
        </>
      )}
    </div>
  )
}

function ResultBanner({ banner, onRetry }: { banner: Banner; onRetry: () => void }) {
  const success = banner.tone === 'success'
  return (
    <div
      className={`p-3 rounded border text-xs leading-relaxed max-w-2xl flex items-start gap-2.5 ${
        success
          ? 'bg-status-compliant/10 border-status-compliant/30 text-status-compliant'
          : 'bg-status-gap/10 border-status-gap/30 text-status-gap'
      }`}
    >
      {success ? (
        <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />
      ) : (
        <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
      )}
      <div className="space-y-0.5">
        <div className="font-medium">{banner.title}</div>
        <div className="opacity-90">{banner.message}</div>
        {banner.retryable && (
          <button
            onClick={onRetry}
            className="mt-1.5 underline underline-offset-2 font-medium"
          >
            Retry authorization
          </button>
        )}
      </div>
    </div>
  )
}

function RepoList({
  repositories,
  scannedByName,
  loading,
  error,
}: {
  repositories: Repository[]
  scannedByName: Map<string, ScannedRepository>
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="text-xs text-text-tertiary font-mono py-8 flex items-center justify-center gap-2 bg-surface rounded border border-border">
        <Loader2 size={14} className="animate-spin" />
        <span>Loading repositories from GitHub API…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded border border-status-warning/30 bg-status-warning/5 text-xs text-text-secondary">
        <div className="text-status-warning font-medium mb-1">
          Unable to fetch repositories from GitHub
        </div>
        <div>
          {error} You can still initiate scans by typing the repository name directly in the panel above.
        </div>
      </div>
    )
  }

  if (repositories.length === 0) {
    return (
      <div className="p-4 rounded border border-border bg-surface text-xs text-text-secondary">
        <div className="font-medium text-text-primary mb-1">No repositories visible</div>
        <div className="text-text-tertiary max-w-lg leading-relaxed">
          The authorized account has no public or permitted repositories. If the code resides in an enterprise organization, ensure organization access is approved in GitHub OAuth settings.
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {repositories.map((repo) => (
        <RepoItem
          key={repo.id}
          repo={repo}
          scanned={scannedByName.get(repo.full_name.toLowerCase()) ?? null}
        />
      ))}
    </div>
  )
}

function RepoItem({ repo, scanned }: { repo: Repository; scanned: ScannedRepository | null }) {
  const { status, logs, error, reconnecting, triggerScan } = useScan()
  const busy = status === 'starting' || status === 'running'
  const scan = () => triggerScan(repo.full_name, repo.branch)

  return (
    <div className={`flex flex-col p-4 rounded border transition-colors bg-surface ${busy ? 'border-text-tertiary' : 'border-border hover:bg-surface-elevated/60'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs font-medium text-text-primary truncate" title={repo.full_name}>
              {repo.full_name}
            </span>
            <span className="px-1 py-0.2 rounded border border-border text-[9px] font-mono text-text-tertiary uppercase flex-shrink-0 flex items-center gap-1 bg-bg">
              {repo.private ? <Lock size={9} /> : <Globe size={9} />}
              {repo.private ? 'PRV' : 'PUB'}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-text-tertiary">
            <span className="flex items-center gap-1 truncate text-text-secondary">
              <GitBranch size={10} /> {repo.branch}
            </span>
            {repo.pushed_at && (
              <>
                <span>·</span>
                <span className="truncate">Pushed {formatWhen(repo.pushed_at)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-border/60 flex items-center justify-between gap-3">
        {scanned ? (
          <div className="flex items-center gap-2.5 flex-1 w-full justify-between min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 font-mono text-[10px] text-text-secondary">
              <CheckCircle2 size={11} className="text-status-compliant flex-shrink-0" />
              <span className="truncate" title={scanned.last_scan ? new Date(scanned.last_scan).toLocaleString() : undefined}>
                Scanned
                {' · '}
                <span className={scanned.gaps > 0 ? 'text-status-gap' : 'text-status-compliant'}>
                  {scanned.gaps} {scanned.gaps === 1 ? 'finding' : 'findings'}
                </span>
                {scanned.last_scan ? ` · last scan ${timeAgo(scanned.last_scan)}` : ' · loaded from the command line'}
              </span>
            </div>

            <button
              onClick={scan}
              disabled={busy}
              className="px-2.5 py-1 rounded border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg transition-colors disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
            >
              {busy ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Scanning…</span>
                </>
              ) : (
                'Re-scan'
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={scan}
            disabled={busy}
            className="w-full py-1.5 px-3 rounded text-xs font-medium text-bg bg-text-primary hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-1.5 shadow-xs"
          >
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Scanning…</span>
              </>
            ) : (
              'Scan Codebase'
            )}
          </button>
        )}
      </div>

      {status !== 'idle' && (
        <ScanProgress status={status} logs={logs} error={error} reconnecting={reconnecting} />
      )}
    </div>
  )
}

function ScanProgress({
  status,
  logs,
  error,
  reconnecting,
}: {
  status: ScanStatus
  logs: ScanEvent[]
  error: string | null
  reconnecting: { attempt: number } | null
}) {
  const isRunning = status === 'starting' || status === 'running'

  return (
    <div className="mt-3 pt-3 border-t border-border font-mono text-[11px]">
      <div className="space-y-1.5">
        {status === 'starting' && logs.length === 0 && (
          <div className="flex items-center gap-2 text-text-tertiary">
            <Loader2 size={11} className="animate-spin" />
            <span>Requesting scan…</span>
          </div>
        )}

        {logs.map((log, i) => {
          const isLast = i === logs.length - 1
          const showSpinner = isLast && isRunning && !reconnecting
          const msg = log.message || log.error || log.event

          return (
            <div key={`${i}-${log.event}`} className="flex items-start gap-2 text-text-secondary">
              <span className="text-text-tertiary">[{log.event}]</span>
              <span className="text-text-primary truncate">{msg}</span>
              {showSpinner && <Loader2 size={11} className="animate-spin text-text-tertiary mt-0.5 ml-auto flex-shrink-0" />}
            </div>
          )
        })}

        {isRunning && reconnecting && (
          <div className="flex items-center gap-2 text-status-warning">
            <Loader2 size={11} className="animate-spin" />
            <span>Connection interrupted — reconnecting (attempt {reconnecting.attempt})…</span>
          </div>
        )}

        {status === 'completed' && (
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-status-compliant font-medium">
            <span>Scan Complete</span>
            <Link to="/gaps" className="text-text-primary hover:underline flex items-center gap-1">
              Review Gaps <ArrowRight size={11} />
            </Link>
          </div>
        )}

        {status === 'failed' && (
          <div className="mt-2 pt-2 border-t border-border text-status-gap">
            Scan failed: {error}
          </div>
        )}

        {status === 'rejected' && (
          <div className="mt-2 pt-2 border-t border-border text-status-warning flex items-start gap-1.5">
            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
            <span>{error || 'The server did not start this scan.'}</span>
          </div>
        )}

        {status === 'connection_lost' && (
          <div className="mt-2 pt-2 border-t border-border text-status-warning flex items-start gap-1.5">
            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
            <span>{error || 'Lost the connection to the scan progress stream.'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
