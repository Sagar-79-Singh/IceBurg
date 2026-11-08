import { create } from 'zustand'
import { CloseIcon } from './icons.jsx'

// Only for things that happened and are now gone: a model pulled, a key saved.
// Problems that need a decision live in the dialog, not here.
export const useToasts = create((set) => ({
  items: [],
  push(message) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((state) => ({ items: [...state.items, { id, message }] }))
    setTimeout(() => {
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
    }, 4000)
  },
  dismiss(id) {
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },
}))

export function toast(message) {
  useToasts.getState().push(message)
}

export default function Toasts() {
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
        <div className="pointer-events-auto flex items-center gap-3 rounded border border-line-strong bg-glacier px-3 py-2 text-sm shadow-lg">
          <span>{latest.message}</span>
          <button
            type="button"
            onClick={() => dismiss(latest.id)}
            className="btn btn-quiet btn-icon h-6 w-6"
            aria-label="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  )
}
