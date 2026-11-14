import ModelMenu from './ModelMenu.tsx'
import ThemeToggle from './ThemeToggle.tsx'
import BergMark from './BergMark.tsx'
import StatusClock from './StatusClock.tsx'
import { useChat } from '../store/chat.ts'
import { useT } from '../lib/useT.ts'
import { useVoice } from '../store/voice.ts'
import type { CSSProperties } from 'react'

// Electron-only style property (frameless window drag region). Not part of the
// CSS spec, so it is declared locally instead of widening every CSSProperties use.
type AppRegionStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

// One console row: the berg on the left, the conversation's state in the
// middle, the clock and the controls on the right. The window is a machine
// you talk to, and the header is its nameplate.
export default function Header({ onOpenSettings, onNewChat, sidebarOpen, onToggleSidebar }: { onOpenSettings: () => void; onNewChat: () => void; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const streaming = useChat((state) => state.streamingId !== null)
  const voiceOpen = useVoice((state) => state.open)
  const voiceMode = useVoice((state) => state.mode)
  const toggleVoice = useVoice((state) => (state.open ? state.closeVoice : state.openVoice))
  // On macOS the window's own buttons sit in this row, so the mark starts after
  // them instead of underneath them.
  const onMac = typeof window !== 'undefined' && window.iceburg?.platform === 'darwin'
  const { t } = useT()

  // One lamp for the whole app: whatever the machine is doing right now.
  const state = voiceOpen && voiceMode !== 'idle' ? voiceMode : streaming ? 'thinking' : 'idle'
  const stateLabel = streaming && voiceMode === 'idle' ? t('header_streaming') : t(`voice_state_${state}`)

  return (
    <header
      className={`relative z-30 flex h-[54px] shrink-0 items-center gap-3 border-b border-line pr-3 sm:gap-4 sm:pr-4 ${
        onMac ? 'pl-[92px]' : 'pl-4'
      }`}
      style={
        {
          WebkitAppRegion: 'drag',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--melt) 7%, var(--surface)) 0%, var(--surface) 100%)',
        } as AppRegionStyle
      }
    >
      <div className="flex shrink-0 items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}>
        <BergMark size={18} weight="light" />
        <div className="flex flex-col leading-none">
          <span className="wordmark text-[0.92rem]">IceBurg</span>
          <span className="mt-1 hidden font-mono text-[0.5rem] uppercase tracking-[0.3em] text-melt min-[1040px]:block">
            {t('header_sub')}
          </span>
        </div>
      </div>

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line-strong" />

      <div className="flex min-w-0 items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="tap-bare hidden font-mono text-[0.72rem] uppercase tracking-[0.18em] md:inline-flex"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? t('header_hide_chats') : t('header_show_chats')}
        >
          {t('header_chats')}
        </button>
        <ModelMenu onOpenSettings={onOpenSettings} />
      </div>

      {/* The machine's one lamp, dead centre. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 min-[1230px]:block"
        aria-hidden="true"
      >
        <span className={`hud-chip hud-chip-${state}`}>
          <span className="hud-chip-dot" />
          {stateLabel}
        </span>
      </div>

      <div
        className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4"
        style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}
      >
        <button type="button" onClick={onNewChat} className="hud-btn hidden sm:inline-flex">
          {t('header_new_chat')}
        </button>
        <button
          type="button"
          onClick={toggleVoice}
          className="tap-bare p-1.5"
          aria-label={t('voice_mode_open_aria')}
          aria-pressed={voiceOpen}
          title={t('voice_mode')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 10v4M8.5 7v10M13 4v16M17.5 8v8M21 10.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={onOpenSettings}
          className="tap-bare hidden min-[1040px]:inline-flex"
          aria-label={t('header_settings_aria')}
        >
          {t('header_settings')}
        </button>
        <span aria-hidden="true" className="hidden h-6 w-px bg-line-strong min-[1180px]:block" />
        <StatusClock className="hidden min-[1180px]:flex" />
      </div>

      {/* The lit rule along the bottom edge, brightest under the chip. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--melt) 38%, transparent) 38%, color-mix(in srgb, var(--melt) 85%, transparent) 50%, color-mix(in srgb, var(--melt) 38%, transparent) 62%, transparent 100%)',
        }}
      />
    </header>
  )
}
