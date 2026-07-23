import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/shared/PageStates'
import { useRepos } from '@/hooks/useRepos'

export default function Repositories() {
  const { data, loading, error } = useRepos()

  if (loading) return <LoadingState label="Loading repositories…" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Code Inventory"
        title="Repositories"
        subtitle="Track the repos that feed your compliance signals and review activity."
      />
      {!data || data.repositories.length === 0 ? (
        <EmptyState
          title="No repositories connected yet"
          message="Connect a GitHub repository to start tracking compliance signals from your codebase."
        />
      ) : (
        <div className="grid gap-3">
          {data.repositories.map((repo) => (
            <Card key={repo.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{repo.full_name}</div>
                <div className="text-sm text-text-dim">Branch {repo.branch} • Last scanned {repo.last_scanned_at}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={repo.status === 'compliant' ? 'good' : repo.status === 'gap' ? 'gap' : 'muted'}>
                  {repo.status_detail}
                </Badge>
                <div className="text-sm font-semibold">{repo.score}%</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}