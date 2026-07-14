import { Table, TableHead, TableRow, TableCell } from '@/components/ui/Table'
import { StatusBadge } from '@/components/ui/Badge'
import type { Repository } from '@/types/api'

export function RepositoriesTable({ repositories }: { repositories: Repository[] }) {
  return (
    <Table>
      <TableHead columns={['Repository', 'Branch', 'Score', 'Last scanned', 'Status']} />
      <tbody>
        {repositories.map((repo) => (
          <TableRow key={repo.id}>
            <TableCell>
              <span className="font-semibold flex items-center gap-2.5">
                <span className="w-[26px] h-[26px] rounded-lg bg-white/[0.06] flex items-center justify-center text-xs">
                  📦
                </span>
                {repo.full_name}
              </span>
            </TableCell>
            <TableCell>{repo.branch}</TableCell>
            <TableCell>{repo.score}%</TableCell>
            <TableCell>{new Date(repo.last_scanned_at).toLocaleString()}</TableCell>
            <TableCell>
              <StatusBadge status={repo.status}>{repo.status_detail || repo.status}</StatusBadge>
            </TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  )
}