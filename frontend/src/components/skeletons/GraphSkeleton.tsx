import { Card } from '@/components/ui/Card'

export function GraphSkeleton() {
  return (
    <div className="animate-pulse">
      <Card className="w-full h-[600px] bg-surface/20 flex items-center justify-center relative overflow-hidden border-border-soft/50">
        {/* Abstract floating skeleton nodes to suggest a graph */}
        <div className="absolute top-[30%] left-[20%] w-24 h-12 bg-surface/50 rounded-lg" />
        <div className="absolute top-[50%] left-[40%] w-32 h-16 bg-surface/80 rounded-lg" />
        <div className="absolute top-[40%] left-[70%] w-28 h-12 bg-surface/50 rounded-lg" />
        <div className="absolute top-[70%] left-[60%] w-20 h-10 bg-surface/50 rounded-lg" />
        
        {/* Abstract edges connecting them */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          <line x1="25%" y1="35%" x2="45%" y2="55%" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
          <line x1="50%" y1="55%" x2="75%" y2="45%" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
          <line x1="50%" y1="55%" x2="65%" y2="75%" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
      </Card>
      <div className="text-surface/50 text-[11px] mt-3 h-3 w-48 rounded bg-surface/50" />
    </div>
  )
}
