import { useCallback, useEffect, useState } from 'react'
import { Loader2, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { getInvites, getTeam, removeMember, updateTeam } from '@/services/api/client'
import type { InviteSummary, TeamResponse } from '@/types/api'
import { PageHeader } from '@/components/shared/PageStates'
import { MembersTable } from '@/components/team/MembersTable'
import { InviteCreator, InviteList } from '@/components/team/InvitePanel'
import { RoleBadge } from '@/components/team/RoleBadge'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/components/team/roles'
import {
  InlineError,
  Panel,
  SectionHeading,
  Toggle,
  buttonDanger,
  buttonSecondary,
  inputClass,
} from '@/components/team/ui'
import { useSEO } from '@/hooks/useSEO'
import type { WorkspaceRole } from '@/types/api'

const ROLE_ORDER: WorkspaceRole[] = ['owner', 'legal', 'member']

export default function Team() {
  useSEO({ title: 'Team', description: 'Members, roles and invitations for this Niam workspace.' })

  const { userId, workspaces, switchWorkspace } = useAuth()
  const [team, setTeam] = useState<TeamResponse | null>(null)
  const [invites, setInvites] = useState<InviteSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const isOwner = team?.my_role === 'owner'

  useEffect(() => {
    let live = true
    setLoading(true)
    setLoadError(null)
    getTeam()
      .then(async (t) => {
        const inv = t.my_role === 'owner' ? await getInvites().catch(() => []) : []
        if (!live) return
        setTeam(t)
        setInvites(inv)
      })
      .catch((err: Error) => live && setLoadError(err.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [userId, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const reloadInvites = useCallback(() => {
    getInvites()
      .then(setInvites)
      .catch(() => undefined)
  }, [])

  if (loading && !team) {
    return (
      <div className="max-w-[880px] py-16 flex items-center gap-2 text-xs text-text-tertiary" aria-live="polite">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading team…
      </div>
    )
  }

  if (loadError || !team) {
    return (
      <div className="max-w-[880px]">
        <PageHeader eyebrow="Workspace" title="Team" subtitle="Members, roles and invitations." />
        <Panel className="p-5 border-status-gap/30 bg-status-gap/5">
          <p className="text-sm text-text-secondary mb-3">{loadError || 'Could not load the team.'}</p>
          <button type="button" onClick={reload} className={buttonSecondary}>
            <RefreshCw size={13} aria-hidden="true" /> Try again
          </button>
        </Panel>
      </div>
    )
  }

  const creatorId = team.workspace.id
  const personal = workspaces.find((w) => w.personal)
  const canLeave = team.my_user_id !== creatorId

  return (
    <div className="max-w-[880px] w-full space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title={team.workspace.name || 'Team'}
        subtitle="Who can scan, review and approve fixes in this workspace. Each person signs in with their own account."
      />

      <div className="flex flex-wrap items-center gap-2 -mt-4 text-xs text-text-secondary">
        <span>Your role:</span>
        <RoleBadge role={team.my_role} />
        <span className="text-text-tertiary">— {ROLE_DESCRIPTION[team.my_role]}</span>
      </div>

      {isOwner && <WorkspaceName team={team} onSaved={reload} />}

      <section aria-labelledby="members-heading">
        <SectionHeading
          id="members-heading"
          eyebrow={`${team.members.length} ${team.members.length === 1 ? 'person' : 'people'}`}
          title="Members"
        />
        <Panel>
          <MembersTable
            members={team.members}
            creatorId={creatorId}
            myUserId={team.my_user_id}
            isOwner={isOwner}
            onChanged={reload}
          />
        </Panel>
      </section>

      {isOwner && (
        <section aria-label="Invite people">
          <SectionHeading eyebrow="Invitations" title="Invite someone" />
          <Panel className="divide-y divide-border">
            <InviteCreator onCreated={reloadInvites} />
            <div>
              <div className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">Recent invites</div>
              <InviteList invites={invites} onChanged={reloadInvites} />
            </div>
          </Panel>
        </section>
      )}

      <ApprovalSetting team={team} isOwner={isOwner} onSaved={reload} />

      <section aria-label="Roles explained">
        <SectionHeading eyebrow="Reference" title="What each role can do" />
        <Panel>
          <dl className="divide-y divide-border-subtle">
            {ROLE_ORDER.map((r) => (
              <div key={r} className="px-4 py-2.5 grid grid-cols-[130px_1fr] gap-3 text-xs">
                <dt className="text-text-primary font-medium">{ROLE_LABEL[r]}</dt>
                <dd className="text-text-secondary">{ROLE_DESCRIPTION[r]}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </section>

      {canLeave && (
        <LeaveWorkspace
          name={team.workspace.name}
          userId={team.my_user_id}
          onLeft={() => switchWorkspace(personal?.workspace_id ?? team.my_user_id)}
        />
      )}
    </div>
  )
}

function WorkspaceName({ team, onSaved }: { team: TeamResponse; onSaved: () => void }) {
  const [name, setName] = useState(team.workspace.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = name.trim() !== (team.workspace.name ?? '') && name.trim().length > 0

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!changed) return
    setBusy(true)
    setError(null)
    try {
      await updateTeam({ name: name.trim() })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-1.5">
      <label htmlFor="workspace-name" className="block text-xs font-medium text-text-secondary">
        Workspace name
      </label>
      <div className="flex gap-2 max-w-md">
        <input
          id="workspace-name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} flex-1`}
        />
        <button type="submit" disabled={!changed || busy} className={buttonSecondary}>
          {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
          Save
        </button>
      </div>
      <InlineError>{error}</InlineError>
    </form>
  )
}

function ApprovalSetting({ team, isOwner, onSaved }: { team: TeamResponse; isOwner: boolean; onSaved: () => void }) {
  const serverValue = !!team.workspace.settings?.require_distinct_approvers
  const [value, setValue] = useState(serverValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setValue(serverValue), [serverValue])

  const change = async (next: boolean) => {
    setValue(next)
    setBusy(true)
    setError(null)
    try {
      await updateTeam({ require_distinct_approvers: next })
      onSaved()
    } catch (err) {
      setValue(!next)
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Approval policy">
      <SectionHeading eyebrow="Approval policy" title="Two-person review" />
      <Panel className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div id="distinct-label" className="text-xs font-medium text-text-primary">
              Require a different person for owner approval than for legal approval
            </div>
            <p id="distinct-help" className="text-xs text-text-secondary leading-relaxed mt-1 max-w-xl">
              By default a solo owner can approve both stages of a drafted fix; the record then labels it self-approved. Turn this on to require a second person.
            </p>
            {!isOwner && <p className="text-[11px] text-text-tertiary mt-1.5">Only an owner can change this.</p>}
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {busy && <Loader2 size={12} className="animate-spin text-text-tertiary" aria-hidden="true" />}
            <Toggle
              id="distinct-approvers"
              checked={value}
              disabled={!isOwner || busy}
              onChange={(v) => void change(v)}
              labelledBy="distinct-label"
              describedBy="distinct-help"
            />
          </div>
        </div>
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      </Panel>
    </section>
  )
}

function LeaveWorkspace({ name, userId, onLeft }: { name: string; userId: string; onLeft: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const leave = async () => {
    setBusy(true)
    setError(null)
    try {
      await removeMember(userId)
      onLeft()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <section aria-label="Leave workspace" className="pt-2 border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <div className="text-xs text-text-secondary max-w-lg">
          Leaving removes your access to {name || 'this workspace'}. You&apos;ll need a new invite to come back.
        </div>
        {confirming ? (
          <span className="inline-flex gap-2">
            <button type="button" onClick={() => void leave()} disabled={busy} className={buttonDanger}>
              {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              Leave {name || 'workspace'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={buttonSecondary}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={buttonSecondary}>
            <LogOut size={13} aria-hidden="true" /> Leave workspace
          </button>
        )}
      </div>
      <div className="mt-2">
        <InlineError>{error}</InlineError>
      </div>
    </section>
  )
}
