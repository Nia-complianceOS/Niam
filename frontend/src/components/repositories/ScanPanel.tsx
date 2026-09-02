import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { useScan } from '@/hooks/useScan'

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
  const { status, logs, error, triggerScan } = useScan()

  const busy = status === 'starting' || status === 'running'
  const valid = REPO_RE.test(repo.trim())

  return (
    <Card className="p-5 mb-4">
      <div className="font-display text-[15px] font-semibold mb-1">Scan a repository</div>
      <div className="text-xs text-text-faint mb-4">
        Reads the repo through the GitHub API using your configured token. Nothing is written to
        the repository.
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-[260px]">
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/repo"
            spellCheck={false}
            className="w-full bg-black/20 border border-border-soft rounded-[10px] px-3 py-2 text-[14px] font-mono text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
          />
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
