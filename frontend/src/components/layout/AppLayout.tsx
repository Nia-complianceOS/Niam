import { Outlet, Link, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { StructuredData } from '@/components/seo/StructuredData'
import { useState } from 'react'
import { Menu, Bell } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'

export function AppLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()
  
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Niam",
    "description": "DPDP Compliance Platform for Engineering Teams",
    "url": "https://niam.dev",
    "applicationCategory": "Compliance Software",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "INR"
    }
  }

  return (
    <div className="flex h-screen w-screen bg-bg relative overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <StructuredData data={webAppSchema} />
      <Sidebar isOpenMobile={isMobileMenuOpen} onCloseMobile={() => setIsMobileMenuOpen(false)} />
      <div className="flex-1 overflow-y-auto flex flex-col w-full min-w-0">
        
        {/* Desktop Top Bar */}
        <div className="hidden md:flex h-14 items-center justify-between px-10 flex-shrink-0 mt-2">
          <Breadcrumbs />
          <div className="flex items-center gap-4">
            <button className="p-2 text-text-dim hover:text-text transition-colors relative rounded-full hover:bg-white/[0.04]">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-blue" />
            </button>
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3a3a52] to-[#1c1c2b] flex items-center justify-center text-[11px] font-semibold text-[#c9c9e0] flex-shrink-0">
                {user?.name?.substring(0, 2).toUpperCase() || user?.email?.substring(0, 2).toUpperCase() || 'US'}
              </div>
            </div>
          </div>
        </div>

        {/* Content area gradient border top */}
        <div className="hidden md:block h-[1px] w-full bg-gradient-to-r from-accent-blue via-purple-500 to-transparent opacity-20" />

        <div className="flex-1 overflow-y-auto px-4 md:px-10 pt-4 md:pt-6 pb-[10px] flex flex-col w-full min-w-0">
          {/* Mobile Header */}
          <div className="md:hidden flex items-center justify-between mb-4 flex-shrink-0">
            <span className="font-display font-bold text-[18px]">Niam</span>
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-1 text-text-dim hover:text-text transition-colors">
              <Menu size={22} />
            </button>
          </div>
          
          <div className="md:hidden mb-4">
             <Breadcrumbs />
          </div>

          <main id="main-content" className="grow flex flex-col relative focus:outline-none" tabIndex={-1}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="grow flex flex-col"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
          <footer className="mt-20 pt-6 pb-6 border-t border-border-soft flex flex-wrap items-center justify-between gap-4 text-xs text-text-faint">
            <div className="flex items-center gap-5">
              <span className="font-semibold text-text-dim">Niam</span>
              <Link to="/" className="hover:text-text transition-colors">Dashboard</Link>
              <Link to="/gaps" className="hover:text-text transition-colors">Gaps</Link>
              <Link to="/graph" className="hover:text-text transition-colors">Graph</Link>
              <Link to="/repositories" className="hover:text-text transition-colors">Repositories</Link>
            </div>
            <a href="https://github.com/Nia-complianceOS/Niam" target="_blank" rel="noreferrer" className="hover:text-text transition-colors">
              Documentation
            </a>
          </footer>
        </div>
      </div>
    </div>
  )
}