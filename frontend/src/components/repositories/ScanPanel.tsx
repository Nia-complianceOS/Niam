import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Lock, Search, Terminal, Play, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useScan } from '@/hooks/useScan'
import type { Repository } from '@/types/api'

const REPO_RE = /^[\w.\-]+\/[\w.\-]+$/

export function ScanPanel({
  repositories = [],
  truncated = false,
  onScanComplete,
}: {
  repositories?: Repository[]
  truncated?: boolean
  onScanComplete?: () => void
}) {
  const [repo, setRepo] = useState('')
  const [ref, setRef] = useState('main')
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { status, logs, error, reconnecting, triggerScan, cancelActive } = useScan()

  const busy = status === 'starting' || status === 'running'
  const valid = REPO_RE.test(repo.trim())

  const onCompleteRef = useRef(onScanComplete)
  onCompleteRef.current = onScanComplete
  useEffect(() => {
    if (status === 'completed') onCompleteRef.current?.()
  }, [status])

  const matches = useMemo(() => {
    const q = repo.trim().toLowerCase()
    return q
      ? repositories.filter((r) => r.full_name.toLowerCase().includes(q))
      : repositories
  }, [repositories, repo])

  return (
    <div className="p-5 rounded border border-border bg-surface mb-4 font-sans shadow-xs">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
        <div>
          <h2 className="font-medium text-sm text-text-primary">Scan a Repository</h2>
          <p className="text-xs text-text-secondary mt-0.5 max-w-[560px] leading-relaxed">
            Reads the repository at the chosen branch or commit in two stages: a signal filter picks out candidate lines, then a Google Gemini model classifies each one into a fixed taxonomy of personal-data types and vendors. Only those candidate lines are sent to Gemini; Niam keeps the findings (file paths, line numbers, commit details), not your source files, and never runs your code.
          </p>
        </div>
        <span className="font-mono text-[10px] text-text-tertiary px-1.5 py-0.5 rounded border border-border bg-bg">
          TWO-STAGE SCAN
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-2 pt-1">
        <div className="flex-1 min-w-[260px]">
          <div className="relative">
            <input
              ref={inputRef}
              value={repo}
              onChange={(e) => {
                setRepo(e.target.value)
                setPickerOpen(true)
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => window.setTimeout(() => setPickerOpen(false), 150)}
              placeholder="organization/repository"
              spellCheck={false}
              className="w-full bg-bg border border-border rounded px-3 py-1.5 pr-8 text-xs font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors"
            />
            {repositories.length > 0 && (
              <button
                type="button"
                aria-label="Select repository"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPickerOpen((o) => !o)
                  inputRef.current?.focus()
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                <ChevronDown size={14} />
              </button>
            )}

            {pickerOpen && repositories.length > 0 && (
              <div className="absolute z-30 mt-1 w-full max-h-[260px] overflow-y-auto rounded border border-border bg-surface-elevated shadow-md">
                <div className="px-3 py-1.5 text-[10px] font-mono text-text-tertiary border-b border-border flex items-center gap-1.5 sticky top-0 bg-surface-elevated">
                  <Search size={11} />
                  <span>{matches.length} OF {repositories.length} REPOSITORIES AVAILABLE{truncated ? ' (FIRST 100)' : ''}</span>
                </div>
                {matches.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-text-tertiary">
                    No matching repository. You can type any valid repository name.
                  </div>
                ) : (
                  matches.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setRepo(r.full_name)
                        setRef(r.branch || 'main')
                        setPickerOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-bg flex items-center gap-2 border-b border-border/40 last:border-0"
                    >
                      <span className="font-mono text-xs text-text-primary truncate">
                        {r.full_name}
                      </span>
                      {r.private && (
                        <Lock size={11} className="text-text-tertiary flex-shrink-0" />
                      )}
                      <span className="ml-auto font-mono text-[10px] text-text-tertiary flex-shrink-0">
                        {r.branch}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {repo.trim() !== '' && !valid && (
            <div className="mt-1 font-mono text-[11px] text-status-gap">
              Expected standard format: owner/repository
            </div>
          )}
        </div>

        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="main"
          spellCheck={false}
          className="w-[110px] bg-bg border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors"
        />

        <button
          onClick={() => triggerScan(repo.trim(), ref.trim() || 'main')}
          disabled={busy || !valid}
          className="px-4 py-1.5 rounded text-xs font-medium text-bg bg-text-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center gap-1.5 shadow-xs"
        >
          {busy ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Scanning…</span>
            </>
          ) : (
            <>
              <Play size={12} />
              <span>Trigger Scan</span>
            </>
          )}
        </button>

        {(busy || status === 'rejected') && (
          <button
            onClick={() => cancelActive()}
            title="Stop the currently running scan and free the slot for a new one"
            className="px-3 py-1.5 rounded text-xs font-medium text-text-secondary border border-border bg-bg hover:bg-surface-elevated hover:text-status-gap transition-colors"
          >
            Cancel scan
          </button>
        )}
      </div>

      {status !== 'idle' && (
        <div className="mt-4 rounded border border-border bg-bg p-3 text-xs max-h-[280px] overflow-y-auto font-mono">
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-border/80 text-[10px] text-text-tertiary uppercase">
            <Terminal size={12} />
            <span>Telemetry SSE Stream // {repo}</span>
          </div>

          <div className="space-y-1 text-text-secondary text-[11px]">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-text-primary">[{log.event}]</span>
                <span>{log.message || log.error || 'stream packet received'}</span>
              </div>
            ))}
            {busy && !reconnecting && <div className="text-text-tertiary animate-pulse">_ scan in progress</div>}
            {busy && reconnecting && (
              <div className="text-status-warning flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                <span>Connection interrupted — reconnecting (attempt {reconnecting.attempt})…</span>
              </div>
            )}
          </div>

          {status === 'completed' && (
            <div className="mt-3 pt-2 border-t border-border flex items-center gap-2 text-status-compliant font-medium text-xs">
              <CheckCircle2 size={13} />
              <span>Scan complete. Compliance knowledge graph and findings ledger updated.</span>
            </div>
          )}
          {status === 'failed' && (
            <div className="mt-3 pt-2 border-t border-border flex items-center gap-2 text-status-gap font-medium text-xs">
              <AlertTriangle size={13} />
              <span>Scan failed: {error}</span>
            </div>
          )}
          {status === 'cancelled' && (
            <div className="mt-3 pt-2 border-t border-border flex items-center gap-2 text-text-secondary font-medium text-xs">
              <AlertTriangle size={13} />
              <span>Scan cancelled. You can start a new scan now.</span>
            </div>
          )}
          {status === 'rejected' && (
            <div className="mt-3 pt-2 border-t border-border flex items-center gap-2 text-status-warning font-medium text-xs">
              <AlertTriangle size={13} />
              <span>{error}</span>
            </div>
          )}
          {status === 'connection_lost' && (
            <div className="mt-3 pt-2 border-t border-border flex items-center gap-2 text-status-warning font-medium text-xs">
              <AlertTriangle size={13} />
              <span>{error || 'Lost the connection to the scan progress stream. The scan may still be running on the server.'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
