import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSEO } from '@/hooks/useSEO'
import { Shield, Menu, X, Code, Map, GitPullRequest, ArrowRight, CheckCircle, Lock, ShieldCheck } from 'lucide-react'
import { AnimatedSection } from '@/components/landing/AnimatedSection'

export default function LandingPage() {
  useSEO({
    title: 'Home',
    description: 'Niam is the compliance OS for engineering teams.'
  })

  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text overflow-x-hidden font-sans">
      {/* 1. NAVBAR */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          isScrolled ? 'bg-bg/80 backdrop-blur-xl border-b border-white/5 py-3' : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-accent-blue" />
            <span className="text-xl font-bold tracking-tight">Niam</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-text-dim hover:text-text transition-colors">Features</a>
            <a href="#how-it-works" className="text-text-dim hover:text-text transition-colors">How it Works</a>
            <a href="https://github.com/niam" target="_blank" rel="noreferrer" className="text-text-dim hover:text-text transition-colors">Open Source</a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link to="/login" className="px-4 py-2 rounded-lg font-medium text-text-dim hover:text-text transition-colors">
              Sign In
            </Link>
            <Link to="/signup" className="px-5 py-2 rounded-lg font-medium bg-gradient-to-r from-accent-blue to-accent-purple text-white shadow-lg shadow-accent-blue/25 hover:shadow-accent-blue/40 transition-all">
              Get Started
            </Link>
          </div>

          <button className="md:hidden text-text-dim" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-bg/95 backdrop-blur-sm md:hidden">
          <div className="flex justify-end p-5">
            <button className="text-text-dim" onClick={() => setIsMobileMenuOpen(false)}>
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-8 pt-10 text-lg">
            <a href="#features" onClick={() => setIsMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setIsMobileMenuOpen(false)}>How it Works</a>
            <a href="https://github.com/niam">Open Source</a>
            <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="mt-4">Sign In</Link>
            <Link to="/signup" onClick={() => setIsMobileMenuOpen(false)} className="px-8 py-3 rounded-lg font-medium bg-gradient-to-r from-accent-blue to-accent-purple text-white shadow-lg shadow-accent-blue/25">
              Get Started
            </Link>
          </div>
        </div>
      )}

      {/* Background Gradients */}
      <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-[-1]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-accent-blue/20 blur-[120px] animate-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent-purple/20 blur-[120px] animate-float" style={{ animationDelay: '-10s' }} />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[40%] rounded-full bg-accent-blue/10 blur-[150px] animate-float" style={{ animationDelay: '-5s' }} />
      </div>

      {/* 2. HERO SECTION */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-4 overflow-hidden">
        {/* Subtle grid pattern for hero background */}
        <div 
          className="absolute inset-0 pointer-events-none z-[-1]" 
          style={{ 
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }} 
        />

        <AnimatedSection delay={0} direction="none" className="max-w-5xl mx-auto text-center z-10 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent-blue/30 bg-accent-blue/10 mb-8"
          >
            <span className="text-sm font-medium">🛡️ Built for India's DPDP Act 2023</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-[36px] md:text-[56px] leading-[1.1] font-bold tracking-tight mb-6"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Know what <span className="bg-gradient-to-r from-accent-blue to-accent-purple bg-clip-text text-transparent animate-pulse inline-block">personal data</span> your code touches — before the regulator does.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-[18px] text-text-dim max-w-[640px] mx-auto mb-10 leading-relaxed font-sans"
          >
            Niam scans your repositories, maps every data flow, and tells you exactly where your code falls short of the DPDP Act. Then it drafts the fix.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/signup" className="w-full sm:w-auto px-8 py-4 rounded-xl font-medium bg-gradient-to-r from-accent-blue to-accent-purple text-white shadow-lg shadow-accent-blue/25 hover:shadow-accent-blue/40 transition-all text-lg">
              Start Scanning — Free
            </Link>
            <a href="#how-it-works" className="w-full sm:w-auto px-8 py-4 rounded-xl font-medium text-text hover:bg-white/5 transition-all flex items-center justify-center gap-2">
              See How It Works <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* 3. PRODUCT SHOWCASE */}
      <section className="px-4 pb-24 max-w-6xl mx-auto">
        <AnimatedSection delay={0.3} direction="up">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-2 shadow-[0_20px_60px_rgba(91,140,255,0.15)] relative z-10">
            <div className="bg-bg/80 rounded-xl overflow-hidden border border-border/50 h-[300px] md:h-[500px] relative flex flex-col">
              {/* Fake browser header */}
              <div className="flex items-center gap-2 p-4 border-b border-border/30 bg-bg/90">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              {/* Dashboard Mockup Content */}
              <div className="p-6 flex-1 flex flex-col gap-6 opacity-80">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-sm text-text-dim mb-1">Repositories Scanned</div>
                    <div className="text-2xl font-bold">12</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-sm text-text-dim mb-1">Compliance Gaps</div>
                    <div className="text-2xl font-bold text-red-400">4</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-sm text-text-dim mb-1">Pull Requests</div>
                    <div className="text-2xl font-bold text-accent-blue">2</div>
                  </div>
                </div>
                <div className="flex-1 bg-white/5 rounded-lg border border-white/10 relative overflow-hidden flex items-center justify-center">
                   <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />
                   <div className="flex items-center gap-12 relative z-10">
                      <div className="w-16 h-16 rounded-full bg-accent-blue/20 border border-accent-blue flex items-center justify-center">
                         <Code className="text-accent-blue w-8 h-8" />
                      </div>
                      <div className="h-1 bg-border/50 w-24 relative">
                          <div className="absolute inset-0 bg-accent-purple/50 animate-pulse w-full" />
                      </div>
                      <div className="w-16 h-16 rounded-full bg-accent-purple/20 border border-accent-purple flex items-center justify-center">
                         <Lock className="text-accent-purple w-8 h-8" />
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* 4. FEATURES SECTION */}
      <section id="features" className="py-24 px-4 max-w-7xl mx-auto relative z-10">
        <AnimatedSection delay={0} direction="up" className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold inline-block relative">
            What Niam Does
            <div className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-accent-blue/0 via-accent-blue to-accent-blue/0 rounded-full" />
          </h2>
        </AnimatedSection>
        
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: <Code className="w-6 h-6 text-white" />,
              title: "Scan Your Code",
              desc: "Point Niam at any GitHub repository. It reads every file, finds where personal data is collected, stored, or sent to third parties."
            },
            {
              icon: <Map className="w-6 h-6 text-white" />,
              title: "Map the Compliance Gap",
              desc: "Niam builds a knowledge graph of your data flows and checks each one against the DPDP Act's obligations. Gaps are specific and actionable."
            },
            {
              icon: <GitPullRequest className="w-6 h-6 text-white" />,
              title: "Draft the Fix",
              desc: "For each gap, Niam drafts the exact policy language your privacy notice needs and opens a pull request for your team to review."
            }
          ].map((feature, idx) => (
            <AnimatedSection key={idx} delay={0.1 * (idx + 1)} direction="up">
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-accent-blue/20 hover:shadow-[0_0_20px_rgba(91,140,255,0.15)] transition-all duration-300 hover:scale-[1.02] group h-full">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center mb-6 shadow-lg shadow-accent-blue/20 group-hover:shadow-accent-blue/40 transition-all">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-text-dim leading-relaxed">{feature.desc}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* 5. HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-4 bg-black/20 border-y border-white/5 relative z-10">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection delay={0} direction="up" className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">How It Works</h2>
          </AnimatedSection>
          
          <div className="relative pl-8 md:pl-0">
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-accent-blue/10 -translate-x-1/2" />
            <div className="md:hidden absolute left-0 top-0 bottom-0 w-0.5 border-l-2 border-accent-blue/30" />

            {[
              { step: 1, title: "Connect GitHub", desc: "OAuth in one click. Niam sees only what you choose." },
              { step: 2, title: "Scan a Repository", desc: "Niam reads the code, builds a data flow graph, and cross-references the DPDP Act." },
              { step: 3, title: "Review Findings", desc: "Each finding explains what the code does, what the Act requires, and what is missing." },
              { step: 4, title: "Merge the Fix", desc: "Niam drafts the policy amendment as a pull request. Review it, approve it, done." }
            ].map((item, idx) => (
              <AnimatedSection key={idx} delay={0.2 * (idx + 1)} direction={idx % 2 === 0 ? 'left' : 'right'}>
                <div className={`relative flex items-center mb-12 last:mb-0 ${idx % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                  <div className="absolute left-[-32px] md:static md:left-auto md:w-1/2 flex justify-center z-10">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(91,140,255,0.4)] border-4 border-bg relative -left-[1px] md:left-0">
                      {item.step}
                    </div>
                  </div>
                  <div className={`md:w-1/2 pl-6 md:pl-0 ${idx % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12'}`}>
                    <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                    <p className="text-text-dim">{item.desc}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* 6. SOCIAL PROOF / TRUST */}
      <section className="py-24 px-4 max-w-6xl mx-auto text-center relative z-10">
        <AnimatedSection delay={0.1} direction="up">
          <h2 className="text-2xl font-semibold mb-12 text-text-dim">Open Source. Self-Hostable. No vendor lock-in.</h2>
          <div className="flex flex-col md:flex-row justify-center gap-8 md:gap-16">
            {[
              { icon: <CheckCircle className="w-5 h-5 text-accent-blue" />, text: "Real-time scanning" },
              { icon: <ShieldCheck className="w-5 h-5 text-accent-purple" />, text: "Fernet-encrypted credentials" },
              { icon: <Lock className="w-5 h-5 text-accent-blue" />, text: "Multi-tenant by design" }
            ].map((trust, idx) => (
              <div key={idx} className="flex items-center justify-center gap-3">
                {trust.icon}
                <span className="font-medium text-text-dim">{trust.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <a href="https://github.com/niam" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-accent-blue hover:text-accent-purple transition-colors font-medium">
              View on GitHub <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </AnimatedSection>
      </section>

      {/* 7. CTA SECTION */}
      <section className="py-24 px-4 relative overflow-hidden">
        <AnimatedSection delay={0} direction="up">
          <div className="max-w-3xl mx-auto text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to close the gap?</h2>
            <p className="text-xl text-text-dim mb-10 leading-relaxed">
              Get started in 2 minutes. Connect GitHub, scan a repository, see what your code actually does with personal data.
            </p>
            <Link to="/signup" className="inline-flex items-center gap-2 px-10 py-5 rounded-xl font-bold bg-gradient-to-r from-accent-blue to-accent-purple text-white shadow-xl shadow-accent-blue/25 hover:shadow-accent-blue/40 hover:-translate-y-1 transition-all text-lg">
              Start Free
            </Link>
          </div>
        </AnimatedSection>
      </section>

      {/* 8. FOOTER */}
      <footer className="border-t border-white/5 py-16 px-4 bg-black/40 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
            <div>
              <h4 className="font-bold mb-6 text-text">Product</h4>
              <ul className="space-y-4 text-text-faint">
                <li><Link to="/dashboard" className="hover:text-text transition-colors">Dashboard</Link></li>
                <li><Link to="/gaps" className="hover:text-text transition-colors">Gaps</Link></li>
                <li><Link to="/graph" className="hover:text-text transition-colors">Graph</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-text">Resources</h4>
              <ul className="space-y-4 text-text-faint">
                <li><a href="#" className="hover:text-text transition-colors">Documentation</a></li>
                <li><a href="https://github.com/niam" className="hover:text-text transition-colors">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-text">Legal</h4>
              <ul className="space-y-4 text-text-faint">
                <li><a href="#" className="hover:text-text transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-text transition-colors">Terms of Service</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-text">Company</h4>
              <ul className="space-y-4 text-text-faint">
                <li><a href="#" className="hover:text-text transition-colors">About</a></li>
                <li><a href="#" className="hover:text-text transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-text-faint">
            <div>© 2024 Niam. All rights reserved.</div>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-text transition-colors">Twitter</a>
              <a href="#" className="hover:text-text transition-colors">LinkedIn</a>
              <a href="https://github.com/niam" className="hover:text-text transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
