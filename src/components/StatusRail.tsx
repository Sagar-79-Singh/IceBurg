import HudPanel from './HudPanel.tsx'
import { useChat } from '../store/chat.ts'
import { useSettings, activeAdapter } from '../store/settings.ts'
import { useVoice } from '../store/voice.ts'
import { useTheme } from '../store/theme.ts'
import { useT } from '../lib/useT.ts'
import { languageLabel } from '../lib/i18n.ts'
import { shortModelName } from '../lib/modelName.ts'
import pkg from '../../package.json'

// The right column: the same machine, readouts instead of controls. Every
// number here is computed from the stores, or it is not shown.
export default function StatusRail({ ollamaStatus }: { ollamaStatus?: { running: boolean; models: number } | null }) {
  const chats = useChat((state) => state.chats)
  const activeId = useChat((state) => state.activeId)
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const voiceOpen = useVoice((state) => state.open)
  const voiceMode = useVoice((state) => state.mode)
  const theme = useTheme((state) => state.theme)
  const { t } = useT()

  const { label, model } = activeAdapter({ settings, keys })
  const activeChat = chats.find((item) => item.id === activeId) || null
  const turnCount = activeChat?.messages.length ?? 0
  const tokenCount = Math.max(
    0,
    Math.round((activeChat?.messages || []).reduce((total, message) => total + (message.content?.length || 0), 0) / 4),
  )
  const messageTotal = chats.reduce((total, chat) => total + (chat.messages?.length || 0), 0)
  const ollamaLabel = !ollamaStatus
    ? '--'
    : ollamaStatus.running
      ? t('status_ollama_up', { n: ollamaStatus.models })
      : t('status_ollama_down')

  return (
    <aside
      className="relative z-20 hidden w-[272px] shrink-0 flex-col gap-2.5 overflow-y-auto border-l border-line bg-[color-mix(in_srgb,var(--crevasse)_38%,var(--surface))] p-2.5 min-[1180px]:flex"
      aria-label={t('status_panel')}
    >
      <HudPanel title={t('status_panel')} code={t('status_live')} className="shrink-0">
        <div className="flex flex-col gap-1.5">
          <div className="hud-row">
            <span className="hud-key">{t('status_engine')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className="hud-val hud-val-accent">{(label || '—').toUpperCase()}</span>
          </div>
          <div className="hud-row">
            <span className="hud-key">{t('status_model')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className="hud-val" title={model || undefined}>{shortModelName(model) || '—'}</span>
          </div>
          <div className="hud-row">
            <span className="hud-key">{t('status_ollama')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className={`hud-val ${ollamaStatus?.running ? 'hud-val-accent' : ''}`}>{ollamaLabel}</span>
          </div>
          <div className="hud-row">
            <span className="hud-key">{t('status_voice')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className={`hud-val ${voiceOpen ? 'hud-val-accent' : ''}`}>
              {voiceOpen ? t(`voice_state_${voiceMode}`) : t('status_off')}
            </span>
          </div>
          <div className="hud-row">
            <span className="hud-key">{t('status_theme')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className="hud-val">{theme === 'dark' ? t('theme_dark').toUpperCase() : t('theme_light').toUpperCase()}</span>
          </div>
          <div className="hud-row">
            <span className="hud-key">{t('status_language')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className="hud-val">{languageLabel(settings.language).toUpperCase()}</span>
          </div>
        </div>
      </HudPanel>

      <HudPanel title={t('session_panel')} code={activeChat ? String(turnCount).padStart(2, '0') : '--'} className="shrink-0">
        <div className="flex flex-col gap-1.5">
          <div className="hud-row">
            <span className="hud-key">{t('session_turns')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className="hud-val">{String(turnCount).padStart(3, '0')}</span>
          </div>
          <div className="hud-row">
            <span className="hud-key">{t('session_tokens')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className="hud-val">~{tokenCount.toLocaleString()}</span>
          </div>
          <div className="hud-row">
            <span className="hud-key">{t('session_chats')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className="hud-val">{String(chats.length).padStart(3, '0')}</span>
          </div>
          <div className="hud-row">
            <span className="hud-key">{t('session_messages')}</span>
            <span className="hud-fill" aria-hidden="true" />
            <span className="hud-val">{String(messageTotal).padStart(4, '0')}</span>
          </div>
        </div>
      </HudPanel>

      <HudPanel title={t('about_panel')} className="shrink-0">
        <div className="flex flex-col gap-1 font-mono text-[0.5625rem] uppercase leading-relaxed tracking-[0.12em] text-muted">
          <p>IceBurg v{pkg.version}</p>
          <p>{t('about_local')}</p>
          <p className="text-muted/70">{t('about_mark')}</p>
          <p className="text-muted/70">{t('about_not_affiliated')}</p>
        </div>
      </HudPanel>
    </aside>
  )
}
