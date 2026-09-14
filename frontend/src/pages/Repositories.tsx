import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, Lock, Globe, GitBranch, ArrowRight } from 'lucide-react'
import { GitHubAccountBar } from '@/components/repositories/GitHubAccountBar'
import { GitHubConnectPanel } from '@/components/repositories/GitHubConnectPanel'
import { ScanPanel } from '@/components/repositories/ScanPanel'
import { ScannedRepositories } from '@/components/repositories/ScannedRepositories'
import { useGitHubConnection } from '@/hooks/useGitHubConnection'
import { useRepos } from '@/hooks/useRepos'
import { useScannedRepositories } from '@/hooks/useScannedRepositories'
import { useScan } from '@/hooks/useScan'
import { useSEO } from '@/hooks/useSEO'
import { describeConnectFailure } from '@/lib/githubMessages'
import type { Repository } from '@/types/api'

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

  const refreshGraphData = useCallback(() => {
    scanned.refetch()
    repos.refetch()
  }, [scanned.refetch, repos.refetch])

  useEffect(() => {
    const result = params.get('github')
    if (!result) return

    if (result === 'connected') {
      setBanner({
        tone: 'success',
        title: 'GitHub authorization confirmed',
        message:
          'Your repository access token is verified. Select a codebase below to initiate AST statutory analysis.',
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
            Connect codebases, trigger AST static scans, and audit third-party data egress pipelines.
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
            onScanComplete={refreshGraphData}
          />

          <ScannedRepositories
            repositories={scanned.data?.repositories ?? []}
            loading={scanned.loading}
            error={scanned.error}
            onRemoved={refreshGraphData}
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
  loading,
  error,
}: {
  repositories: Repository[]
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
        <RepoItem key={repo.id} repo={repo} />
      ))}
    </div>
  )
}

function RepoItem({ repo }: { repo: Repository }) {
  const { status, logs, error, triggerScan } = useScan()
  const busy = status === 'starting' || status === 'running'
  const isScanned = Boolean(repo.last_scanned_at)
  const score = typeof repo.score === 'number' ? repo.score : 0
  const scoreCircumference = 2 * Math.PI * 13
  const scoreOffset = scoreCircumference - (score / 100) * scoreCircumference

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
            <span>·</span>
            <span className="truncate">
              {repo.pushed_at ? `Updated ${formatWhen(repo.pushed_at)}` : (repo.last_scanned_at ? `Scanned ${formatWhen(repo.last_scanned_at)}` : 'Unscanned')}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-border/60 flex items-center justify-between gap-3">
        {isScanned ? (
          <div className="flex items-center gap-2.5 flex-1 w-full justify-between">
            <div className="flex items-center gap-2">
              <div className="relative w-7 h-7 flex items-center justify-center shrink-0" title={`DPDP Score: ${score}%`}>
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="14" cy="14" r="12" fill="transparent" stroke="currentColor" strokeWidth="2.5" className="text-border" />
                  <circle 
                    cx="14" cy="14" r="12" fill="transparent" stroke="currentColor" strokeWidth="2.5"
                    strokeDasharray={scoreCircumference}
                    strokeDashoffset={scoreOffset}
                    strokeLinecap="round"
                    className={score >= 70 ? 'text-status-compliant' : score >= 40 ? 'text-status-warning' : 'text-status-gap'}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] text-text-primary font-medium">
                  {score}
                </div>
              </div>
              
              {repo.status_detail && (
                <span className="font-mono text-[10px] text-text-secondary truncate max-w-[120px]">
                  {repo.status_detail}
                </span>
              )}
            </div>
            
            <button
              onClick={() => triggerScan(repo.full_name, repo.branch)}
              disabled={busy}
              className="px-2.5 py-1 rounded border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg transition-colors disabled:opacity-40"
            >
              Re-scan
            </button>
          </div>
        ) : (
          <button
            onClick={() => triggerScan(repo.full_name, repo.branch)}
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
        <ScanProgress status={status} logs={logs} error={error} />
      )}
    </div>
  )
}

function ScanProgress({ status, logs, error }: { status: string, logs: any[], error: string | null }) {
  return (
    <div className="mt-3 pt-3 border-t border-border font-mono text-[11px]">
      <div className="space-y-1.5">
        {logs.map((log, i) => {
          const isLast = i === logs.length - 1
          const isRunning = status === 'starting' || status === 'running'
          const showSpinner = isLast && isRunning
          const msg = log.message || log.error || log.event

          return (
            <div key={`${i}-${log.event}`} className="flex items-start gap-2 text-text-secondary">
              <span className="text-text-tertiary">[{log.event}]</span>
              <span className="text-text-primary truncate">{msg}</span>
              {showSpinner && <Loader2 size={11} className="animate-spin text-text-tertiary mt-0.5 ml-auto flex-shrink-0" />}
            </div>
          )
        })}

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
      </div>
    </div>
  )
}

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
