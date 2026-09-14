import { Link } from 'react-router-dom'
import { LayoutDashboard, AlertTriangle, Code, ArrowRight } from 'lucide-react'
import { useSEO } from '@/hooks/useSEO'

export default function NotFound() {
  useSEO({
    title: 'Page Not Found',
    description: 'The page you are looking for does not exist.'
  })

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] h-full w-full py-20 px-4 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      
      {/* Background Effect */}
      <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            animation: 'slide-grid 4s linear infinite',
            WebkitMaskImage: 'radial-gradient(circle at center, black 0%, transparent 80%)',
            maskImage: 'radial-gradient(circle at center, black 0%, transparent 80%)'
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center w-full">
        {/* Large Gradient 404 */}
        <h1 className="font-display text-[120px] sm:text-[160px] font-black leading-none tracking-tighter bg-gradient-to-br from-accent-blue via-accent-purple to-accent-blue bg-clip-text text-transparent mb-4">
          404
        </h1>
        
        <h2 className="text-[24px] font-semibold text-text mb-3">
          This page doesn't exist
        </h2>
        
        <p className="text-text-dim max-w-[400px] mb-12 text-[15px] leading-relaxed mx-auto">
          The page you're looking for may have been moved or deleted.
        </p>
        
        {/* Helpful Links Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-[720px] mx-auto text-left">
          <Link 
            to="/"
            className="group flex flex-col items-start gap-3 p-5 rounded-xl bg-surface/50 border border-border-soft hover:border-accent-blue/50 hover:bg-white/5 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-accent-blue/10 flex items-center justify-center text-accent-blue">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <div className="font-semibold text-text text-[14px] mb-1 group-hover:text-accent-blue transition-colors flex items-center gap-1.5">
                Go to Dashboard
                <ArrowRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </div>
              <div className="text-[12px] text-text-faint">Your compliance overview</div>
            </div>
          </Link>
          
          <Link 
            to="/gaps"
            className="group flex flex-col items-start gap-3 p-5 rounded-xl bg-surface/50 border border-border-soft hover:border-accent-amber/50 hover:bg-white/5 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-accent-amber/10 flex items-center justify-center text-accent-amber">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="font-semibold text-text text-[14px] mb-1 group-hover:text-accent-amber transition-colors flex items-center gap-1.5">
                View Compliance Gaps
                <ArrowRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </div>
              <div className="text-[12px] text-text-faint">Review and resolve findings</div>
            </div>
          </Link>
          
          <Link 
            to="/repositories"
            className="group flex flex-col items-start gap-3 p-5 rounded-xl bg-surface/50 border border-border-soft hover:border-accent-green/50 hover:bg-white/5 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-accent-green/10 flex items-center justify-center text-accent-green">
              <Code size={20} />
            </div>
            <div>
              <div className="font-semibold text-text text-[14px] mb-1 group-hover:text-accent-green transition-colors flex items-center gap-1.5">
                Scan a Repository
                <ArrowRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </div>
              <div className="text-[12px] text-text-faint">Map your code's data flow</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
