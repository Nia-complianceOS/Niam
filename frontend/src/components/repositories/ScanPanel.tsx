import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Lock, Search } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useScan } from '@/hooks/useScan'
import { useRepos } from '@/hooks/useRepos'

const REPO_RE = /^[\w.\-]+\/[\w.\-]+$/

/**
 * Start a scan against any repository you name.
 *
 * Previously the only way to trigger a scan was a button attached to a row
 * in the repository list -- and that list was four invented `nova-labs/*`
 * repos that do not exist, so every click ended in a GitHub 404. There was
 * no path in the UI to scan a real repository at all. Taking the repo
 * directly is also what makes an empty repository list harmless.
 */
export function ScanPanel() {
  const [repo, setRepo] = useState('')
  const [ref, setRef] = useState('main')
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { status, logs, error, triggerScan } = useScan()
  // Real repositories the configured token can see. The field still
  // accepts a typed owner/repo, so this is a convenience rather than a
  // constraint -- and it degrades to nothing if the token cannot list.
  const { data: repoData } = useRepos()

  const busy = status === 'starting' || status === 'running'
  const valid = REPO_RE.test(repo.trim())

  const matches = useMemo(() => {
    const all = repoData?.repositories ?? []
    const q = repo.trim().toLowerCase()
    const filtered = q
      ? all.filter((r) => r.full_name.toLowerCase().includes(q))
      : all
    return filtered
  }, [repoData, repo])

  return (
    <Card className="p-5 mb-4">
      <div className="font-display text-[15px] font-semibold mb-1">Scan a repository</div>
      <div className="text-xs text-text-faint mb-4">
        Reads the repo through the GitHub API using your configured token. Nothing is written to
        the repository.
      </div>

      <div className="flex flex-wrap items-start gap-2">
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
              placeholder="owner/repo — or pick from the list"
              spellCheck={false}
              className="w-full bg-black/20 border border-border-soft rounded-[10px] px-3 py-2 pr-9 text-[14px] font-mono text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
            />
            {(repoData?.repositories.length ?? 0) > 0 && (
              <button
                type="button"
                aria-label="Show repositories"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPickerOpen((o) => !o)
                  inputRef.current?.focus()
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded text-text-faint hover:text-text"
              >
                <ChevronDown size={15} />
              </button>
            )}

            {pickerOpen && (repoData?.repositories.length ?? 0) > 0 && (
              /* ~10 rows then scroll, so a hundred repositories do not push
                 the scan log off the page. */
              <div className="absolute z-20 mt-1 w-full max-h-[300px] overflow-y-auto rounded-[10px] border border-border bg-bg-elevated shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
                <div className="px-3 py-2 text-[11px] text-text-faint border-b border-border-soft flex items-center gap-1.5 sticky top-0 bg-bg-elevated">
                  <Search size={12} />
                  {matches.length} of {repoData?.repositories.length} repositories
                  {repoData?.truncated ? ' (first 100)' : ''}
                </div>
                {matches.length === 0 ? (
                  <div className="px-3 py-3 text-[12.5px] text-text-faint">
                    No match. You can still type any owner/repo the token can
                    read.
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
                      className="w-full text-left px-3 py-2 hover:bg-white/[0.05] flex items-center gap-2"
                    >
                      <span className="font-mono text-[13px] truncate">
                        {r.full_name}
                      </span>
                      {r.private && (
                        <Lock size={11} className="text-text-faint flex-shrink-0" />
                      )}
                      <span className="ml-auto text-[11px] text-text-faint flex-shrink-0">
                        {r.branch}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {repo.trim() !== '' && !valid && (
            <div className="mt-1.5 text-xs text-accent-red">
              Expected the form <span className="font-mono">owner/repo</span>.
            </div>
          )}
        </div>

        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="main"
          spellCheck={false}
          className="w-[140px] bg-black/20 border border-border-soft rounded-[10px] px-3 py-2 text-[14px] font-mono text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
        />

        <button
          onClick={() => triggerScan(repo.trim(), ref.trim() || 'main')}
          disabled={busy || !valid}
          className="px-4 py-2 rounded-[10px] text-sm font-semibold text-white bg-accent-blue hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {busy ? 'Scanning…' : 'Start scan'}
        </button>
      </div>

      {status !== 'idle' && (
        <div className="mt-4 rounded-[10px] bg-black/40 border border-border-soft p-3 text-sm max-h-[320px] overflow-y-auto">
          <div className="font-mono text-text-dim space-y-1">
            {logs.map((log, i) => (
              <div key={i}>
                <span className="text-accent-blue">[{log.event}]</span>{' '}
                {log.message || log.error || 'event received'}
              </div>
            ))}
            {busy && <div className="animate-pulse text-text-faint">_</div>}
          </div>

          {status === 'completed' && (
            <div className="mt-3 text-accent-green font-semibold text-sm">
              Scan completed. The graph now reflects this repository.
            </div>
          )}
          {status === 'failed' && (
            <div className="mt-3 text-accent-red font-semibold text-sm">Scan failed: {error}</div>
          )}
          {status === 'connection_lost' && (
            <div className="mt-3 text-accent-amber font-semibold text-sm">
              Lost the scan stream. The scan may still be running on the server.
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
