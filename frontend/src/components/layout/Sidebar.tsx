import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { SIDEBAR_KEY } from '@/lib/session'
import { useGaps } from '@/hooks/useGaps'
import { useTheme } from '@/context/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Share2,
  FolderGit2,
  Building2,
  ShieldCheck,
  FileText,
  GitPullRequest,
  ScrollText,
  Settings as SettingsIcon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Sun,
  Moon,
  Scale,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: (gapsCount: number) => number | null
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Executive',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/graph', label: 'Compliance Graph', icon: Share2 },
    ]
  },
  {
    title: 'Audit & Analysis',
    items: [
      { to: '/gaps', label: 'Compliance Gaps', icon: ShieldAlert, badge: (count) => count > 0 ? count : null },
      { to: '/repositories', label: 'Repositories', icon: FolderGit2 },
      { to: '/vendors', label: 'Data Processors', icon: Building2 },
    ]
  },
  {
    title: 'Statutory & Policy',
    items: [
      { to: '/regulations', label: 'DPDP Clauses', icon: Scale },
      { to: '/policies', label: 'Privacy Policies', icon: FileText },
      { to: '/pull-requests', label: 'Pull Requests', icon: GitPullRequest },
      { to: '/audit', label: 'Audit Trail', icon: ScrollText },
    ]
  }
]

export function Sidebar({ 
  isOpenMobile, 
  onCloseMobile 
}: { 
  isOpenMobile?: boolean
  onCloseMobile?: () => void 
} = {}) {
  const { user, logout } = useAuth()
  const { gaps } = useGaps()
  const { theme, toggleTheme } = useTheme()
  const openGapsCount = gaps.filter(g => g.status !== 'resolved').length
  
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) === 'true'
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(isCollapsed))
  }, [isCollapsed])

  const sidebarContent = (
    <aside 
      className={`
        h-full flex-shrink-0 bg-bg-subtle border-r border-border flex flex-col px-3 py-4 relative font-sans
        ${isCollapsed ? 'w-[68px]' : 'w-[250px]'}
        transition-all duration-200 ease-out
      `}
    >
      {/* Desktop Collapse Toggle */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden md:flex absolute -right-3 top-5 bg-surface border border-border rounded p-1 text-text-tertiary hover:text-text-primary z-20 transition-colors shadow-sm"
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? <ChevronRight size={12} strokeWidth={2} /> : <ChevronLeft size={12} strokeWidth={2} />}
      </button>

      {/* Brand Header */}
      <div className={`flex items-center gap-2.5 pb-6 pt-1 border-b border-border/60 ${isCollapsed ? 'justify-center px-0' : 'px-2'}`}>
        <div className="w-7 h-7 rounded border border-border bg-surface flex items-center justify-center text-text-primary flex-shrink-0">
          <ShieldCheck size={16} strokeWidth={1.75} className="text-text-primary" />
        </div>
        {!isCollapsed && (
          <div className="flex items-baseline gap-2 overflow-hidden">
            <span className="font-serif font-semibold text-[17px] tracking-tight text-text-primary">Niam</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary px-1 py-0.5 rounded border border-border bg-bg">
              DPDP
            </span>
          </div>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex flex-col gap-5 flex-1 overflow-y-auto overflow-x-hidden pt-4 pb-2">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            {!isCollapsed && (
              <span className="px-2.5 text-[10px] font-mono font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                {section.title}
              </span>
            )}
            {section.items.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink 
                key={to} 
                to={to} 
                end={end} 
                onClick={() => onCloseMobile?.()}
                className={({ isActive }) => `
                  group relative flex items-center gap-2.5 ${isCollapsed ? 'justify-center px-0' : 'px-2.5'} py-2 rounded text-[13px] transition-colors
                  ${isActive 
                    ? 'bg-surface text-text-primary border border-border font-medium shadow-sm' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}
                `}
              >
                {({ isActive }) => (
                  <>
                    <Icon 
                      size={16} 
                      strokeWidth={1.75} 
                      className={`flex-shrink-0 transition-colors ${isActive ? 'text-text-primary' : 'text-text-tertiary group-hover:text-text-primary'}`} 
                    />
                    
                    {!isCollapsed && <span className="truncate">{label}</span>}
                    
                    {!isCollapsed && badge && badge(openGapsCount) !== null && (
                      <span className="ml-auto font-mono text-[10px] px-1.5 py-0.2 rounded border border-status-gap/30 bg-status-gap/10 text-status-gap font-medium">
                        {badge(openGapsCount)}
                      </span>
                    )}

                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-surface-elevated border border-border text-text-primary text-[11px] font-mono rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-md">
                        {label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer Controls & User Profile */}
      <div className={`flex flex-col gap-1.5 pt-3 border-t border-border mt-auto ${isCollapsed ? 'items-center px-0' : 'px-1'}`}>
        <NavLink 
          to="/settings" 
          onClick={() => onCloseMobile?.()}
          className={({ isActive }) => `
            group relative flex items-center gap-2.5 ${isCollapsed ? 'justify-center w-8 h-8 px-0' : 'px-2.5 py-1.5'} rounded text-[13px] transition-colors
            ${isActive 
              ? 'bg-surface text-text-primary border border-border font-medium' 
              : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}
          `}
          title="System Settings"
        >
          <SettingsIcon size={16} strokeWidth={1.75} className="flex-shrink-0 text-text-tertiary group-hover:text-text-primary" />
          {!isCollapsed && <span>Settings</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-surface-elevated border border-border text-text-primary text-[11px] font-mono rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-md">
              Settings
            </div>
          )}
        </NavLink>
        
        <button
          onClick={toggleTheme}
          className={`
            group relative flex items-center gap-2.5 ${isCollapsed ? 'justify-center w-8 h-8 px-0' : 'px-2.5 py-1.5'} rounded text-[13px] transition-colors text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent
          `}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          <div className="flex-shrink-0 relative w-4 h-4 flex items-center justify-center">
            {theme === 'dark' ? (
              <Sun size={15} strokeWidth={1.75} className="text-text-tertiary group-hover:text-text-primary" />
            ) : (
              <Moon size={15} strokeWidth={1.75} className="text-text-tertiary group-hover:text-text-primary" />
            )}
          </div>
          {!isCollapsed && <span>{theme === 'dark' ? 'Light Appearance' : 'Dark Appearance'}</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-surface-elevated border border-border text-text-primary text-[11px] font-mono rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-md">
              Appearance
            </div>
          )}
        </button>

        {/* User Badge */}
        <div className={`flex items-center gap-2.5 w-full pt-2 mt-1 border-t border-border/50 ${isCollapsed ? 'justify-center' : 'px-1'}`}>
          <div className="w-6 h-6 rounded border border-border bg-surface flex items-center justify-center text-[10px] font-mono font-medium text-text-primary flex-shrink-0">
            {user?.name?.slice(0, 2).toUpperCase() || user?.email?.slice(0, 2).toUpperCase() || 'LE'}
          </div>
          
          {!isCollapsed && (
            <div className="flex flex-col min-w-0 flex-1 leading-tight">
              <span className="text-[12px] font-medium text-text-primary truncate">
                {user?.name || user?.email?.split('@')[0] || 'Counsel'}
              </span>
              <span className="text-[10px] font-mono text-text-tertiary truncate">
                {user?.email || 'dpdp-audit'}
              </span>
            </div>
          )}
          
          <button 
            onClick={logout}
            className={`p-1 text-text-tertiary hover:text-status-gap hover:bg-surface rounded transition-colors ${isCollapsed ? 'hidden' : ''}`}
            title="Sign out"
          >
            <LogOut size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      <AnimatePresence>
        {isOpenMobile && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs" 
              onClick={onCloseMobile}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 md:hidden h-full shadow-xl"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      <div className="hidden md:block h-full flex-shrink-0">
        {sidebarContent}
      </div>
    </>
  )
}