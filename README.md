# IceBurg

A calm desktop chat app for Ollama and any cloud provider. One window, one
conversation, no accounts and no telemetry. Everything except the requests you
send to a cloud provider stays on your own machine.

- **Local first.** If Ollama is running, its models are there on launch. If it is
  not installed, IceBurg asks before it installs anything.
- **Your providers.** Ollama, OpenRouter, OmniRoute, Gemini, and any custom
  OpenAI-compatible endpoint (CloseRouter, LM Studio, vLLM…).
- **Keys encrypted.** API keys are sealed with Electron `safeStorage` (Keychain,
  DPAPI, libsecret) and never leave the main process.
- **Chats saved locally** in your user data directory. Rename, delete, stop a
  generation mid-sentence, copy a code block.
- **Two themes.** Deep sea by default, ice light on a toggle.

## Requirements

- Node.js 20 or newer.
- Ollama (optional). [ollama.com](https://ollama.com) — IceBurg can install it for
  you, with your permission.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on port 5273 and opens Electron against it. The window
hot-reloads as you edit the renderer.

## Build and package

```bash
npm run build      # renderer bundle only, into dist/
npm run dist       # packaged app for the current OS, into release/
npm run dist:win   # Windows .exe (NSIS)
npm run dist:linux # Linux AppImage
npm run dist:mac   # macOS .dmg (unsigned)
npm run check      # provider, chat-loop and first-run checks
```

Installers for all three platforms are built by GitHub Actions
(`.github/workflows/build.yml`): push a tag such as `v0.1.0` and the workflow
attaches a Windows `.exe`, a Linux AppImage and an unsigned macOS `.dmg` to the
release. The macOS build is deliberately unsigned, so first launch needs
right-click → Open.

## Adding a provider

Every provider is one file behind one interface:

```js
// src/providers/mine.js
export default {
  id: 'mine',
  name: 'Mine',
  blurb: 'One line about it.',
  signup: 'https://example.com/keys',   // optional
  defaultBaseUrl: 'https://api.example.com/v1',
  fields: ['baseUrl', 'apiKey'],        // what settings should show
  create(settings) {
    return {
      id: 'mine',
      name: 'Mine',
      async listModels({ signal }) { /* [{ id, name, meta }] */ },
      async *streamChat({ messages, model, signal }) {
        // yield text chunks as they arrive
      },
    }
  },
}
```

Then add it to the list in `src/providers/registry.js`. Settings, the model menu,
the header switcher and chat persistence all pick it up automatically.

Requests go through `src/providers/http.js`, which hands them to the main process
over IPC. That is why keys can stay in the main process, and why there is no CORS
code anywhere in the app.

## Where things live

```
electron/          main process: window, storage, secrets, streaming HTTP, Ollama
  main.js            window creation, navigation rules, wiring
  preload.cjs        the only API the renderer can see
  store.js           atomic JSON documents in userData
  secrets.js         safeStorage-encrypted keys, readable only in main
  net.js             all outbound HTTP, chunked back over IPC, with timeouts
  ollama.js          detection, install on request, binary discovery
src/providers/     one adapter per provider, one shared transport
src/store/         zustand stores: settings, chats, theme, bridge
src/components/    sidebar, header, model menu, conversation, composer, dialogs
src/styles/        palette tokens and typography
scripts/           check suites (providers, app flow, first run)
build/             app icon
```

Data lives in the Electron `userData` directory:

| File           | Contents                          |
| -------------- | --------------------------------- |
| `settings.json`| theme, active provider, models    |
| `chats.json`   | every conversation                |
| `secrets.json` | encrypted API keys                |

Deleting those three files resets the app.

## Notes

- On Windows and macOS, "Install Ollama" opens the official installer from
  ollama.com. On Linux it runs the official install script in your terminal, so
  you see the sudo prompt yourself.
- If the system has no keyring (some Linux setups), keys are obfuscated rather
  than encrypted, and the settings screen says so instead of pretending.
- Nothing is installed, pulled or sent without an explicit action.

## Licence

MIT.
