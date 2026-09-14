import { useState } from 'react'
import { AlertTriangle, Github } from 'lucide-react'
import type { GitHubConnection } from '@/types/api'

export function GitHubAccountBar({
  connection,
  actionError,
  onDisconnect,
}: {
  connection: GitHubConnection
  actionError: string | null
  onDisconnect: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const initials = (connection.login ?? '?').slice(0, 2).toUpperCase()

  return (
    <div className="p-3.5 rounded border border-border bg-surface mb-4 font-sans text-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {connection.avatar_url ? (
            <img
              src={connection.avatar_url}
              alt={`${connection.login ?? 'User'}'s GitHub avatar`}
              width={32}
              height={32}
              loading="lazy"
              className="w-8 h-8 rounded border border-border flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded border border-border bg-bg flex items-center justify-center font-mono text-[11px] font-medium text-text-primary flex-shrink-0">
              {initials}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-text-primary">
              <Github size={13} className="text-text-tertiary" />
              <span>{connection.login ?? 'GitHub Account'}</span>
              <span className="font-mono text-[9px] uppercase px-1 py-0.2 rounded border border-status-compliant/30 bg-status-compliant/10 text-status-compliant">
                Active Source
              </span>
            </div>
            <div className="font-mono text-[11px] text-text-tertiary mt-0.5">
              Connected{connection.connected_at ? ` on ${formatDate(connection.connected_at)}` : ''}
              {connection.method === 'token' ? ' via fine-grained token' : ' via OAuth'}
            </div>
          </div>
        </div>

        {!confirming && (
          <button
            onClick={() => setConfirming(true)}
            className="px-2.5 py-1 rounded border border-border text-xs text-text-secondary hover:text-status-gap hover:border-status-gap/30 hover:bg-status-gap/5 transition-colors"
          >
            Disconnect Account
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <div className="font-medium text-text-primary">
            Disconnect {connection.login ?? 'this GitHub account'}?
          </div>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            This removes the stored token from Niam. Ongoing and historical compliance findings remain recorded in your ledger. To revoke application access completely, configure permissions inside your GitHub Settings.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                setConfirming(false)
                onDisconnect()
              }}
              className="px-3 py-1 rounded border border-status-gap/40 bg-status-gap/10 text-status-gap hover:bg-status-gap/20 transition-colors font-medium"
            >
              Confirm Disconnect
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1 rounded border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="mt-2.5 p-2 rounded border border-status-gap/30 bg-status-gap/10 text-status-gap flex items-center gap-2">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
    </div>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
