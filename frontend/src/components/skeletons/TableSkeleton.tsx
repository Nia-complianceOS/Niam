import { Card } from '@/components/ui/Card'

interface Props {
  rows?: number
}

export function TableSkeleton({ rows = 4 }: Props) {
  return (
    <div className="grid gap-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2 w-full sm:w-auto flex-1 max-w-[280px]">
            <div className="h-4 bg-surface/80 rounded w-3/4" />
            <div className="h-3 bg-surface/50 rounded w-full" />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="h-5 bg-surface/80 rounded w-16" />
            <div className="h-5 bg-surface/50 rounded w-20" />
          </div>
        </Card>
      ))}
    </div>
  )
}
