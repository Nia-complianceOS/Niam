import { Loader2 } from 'lucide-react'

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] w-full animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center w-12 h-12 rounded border border-border bg-surface">
        <Loader2 className="animate-spin text-entity-system" size={22} />
      </div>
    </div>
  )
}
