import { Card } from '@/components/ui/Card'

export default function PullRequests() {
  return (
    <div className="max-w-[1280px]">
      <Card className="p-6">
        <h1 className="font-display text-[24px] font-semibold tracking-tight">Pull Requests</h1>
        <p className="mt-2 text-sm text-text-dim">Open remediation PRs will be listed here.</p>
      </Card>
    </div>
  )
}
