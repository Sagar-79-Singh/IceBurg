import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import ChatView from './components/ChatView.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import OllamaInstall from './components/OllamaInstall.jsx'
import Toasts from './components/Toasts.jsx'
import { useChat } from './store/chat.js'
import { useSettings } from './store/settings.js'
import { useTheme } from './store/theme.js'
import { ollama } from './store/bridge.js'
import { freshStart } from './store/first-run.js'
import { useT } from './lib/useT.js'

// Shell: rail, header, conversation. It also runs the two things that happen on
// launch, in order: load what was saved, then ask Ollama whether it is there.
export default function App() {
  const chats = useChat((state) => state.chats)
  const activeId = useChat((state) => state.activeId)
  const chatLoaded = useChat((state) => state.loaded)
  const createChat = useChat((state) => state.createChat)
  const settings = useSettings((state) => state.settings)
  const settingsLoaded = useSettings((state) => state.loaded)
  const setOnboarding = useSettings((state) => state.setOnboarding)
  const updateProvider = useSettings((state) => state.updateProvider)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsProvider, setSettingsProvider] = useState(null)
  const [installOpen, setInstallOpen] = useState(false)
  const lastChatId = useRef(null)
  const { t } = useT()
  const [installFromSettings, setInstallFromSettings] = useState(false)
  const [detected, setDetected] = useState(null)
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
    const onKey = (event) => {
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

  const openSettings = (providerId = null) => {
    setSettingsProvider(providerId)
    setSettingsOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <Header
        onOpenSettings={() => openSettings()}
        onNewChat={() => createChat()}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewChat={() => createChat()}
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
      </div>

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
    </div>
  )
}
