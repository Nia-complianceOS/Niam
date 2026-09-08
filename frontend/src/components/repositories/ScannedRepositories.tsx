import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { httpStatus, isAbortError, removeScannedRepository } from '@/services/api/client'
import { describeLastScan, summariseRemoval } from '@/lib/workspaceMessages'
import type { RemovalResponse, ScannedRepository } from '@/types/api'

/**
 * What this account has actually scanned, and the only way to undo it.
 *
 * Until this existed a scan was permanent: a repository scanned by mistake
 * kept its vendors, data types and findings on the account forever, and
 * because every scan from the UI merged into one system, a second
 * repository quietly blended into the first. This is the list that makes
 * both visible and the second one fixable.
 *
 * `system_name` never reaches the screen. It is a slug the graph uses as a
 * key, and it is sent straight back to the delete call; the person reading
 * this recognises `owner/repo` and nothing else.
 *
 * Removal is destructive and irreversible, so it confirms in place — not
 * with a browser confirm(), which cannot name what goes and what stays —
 * and reports afterwards using the counts the server returns rather than
 * the ones the UI assumed.
 */
export function ScannedRepositories({
  repositories,
  loading,
  error,
  onRemoved,
}: {
  repositories: ScannedRepository[]
  loading: boolean
  error: string | null
  /** Refresh everything downstream of the graph: this list, and the scores
   *  and scan dates on the repository list above. */
  onRemoved: () => void
}) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [result, setResult] = useState<RemovalResponse | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const remove = async (repo: ScannedRepository) => {
    setRemoving(repo.system_name)
    setResult(null)
    setFailure(null)
    try {
      setResult(await removeScannedRepository(repo.system_name))
      onRemoved()
    } catch (err) {
      if (isAbortError(err)) return
      // The one failure that is not a fault: the repository is already
      // gone, which means this list was out of date. Refreshing it is the
      // whole fix, so say that rather than reporting an error.
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
    <Card className="p-5 mb-4">
      <div className="font-display text-[15px] font-semibold mb-1">
        Scanned repositories
      </div>
      <div className="text-xs text-text-faint mb-4">
        Everything Niam has mapped for this account. Each repository is kept
        separate, so removing one leaves the others exactly as they are.
      </div>

      {result && <RemovalReceipt result={result} />}
      {failure && (
        <div className="mb-3 flex items-start gap-2.5 px-3.5 py-2.5 rounded-[10px] bg-accent-amber/10 border border-accent-amber/30 text-[12.5px] leading-relaxed text-accent-amber">
          <AlertTriangle size={15} className="mt-[1px] flex-shrink-0" />
          <span>{failure}</span>
        </div>
      )}

      {loading ? (
        <div className="text-[12.5px] text-text-dim font-mono py-2">
          Loading what you've scanned…
        </div>
      ) : error ? (
        <div className="rounded-[10px] bg-black/30 border border-border-soft p-3.5 text-[12.5px] leading-relaxed">
          <div className="text-accent-amber font-semibold mb-1">
            We couldn't list what you've scanned
          </div>
          <div className="text-text-dim">
            {error} Nothing has been changed — your findings are still there.
          </div>
        </div>
      ) : repositories.length === 0 ? (
        <div className="rounded-[10px] bg-black/30 border border-border-soft p-4 text-[12.5px] leading-relaxed">
          <div className="font-semibold text-[13px] mb-1">Nothing scanned yet</div>
          <div className="text-text-dim max-w-[560px]">
            Your GitHub account is connected, but Niam has not read any code
            yet. Choose a repository in the panel above and start a scan — what
            it finds will be listed here, and you can remove it again at any
            time.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {repositories.map((repo) => (
            <ScannedRepositoryRow
              key={repo.system_name}
              repo={repo}
              busy={removing === repo.system_name}
              // One removal at a time. A second confirmation opened while
              // the first is in flight would be confirming against a list
              // that is about to change underneath it.
              disabled={removing !== null && removing !== repo.system_name}
              onConfirm={() => void remove(repo)}
            />
          ))}
        </div>
      )}
    </Card>
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
    <div className="rounded-[10px] bg-black/30 border border-border-soft p-3.5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate">{repo.repo}</div>
          <div className="text-[12px] text-text-faint mt-0.5">
            {describeLastScan(repo)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge tone="muted">{count(repo.data_types, 'data type', 'data types')}</Badge>
            <Badge tone="muted">{count(repo.vendors, 'vendor', 'vendors')}</Badge>
            <Badge tone={repo.gaps > 0 ? 'gap' : 'muted'}>
              {count(repo.gaps, 'finding', 'findings')}
            </Badge>
          </div>
        </div>

        {!confirming && (
          <Button
            variant="ghost"
            className="text-accent-red flex-shrink-0"
            disabled={disabled || busy}
            onClick={() => setConfirming(true)}
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Removing…
              </>
            ) : (
              'Remove'
            )}
          </Button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 rounded-[10px] border border-accent-red/30 bg-accent-red/[0.06] p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-accent-red mt-[2px] flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-accent-red">
                Remove {repo.repo} from Niam?
              </div>
              <div className="text-[12.5px] text-text-dim leading-relaxed mt-1 max-w-[620px]">
                This cannot be undone. You can scan {repo.repo} again later, but
                everything Niam has found in it so far will be gone.
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 mt-3.5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2">
                What this deletes
              </div>
              <ul className="flex flex-col gap-1.5 text-[12.5px] text-text-dim leading-relaxed">
                <li>
                  Everything Niam found in {repo.repo} — the personal data it
                  handles, the outside services it sends that data to, and every
                  finding raised against it.
                </li>
                <li>
                  Any fix Niam drafted for those findings. A pull request you
                  have already opened on GitHub stays open there; Niam simply
                  stops tracking it.
                </li>
                <li>The record of when this repository was scanned.</li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2">
                What this leaves alone
              </div>
              <ul className="flex flex-col gap-1.5 text-[12.5px] text-text-dim leading-relaxed">
                <li>
                  Your GitHub connection, and the repository itself. Nothing is
                  changed in your code.
                </li>
                <li>
                  Every other repository you have scanned — including anything
                  they have in common with this one, such as a service both send
                  data to.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setConfirming(false)
                onConfirm()
              }}
              disabled={busy}
              className="px-4 py-2 rounded-[10px] text-[13px] font-semibold text-white bg-accent-red hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Yes, remove {repo.repo}
            </button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * What actually went, counted by the server. A fixed "Removed." would read
 * the same whether eleven findings were deleted or none were, which is
 * exactly the reassurance nobody should be given after a destructive
 * action.
 */
function RemovalReceipt({ result }: { result: RemovalResponse }) {
  const summary = summariseRemoval(result.removed)
  const name = result.repo ?? 'That repository'

  return (
    <div className="mb-3 flex items-start gap-2.5 px-3.5 py-2.5 rounded-[10px] bg-accent-green/10 border border-accent-green/30 text-[12.5px] leading-relaxed text-accent-green">
      <CheckCircle2 size={15} className="mt-[1px] flex-shrink-0" />
      <div>
        <div className="font-semibold">{name} has been removed</div>
        <div className="text-accent-green/80">
          {summary
            ? `Deleted along with it: ${summary}.`
            : 'There was nothing else recorded against it.'}{' '}
          Your GitHub connection and your other repositories are untouched.
        </div>
      </div>
    </div>
  )
}
