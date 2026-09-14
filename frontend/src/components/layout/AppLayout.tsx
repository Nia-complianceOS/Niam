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

  const initials = user?.name
    ? user.name.slice(0, 2).toUpperCase()
    : user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'LE'

  return (
    <div className="flex h-screen w-screen bg-bg text-text-primary relative overflow-hidden font-sans">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <StructuredData data={webAppSchema} />
      
      {/* Primary Sidebar */}
      <Sidebar isOpenMobile={isMobileMenuOpen} onCloseMobile={() => setIsMobileMenuOpen(false)} />
      
      <div className="flex-1 overflow-y-auto flex flex-col w-full min-w-0 bg-bg">
        {/* Desktop Top Header Bar */}
        <header className="hidden md:flex h-13 border-b border-border bg-bg/80 backdrop-blur-sm items-center justify-between px-8 flex-shrink-0 z-10">
          <Breadcrumbs />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded border border-border bg-bg-subtle text-[11px] font-mono text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
              <span>DPDP ACT 2023</span>
            </div>

            <button 
              className="p-1.5 text-text-secondary hover:text-text-primary transition-colors relative rounded hover:bg-surface border border-transparent hover:border-border"
              title="Notifications coming soon"
            >
              <Bell size={16} strokeWidth={1.75} />
            </button>
            
            <div className="h-4 w-[1px] bg-border mx-1" />

            <div className="flex items-center gap-2 pl-1">
              <div className="w-7 h-7 rounded border border-border bg-surface flex items-center justify-center text-[11px] font-mono font-medium text-text-primary flex-shrink-0">
                {initials}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5 md:py-6 flex flex-col w-full min-w-0">
          {/* Mobile Top Bar */}
          <div className="md:hidden flex items-center justify-between pb-3 mb-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-serif font-semibold text-lg text-text-primary tracking-tight">Niam</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-border text-text-secondary bg-bg-subtle">
                Ledger
              </span>
            </div>
            <button 
              onClick={() => setIsMobileMenuOpen(true)} 
              className="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded border border-border"
            >
              <Menu size={18} />
            </button>
          </div>
          
          <div className="md:hidden mb-3">
            <Breadcrumbs />
          </div>

          <main id="main-content" className="grow flex flex-col relative focus:outline-none" tabIndex={-1}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ y: 4, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="grow flex flex-col"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Forensic Legal Ledger Footer */}
          <footer className="mt-16 pt-5 pb-6 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs text-text-tertiary">
            <div className="flex items-center gap-4">
              <span className="font-serif font-medium text-text-secondary">Niam</span>
              <span className="font-mono text-[11px]">DPDP Act 2023 Continuous Ledger</span>
              <div className="hidden sm:flex items-center gap-3 pl-2 border-l border-border">
                <Link to="/dashboard" className="hover:text-text-primary transition-colors">Dashboard</Link>
                <Link to="/graph" className="hover:text-text-primary transition-colors">Graph</Link>
                <Link to="/gaps" className="hover:text-text-primary transition-colors">Gaps</Link>
                <Link to="/repositories" className="hover:text-text-primary transition-colors">Repositories</Link>
              </div>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
                Audit Engine Active
              </span>
              <a 
                href="https://github.com/Nia-complianceOS/Niam" 
                target="_blank" 
                rel="noreferrer" 
                className="hover:text-text-primary transition-colors underline underline-offset-4"
              >
                Statutory Specs
              </a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}