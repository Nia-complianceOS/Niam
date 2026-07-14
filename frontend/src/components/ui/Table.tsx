import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'

export function Table({ children }: { children: ReactNode }) {
  return (
    <Card className="p-0 overflow-hidden">
      <table className="w-full border-collapse">{children}</table>
    </Card>
  )
}

export function TableHead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr>
        {columns.map((col) => (
          <th
            key={col}
            className="text-left text-[11px] font-semibold text-text-faint uppercase tracking-wide px-4 py-3 border-b border-border-soft"
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function TableRow({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr onClick={onClick} className={onClick ? 'cursor-pointer hover:bg-white/[0.015]' : 'hover:bg-white/[0.015]'}>
      {children}
    </tr>
  )
}

export function TableCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3.5 text-[13px] border-b border-border-soft">{children}</td>
}