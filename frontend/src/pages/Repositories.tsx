import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, Lock, Globe, GitBranch, Shield, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
import { useSEO } from '@/hooks/useSEO'
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
  useSEO({
    title: 'Repositories',
    description: 'Connect and scan GitHub repositories for DPDP compliance',
  })

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
      <div className="text-[13px] text-text-dim font-mono py-6 flex items-center justify-center gap-3 bg-white/[0.02] rounded-xl border border-white/5">
        <Loader2 size={16} className="animate-spin text-accent-blue" />
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {repositories.map((repo) => (
        <RepoItem key={repo.id} repo={repo} />
      ))}
    </div>
  )
}

function RepoItem({ repo }: { repo: Repository }) {
  const { status, logs, error, triggerScan } = useScan()
  const busy = status === 'starting' || status === 'running'
  const isScanned = !!repo.last_scanned_at
  const score = typeof repo.score === 'number' ? repo.score : 0
  const scoreCircumference = 2 * Math.PI * 14
  const scoreOffset = scoreCircumference - (score / 100) * scoreCircumference

  return (
    <Card className={`flex flex-col p-5 transition-all duration-300 ${busy ? 'border-accent-blue/30 shadow-[0_0_20px_rgba(91,140,255,0.15)] ring-1 ring-accent-blue/20 bg-accent-blue/[0.02]' : 'hover:border-border hover:shadow-lg'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px] text-white truncate" title={repo.full_name}>
              {repo.full_name}
            </span>
            <span className="px-1.5 py-[2px] rounded border border-white/10 text-[10px] font-semibold text-text-dim uppercase tracking-wider flex-shrink-0 flex items-center gap-1 bg-white/5">
              {repo.private ? <Lock size={10} /> : <Globe size={10} />}
              {repo.private ? 'Private' : 'Public'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-text-faint">
            <span className="flex items-center gap-1 truncate text-accent-blue/80">
              <GitBranch size={12} /> {repo.branch}
            </span>
            <span className="text-white/20">·</span>
            <span className="truncate">
              {repo.pushed_at ? `Updated ${formatWhen(repo.pushed_at)}` : (repo.last_scanned_at ? `Scanned ${formatWhen(repo.last_scanned_at)}` : 'Not scanned yet')}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 flex items-center justify-between gap-4">
        {isScanned ? (
          <div className="flex items-center gap-3 flex-1 w-full">
            <div className="relative w-8 h-8 flex items-center justify-center shrink-0" title={`Score: ${score}%`}>
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="16" cy="16" r="14" fill="transparent" stroke="currentColor" strokeWidth="3" className="text-white/10" />
                <circle 
                  cx="16" cy="16" r="14" fill="transparent" stroke="currentColor" strokeWidth="3"
                  strokeDasharray={scoreCircumference}
                  strokeDashoffset={scoreOffset}
                  strokeLinecap="round"
                  className={score >= 70 ? 'text-accent-green' : score >= 40 ? 'text-accent-amber' : 'text-accent-red'}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield size={10} className="text-white" />
              </div>
            </div>
            
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
              {repo.status_detail && (
                <Badge tone={repo.status === 'compliant' ? 'good' : repo.status === 'gap' ? 'gap' : 'muted'} className="truncate">
                  {repo.status_detail}
                </Badge>
              )}
            </div>
            
            <Button
              variant="ghost"
              onClick={() => triggerScan(repo.full_name, repo.branch)}
              disabled={busy}
              className="flex-shrink-0 text-[12px] h-8 px-3"
            >
              Re-scan
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => triggerScan(repo.full_name, repo.branch)}
            disabled={busy}
            className="w-full bg-gradient-to-r from-accent-blue to-[#8e6ef6] hover:opacity-90 border-none h-9 text-[13px] shadow-[0_0_15px_rgba(91,140,255,0.2)]"
          >
            {busy ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Scanning...</> : 'Scan repository'}
          </Button>
        )}
      </div>

      {status !== 'idle' && (
        <ScanProgress status={status} logs={logs} error={error} />
      )}
    </Card>
  )
}

function ScanProgress({ status, logs, error }: { status: string, logs: any[], error: string | null }) {
  return (
    <div className="mt-5 pt-4 border-t border-white/10 overflow-hidden">
      <div className="space-y-3.5 relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/5 z-0" />
        
        <AnimatePresence initial={false}>
          {logs.map((log, i) => {
            const isLast = i === logs.length - 1
            const isRunning = status === 'starting' || status === 'running'
            const showSpinner = isLast && isRunning
            const msg = log.message || log.error || log.event

            return (
              <motion.div
                key={`${i}-${log.event}`}
                initial={{ opacity: 0, x: -10, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                className="flex items-start gap-3 text-[13px] text-text-dim relative z-10"
              >
                <div className="mt-[2px] w-4 h-4 bg-surface rounded-full flex items-center justify-center flex-shrink-0 border border-white/10">
                  {showSpinner ? (
                    <Loader2 size={10} className="animate-spin text-accent-blue" />
                  ) : (
                    <CheckCircle2 size={12} className="text-accent-green" />
                  )}
                </div>
                <span className="font-medium text-white/80">{msg}</span>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {status === 'completed' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-5 pt-4 border-t border-white/5 relative z-10 bg-accent-green/5 -mx-5 px-5 -mb-5 pb-5 rounded-b-xl"
          >
            <div className="flex items-center gap-2 text-accent-green text-[13px] font-semibold">
              <div className="w-5 h-5 rounded-full bg-accent-green/20 flex items-center justify-center">
                <CheckCircle2 size={12} />
              </div>
              Scan complete
            </div>
            <Link to="/gaps" className="text-[12.5px] font-semibold text-accent-blue hover:text-white hover:bg-accent-blue transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-accent-blue/30 bg-accent-blue/10">
              Review gaps <ArrowRight size={14} />
            </Link>
          </motion.div>
        )}

        {status === 'failed' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 pt-3 border-t border-white/5 text-accent-red text-[13px] font-semibold relative z-10"
          >
            Scan failed: {error}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
