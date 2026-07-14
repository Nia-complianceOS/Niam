import { NavLink } from 'react-router-dom'
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
  { to: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { to: '/vendors', label: 'Vendors', icon: Building2 },
  { to: '/regulations', label: 'Regulations', icon: ShieldCheck },
  { to: '/policies', label: 'Policies', icon: FileText },
  { to: '/pull-requests', label: 'Pull Requests', icon: GitPullRequest },
  { to: '/audit', label: 'Audit Trail', icon: ScrollText },
]

function navLinkClass(isActive: boolean): string {
  return `flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-[13.5px] font-medium transition-colors ${
    isActive ? 'bg-accent-blue/[0.12] text-[#cddbff]' : 'text-text-dim hover:bg-white/[0.04] hover:text-text'
  }`
}

export function Sidebar() {
  return (
    <div className="w-[240px] flex-shrink-0 bg-white/[0.015] border-r border-border-soft flex flex-col px-3.5 py-5">
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <div className="relative w-[26px] h-[26px] rounded-[7px] bg-grad-primary">
          <div className="absolute inset-1.5 rounded-sm bg-bg opacity-90" />
        </div>
        <div className="font-display font-bold text-[15.5px] tracking-wide">CONTINUUM</div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClass(isActive)}>
            <Icon size={16} strokeWidth={2} className="flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        <div className="h-px bg-border-soft mx-1 my-2.5" />

        <NavLink to="/settings" className={({ isActive }) => navLinkClass(isActive)}>
          <SettingsIcon size={16} strokeWidth={2} className="flex-shrink-0" />
          Settings
        </NavLink>
      </nav>

      <div className="flex items-center gap-2.5 pt-3 px-2.5 border-t border-border-soft mt-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3a3a52] to-[#1c1c2b] flex items-center justify-center text-[11px] font-semibold text-[#c9c9e0] flex-shrink-0">
          NL
        </div>
        <div className="flex flex-col leading-tight">
          <b className="text-[12.5px] font-semibold">Nova Labs</b>
          <span className="text-[11px] text-text-faint">Growth plan</span>
        </div>
      </div>
    </div>
  )
}