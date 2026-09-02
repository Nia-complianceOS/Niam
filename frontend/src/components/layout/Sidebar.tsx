import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
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
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/graph', label: 'Compliance Graph', icon: Share2 },
  { to: '/gaps', label: 'Compliance Gaps', icon: TriangleAlert },
  { to: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { to: '/vendors', label: 'Vendors', icon: Building2 },
  { to: '/regulations', label: 'Regulations', icon: ShieldCheck },
  { to: '/policies', label: 'Policies', icon: FileText },
  { to: '/pull-requests', label: 'Pull Requests', icon: GitPullRequest },
  { to: '/audit', label: 'Audit Trail', icon: ScrollText },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('niam_sidebar_collapsed') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('niam_sidebar_collapsed', String(isCollapsed))
  }, [isCollapsed])

  function navLinkClass(isActive: boolean): string {
    return `group relative flex items-center gap-2.5 ${isCollapsed ? 'justify-center px-0' : 'px-3'} py-2.5 rounded-[9px] text-[13.5px] font-medium transition-all duration-200 ${
      isActive ? 'bg-accent-blue/[0.12] text-[#cddbff]' : 'text-text-dim hover:bg-white/[0.04] hover:text-text'
    }`
  }

  return (
    <div 
      className={`${isCollapsed ? 'w-[72px]' : 'w-[240px]'} flex-shrink-0 bg-white/[0.015] border-r border-border-soft flex flex-col px-3.5 py-5 transition-all duration-300 relative`}
    >
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-6 bg-surface border border-border-soft rounded-full p-1 text-text-dim hover:text-text z-10"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`flex items-center gap-2.5 pb-6 ${isCollapsed ? 'justify-center px-0' : 'px-2'}`}>
        <div className="relative w-[26px] h-[26px] rounded-[7px] bg-grad-primary flex-shrink-0">
          <div className="absolute inset-1.5 rounded-sm bg-bg opacity-90" />
        </div>
        {!isCollapsed && <div className="font-display font-bold text-[15.5px] tracking-wide whitespace-nowrap overflow-hidden">Niam</div>}
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClass(isActive)}>
            <Icon size={18} strokeWidth={2} className="flex-shrink-0" />
            {!isCollapsed && <span className="whitespace-nowrap">{label}</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-3 px-2 py-1 bg-surface border border-border-soft text-text text-[12px] rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                {label}
              </div>
            )}
          </NavLink>
        ))}

        <div className="h-px bg-border-soft mx-1 my-2.5" />

        <NavLink to="/settings" className={({ isActive }) => navLinkClass(isActive)}>
          <SettingsIcon size={18} strokeWidth={2} className="flex-shrink-0" />
          {!isCollapsed && <span className="whitespace-nowrap">Settings</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-2 py-1 bg-surface border border-border-soft text-text text-[12px] rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
              Settings
            </div>
          )}
        </NavLink>
      </nav>

      <div className={`flex items-center gap-2.5 pt-4 border-t border-border-soft mt-2 ${isCollapsed ? 'justify-center px-0 flex-col' : 'px-2'}`}>
        <div className="flex items-center gap-2.5 w-full group relative">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3a3a52] to-[#1c1c2b] flex items-center justify-center text-[11px] font-semibold text-[#c9c9e0] flex-shrink-0">
            {user?.name?.substring(0, 2).toUpperCase() || 'NL'}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col leading-tight overflow-hidden flex-1">
              <b className="text-[12.5px] font-semibold truncate">{user?.name || 'Admin Workspace'}</b>
              {/* No billing system exists, so no plan is displayed. This
                  previously read "Growth plan" / "Free plan" -- invented at
                  signup and shown as though it meant something. */}
              <span className="text-[11px] text-text-faint truncate">{user?.email}</span>
            </div>
          )}
          
          <button 
            onClick={logout}
            className={`${isCollapsed ? '' : 'opacity-0 group-hover:opacity-100'} p-1.5 text-text-faint hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all`}
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}