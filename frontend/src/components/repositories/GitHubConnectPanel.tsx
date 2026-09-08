import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Github,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CONNECT_ASSURANCE, CONNECT_BENEFITS } from '@/lib/githubMessages'

/**
 * The on-ramp: the panel a brand-new account sees first.
 *
 * The audience is a compliance or legal reviewer, not the engineer who
 * owns the repository, so this leads with what connecting DOES and what it
 * will not do, and only then with a button. The paste-a-token fallback is
 * collapsed by default — it exists for instances with no GitHub app
 * registered, and putting a "personal access token" field in front of
 * someone who does not need one is how a simple page starts feeling
 * technical.
 */
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
    // Cleared either way. A token that failed is no more use in the box
    // than one that worked, and leaving a credential sitting in an input
    // is its own small hazard.
    setToken('')
    if (ok) setTokenOpen(false)
  }

  return (
    <Card className="p-6 max-w-[720px]">
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-[10px] bg-grad-primary flex items-center justify-center flex-shrink-0">
          <Github size={18} className="text-white" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[16px] font-semibold">
            Connect your GitHub account
          </div>
          <div className="text-[13px] text-text-dim mt-1 leading-relaxed">
            This is the first step. Until Niam can read your code, it has
            nothing to check your privacy obligations against.
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[10px] bg-black/30 border border-border-soft p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2.5">
          What connecting lets Niam do
        </div>
        <ul className="flex flex-col gap-2">
          {CONNECT_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-[12.5px] text-text-dim leading-relaxed">
              <Check size={14} className="text-accent-green mt-[3px] flex-shrink-0" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex items-start gap-2.5 text-[12.5px] text-text-dim leading-relaxed">
        <ShieldCheck size={14} className="text-accent-blue mt-[3px] flex-shrink-0" />
        <span>{CONNECT_ASSURANCE}</span>
      </div>

      {actionError && (
        <div className="mt-4 flex items-start gap-2.5 px-3.5 py-2.5 rounded-[10px] bg-accent-red/10 border border-accent-red/30 text-[12.5px] leading-relaxed text-accent-red">
          <AlertTriangle size={15} className="mt-[1px] flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={onConnect} disabled={connecting}>
          {connecting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Taking you to GitHub…
            </>
          ) : (
            <>
              <Github size={15} />
              Connect GitHub
            </>
          )}
        </Button>
        <span className="text-[12px] text-text-faint">
          You'll approve this on GitHub, then come straight back here.
        </span>
      </div>

      <div className="mt-5 pt-4 border-t border-border-soft">
        <button
          type="button"
          onClick={() => setTokenOpen((open) => !open)}
          className="flex items-center gap-1.5 text-[12.5px] text-text-dim hover:text-text transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${tokenOpen ? 'rotate-180' : ''}`}
          />
          Paste a token instead
        </button>

        {tokenOpen && (
          <div className="mt-3">
            <div className="text-[12.5px] text-text-dim leading-relaxed max-w-[560px]">
              If your organisation has not set up one-click sign-in, someone
              on your engineering team can create a GitHub access token and
              paste it here. It does the same job.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit()
                }}
                placeholder="Paste the token here"
                spellCheck={false}
                autoComplete="off"
                className="flex-1 min-w-[260px] bg-black/20 border border-border-soft rounded-[10px] px-3 py-2 text-[14px] font-mono text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
              />
              <Button
                variant="ghost"
                onClick={() => void submit()}
                disabled={submitting || connecting || token.trim() === ''}
              >
                {submitting ? 'Checking…' : 'Use this token'}
              </Button>
            </div>
            <div className="mt-2 text-[11.5px] text-text-faint">
              The token is checked with GitHub before it is saved, and it is
              stored encrypted. It is never shown again after this.
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
