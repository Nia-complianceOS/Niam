import { useState } from 'react'
import {
  ChevronDown,
  Github,
  Loader2,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { CONNECT_ASSURANCE, CONNECT_BENEFITS } from '@/lib/githubMessages'

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
    <div className="flex flex-col items-center justify-center py-10 px-4 w-full font-sans">
      <Card className="w-full max-w-[620px] p-8 md:p-10 flex flex-col items-center text-center bg-surface border border-border shadow-xs relative">
        <div className="w-14 h-14 rounded border border-border bg-bg flex items-center justify-center mb-5 text-text-primary shadow-xs">
          <Github size={28} strokeWidth={1.75} />
        </div>

        <span className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary mb-2 block">
          Step 01 // Source Ingestion
        </span>

        <h2 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-text-primary mb-3">
          Authorize Source Repository
        </h2>
        <p className="text-xs text-text-secondary max-w-[460px] leading-relaxed mb-6">
          Connect your GitHub organization to scan source code Abstract Syntax Trees against India&apos;s DPDP Act 2023. Niam reads AST nodes without executing code.
        </p>

        <div className="w-full text-left bg-bg rounded border border-border p-4 mb-5 space-y-2.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            Scope & Statutory Protections
          </div>
          <ul className="space-y-2 text-xs text-text-secondary">
            {CONNECT_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 leading-relaxed">
                <span className="mt-0.5 text-status-compliant font-bold font-mono text-[11px]">✓</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2.5 text-xs text-text-tertiary leading-relaxed mb-6 bg-bg-subtle/70 px-3.5 py-2.5 rounded border border-border w-full text-left font-mono">
          <ShieldCheck size={14} className="text-status-compliant mt-0.5 flex-shrink-0" />
          <span>{CONNECT_ASSURANCE}</span>
        </div>

        {actionError && (
          <div className="w-full mb-5 p-3 rounded border border-status-gap/30 bg-status-gap/10 text-xs text-status-gap text-left leading-relaxed">
            <div className="font-mono font-bold text-[10px] uppercase mb-0.5">Connection Fault</div>
            {actionError}
          </div>
        )}

        <button
          onClick={onConnect}
          disabled={connecting}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-text-primary text-bg rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
        >
          {connecting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Redirecting to GitHub OAuth…</span>
            </>
          ) : (
            <>
              <Github size={14} />
              <span>Connect with GitHub</span>
              <ArrowRight size={13} />
            </>
          )}
        </button>

        {/* Access Token Fallback Accordion */}
        <div className="mt-8 pt-5 border-t border-border w-full text-left">
          <button
            type="button"
            onClick={() => setTokenOpen((o) => !o)}
            className="text-xs font-mono text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-between w-full"
          >
            <span>Or configure with Personal Access Token</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${tokenOpen ? 'rotate-180' : ''}`} />
          </button>

          {tokenOpen && (
            <div className="mt-3 space-y-3 pt-2">
              <p className="text-[11px] text-text-secondary leading-relaxed">
                If OAuth is restricted by enterprise policy, provide a fine-grained token with repository <code className="font-mono bg-bg px-1 py-0.5 rounded border border-border text-text-primary">contents:read</code> scope.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_..."
                  className="flex-1 bg-bg border border-border rounded px-3 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || !token.trim()}
                  className="px-3 py-1.5 rounded bg-surface border border-border text-xs font-medium text-text-primary hover:bg-bg disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Verifying…' : 'Save Token'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
