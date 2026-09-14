import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ShieldCheck, Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react'
import { useSEO } from '@/hooks/useSEO'

export default function Login() {
  useSEO({
    title: 'Sign In — Niam Statutory Ledger',
    description: 'Sign in to access your continuous DPDP Act 2023 compliance workspace.'
  })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    
    setIsSubmitting(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError((err as Error).message || 'Sign in failed')
    } finally {
      setIsSubmitting(false)
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-bg text-text-primary font-sans">
      {/* LEFT COLUMN: Regulatory Briefing & Ledger Identity */}
      <div className="w-full md:w-[50%] lg:w-[48%] flex flex-col justify-between p-8 md:p-14 lg:p-18 border-b md:border-b-0 md:border-r border-border bg-bg-subtle/40">
        <div>
          <Link to="/" className="inline-flex items-center gap-2.5 group mb-12">
            <div className="w-8 h-8 rounded border border-border bg-surface flex items-center justify-center text-text-primary transition-colors group-hover:border-text-tertiary">
              <ShieldCheck size={18} strokeWidth={1.75} />
            </div>
            <span className="font-serif font-semibold text-xl tracking-tight text-text-primary">Niam</span>
            <span className="text-[10px] font-mono text-text-tertiary px-1.5 py-0.5 rounded border border-border bg-bg">
              DPDP ACT 2023
            </span>
          </Link>

          <div className="max-w-md space-y-6">
            <h1 className="font-serif text-3xl lg:text-4xl font-medium tracking-tight leading-[1.15] text-text-primary">
              Arbitrate statutory risk across your software supply chain.
            </h1>
            <p className="text-[14px] text-text-secondary leading-relaxed">
              Niam isolates personal data egress, detects undeclared third-party processors, and maintains an auditable compliance ledger aligned with India&apos;s DPDP Act.
            </p>

            <div className="pt-6 space-y-3 font-mono text-xs text-text-secondary border-t border-border">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
                <span>Statutory Scope: India DPDP Act 2023</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
                <span>Engine: AST Static Analysis & Policy Cross-Check</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
                <span>Output: Prose Remedial Pull Requests</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-10 text-[11px] font-mono text-text-tertiary border-t border-border/60 flex items-center justify-between">
          <span>CONFIDENTIAL AUDIT LEDGER</span>
          <span>SEC. 4 // NOTICE & CONSENT</span>
        </div>
      </div>

      {/* RIGHT COLUMN: Authentication Form */}
      <div className="w-full md:w-[50%] lg:w-[52%] flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-bg">
        <div className="w-full max-w-[380px] space-y-6">
          <div className="space-y-1.5">
            <span className="font-mono text-[11px] text-text-tertiary uppercase tracking-wider block">
              Authentication
            </span>
            <h2 className="font-serif text-2xl font-medium text-text-primary">Access Workspace</h2>
            <p className="text-xs text-text-secondary">Enter your credentials to enter the compliance ledger.</p>
          </div>

          <div className="rounded border border-border bg-surface p-6 sm:p-7 shadow-sm">
            {error && (
              <div className="mb-5 p-3 rounded border border-status-gap/30 bg-status-gap/10 text-status-gap text-xs leading-relaxed flex items-start gap-2 font-sans">
                <span className="font-mono text-[11px] font-bold">ERR:</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-medium text-text-secondary">
                  Work Email Address
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
                    <Mail size={15} strokeWidth={1.75} />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="counsel@company.com"
                    autoComplete="email"
                    className="w-full pl-9 pr-3 py-2 rounded bg-bg border border-border text-text-primary text-xs focus:outline-none focus:border-text-tertiary transition-colors placeholder:text-text-tertiary"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" aria-label="Password" className="text-xs font-medium text-text-secondary">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
                    <Lock size={15} strokeWidth={1.75} />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className="w-full pl-9 pr-9 py-2 rounded bg-bg border border-border text-text-primary text-xs focus:outline-none focus:border-text-tertiary transition-colors placeholder:text-text-tertiary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !email || !password}
                  className="w-full py-2.5 px-4 rounded text-xs font-medium bg-text-primary text-bg hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Ledger</span>
                      <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-5 pt-4 border-t border-border text-center text-xs text-text-secondary">
              Need a new workspace?{' '}
              <Link to="/signup" className="text-text-primary font-medium hover:underline underline-offset-4">
                Register repository audit
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
