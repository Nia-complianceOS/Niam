import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Github } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { GitHubConnection } from '@/types/api'

/**
 * Whose GitHub account this is, and how to stop using it.
 *
 * Naming the account matters more than it looks: everything else on this
 * page — which repositories are listed, whose name a pull request is
 * opened under — follows from this one connection, and on a shared machine
 * "connected" without "connected as whom" is exactly the ambiguity that
 * lets somebody scan against the wrong account.
 *
 * Disconnecting asks first, and the confirmation is written to close the
 * gap between what "disconnect" sounds like and what it does. It removes
 * the sign-in stored here. It does NOT delete the findings that sign-in
 * already produced, and it cannot revoke anything at GitHub. Someone who
 * disconnects believing their data is gone has been misled by us, so the
 * confirmation says where their data actually lives and how to delete it
 * for real.
 */
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
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-3.5 flex-wrap">
        {connection.avatar_url ? (
          <img
            src={connection.avatar_url}
            alt={`${connection.login ?? 'User'}'s GitHub avatar`}
            width={36}
            height={36}
            loading="lazy"
            className="w-9 h-9 rounded-full border border-border-soft flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-border-soft flex items-center justify-center text-[11px] font-semibold text-text-dim flex-shrink-0">
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            <Github size={14} className="text-text-faint" />
            {connection.login ?? 'GitHub account'}
          </div>
          <div className="text-[12px] text-text-faint mt-0.5">
            Connected{connection.connected_at ? ` on ${formatDate(connection.connected_at)}` : ''}
            {connection.method === 'token' ? ' with a pasted access token' : ''}
          </div>
        </div>

        {!confirming && (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Disconnect
          </Button>
        )}
      </div>

      {confirming && (
        <div className="mt-3.5 rounded-[10px] bg-black/30 border border-border-soft p-4">
          <div className="text-[13px] font-semibold">
            Disconnect {connection.login ?? 'this GitHub account'}?
          </div>
          <div className="text-[12.5px] text-text-dim leading-relaxed mt-1.5 max-w-[620px]">
            This removes the sign-in Niam has stored. It will stop reading your
            repositories and you will not be able to scan or open a pull
            request until you connect again — which you can do at any time.
          </div>
          <div className="text-[12.5px] text-text-dim leading-relaxed mt-2.5 max-w-[620px]">
            <span className="text-text font-semibold">
              It does not delete anything Niam has already found.
            </span>{' '}
            Your scanned repositories, their findings and any fixes drafted for
            them all stay exactly as they are. To delete those, remove a
            repository from the list below, or use{' '}
            <Link
              to="/settings"
              className="text-accent-blue underline underline-offset-2 hover:brightness-110"
            >
              Delete all findings
            </Link>{' '}
            in Settings.
          </div>
          <div className="text-[12.5px] text-text-faint leading-relaxed mt-2.5 max-w-[620px]">
            It also does not change anything at GitHub. If you want to withdraw
            Niam's access there as well, do that from your GitHub account
            settings.
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              className="text-accent-red"
              onClick={() => {
                setConfirming(false)
                onDisconnect()
              }}
            >
              Disconnect
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it connected
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="mt-3 flex items-start gap-2.5 px-3.5 py-2.5 rounded-[10px] bg-accent-red/10 border border-accent-red/30 text-[12.5px] leading-relaxed text-accent-red">
          <AlertTriangle size={15} className="mt-[1px] flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
    </Card>
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
