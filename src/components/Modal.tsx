import type React from 'react'
import { useEffect, useRef } from 'react'
import { CloseIcon } from './icons.tsx'
import { useT } from '../lib/useT.ts'

// One dialog shell: focus moves in, Tab stays inside, Escape closes, focus returns
// to whatever opened it.
export default function Modal({ title, description, onClose, children, width = 'w-[34rem]' }: { title: string; description?: string; onClose: () => void; children?: React.ReactNode; width?: string }) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const opener = useRef<Element | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const { t } = useT()

  // Mount only: move focus in, keep Tab inside, Escape closes. Re-running this on
  // every render would pull focus out of whatever the user is typing in.
  useEffect(() => {
    opener.current = document.activeElement
    const node = panelRef.current
    const first = (node?.querySelector('[data-autofocus]') || node?.querySelector('button, input, textarea, select, a[href]')) as HTMLElement | null | undefined
    first?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const focusables = [...node.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null)
      const firstEl = focusables[0]
      const lastEl = focusables[focusables.length - 1]
      if (!firstEl || !lastEl) return
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="overlay">
      <div
        className="overlay-backdrop"
        style={{ background: 'var(--scrim)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`pane relative my-auto max-h-[calc(100vh-2rem)] w-full ${width} overflow-y-auto`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-glacier px-5 py-3">
          <div>
            <h2 className="display text-lead">{title}</h2>
            {description && <p className="mt-0.5 text-base text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="tap-bare p-1" aria-label={t('modal_close')}>
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
