import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { httpStatus, isAbortError, removeScannedRepository } from '@/services/api/client'
import { describeLastScan, summariseRemoval } from '@/lib/workspaceMessages'
import type { RemovalResponse, ScannedRepository } from '@/types/api'

export function ScannedRepositories({
  repositories,
  loading,
  error,
  onRemoved,
}: {
  repositories: ScannedRepository[]
  loading: boolean
  error: string | null
  onRemoved: () => void
}) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [result, setResult] = useState<RemovalResponse | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const totalRepos = repositories.length
  const totalDataTypes = repositories.reduce((sum, r) => sum + r.data_types, 0)
  const totalFindings = repositories.reduce((sum, r) => sum + r.gaps, 0)

  const remove = async (repo: ScannedRepository) => {
    setRemoving(repo.system_name)
    setResult(null)
    setFailure(null)
    try {
      setResult(await removeScannedRepository(repo.system_name))
      onRemoved()
    } catch (err) {
      if (isAbortError(err)) return
      if (httpStatus(err) === 404) {
        setFailure(
          `${repo.repo} had already been removed from this account. The list below is now up to date.`
        )
        onRemoved()
      } else {
        setFailure(`We couldn't remove ${repo.repo}. ${(err as Error).message}`)
      }
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="p-5 rounded border border-border bg-surface mb-4 font-sans shadow-xs">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
        <div>
          <h2 className="font-medium text-sm text-text-primary">Mapped Systems in Compliance Graph</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Repositories actively arbitrated against the DPDP Act. Each codebase is isolated in graph ontology.
          </p>
        </div>
        <span className="font-mono text-[10px] text-text-tertiary px-1.5 py-0.5 rounded border border-border bg-bg">
          ONTOLOGY LEDGER
        </span>
      </div>

      {result && <RemovalReceipt result={result} />}
      {failure && (
        <div className="mb-3 flex items-start gap-2 p-2.5 rounded border border-status-warning/30 bg-status-warning/10 text-xs text-status-warning">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{failure}</span>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-text-tertiary font-mono py-4">
          Loading mapped repositories…
        </div>
      ) : error ? (
        <div className="rounded border border-status-warning/30 bg-status-warning/5 p-3 text-xs text-text-secondary">
          <div className="text-status-warning font-medium mb-1">
            Unable to load scanned repositories
          </div>
          <div>{error} Existing graph nodes remain intact.</div>
        </div>
      ) : repositories.length === 0 ? (
        <div className="rounded border border-border bg-bg p-4 text-xs text-text-secondary space-y-1">
          <div className="font-medium text-text-primary">Zero Repositories Mapped</div>
          <p className="leading-relaxed">
            Choose a repository in the panel above and trigger a scan to populate your compliance graph.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-bg rounded border border-border font-mono text-[11px] text-text-tertiary">
            <span className="text-text-primary font-medium">{totalRepos} {totalRepos === 1 ? 'REPOSITORY' : 'REPOSITORIES'}</span>
            <span className="text-border">/</span>
            <span>{totalDataTypes} DATA TYPES</span>
            <span className="text-border">/</span>
            <span className={totalFindings > 0 ? 'text-status-gap font-medium' : 'text-status-compliant'}>
              {totalFindings} STATUTORY GAPS
            </span>
          </div>

          <div className="space-y-2">
            {repositories.map((repo) => (
              <ScannedRepositoryRow
                key={repo.system_name}
                repo={repo}
                busy={removing === repo.system_name}
                disabled={removing !== null && removing !== repo.system_name}
                onConfirm={() => void remove(repo)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function ScannedRepositoryRow({
  repo,
  busy,
  disabled,
  onConfirm,
}: {
  repo: ScannedRepository
  busy: boolean
  disabled: boolean
  onConfirm: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-3.5 rounded border border-border/80 bg-bg space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-mono font-medium text-text-primary truncate">{repo.repo}</div>
          <div className="font-mono text-[11px] text-text-tertiary mt-0.5">
            {describeLastScan(repo)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="px-1.5 py-0.2 rounded border border-entity-datatype/30 bg-entity-datatype/10 text-entity-datatype font-mono text-[10px]">
              {count(repo.data_types, 'data type', 'data types')}
            </span>
            <span className="px-1.5 py-0.2 rounded border border-entity-vendor/30 bg-entity-vendor/10 text-entity-vendor font-mono text-[10px]">
              {count(repo.vendors, 'vendor', 'vendors')}
            </span>
            <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
              repo.gaps > 0 
                ? 'border border-status-gap/30 bg-status-gap/10 text-status-gap' 
                : 'border border-status-compliant/30 bg-status-compliant/10 text-status-compliant'
            }`}>
              {count(repo.gaps, 'statutory gap', 'statutory gaps')}
            </span>
          </div>
        </div>

        {!confirming && (
          <button
            disabled={disabled || busy}
            onClick={() => setConfirming(true)}
            className="px-2.5 py-1 rounded border border-border text-xs text-text-secondary hover:text-status-gap hover:border-status-gap/30 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Removing…</span>
              </>
            ) : (
              <>
                <Trash2 size={12} />
                <span>Purge Node</span>
              </>
            )}
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 p-3 rounded border border-status-gap/30 bg-status-gap/5 space-y-2">
          <div className="flex items-start gap-2 text-status-gap text-xs font-medium">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>Purge {repo.repo} from statutory compliance graph?</span>
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            This will remove all AST entities, data egress edges, and unresolved compliance gaps associated with this codebase. Source code at GitHub remains untouched.
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                setConfirming(false)
                onConfirm()
              }}
              className="px-3 py-1 rounded border border-status-gap/40 bg-status-gap/10 text-status-gap text-xs hover:bg-status-gap/20 transition-colors font-medium"
            >
              Confirm Deletion
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1 rounded border border-border text-text-secondary text-xs hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RemovalReceipt({ result }: { result: RemovalResponse }) {
  return (
    <div className="mb-3 p-2.5 rounded border border-status-compliant/30 bg-status-compliant/10 text-xs text-status-compliant flex items-start gap-2">
      <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
      <span>{summariseRemoval(result.removed)}</span>
    </div>
  )
}
