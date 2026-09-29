import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * A modal confirmation with proper dialog semantics: role="alertdialog",
 * labelled and described, Escape and the backdrop cancel, focus moves
 * into the dialog (the cancel button, so Enter never confirms by accident)
 * and is trapped there, and returns to whatever had it on close.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  tone = 'primary',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const bodyId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 font-sans"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-[520px] rounded-md border border-border bg-surface-elevated shadow-2xl p-5 sm:p-6 text-xs"
      >
        <h2 id={titleId} className="font-serif text-title-lg text-text-primary">
          {title}
        </h2>
        <div id={bodyId} className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-text-secondary">
          {children}
        </div>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 py-2 rounded border border-border text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className={`px-3.5 py-2 rounded text-xs font-medium disabled:opacity-60 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated ${
              tone === 'danger'
                ? 'bg-status-gap text-white hover:opacity-90 focus-visible:ring-status-gap'
                : 'bg-text-primary text-bg hover:opacity-90 focus-visible:ring-text-tertiary'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
