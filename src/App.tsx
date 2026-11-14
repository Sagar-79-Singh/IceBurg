import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.tsx'
import StatusRail from './components/StatusRail.tsx'
import Header from './components/Header.tsx'
import ChatView from './components/ChatView.tsx'
import SettingsDialog from './components/SettingsDialog.tsx'
import OllamaInstall from './components/OllamaInstall.tsx'
import Toasts from './components/Toasts.tsx'
import VoiceMode from './components/voice/VoiceMode.tsx'
import { useChat } from './store/chat.ts'
import { useVoice } from './store/voice.ts'
import { useSettings, activeAdapter } from './store/settings.ts'
import { useTheme } from './store/theme.ts'
import { ollama } from './store/bridge.ts'
import { freshStart } from './store/first-run.ts'
import type { OllamaDetectResult } from '../shared/ipc.ts'
import { useT } from './lib/useT.ts'

// Shell: rail, header, conversation. It also runs the two things that happen on
// launch, in order: load what was saved, then ask Ollama whether it is there.
export default function App() {
  const chats = useChat((state) => state.chats)
  const activeId = useChat((state) => state.activeId)
  const chatLoaded = useChat((state) => state.loaded)
  const createChat = useChat((state) => state.createChat)
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const settingsLoaded = useSettings((state) => state.loaded)
  const setOnboarding = useSettings((state) => state.setOnboarding)
  const updateProvider = useSettings((state) => state.updateProvider)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900)
  const voiceOpen = useVoice((state) => state.open)
  const voiceMode = useVoice((state) => state.mode)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsProvider, setSettingsProvider] = useState<string | null>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const lastChatId = useRef<string | null>(null)
  const { t } = useT()
  const [installFromSettings, setInstallFromSettings] = useState(false)
  const [detected, setDetected] = useState<OllamaDetectResult | null>(null)
  const bootstrapped = useRef(false)

  const loaded = chatLoaded && settingsLoaded
  const chat = useMemo(() => chats.find((item) => item.id === activeId) || null, [chats, activeId])

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    ;(async () => {
      await useTheme.getState().load()
      await useSettings.getState().load()
      const stored = freshStart ? { chats: [], activeId: null } : await useChat.getState().load()
      if (freshStart) {
        // A preview starts in the empty state, with the launch question untouched.
        useChat.setState({ chats: [], activeId: null, loaded: true })
        useSettings.getState().setOnboarding({ ollamaChecked: false, ollamaDeclined: false })
      }
      await useSettings.getState().detectEncryption()
      // A saved chat remembers which provider it was written with.
      const last = stored.chats.find((item) => item.id === stored.activeId) || stored.chats[0]
      if (last?.providerId) useSettings.getState().setActiveProvider(last.providerId)
    })()
  }, [])

  const runOllamaCheck = useCallback(async () => {
    const result = await ollama.detect()
    setDetected(result)
    const state = useSettings.getState()

    if (result.running) {
      const models = result.models || []
      const current = state.settings.providers.ollama?.model
      const stillInstalled = models.some((model) => model.name === current)
      if (!stillInstalled && models[0]) {
        updateProvider('ollama', { model: models[0].name })
      }
      setOnboarding({ ollamaChecked: true })
      setInstallOpen(false)
    } else if (!state.settings.onboarding.ollamaChecked && !state.settings.onboarding.ollamaDeclined) {
      // Ask on the first launch only. The settings screen can always install it.
      setInstallOpen(true)
      setOnboarding({ ollamaChecked: true })
    }
    return result
  }, [setOnboarding, updateProvider])

  useEffect(() => {
    if (loaded) runOllamaCheck()
  }, [loaded, runOllamaCheck])

  // Each chat remembers who answered it: opening one brings that provider and
  // model back, so a conversation stays coherent.
  useEffect(() => {
    if (!loaded || !chat || lastChatId.current === chat.id) return
    lastChatId.current = chat.id
    if (!chat.providerId) return
    const settingsState = useSettings.getState()
    if (settingsState.settings.activeProvider !== chat.providerId) {
      settingsState.setActiveProvider(chat.providerId)
    }
    if (chat.model && settingsState.settings.providers[chat.providerId]?.model !== chat.model) {
      settingsState.updateProvider(chat.providerId, { model: chat.model })
    }
  }, [chat, loaded])

  // Narrow windows keep the rail closed; wide ones leave it as the user set it.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 760) setSidebarOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // A chat being written when the window closes is still written to disk.
  useEffect(() => {
    const flush = () => useChat.getState().flush()
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  // Shortcuts: Cmd/Ctrl+N new chat, Cmd/Ctrl+, settings, Cmd/Ctrl+B the rail.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === 'n') {
        event.preventDefault()
        createChat()
      } else if (event.key === ',') {
        event.preventDefault()
        setSettingsProvider(null)
        setSettingsOpen(true)
      } else if (event.key === 'b') {
        event.preventDefault()
        setSidebarOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createChat])

  const openSettings = (providerId: string | null = null) => {
    setSettingsProvider(providerId)
    setSettingsOpen(true)
  }

  // Honest readouts for the footer strip: who answers, and what the voice is doing.
  const { label } = activeAdapter({ settings, keys })
  const voiceWord = voiceOpen ? t(`voice_state_${voiceMode}`) : t('status_off')
  const ollamaStatus = detected ? { running: detected.running, models: detected.models?.length || 0 } : null

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      {/* The room the HUD sits in */}
      <div className="hud-backdrop" aria-hidden="true">
        <div className="hud-glow" />
        <div className="hud-floor" />
      </div>

      <Header
        onOpenSettings={() => openSettings()}
        onNewChat={() => createChat()}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
      />

      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewChat={() => createChat()}
          ollamaStatus={ollamaStatus}
        />
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t('chat_conversation_aria')}>
          {loaded ? (
            <ChatView
              key={chat?.id || 'empty'}
              chat={chat}
              ollamaDown={Boolean(detected && !detected.running)}
              ollamaModels={detected?.models?.length || 0}
              onOpenSettings={(providerId) => openSettings(providerId)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-base text-muted">{t('app_opening')}</div>
          )}
        </main>
        <StatusRail ollamaStatus={ollamaStatus} />
      </div>

      {/* The footer strip */}
      <footer className="hud-statusbar" aria-hidden="true">
        <span className="inline-flex items-center text-melt"><span className="hud-dot" />{t('status_engine')} · {(label || '—').toUpperCase()}</span>
        <span className="hidden sm:inline">{t('status_voice')} · {voiceWord}</span>
        <span className="hidden md:inline">{t('session_chats')} · {chats.length.toString().padStart(3, '0')}</span>
        <span className="hud-statusbar-right hidden lg:inline">{t('shortcut_hint_n')}</span>
      </footer>

      {settingsOpen && (
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialProvider={settingsProvider}
          ollamaDetected={detected}
          onInstallOllama={() => {
            setInstallFromSettings(true)
            setInstallOpen(true)
          }}
        />
      )}

      <OllamaInstall
        open={installOpen}
        detected={detected}
        onClose={() => {
          setInstallOpen(false)
          // Saying no at launch is remembered; closing from settings is not.
          if (!installFromSettings) setOnboarding({ ollamaDeclined: true })
          setInstallFromSettings(false)
        }}
        onInstalled={(result) => {
          setInstallOpen(false)
          setInstallFromSettings(false)
          setSettingsProvider('ollama')
          setSettingsOpen(true)
          setDetected(result)
          const models = result?.models || []
          if (models[0] && !settings.providers.ollama?.model) {
            updateProvider('ollama', { model: models[0].name })
          }
          useSettings.getState().setActiveProvider('ollama')
          setOnboarding({ ollamaDeclined: false, ollamaChecked: true })
        }}
      />

      <Toasts />
      {voiceOpen && <VoiceMode />}
    </div>
  )
}
