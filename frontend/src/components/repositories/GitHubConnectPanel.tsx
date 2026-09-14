import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Github,
  Loader2,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CONNECT_ASSURANCE, CONNECT_BENEFITS } from '@/lib/githubMessages'
import { motion, AnimatePresence } from 'framer-motion'

export function GitHubConnectPanel({
  connecting,
  actionError,
  onConnect,
  onSubmitToken,
}: {
  connecting: boolean
  actionError: string | null
  onConnect: () => void
  onSubmitToken: (token: string) => Promise<boolean>
}) {
  const [tokenOpen, setTokenOpen] = useState(false)
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const value = token.trim()
    if (!value) return
    setSubmitting(true)
    const ok = await onSubmitToken(value)
    setSubmitting(false)
    setToken('')
    if (ok) setTokenOpen(false)
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 w-full">
      <Card className="w-full max-w-[640px] p-8 md:p-10 flex flex-col items-center text-center bg-surface/50 backdrop-blur-md shadow-xl border-border-soft/60 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-accent-blue/10 blur-[100px] pointer-events-none" />

        <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-lg shadow-black/20">
          <Github size={40} className="text-white drop-shadow-md" />
        </div>

        <h2 className="font-display text-[28px] font-bold tracking-tight mb-3">
          Connect your GitHub account
        </h2>
        <p className="text-[15px] text-text-dim max-w-[480px] leading-relaxed mb-8">
          This is the first step. Until Niam can read your code, it has nothing to check your privacy obligations against.
        </p>

        <div className="w-full text-left bg-black/20 rounded-xl p-5 border border-border-soft mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-3">
            What connecting lets Niam do
          </div>
          <ul className="flex flex-col gap-3">
            {CONNECT_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3 text-[13.5px] text-text-dim leading-relaxed">
                <div className="mt-0.5 w-4 h-4 rounded-full bg-accent-green/20 flex items-center justify-center flex-shrink-0">
                  <Check size={10} className="text-accent-green" />
                </div>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start justify-center gap-2.5 text-[13px] text-text-dim leading-relaxed mb-8 bg-accent-blue/5 px-4 py-3 rounded-lg border border-accent-blue/10 w-full text-left">
          <ShieldCheck size={16} className="text-accent-blue mt-[1px] flex-shrink-0" />
          <span>{CONNECT_ASSURANCE}</span>
        </div>

        {actionError && (
          <div className="w-full mb-6 flex items-start gap-2.5 px-4 py-3 rounded-[10px] bg-accent-red/10 border border-accent-red/30 text-[13px] leading-relaxed text-accent-red text-left">
            <AlertTriangle size={16} className="mt-[1px] flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        <button
          onClick={onConnect}
          disabled={connecting}
          className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-accent-blue to-[#8e6ef6] text-white rounded-xl font-semibold text-[15px] hover:opacity-90 transition-all shadow-[0_0_20px_rgba(91,140,255,0.3)] hover:shadow-[0_0_30px_rgba(91,140,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
        >
          {connecting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Taking you to GitHub…
            </>
          ) : (
            <>
              <Github size={18} />
              Connect with GitHub
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>

        <p className="text-[12px] text-text-faint mt-4 mb-8">
          You'll approve this securely on GitHub, then return here.
        </p>

        <div className="w-full pt-6 border-t border-border-soft">
          <button
            type="button"
            onClick={() => setTokenOpen((open) => !open)}
            className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-text-dim hover:text-text transition-colors mx-auto"
          >
            Or paste a personal access token
            <ChevronDown
              size={14}
              className={`transition-transform duration-300 ${tokenOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <AnimatePresence>
            {tokenOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden w-full text-left"
              >
                <div className="pt-5">
                  <div className="text-[13px] text-text-dim leading-relaxed mb-4">
                    If your organisation has not set up one-click sign-in, create a GitHub access token and paste it here.
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submit()
                      }}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      spellCheck={false}
                      autoComplete="off"
                      className="flex-1 bg-black/20 border border-border-soft rounded-xl px-4 py-2.5 text-[14px] font-mono text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                    />
                    <Button
                      variant="primary"
                      onClick={() => void submit()}
                      disabled={submitting || connecting || token.trim() === ''}
                      className="whitespace-nowrap"
                    >
                      {submitting ? 'Checking…' : 'Use Token'}
                    </Button>
                  </div>
                  <div className="mt-3 text-[11.5px] text-text-faint text-center">
                    The token is verified securely and stored encrypted.
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  )
}
