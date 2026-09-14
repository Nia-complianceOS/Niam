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
  TriangleAlert,
  Sun,
  Moon,
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
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/graph', label: 'Compliance Graph', icon: Share2 },
    ]
  },
  {
    title: 'Analysis',
    items: [
      { to: '/gaps', label: 'Compliance Gaps', icon: TriangleAlert, badge: (count) => count > 0 ? count : null },
      { to: '/repositories', label: 'Repositories', icon: FolderGit2 },
      { to: '/vendors', label: 'Vendors', icon: Building2 },
    ]
  },
  {
    title: 'Legal',
    items: [
      { to: '/regulations', label: 'Regulations', icon: ShieldCheck },
      { to: '/policies', label: 'Policies', icon: FileText },
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
    <div 
      className={`
        h-full flex-shrink-0 bg-bg md:bg-white/[0.015] border-r border-border-soft flex flex-col px-3.5 py-5 relative
        ${isCollapsed ? 'w-[72px]' : 'w-[260px]'}
        transition-all duration-300
      `}
    >
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden md:flex absolute -right-3 top-6 bg-surface border border-border-soft rounded-full p-1 text-text-dim hover:text-text z-10 transition-colors shadow-sm"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`flex items-center gap-2.5 pb-8 ${isCollapsed ? 'justify-center px-0' : 'px-2'}`}>
        <div className="relative w-[28px] h-[28px] rounded-[8px] bg-gradient-to-tr from-accent-blue via-purple-500 to-accent-blue flex-shrink-0 shadow-lg shadow-accent-blue/20">
          <div className="absolute inset-[2px] rounded-[6px] bg-bg flex items-center justify-center">
            <ShieldCheck size={14} className="text-accent-blue" />
          </div>
        </div>
        {!isCollapsed && <div className="font-display font-bold text-[17px] tracking-wide whitespace-nowrap overflow-hidden bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">Niam</div>}
      </div>

      <nav className="flex flex-col gap-6 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pb-4">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={idx} className="flex flex-col gap-1">
            {!isCollapsed && (
              <span className="px-3 text-[11px] font-semibold text-text-faint uppercase tracking-wider mb-1">
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
                  group relative flex items-center gap-3 ${isCollapsed ? 'justify-center px-0' : 'px-3'} py-2.5 rounded-[9px] text-[13.5px] font-medium transition-all duration-300 overflow-hidden
                  ${isActive ? 'text-[#cddbff]' : 'text-text-dim hover:text-text'}
                `}
              >
                {({ isActive }) => (
                  <>
                    {/* Background animation on hover & active */}
                    <div className={`absolute inset-0 rounded-[9px] transition-all duration-300 ease-out z-0
                      ${isActive ? 'bg-accent-blue/[0.12]' : 'bg-white/[0.00] group-hover:bg-white/[0.04]'}
                    `} />
                    
                    {/* Active indicator */}
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] rounded-r-full bg-accent-blue transition-all duration-300 ease-out z-10
                      ${isActive ? 'opacity-100' : 'opacity-0 -translate-x-full'}
                    `} />
                    
                    <Icon size={18} strokeWidth={2} className={`flex-shrink-0 z-10 transition-colors duration-300 ${isActive ? 'text-accent-blue' : ''}`} />
                    {!isCollapsed && <span className="whitespace-nowrap z-10 relative">{label}</span>}
                    
                    {/* Badge */}
                    {!isCollapsed && badge && badge(openGapsCount) !== null && (
                      <span className="z-10 ml-auto bg-accent-blue/20 text-accent-blue text-[11px] px-2 py-0.5 rounded-full font-bold">
                        {badge(openGapsCount)}
                      </span>
                    )}

                    {isCollapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-surface border border-border-soft text-text text-[12px] rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-lg shadow-black/20 font-medium">
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

      <div className={`flex flex-col gap-2 pt-5 border-t border-border-soft/50 mt-2 ${isCollapsed ? 'items-center px-0' : 'px-2'}`}>
        <NavLink 
          to="/settings" 
          onClick={() => onCloseMobile?.()}
          className={({ isActive }) => `
            group relative flex items-center gap-3 ${isCollapsed ? 'justify-center w-10 h-10 px-0' : 'px-3 py-2.5'} rounded-[9px] text-[13.5px] font-medium transition-all duration-300 overflow-hidden
            ${isActive ? 'text-[#cddbff]' : 'text-text-dim hover:text-text'}
          `}
        >
          {({ isActive }) => (
            <>
              <div className={`absolute inset-0 rounded-[9px] transition-all duration-300 ease-out z-0
                ${isActive ? 'bg-accent-blue/[0.12]' : 'bg-white/[0.00] group-hover:bg-white/[0.04]'}
              `} />
              <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] rounded-r-full bg-accent-blue transition-all duration-300 ease-out z-10
                ${isActive ? 'opacity-100' : 'opacity-0 -translate-x-full'}
              `} />
              <SettingsIcon size={18} strokeWidth={2} className={`flex-shrink-0 z-10 transition-colors duration-300 ${isActive ? 'text-accent-blue' : ''}`} />
              {!isCollapsed && <span className="whitespace-nowrap z-10 relative">Settings</span>}
              {isCollapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-surface border border-border-soft text-text text-[12px] rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-lg shadow-black/20 font-medium">
                  Settings
                </div>
              )}
            </>
          )}
        </NavLink>
        
        <button
          onClick={toggleTheme}
          className={`
            group relative flex items-center gap-3 ${isCollapsed ? 'justify-center w-10 h-10 px-0' : 'px-3 py-2.5'} rounded-[9px] text-[13.5px] font-medium transition-all duration-300 overflow-hidden
            text-text-dim hover:text-text
          `}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          <div className="absolute inset-0 rounded-[9px] transition-all duration-300 ease-out z-0 bg-white/[0.00] group-hover:bg-white/[0.04]" />
          <div className="flex-shrink-0 z-10 transition-colors duration-300 relative w-[18px] h-[18px]">
            <Sun size={18} strokeWidth={2} className={`absolute inset-0 transition-all duration-500 ${theme === 'dark' ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
            <Moon size={18} strokeWidth={2} className={`absolute inset-0 transition-all duration-500 ${theme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} />
          </div>
          {!isCollapsed && <span className="whitespace-nowrap z-10 relative">Theme</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-surface border border-border-soft text-text text-[12px] rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-lg shadow-black/20 font-medium">
              Theme
            </div>
          )}
        </button>

        <div className="flex items-center gap-3 w-full group relative mt-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-blue/80 to-purple-500/80 p-[2px] flex-shrink-0 cursor-pointer">
            <div className="w-full h-full rounded-full bg-bg flex items-center justify-center text-[12px] font-bold text-text">
              {user?.name?.substring(0, 2).toUpperCase() || user?.email?.substring(0, 2).toUpperCase() || 'US'}
            </div>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col leading-tight overflow-hidden flex-1">
              <b className="text-[13px] font-semibold truncate text-text">{user?.name || user?.email?.split('@')[0] || 'User'}</b>
              <span className="text-[11px] text-text-faint truncate">{user?.email}</span>
            </div>
          )}
          
          <button 
            onClick={logout}
            className={`${isCollapsed ? 'hidden' : 'opacity-0 group-hover:opacity-100'} p-2 text-text-faint hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all absolute right-0 bg-bg`}
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isOpenMobile && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" 
              onClick={onCloseMobile}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 md:hidden h-full shadow-2xl"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Desktop Sidebar */}
      <div className="hidden md:block h-full">
        {sidebarContent}
      </div>
    </>
  )
}