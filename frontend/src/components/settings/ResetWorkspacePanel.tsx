import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { isAbortError, resetWorkspace } from '@/services/api/client'
import { summariseRemoval } from '@/lib/workspaceMessages'
import type { RemovalResponse } from '@/types/api'

/** Typed exactly, ignoring case and stray spaces. */
const CONFIRM_WORD = 'reset'

/**
 * Delete every finding on this account.
 *
 * It lives here rather than on Repositories on purpose. Removing one
 * repository is routine housekeeping and belongs next to the list of
 * repositories; deleting everything is a different weight of action, and
 * should not sit one click away from the button someone presses every
 * week. Settings is where you go on purpose.
 *
 * Two clicks are not enough either, because the second click is muscle
 * memory. Confirming means typing the word, which cannot be done by
 * accident and cannot be done by a stray Enter on a focused button.
 *
 * The panel is careful to be exact about scope: this deletes findings, not
 * the account and not the GitHub connection, and it does not touch a line
 * of anyone's code.
 */
export function ResetWorkspacePanel() {
  const [armed, setArmed] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RemovalResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const matches = typed.trim().toLowerCase() === CONFIRM_WORD

  const cancel = () => {
    setArmed(false)
    setTyped('')
    setError(null)
  }

  const run = async () => {
    if (!matches) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await resetWorkspace())
      setArmed(false)
      setTyped('')
    } catch (err) {
      if (isAbortError(err)) return
      setError(
        `Nothing was deleted — we couldn't complete this. ${(err as Error).message}`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 mt-4 border-border bg-surface">
      <div className="font-serif text-base font-normal text-text-primary mb-1.5">
        Purge Compliance Ledger
      </div>
      <div className="text-xs text-text-secondary leading-relaxed max-w-[620px] font-sans">
        This wipes all findings discovered for your account: repository links, mapped personal data entities, external processor associations, identified statutory gaps, and scan telemetry. This action is irreversible.
      </div>

      <div className="mt-4 rounded bg-surface-sunken border border-border-subtle p-4">
        <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-text-muted mb-2">
          Scope Boundaries (Unaffected Elements)
        </div>
        <ul className="flex flex-col gap-1.5 text-xs text-text-secondary font-sans leading-relaxed">
          <li>
            <strong className="text-text-primary font-medium">Session & Account:</strong> Your credentials and active session remain valid.
          </li>
          <li>
            <strong className="text-text-primary font-medium">GitHub Authorization:</strong> Repository tokens stay connected for subsequent scans.
          </li>
          <li>
            <strong className="text-text-primary font-medium">Upstream Source Code:</strong> No files or branches on GitHub are altered or removed.
          </li>
        </ul>
      </div>

      {result && <ResetReceipt result={result} />}

      {error && (
        <div className="mt-4 flex items-start gap-2.5 p-3 rounded border border-danger/30 bg-danger/5 text-xs font-mono text-danger leading-relaxed">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {armed ? (
        <div className="mt-4 rounded border border-danger/40 bg-danger/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-danger mt-0.5 flex-shrink-0" />
            <div className="text-xs leading-relaxed max-w-[560px]">
              <div className="font-semibold text-danger">
                Final Confirmation Required
              </div>
              <div className="text-text-secondary mt-1 font-sans">
                Type <span className="font-mono text-text-primary bg-surface-sunken px-1.5 py-0.5 rounded border border-border-subtle font-bold">reset</span> below to execute ledger purge. No secondary confirmation modal will be displayed.
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run()
              }}
              placeholder="reset"
              spellCheck={false}
              autoComplete="off"
              aria-label="Type reset to confirm"
              className="w-48 bg-surface-sunken border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger transition-colors"
            />
            <button
              onClick={() => void run()}
              disabled={!matches || busy}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded text-xs font-mono font-medium text-white bg-danger hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              {busy ? 'Purging...' : 'Confirm Purge'}
            </button>
            <Button variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger/10 text-xs font-mono"
            onClick={() => {
              setArmed(true)
              setResult(null)
              setError(null)
            }}
          >
            Purge all findings…
          </Button>
        </div>
      )}
    </Card>
  )
}

/**
 * The counts the server reports after the fact.
 */
function ResetReceipt({ result }: { result: RemovalResponse }) {
  const summary = summariseRemoval(result.removed, { includeRepositories: true })

  return (
    <div className="mt-4 flex items-start gap-2.5 p-3.5 rounded border border-status-compliant/30 bg-status-compliant/10 text-xs font-sans text-status-compliant leading-relaxed">
      <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />
      <div>
        <div className="font-semibold text-text-primary">Ledger Purged Successfully</div>
        <div className="text-text-secondary mt-0.5">
          {summary
            ? `Removed entities: ${summary}.`
            : 'No active graph findings were indexed for this workspace.'}{' '}
          Repository connections remain intact. Initiate a new scan whenever ready.
        </div>
      </div>
    </div>
  )
}
