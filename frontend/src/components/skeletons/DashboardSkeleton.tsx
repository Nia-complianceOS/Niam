import { Card } from '@/components/ui/Card'

export function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3.5 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-[18px_20px] h-[100px] flex flex-col justify-center">
            <div className="h-3 bg-surface/50 rounded w-1/2 mb-3" />
            <div className="h-6 bg-surface/80 rounded w-1/3" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4 items-start">
        <Card className="h-[300px] p-5">
          <div className="h-5 bg-surface/80 rounded w-1/4 mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full bg-surface/50 mt-1.5" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 bg-surface/80 rounded w-1/3" />
                  <div className="h-2.5 bg-surface/50 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="h-[300px] p-5">
          <div className="h-5 bg-surface/80 rounded w-1/4 mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-md bg-surface/50" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 bg-surface/80 rounded w-3/4" />
                  <div className="h-2.5 bg-surface/50 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
