import { Card } from '@/components/ui/Card'
import type { CommitActivity } from '@/types/api'

interface Props {
  commits: CommitActivity[]
  selectedSha: string | null
  onSelect: (sha: string) => void
}

export function GitHubActivityFeed({ commits, selectedSha, onSelect }: Props) {
  return (
    <Card className="p-5">
      <div className="font-display text-[15px] font-semibold mb-1">GitHub Activity</div>
      <div className="text-xs text-text-faint mb-[18px]">{commits[0]?.commit.repo}</div>
      <div>
        {commits.map((c) => {
          const isSelected = c.commit.sha === selectedSha
          return (
            <div
              key={c.commit.sha}
              onClick={() => onSelect(c.commit.sha)}
              className={`flex items-center gap-3 px-2.5 py-[11px] rounded-[10px] cursor-pointer border transition-colors mb-1 ${
                isSelected ? 'bg-accent-blue/[0.09] border-accent-blue/25' : 'border-transparent hover:bg-white/[0.035]'
              }`}
            >
              <div className="w-[30px] h-[30px] rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-[13px]">
                {c.has_compliance_impact ? '⚠️' : '🔀'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium font-mono truncate">{c.commit.message}</div>
                <div className="text-[11px] text-text-faint mt-0.5">
                  {c.commit.sha} · {c.diff_stat}
                </div>
              </div>
              <span
                className={`text-[10.5px] font-semibold px-2 py-[3px] rounded-md whitespace-nowrap flex-shrink-0 ${
                  c.has_compliance_impact ? 'bg-accent-amber/[0.12] text-accent-amber' : 'bg-accent-green/10 text-accent-green'
                }`}
              >
                {c.has_compliance_impact ? 'Compliance Impact' : 'Clear'}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}