import ModelMenu from './ModelMenu.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { GearIcon, PanelIcon, PlusIcon } from './icons.jsx'
import { useChat } from '../store/chat.js'

// The header answers one question: who am I talking to? Provider and model on the
// left, the few global actions on the right. It drags the window like a title bar.
export default function Header({ depth = 0, onOpenSettings, onNewChat, sidebarOpen, onToggleSidebar }) {
  const streaming = useChat((state) => state.streamingId !== null)

  return (
    <header
      className="relative z-30 flex h-11 shrink-0 items-center gap-2 border-b border-line px-2 transition-colors duration-300"
      style={{
        WebkitAppRegion: 'drag',
        backgroundColor: `color-mix(in oklab, var(--crevasse) ${Math.round((1 - depth * 0.55) * 100)}%, var(--abyss))`,
      }}
    >
      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' }}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="btn btn-quiet btn-icon"
          aria-label={sidebarOpen ? 'Hide chat list' : 'Show chat list'}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Hide chat list' : 'Show chat list'}
        >
          <PanelIcon />
        </button>
        <button
          type="button"
          onClick={onNewChat}
          className="btn btn-quiet btn-icon"
          aria-label="New chat"
          title="New chat"
        >
          <PlusIcon />
        </button>
      </div>

      <span aria-hidden="true" className="h-4 w-px bg-line" />

      <div style={{ WebkitAppRegion: 'no-drag' }} className="min-w-0">
        <ModelMenu onOpenSettings={onOpenSettings} />
      </div>

      <div className="ml-auto flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' }}>
        {streaming && <span className="mr-1 hidden text-xs text-muted sm:inline">Generating</span>}
        <ThemeToggle />
        <button
          type="button"
          onClick={onOpenSettings}
          className="btn btn-quiet btn-icon"
          aria-label="Providers and settings"
          title="Providers and settings"
        >
          <GearIcon />
        </button>
      </div>
    </header>
  )
}
