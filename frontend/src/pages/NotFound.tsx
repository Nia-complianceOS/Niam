import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-20 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
        <AlertCircle className="text-red-400" size={32} />
      </div>
      <h1 className="font-display text-[32px] font-bold text-text tracking-tight mb-2">404</h1>
      <h2 className="text-[20px] font-semibold text-text mb-2">Page Not Found</h2>
      <p className="text-text-dim text-center max-w-[400px] mb-8 text-[14.5px]">
        The page you are looking for doesn't exist or has been moved.
      </p>
      
      <Link 
        to="/" 
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-surface border border-border-soft hover:bg-white/5 hover:text-accent-blue transition-colors text-[14px] font-medium"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>
    </div>
  )
}
