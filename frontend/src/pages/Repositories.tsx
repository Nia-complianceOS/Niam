import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/shared/PageStates'
import { useRepos } from '@/hooks/useRepos'
import { useScan } from '@/hooks/useScan'
import { ScanPanel } from '@/components/repositories/ScanPanel'

function RepoItem({ repo }: { repo: any }) {
  const { status, logs, error, triggerScan } = useScan()

  return (
    <Card className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold">{repo.full_name}</div>
          <div className="text-sm text-text-dim">Branch {repo.branch} • Last scanned {repo.last_scanned_at}</div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={repo.status === 'compliant' ? 'good' : repo.status === 'gap' ? 'gap' : 'muted'}>
            {repo.status_detail}
          </Badge>
          <div className="text-sm font-semibold">{repo.score}%</div>
          <button
            onClick={() => triggerScan(repo.full_name, repo.branch)}
            disabled={status === 'starting' || status === 'running'}
            className="px-3 py-1 text-sm font-semibold text-white bg-blue-600 rounded disabled:bg-blue-300 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            Scan Repository
          </button>
        </div>
      </div>
      
      {status !== 'idle' && (
        <div className="mt-2 bg-gray-950 rounded p-3 overflow-hidden text-sm">
          <div className="font-mono text-gray-300 space-y-1">
            {logs.map((log, i) => (
              <div key={i}>
                <span className="text-blue-400">[{log.event}]</span> {log.message || log.error || 'Event received'}
              </div>
            ))}
            {status === 'running' || status === 'starting' ? (
              <div className="animate-pulse text-gray-500">_</div>
            ) : null}
          </div>
          
          {status === 'completed' && (
            <div className="mt-3 text-green-400 font-semibold text-sm">
              Scan completed successfully.
            </div>
          )}
          
          {status === 'failed' && (
            <div className="mt-3 text-red-400 font-semibold text-sm">
              Scan failed: {error}
            </div>
          )}

          {status === 'connection_lost' && (
            <div className="mt-3 text-yellow-400 font-semibold text-sm">
              Connection lost to the scan stream.
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default function Repositories() {
  const { data, loading, error } = useRepos()

  if (loading) return <LoadingState label="Loading repositories…" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Code Inventory"
        title="Repositories"
        subtitle="Scan a repository to map the personal data its code handles."
      />

      <ScanPanel />

      {!data || data.repositories.length === 0 ? (
        <EmptyState
          title="No scan history yet"
          message="Scan history is not stored yet, so previously scanned repositories are not listed here. Use the panel above to scan one now."
        />
      ) : (
        <div className="grid gap-3">
          {data.repositories.map((repo) => (
            <RepoItem key={repo.id} repo={repo} />
          ))}
        </div>
      )}
    </div>
  )
}