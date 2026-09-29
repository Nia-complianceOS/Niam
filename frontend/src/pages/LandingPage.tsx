import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '@/hooks/useSEO'
import { NiamMark } from '@/components/brand/NiamMark'
import {
  Menu,
  X,
  ArrowRight,
  GitPullRequest,
  CheckCircle2,
  Scale,
  ExternalLink,
  ChevronRight,
  SearchCode
} from 'lucide-react'

export default function LandingPage() {
  useSEO({
    title: 'Niam — Continuous DPDP Act 2023 Compliance for Engineering',
    description: 'Niam maps personal data flows in codebases, arbitrates statutory liability under India DPDP Act 2023, and drafts policy fixes as pull requests.'
  })

  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text-primary selection:bg-surface-elevated selection:text-text-primary font-sans antialiased overflow-x-hidden">
      {/* 1. EDITORIAL HEADER & NAVIGATION */}
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-200 ${
          isScrolled 
            ? 'bg-bg/90 backdrop-blur-md border-b border-border py-3 shadow-xs' 
            : 'bg-transparent py-5 border-b border-border/40'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex justify-between items-center">
          {/* Logo & Category */}
          <div className="flex items-center gap-3">
            <Link to="/" aria-label="Niam home" className="flex items-center gap-2.5 group rounded">
              <NiamMark size={26} title="" className="text-text-primary flex-shrink-0" />
              <span className="font-serif font-semibold text-xl tracking-tight text-text-primary">Niam</span>
            </Link>
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-border text-[11px] font-mono text-text-tertiary">
              <span>DPDP STATUTORY LEDGER</span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-[13px] font-medium text-text-secondary">
            <a href="#statutory-arbitration" className="hover:text-text-primary transition-colors">The Arbitration Engine</a>
            <a href="#features" className="hover:text-text-primary transition-colors">Architecture</a>
            <a href="#how-it-works" className="hover:text-text-primary transition-colors">Workflow</a>
            <a href="https://github.com/Nia-complianceOS/Niam" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text-primary transition-colors">
              Source <ExternalLink size={12} className="text-text-tertiary" />
            </a>
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link 
              to="/login" 
              className="px-3.5 py-1.5 rounded text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
            >
              Sign In
            </Link>
            <Link 
              to="/signup" 
              className="px-4 py-1.5 rounded text-[13px] font-medium bg-text-primary text-bg hover:opacity-90 transition-opacity border border-transparent shadow-xs"
            >
              Start Repository Audit
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-1.5 rounded border border-border text-text-secondary hover:text-text-primary" 
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-bg/95 backdrop-blur-md md:hidden flex flex-col p-6">
          <div className="flex justify-between items-center pb-6 border-b border-border">
            <span className="inline-flex items-center gap-2 font-serif font-semibold text-lg">
              <NiamMark size={20} title="" />
              Niam
            </span>
            <button 
              className="p-1.5 rounded border border-border text-text-secondary" 
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close navigation menu"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-5 pt-8 text-sm font-medium text-text-secondary">
            <a href="#statutory-arbitration" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-text-primary">The Arbitration Engine</a>
            <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-text-primary">Architecture</a>
            <a href="#how-it-works" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-text-primary">Workflow</a>
            <a href="https://github.com/Nia-complianceOS/Niam" target="_blank" rel="noreferrer" className="hover:text-text-primary">Source Code</a>
            <div className="pt-6 border-t border-border flex flex-col gap-3">
              <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="w-full py-2 text-center rounded border border-border font-medium text-text-primary">
                Sign In
              </Link>
              <Link to="/signup" onClick={() => setIsMobileMenuOpen(false)} className="w-full py-2 text-center rounded bg-text-primary text-bg font-medium">
                Start Audit
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. ASYMMETRICAL EDITORIAL HERO */}
      <section className="relative pt-32 pb-16 lg:pt-44 lg:pb-24 px-6 lg:px-12 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-start">
          {/* Left Column: Authoritative Editorial Assertion */}
          <div className="lg:col-span-7 flex flex-col items-start">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-border bg-bg-subtle text-[11px] font-mono text-text-secondary mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-status-gap" />
              <span>STATUTORY JURISDICTION: INDIA DPDP ACT 2023</span>
            </div>

            <h1 className="font-serif text-[38px] sm:text-[50px] lg:text-[56px] leading-[1.08] tracking-tight font-medium text-text-primary mb-6">
              Know what personal data your code touches — before the statutory regulator does.
            </h1>

            <p className="text-[15px] sm:text-[17px] leading-[1.6] text-text-secondary max-w-[580px] mb-8 font-sans font-normal">
              Niam scans your codebases, isolates unconsented PII collection and third-party egress, cross-references statutory obligations under India&apos;s DPDP Act, and opens the exact remedial policy pull request.
            </p>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <Link 
                to="/signup" 
                className="px-6 py-3 rounded text-[14px] font-medium bg-text-primary text-bg hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                Scan Repositories for DPDP Gaps
                <ArrowRight size={15} />
              </Link>
              <a 
                href="#statutory-arbitration" 
                className="px-5 py-3 rounded text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface border border-border transition-colors flex items-center justify-center gap-2"
              >
                Review Statutory Ledger
              </a>
            </div>

            {/* Micro Legal Spec List */}
            <div className="mt-10 pt-8 border-t border-border w-full grid grid-cols-3 gap-4 font-mono text-[11px] text-text-tertiary">
              <div>
                <span className="block text-text-primary font-medium text-sm font-sans mb-0.5">Section 6(1)</span>
                Consent for a specified purpose
              </div>
              <div>
                <span className="block text-text-primary font-medium text-sm font-sans mb-0.5">Section 8(7)</span>
                Erasure once the purpose is served
              </div>
              <div>
                <span className="block text-text-primary font-medium text-sm font-sans mb-0.5">Section 16</span>
                Transfer outside India
              </div>
            </div>
          </div>

          {/* Right Column: an ILLUSTRATIVE finding, labelled as such. Nothing
              here is live data or a real customer's scan -- it shows the
              shape of what a scan produces. */}
          <div className="lg:col-span-5 w-full">
            <figure className="rounded border border-border bg-surface p-1 shadow-md">
              {/* Ledger Header */}
              <div className="px-4 py-2.5 border-b border-border/80 bg-bg-subtle flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-status-neutral flex-shrink-0" />
                  <span className="font-mono text-[11px] text-text-secondary font-medium tracking-tight truncate">SAMPLE FINDINGS // example-app</span>
                </div>
                <span className="font-mono text-[10px] text-status-warning px-1.5 py-0.5 rounded border border-status-warning/30 bg-status-warning/10 uppercase flex-shrink-0">
                  Illustrative example
                </span>
              </div>

              {/* Forensic Ledger Preview Body */}
              <div className="p-4 space-y-4 font-sans text-xs">
                {/* How a finding is produced */}
                <ol className="grid grid-cols-3 gap-2 pb-3 border-b border-border">
                  <li className="p-2.5 rounded border border-border bg-bg">
                    <span className="block font-mono text-[10px] text-text-tertiary">STAGE 1</span>
                    <span className="text-[12px] font-medium text-text-primary">Signal filter</span>
                  </li>
                  <li className="p-2.5 rounded border border-border bg-bg">
                    <span className="block font-mono text-[10px] text-text-tertiary">STAGE 2</span>
                    <span className="text-[12px] font-medium text-text-primary">Model classifies</span>
                  </li>
                  <li className="p-2.5 rounded border border-border bg-bg">
                    <span className="block font-mono text-[10px] text-text-tertiary">STAGE 3</span>
                    <span className="text-[12px] font-medium text-text-primary">Clause check</span>
                  </li>
                </ol>

                {/* Finding Item 1 */}
                <div className="p-3 rounded border border-border bg-bg/50 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase text-status-gap bg-status-gap/10 px-1.5 py-0.2 rounded border border-status-gap/20 font-medium">
                      Undisclosed processor
                    </span>
                    <span className="font-mono text-[10px] text-text-tertiary truncate">src/analytics/track.ts</span>
                  </div>
                  <h4 className="font-medium text-text-primary text-[13px]">
                    Email address and phone number sent to an analytics SDK
                  </h4>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    The privacy notice does not mention this processor or purpose. Under <span className="text-text-primary font-mono">DPDP Act §5–6</span>, consent must follow a notice of the data and the purpose it is used for.
                  </p>
                  <div className="pt-2 flex items-center justify-between border-t border-border/50 text-[11px]">
                    <span className="font-mono text-text-tertiary">Vendor: analytics SDK</span>
                    <span className="text-text-primary font-medium inline-flex items-center gap-1">
                      Notice amendment drafted <ArrowRight size={11} />
                    </span>
                  </div>
                </div>

                {/* Finding Item 2 */}
                <div className="p-3 rounded border border-border bg-bg/50 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase text-status-warning bg-status-warning/10 px-1.5 py-0.2 rounded border border-status-warning/20 font-medium">
                      Retention gap
                    </span>
                    <span className="font-mono text-[10px] text-text-tertiary truncate">src/kyc/models.py</span>
                  </div>
                  <h4 className="font-medium text-text-primary text-[13px]">
                    PAN number stored with no stated retention period
                  </h4>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    <span className="text-text-primary font-mono">DPDP Act §8(7)</span> requires erasure once the specified purpose is served or consent is withdrawn, unless the law requires retention.
                  </p>
                </div>
              </div>
              <figcaption className="px-4 py-2 border-t border-border/80 font-mono text-[10px] text-text-tertiary">
                Illustrative example of the findings format. Not data from a real scan.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* 3. ARBITRATION ENGINE EXPLANATION */}
      <section id="statutory-arbitration" className="py-20 px-6 lg:px-12 border-t border-border bg-bg-subtle/40">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-12">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary block mb-2">
              The Problem We Solve
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl text-text-primary font-medium tracking-tight mb-4">
              Lawyers write privacy notices. Engineers push code. Neither reads the other.
            </h2>
            <p className="text-text-secondary text-[15px] leading-relaxed">
              Under the Schedule to India&apos;s Digital Personal Data Protection Act 2023, failing to take reasonable security safeguards against a personal data breach (§8(5)) can cost up to ₹250 crore, and failing to notify a breach to the Board and affected people (§8(6)) up to ₹200 crore. The risk is rarely a missing policy — it is the gap between what your privacy notice says and what your code actually does.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded border border-border bg-surface flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded border border-border bg-bg flex items-center justify-center text-text-primary mb-4">
                  <SearchCode size={16} strokeWidth={1.75} />
                </div>
                <h3 className="font-medium text-base text-text-primary mb-2">Data-Flow Discovery</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Niam reads your code at a specific commit. A signal filter picks out candidate lines, then a model classifies each one into a fixed taxonomy of personal-data types and vendors. Your code is never executed.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border font-mono text-[11px] text-text-tertiary">
                Two-Stage Scan: Filter, Then Model
              </div>
            </div>

            <div className="p-6 rounded border border-border bg-surface flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded border border-border bg-bg flex items-center justify-center text-text-primary mb-4">
                  <Scale size={16} strokeWidth={1.75} />
                </div>
                <h3 className="font-medium text-base text-text-primary mb-2">Statutory Arbitration</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Every discovered data path is evaluated against specific clauses of the DPDP Act 2023 and cross-checked against your published Privacy Notice for discrepancies and unconsented uses.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border font-mono text-[11px] text-text-tertiary">
                Clause-by-Clause Graph Check
              </div>
            </div>

            <div className="p-6 rounded border border-border bg-surface flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded border border-border bg-bg flex items-center justify-center text-text-primary mb-4">
                  <GitPullRequest size={16} strokeWidth={1.75} />
                </div>
                <h3 className="font-medium text-base text-text-primary mb-2">Prose-First Remedial PRs</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Rather than dumping raw linter errors on developers, Niam drafts statutory policy amendments and disclosures and, when you choose to, opens them as a pull request for your counsel and engineers to sign off.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border font-mono text-[11px] text-text-tertiary">
                Automated Human-in-the-Loop PR
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ARCHITECTURE & ONTOLOGY (THE GRAPH) */}
      <section id="features" className="py-20 px-6 lg:px-12 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5 space-y-6">
              <span className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary block">
                The Compliance Knowledge Graph
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl text-text-primary font-medium tracking-tight">
                A connected ontology of every byte, system, and statutory clause.
              </h2>
              <p className="text-text-secondary text-[14px] leading-relaxed">
                Niam models compliance as a directional graph rather than a flat spreadsheet. Follow a user identifier from its point of entry through background workers, outbound cloud processors, and into regulatory mandates.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3 p-3 rounded border border-border bg-surface">
                  <span className="w-2.5 h-2.5 rounded-full bg-entity-system mt-1.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-[13px] text-text-primary">Source Code Systems</h4>
                    <p className="text-[11px] text-text-secondary">Each scanned repository, with the commit its findings came from.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded border border-border bg-surface">
                  <span className="w-2.5 h-2.5 rounded-full bg-entity-datatype mt-1.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-[13px] text-text-primary">Data Types & Identifiers</h4>
                    <p className="text-[11px] text-text-secondary">Contact details, government IDs, payment cards, credentials, device and location data, classified into a fixed taxonomy.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded border border-border bg-surface">
                  <span className="w-2.5 h-2.5 rounded-full bg-entity-vendor mt-1.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-[13px] text-text-primary">Third-Party Processors</h4>
                    <p className="text-[11px] text-text-secondary">Downstream vendors, analytics SDKs, and payment gateways.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded border border-border bg-surface">
                  <span className="w-2.5 h-2.5 rounded-full bg-entity-clause mt-1.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-[13px] text-text-primary">DPDP Statutory Clauses</h4>
                    <p className="text-[11px] text-text-secondary">Exact legal obligations requiring notice, consent, or erasure.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Architecture Visual */}
            <div className="lg:col-span-7 p-6 rounded border border-border bg-surface">
              <div className="border border-border/80 rounded bg-bg p-6 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <span className="font-mono text-xs text-text-secondary font-medium">GRAPH ARBITRATION TOPOLOGY</span>
                  <span className="font-mono text-[10px] text-status-warning px-1.5 py-0.5 rounded border border-status-warning/30 bg-status-warning/10 uppercase">
                    Illustrative example
                  </span>
                </div>

                {/* Visual Pipeline Lanes */}
                <div className="grid grid-cols-4 gap-3 text-center font-mono text-[11px]">
                  <div className="p-3 rounded border border-entity-system/30 bg-entity-system/5 text-entity-system">
                    <span className="block text-[9px] text-text-tertiary mb-1 uppercase">LANE 01</span>
                    SYSTEM
                  </div>
                  <div className="p-3 rounded border border-entity-datatype/30 bg-entity-datatype/5 text-entity-datatype">
                    <span className="block text-[9px] text-text-tertiary mb-1 uppercase">LANE 02</span>
                    DATA TYPE
                  </div>
                  <div className="p-3 rounded border border-entity-vendor/30 bg-entity-vendor/5 text-entity-vendor">
                    <span className="block text-[9px] text-text-tertiary mb-1 uppercase">LANE 03</span>
                    PROCESSOR
                  </div>
                  <div className="p-3 rounded border border-entity-clause/30 bg-entity-clause/5 text-entity-clause">
                    <span className="block text-[9px] text-text-tertiary mb-1 uppercase">LANE 04</span>
                    DPDP CLAUSE
                  </div>
                </div>

                <div className="p-4 rounded border border-border bg-surface space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-text-primary">auth-service (POST /register)</span>
                    <ChevronRight size={12} className="text-text-tertiary" />
                    <span className="text-text-primary">Phone Number (PII)</span>
                    <ChevronRight size={12} className="text-text-tertiary" />
                    <span className="text-text-primary">Twilio SMS Gateway</span>
                    <ChevronRight size={12} className="text-text-tertiary" />
                    <span className="text-status-gap font-medium">Section 5(1) Notice Missing</span>
                  </div>
                  <div className="text-[11px] text-text-secondary leading-normal font-sans pt-1">
                    Example verdict: phone numbers are sent to a third-party SMS vendor, but the privacy notice does not describe this data or purpose.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. FOUR-STAGE WORKFLOW */}
      <section id="how-it-works" className="py-20 px-6 lg:px-12 border-t border-border bg-bg-subtle/30">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-12">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary block mb-2">
              Execution Sequence
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl text-text-primary font-medium tracking-tight mb-3">
              From GitHub token to merged statutory notice in four steps.
            </h2>
            <p className="text-text-secondary text-[14px]">
              Continuous statutory compliance designed to run silently alongside your engineering release cycle.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Authorize Repository',
                desc: 'Connect GitHub with OAuth. Niam asks for the repo scope, which GitHub describes as full read and write access to your repositories; write access is used only to open the fix pull request you ask for. No database or production credentials needed.'
              },
              {
                step: '02',
                title: 'Two-Stage Scan',
                desc: 'A keyword and signal filter selects candidate lines from your repository at a specific commit; a Google Gemini model then classifies each line into a fixed taxonomy of personal-data types and vendors.'
              },
              {
                step: '03',
                title: 'Statutory Cross-Check',
                desc: 'Detected flows are checked against India DPDP Act 2023 clauses and the active privacy policy schedule to identify compliance gaps.'
              },
              {
                step: '04',
                title: 'Review Remedial PR',
                desc: 'Niam drafts amended policy language with statutory reasoning. It opens a pull request only when you click to, and never merges it for you.'
              }
            ].map((item, idx) => (
              <div key={idx} className="p-5 rounded border border-border bg-surface flex flex-col justify-between">
                <div>
                  <span className="font-mono text-xs text-text-tertiary block mb-4">{item.step} // SEQUENCE</span>
                  <h3 className="font-medium text-base text-text-primary mb-2">{item.title}</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">{item.desc}</p>
                </div>
                <div className="mt-6 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] font-mono text-text-tertiary">
                  <span>STAGE {item.step}</span>
                  <CheckCircle2 size={12} className="text-text-tertiary" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. DATA HANDLING -- exactly what leaves, exactly what is kept */}
      <section className="py-16 px-6 lg:px-12 border-t border-border">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4">
            <span className="font-mono text-[11px] text-text-tertiary uppercase tracking-wider block mb-1">
              Data Handling
            </span>
            <h3 className="font-serif text-2xl text-text-primary font-medium">
              We tell you exactly what leaves your repository, and what we keep.
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed mt-3">
              A compliance tool should meet the standard it checks you against. Here is the whole list.
            </p>
          </div>
          <dl className="lg:col-span-8 grid sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded border border-border bg-surface">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-text-primary mb-1.5">Sent for classification</dt>
              <dd className="text-text-secondary leading-relaxed">
                Only the candidate code lines picked out by the signal filter, never whole files, go to Google&apos;s Gemini API to be classified.
              </dd>
            </div>
            <div className="p-4 rounded border border-border bg-surface">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-text-primary mb-1.5">Stored by Niam</dt>
              <dd className="text-text-secondary leading-relaxed">
                Findings with file paths and line numbers, commit SHAs and messages, and the resulting compliance graph, plus your account details. Not your source files.
              </dd>
            </div>
            <div className="p-4 rounded border border-border bg-surface">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-text-primary mb-1.5">Never done</dt>
              <dd className="text-text-secondary leading-relaxed">
                Your code is never executed. Nothing is pushed to GitHub unless you choose to open a pull request, and pull requests are never merged for you.
              </dd>
            </div>
            <div className="p-4 rounded border border-border bg-surface">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-text-primary mb-1.5">Your GitHub credential</dt>
              <dd className="text-text-secondary leading-relaxed">
                Encrypted at rest (Fernet) and never sent back to the browser. Disconnect at any time; delete all findings from Settings.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* 7. CALL TO ACTION */}
      <section className="py-20 px-6 lg:px-12 border-t border-border bg-bg-subtle/50">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary block">
            Begin Continuous Governance
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-text-primary font-medium tracking-tight">
            Close the gap between your code and India&apos;s DPDP Act.
          </h2>
          <p className="text-text-secondary text-[15px] max-w-xl mx-auto leading-relaxed">
            Connect GitHub, scan a repository, and review your statutory posture before your next release cycle or compliance audit. The DPDP Act&apos;s core obligations apply from May 2027, 18 months after the DPDP Rules were notified.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <Link 
              to="/signup" 
              className="px-6 py-3 rounded text-[14px] font-medium bg-text-primary text-bg hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              Start Repository Audit
              <ArrowRight size={15} />
            </Link>
            <Link 
              to="/login" 
              className="px-6 py-3 rounded text-[14px] font-medium text-text-primary hover:bg-surface border border-border transition-colors flex items-center justify-center"
            >
              Sign In to Existing Ledger
            </Link>
          </div>
        </div>
      </section>

      {/* 8. EDITORIAL FOOTER */}
      <footer className="border-t border-border py-14 px-6 lg:px-12 bg-bg text-text-secondary text-xs">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <NiamMark size={20} title="" className="text-text-primary flex-shrink-0" />
                <span className="font-serif font-semibold text-base text-text-primary">Niam</span>
              </div>
              <p className="text-text-tertiary text-xs max-w-sm leading-relaxed">
                Automated statutory risk governance and continuous compliance for the Digital Personal Data Protection Act 2023.
              </p>
              <div className="font-mono text-[11px] text-text-tertiary pt-2">
                DPDP ACT 2023 · DPDP RULES 2025
              </div>
            </div>

            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-primary mb-3">Platform</h4>
              <ul className="space-y-2">
                <li><Link to="/dashboard" className="hover:text-text-primary transition-colors">Dashboard</Link></li>
                <li><Link to="/graph" className="hover:text-text-primary transition-colors">Compliance Graph</Link></li>
                <li><Link to="/gaps" className="hover:text-text-primary transition-colors">Gaps Queue</Link></li>
                <li><Link to="/repositories" className="hover:text-text-primary transition-colors">Repositories</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-primary mb-3">Statutory</h4>
              <ul className="space-y-2">
                <li><Link to="/regulations" className="hover:text-text-primary transition-colors">DPDP Clauses</Link></li>
                <li><Link to="/policies" className="hover:text-text-primary transition-colors">Privacy Notices</Link></li>
                <li><Link to="/pull-requests" className="hover:text-text-primary transition-colors">Pull Requests</Link></li>
                <li><Link to="/audit" className="hover:text-text-primary transition-colors">Audit Trail</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-primary mb-3">Provenance</h4>
              <ul className="space-y-2">
                <li><a href="https://github.com/Nia-complianceOS/Niam" target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">GitHub</a></li>
                <li><a href="https://www.meity.gov.in/content/digital-personal-data-protection-act-2023" target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">DPDP Act Text</a></li>
                <li><Link to="/settings" className="hover:text-text-primary transition-colors">System Settings</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-text-tertiary">
            <div>
              {`© ${new Date().getFullYear()} Niam`} Compliance Platform. Built for India DPDP Act 2023.
            </div>
            <div className="flex items-center gap-6 font-mono text-[11px]">
              <span>CONFIDENTIAL // STATUTORY ARBITRATION</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
