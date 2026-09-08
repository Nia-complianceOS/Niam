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
    <Card className="p-5 mt-4 border-accent-red/25">
      <div className="font-display text-[15px] font-semibold mb-1.5">
        Delete all findings
      </div>
      <div className="text-[13px] text-text-dim leading-relaxed max-w-[620px]">
        This deletes everything Niam has found for your account: every
        repository it has scanned, the personal data and outside services it
        mapped, every finding, every fix it drafted, and the history of every
        scan. It cannot be undone.
      </div>

      <div className="mt-4 rounded-[10px] bg-black/30 border border-border-soft p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2">
          What this does not touch
        </div>
        <ul className="flex flex-col gap-1.5 text-[12.5px] text-text-dim leading-relaxed">
          <li>
            Your account. You stay signed in and can carry on using Niam
            straight away.
          </li>
          <li>
            Your GitHub connection. It stays connected, so you can scan a
            repository again whenever you are ready.
          </li>
          <li>
            Your code. Nothing is changed or deleted on GitHub, and any pull
            request you have already opened there stays open.
          </li>
        </ul>
      </div>

      {result && <ResetReceipt result={result} />}

      {error && (
        <div className="mt-4 flex items-start gap-2.5 px-3.5 py-2.5 rounded-[10px] bg-accent-red/10 border border-accent-red/30 text-[12.5px] leading-relaxed text-accent-red">
          <AlertTriangle size={15} className="mt-[1px] flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {armed ? (
        <div className="mt-4 rounded-[10px] border border-accent-red/30 bg-accent-red/[0.06] p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-accent-red mt-[2px] flex-shrink-0" />
            <div className="text-[12.5px] leading-relaxed max-w-[560px]">
              <div className="text-[13px] font-semibold text-accent-red">
                This deletes every finding on your account
              </div>
              <div className="text-text-dim mt-1">
                Type <span className="font-mono text-text">reset</span> below to
                confirm. There is no further prompt after this, and nothing
                deleted here can be brought back.
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
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
              className="w-[180px] bg-black/20 border border-border-soft rounded-[10px] px-3 py-2 text-[14px] font-mono text-text placeholder:text-text-faint focus:outline-none focus:border-accent-red/50 focus:ring-1 focus:ring-accent-red/50 transition-all"
            />
            <button
              onClick={() => void run()}
              disabled={!matches || busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-semibold text-white bg-accent-red hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? 'Deleting…' : 'Delete everything'}
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
            className="text-accent-red"
            onClick={() => {
              setArmed(true)
              setResult(null)
              setError(null)
            }}
          >
            Delete all findings…
          </Button>
        </div>
      )}
    </Card>
  )
}

/**
 * The counts the server reports after the fact. Someone who has just
 * deleted everything they had is owed an exact account of it.
 */
function ResetReceipt({ result }: { result: RemovalResponse }) {
  const summary = summariseRemoval(result.removed, { includeRepositories: true })

  return (
    <div className="mt-4 flex items-start gap-2.5 px-3.5 py-2.5 rounded-[10px] bg-accent-green/10 border border-accent-green/30 text-[12.5px] leading-relaxed text-accent-green">
      <CheckCircle2 size={15} className="mt-[1px] flex-shrink-0" />
      <div>
        <div className="font-semibold">Your findings have been deleted</div>
        <div className="text-accent-green/80">
          {summary
            ? `Deleted: ${summary}.`
            : 'There was nothing recorded on this account to delete.'}{' '}
          Your account and your GitHub connection are still in place — scan a
          repository whenever you are ready to start again.
        </div>
      </div>
    </div>
  )
}
