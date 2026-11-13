import ModelMenu from './ModelMenu.tsx'
import ThemeToggle from './ThemeToggle.tsx'
import BergMark from './BergMark.tsx'
import { useChat } from '../store/chat.ts'
import { useT } from '../lib/useT.ts'
import type { CSSProperties } from 'react'

// Electron-only style property (frameless window drag region). Not part of the
// CSS spec, so it is declared locally instead of widening every CSSProperties use.
type AppRegionStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

// One row, one line of text, no icon toolbar. The mark on the left is the app
// icon, doing inside the window what it does on the taskbar.
export default function Header({ onOpenSettings, onNewChat, sidebarOpen, onToggleSidebar }: { onOpenSettings: () => void; onNewChat: () => void; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const streaming = useChat((state) => state.streamingId !== null)
  // On macOS the window's own buttons sit in this row, so the mark starts after
  // them instead of underneath them.
  const onMac = typeof window !== 'undefined' && window.iceburg?.platform === 'darwin'
  const { t } = useT()

  return (
    <header
      className={`relative z-30 flex h-[58px] shrink-0 items-center gap-4 border-b border-line pr-4 min-[1040px]:gap-5 min-[1040px]:pr-5 ${
        onMac ? 'pl-[92px]' : 'pl-5'
      }`}
      style={{ WebkitAppRegion: 'drag', background: 'var(--surface)' } as AppRegionStyle}
    >
      <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}>
        <BergMark size={20} />
        {/* The mark always shows; the word appears once there is room for it. */}
        <span className="display hidden text-[1.0625rem] tracking-[-0.02em] text-frost min-[1040px]:inline">
          IceBurg
        </span>
      </div>

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line-strong" />

      <div className="flex min-w-0 items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="tap-bare hidden shrink-0 md:inline-flex"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? t('header_hide_chats') : t('header_show_chats')}
        >
          {t('header_chats')}
        </button>
        <span aria-hidden="true" className="hidden h-4 w-px bg-line md:block" />
        <ModelMenu onOpenSettings={onOpenSettings} />
      </div>

      <div
        className="ml-auto flex shrink-0 items-center gap-4 min-[1040px]:gap-5"
        style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}
      >
        {streaming && <span className="meta hidden lg:block">{t('header_streaming')}</span>}
        <button type="button" onClick={onNewChat} className="tap-bare">
          {t('header_new_chat')}
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={onOpenSettings}
          className="tap-bare"
          aria-label={t('header_settings_aria')}
        >
          {t('header_settings')}
        </button>
      </div>
    </header>
  )
}
