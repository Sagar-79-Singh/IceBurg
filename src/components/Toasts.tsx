import { create } from 'zustand'
import { CloseIcon } from './icons.tsx'
import { useT } from '../lib/useT.ts'

// Only for things that happened and are now gone: a model pulled, a key saved.
// Problems that need a decision live in the dialog, not here.
interface ToastItem {
  id: string
  message: string
}

interface ToastsState {
  items: ToastItem[]
  push(message: string): void
  dismiss(id: string): void
}

export const useToasts = create<ToastsState>()((set) => ({
  items: [],
  push(message: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((state) => ({ items: [...state.items, { id, message }] }))
    setTimeout(() => {
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
    }, 4000)
  },
  dismiss(id: string) {
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },
}))

export function toast(message: string) {
  useToasts.getState().push(message)
}

export default function Toasts() {
  const { t } = useT()
  const items = useToasts((state) => state.items)
  const dismiss = useToasts((state) => state.dismiss)
  const [latest] = items.slice(-1)

  if (!items.length) return null

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[80] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      {latest && (
        <div className="pointer-events-auto flex items-center gap-4 border border-line-strong border-l-2 border-l-melt bg-glacier px-3.5 py-2.5 text-base">
          <span>{latest.message}</span>
          <button
            type="button"
            onClick={() => dismiss(latest.id)}
            className="tap-bare p-1 h-6 w-6"
            aria-label={t('toast_dismiss')}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  )
}
