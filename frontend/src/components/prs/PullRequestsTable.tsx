import { useState } from 'react'
import { Table, TableHead, TableRow, TableCell } from '@/components/ui/Table'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { PRReviewModal } from '@/components/dashboard/PRReviewModal'
import type { PullRequest, PRStatus } from '@/types/api'

const STATUS_TONE: Record<PRStatus, BadgeProps['tone']> = {
  ready_for_review: 'info',
  awaiting_author: 'warn',
  merged: 'good',
  closed: 'muted',
}

const STATUS_LABEL: Record<PRStatus, string> = {
  ready_for_review: 'Ready for Review',
  awaiting_author: 'Awaiting Author',
  merged: 'Merged',
  closed: 'Closed',
}

export function PullRequestsTable({ pullRequests }: { pullRequests: PullRequest[] }) {
  const [selected, setSelected] = useState<PullRequest | null>(null)

  return (
    <>
      <Table>
        <TableHead columns={['Title', 'Files', 'Opened by', 'Reviewer', 'Status']} />
        <tbody>
          {pullRequests.map((pr) => (
            <TableRow key={pr.id} onClick={() => setSelected(pr)}>
              <TableCell>
                <span className="font-semibold">{pr.title}</span>
              </TableCell>
              <TableCell>{pr.files.length} files</TableCell>
              <TableCell>{pr.opened_by}</TableCell>
              <TableCell>{pr.reviewer || '—'}</TableCell>
              <TableCell>
                <Badge tone={STATUS_TONE[pr.status]}>{STATUS_LABEL[pr.status]}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

      {selected && <PRReviewModal pr={selected} onClose={() => setSelected(null)} />}
    </>
  )
}