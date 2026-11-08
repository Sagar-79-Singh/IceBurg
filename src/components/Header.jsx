import ModelMenu from './ModelMenu.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import BergMark from './BergMark.jsx'
import { useChat } from '../store/chat.js'

// One row, one line of text, no icon toolbar. The mark on the left is the app
// icon, doing inside the window what it does on the taskbar.
export default function Header({ onOpenSettings, onNewChat, sidebarOpen, onToggleSidebar }) {
  const streaming = useChat((state) => state.streamingId !== null)
  // On macOS the window's own buttons sit in this row, so the mark starts after
  // them instead of underneath them.
  const onMac = typeof window !== 'undefined' && window.iceburg?.platform === 'darwin'

  return (
    <header
      className={`relative z-30 flex h-[58px] shrink-0 items-center gap-5 border-b border-line pr-5 ${
        onMac ? 'pl-[92px]' : 'pl-5'
      }`}
      style={{ WebkitAppRegion: 'drag', background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' }}>
        <BergMark size={20} />
        {/* The mark always shows; the word appears once there is room for it. */}
        <span className="display hidden text-[1.0625rem] tracking-[-0.02em] text-frost min-[1040px]:inline">
          IceBurg
        </span>
      </div>

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line-strong" />

      <div className="flex min-w-0 items-center gap-4" style={{ WebkitAppRegion: 'no-drag' }}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="tap-bare hidden shrink-0 md:inline-flex"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? 'Hide chats' : 'Show chats'}
        >
          Chats
        </button>
        <span aria-hidden="true" className="hidden h-4 w-px bg-line md:block" />
        <ModelMenu onOpenSettings={onOpenSettings} />
      </div>

      <div
        className="ml-auto flex shrink-0 items-center gap-5"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {streaming && <span className="meta hidden lg:block">streaming</span>}
        <button type="button" onClick={onNewChat} className="tap-bare">
          New chat
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={onOpenSettings}
          className="tap-bare"
          aria-label="Providers and settings"
        >
          Settings
        </button>
      </div>
    </header>
  )
}
