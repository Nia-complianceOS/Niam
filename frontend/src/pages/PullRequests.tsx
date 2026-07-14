import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, PageHeader } from '@/components/shared/PageStates'
import { usePullRequests } from '@/hooks/usePullRequests'

export default function PullRequests() {
  const { data, loading, error } = usePullRequests()

  if (loading) return <LoadingState label="Loading pull requests…" />
  if (error || !data) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Review Queue"
        title="Pull Requests"
        subtitle="Track open remediation work and the legal review state around it."
      />
      <div className="grid gap-3">
        {data.pull_requests.map((pr) => (
          <Card key={pr.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">{pr.title}</div>
              <div className="text-sm text-text-dim">{pr.repo_full_name} • {pr.opened_by}</div>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={pr.status === 'merged' ? 'good' : pr.status === 'closed' ? 'gap' : 'muted'}>
                {pr.status}
              </Badge>
              <div className="text-sm text-text-dim">{pr.reviewer}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}