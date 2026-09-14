import { Loader2 } from 'lucide-react'

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] w-full animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-surface/50 border border-border-soft">
        <Loader2 className="animate-spin text-accent-blue" size={24} />
      </div>
    </div>
  )
}
