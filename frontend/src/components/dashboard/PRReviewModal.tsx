import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { PullRequest } from '@/types/api'
import { GitMerge, X } from 'lucide-react'

interface Props {
  pr: PullRequest
  onClose: () => void
}

export function PRReviewModal({ pr, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <Card
        className="w-[720px] max-w-[92vw] max-h-[84vh] overflow-y-auto p-7 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-5 right-5 w-[30px] h-[30px] rounded-lg bg-white/[0.06] hover:bg-white/10 flex items-center justify-center"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-2.5">
          <div>
            <div className="font-display text-[19px] font-semibold">{pr.title}</div>
            <div className="text-[12.5px] text-text-faint mt-1 font-mono">
              #{pr.id} · {pr.repo_full_name}
            </div>
          </div>
          <span className="text-[11.5px] font-bold px-3 py-[5px] rounded-full bg-accent-blue/[0.14] text-[#a9c1ff] border border-accent-blue/30">
            Ready for Review
          </span>
        </div>

        <div className="flex gap-[22px] text-[12.5px] text-text-dim mb-[22px] flex-wrap">
          <div>
            Reviewer <b className="text-text font-semibold">{pr.reviewer}</b>
          </div>
          <div>
            Opened by <b className="text-text font-semibold">{pr.opened_by}</b>
          </div>
          <div>
            Files changed <b className="text-text font-semibold">{pr.files.length}</b>
          </div>
          <div>
            Regulations <b className="text-text font-semibold">{pr.regulations.join(', ')}</b>
          </div>
        </div>

        {pr.files.map((file, i) => (
          <Card key={i} className="mb-4 overflow-hidden">
            <div className="px-4 py-2.5 bg-white/[0.04] border-b border-border-soft font-mono text-[12.5px] flex justify-between">
              <span>{file.file_path}</span>
            </div>
            <div className="font-mono text-xs leading-[1.9] px-4 py-2">
              {(file.diff_text || '').split('\n').map((line, j) => (
                <div key={j} className="whitespace-pre bg-accent-green/[0.08] text-[#a8e6bd]">
                  {line}
                </div>
              ))}
            </div>
          </Card>
        ))}

        <div className="flex gap-2.5">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button disabled title="Merging happens in GitHub once your team reviews the PR — not wired up here yet">
            <GitMerge size={14} /> Approve &amp; Merge
          </Button>
        </div>
      </Card>
    </div>
  )
}