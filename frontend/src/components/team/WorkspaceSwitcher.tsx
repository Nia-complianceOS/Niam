import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { RoleBadge } from './RoleBadge'

/**
 * Which workspace this browser is acting in. Rendered only for people in
 * more than one; everyone else has nothing to switch.
 *
 * Switching reloads the app (AuthContext.switchWorkspace) rather than
 * swapping state in place, so no page can show one workspace's data under
 * another's name, even for a frame.
 */
export function WorkspaceSwitcher({ className = '' }: { className?: string }) {
  const { workspaces, workspaceId, role, switchWorkspace } = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (workspaces.length < 2) return null

  const current = workspaces.find((w) => w.workspace_id === workspaceId) ?? workspaces[0]

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Workspace: ${current.name}. Switch workspace`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 max-w-[260px] px-2.5 py-1 rounded border border-border bg-bg-subtle hover:bg-surface text-xs text-text-primary transition-colors"
      >
        <span className="truncate">{current.name}</span>
        <RoleBadge role={role ?? current.role} />
        <ChevronsUpDown size={12} className="text-text-tertiary flex-shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 mt-1.5 w-[280px] rounded-md border border-border bg-bg-elevated shadow-lg z-30 py-1"
        >
          <div className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">Workspaces</div>
          <ul>
            {workspaces.map((w) => {
              const active = w.workspace_id === current.workspace_id
              return (
                <li key={w.workspace_id}>
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => {
                      setOpen(false)
                      if (!active) switchWorkspace(w.workspace_id)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-primary hover:bg-surface transition-colors"
                  >
                    <span className="w-3.5 flex-shrink-0">
                      {active && <Check size={13} className="text-text-primary" aria-hidden="true" />}
                    </span>
                    <span className="truncate flex-1">
                      {w.name}
                      {w.personal && <span className="text-text-tertiary"> · personal</span>}
                    </span>
                    <RoleBadge role={w.role} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
