import { Card } from '@/components/ui/Card'

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="max-w-[1280px] flex items-center justify-center h-[60vh] text-text-dim text-sm font-mono">
      {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="max-w-[1280px]">
      <Card className="p-6 border-accent-red/30">
        <div className="text-accent-red font-semibold mb-1">Couldn't reach the backend</div>
        <div className="text-text-dim text-sm">{message}</div>
      </Card>
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-blue uppercase tracking-wide mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green" style={{ boxShadow: '0 0 8px #33d17a' }} />
        {eyebrow}
      </div>
      <h1 className="font-display text-[28px] font-semibold tracking-tight">{title}</h1>
      <div className="text-text-dim text-sm mt-1.5 max-w-[560px]">{subtitle}</div>
    </div>
  )
}