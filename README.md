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
- **Computer tasks.** Type "open YouTube", "open Spotify" or "open Brave" in the
  composer and IceBurg opens it — the installed app if there is one, otherwise an
  installed PWA, otherwise the website in your browser. YouTube, Gmail, Google
  Calendar, Drive and Maps, Spotify, Brave, Claude, ChatGPT, VS Code, Slack,
  Discord, Notion, Figma, WhatsApp, Telegram, X, Reddit, Netflix and GitHub all
  work. Heavy local services (OmniRoute, FreeLLMAPI) ask before they start.
  "Play Koi Mila Gaya song on YouTube" fetches the top result and opens it
  playing. "search X on Gmail / GitHub / Reddit / Maps / …" opens the right
  search page the same way.
- **Voice Mode.** The waveform icon in the top bar opens a full-window HUD with a
  face (or a reactor orb — your choice, it persists), a live waveform and a side
  conversation panel. Hold Ctrl+Space or tap the mic to talk; answers come back
  aloud with real lip-sync, or stay silent and typed — your call. Voice in and
  out are both local and keyless: Whisper tiny (quantised) transcribes on this
  machine after a one-time, consent-gated download, and the mouth is driven from
  the text with a language-agnostic viseme rule set against the system's speech
  engine. The mic only opens while listening, the assistant never hears itself,
  and nothing leaves the machine except the requests you send to a cloud
  provider. Code and long answers wait in the panel; the spoken line just points
  to them.
- **Two themes.** Deep sea by default, ice light on a toggle.
- **One idea, drawn.** The app is an iceberg: the chat title sits on a waterline
  with a faint reflection, a depth gauge in the left margin counts one message as
  two metres, the streaming cursor pings like sonar, and the chat list is a set of
  ice facets with the open conversation lit. Reduced-motion turns the ripple and
  the ping off; nothing else moves on its own.

## Installers

Prebuilt installers are attached to [Releases](../../releases): a Windows installer,
a portable Windows `.exe`, a Linux AppImage, a Linux `.deb` and a macOS `.dmg`.
Builds come from `.github/workflows/build.yml`, which runs on every `v*` tag.

- **Windows (installer):** run `IceBurg-*-win-*.exe`. It is not code signed, so
  SmartScreen may ask you to confirm.
- **Windows (portable):** run `IceBurg-*-win-*-portable.exe` as-is — no install,
  no admin rights.
- **Linux (anywhere):** `chmod +x IceBurg-*.AppImage` and run it.
- **Debian/Ubuntu:** `sudo apt install ./IceBurg-*.deb` (or
  `sudo dpkg -i IceBurg-*.deb`).
- **macOS:** unsigned, so right-click the app and choose Open the first time.

The macOS runner is capacity limited on GitHub's side right now; if a release has
no `.dmg`, re-run the Build workflow from the Actions tab and it is added.

## Linux notes

On Ubuntu 24.04 and newer, the `.deb` is the recommended way to install IceBurg.
The AppImage can fail to start on those releases with a sandbox error, because
AppArmor restricts the unprivileged user namespaces the AppImage sandbox relies
on. If you see that, start the AppImage with `--no-sandbox`
(`./IceBurg-*.AppImage --no-sandbox`) or install the `.deb` instead. The sandbox
is kept enabled in the code; the flag is only a workaround for that AppArmor
policy.

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
npm run dist:win   # Windows .exe (NSIS installer) and portable .exe
npm run dist:linux # Linux AppImage and .deb
npm run dist:mac   # macOS .dmg (unsigned)
npm run check      # provider, chat-loop and first-run checks
```

Installers for all three platforms are built by GitHub Actions
(`.github/workflows/build.yml`): push a tag such as `v0.1.0` and the workflow
attaches a Windows installer `.exe`, a portable Windows `.exe`, a Linux AppImage,
a Debian/Ubuntu `.deb` and an unsigned macOS `.dmg` to the release. The macOS build is deliberately unsigned, so first launch needs
right-click → Open.

Pushes to `main` and every pull request also run a fast check-and-build on Linux,
Windows and macOS (`.github/workflows/ci.yml`); it installs, runs the check suites
and builds the renderer, publishing nothing.

## Adding a provider

Every provider is one file behind one interface:

```ts
// src/providers/mine.ts
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

Then add it to the list in `src/providers/registry.ts`. Settings, the model menu,
the header switcher and chat persistence all pick it up automatically.

Requests go through `src/providers/http.ts`, which hands them to the main process
over IPC. That is why keys can stay in the main process, and why there is no CORS
code anywhere in the app.

## Where things live

```
electron/          main process: window, storage, secrets, streaming HTTP, Ollama
  main.ts            window creation, navigation rules, wiring
  preload.cts        the only API the renderer can see
  store.ts           atomic JSON documents in userData
  secrets.ts         safeStorage-encrypted keys, readable only in main
  net.ts             all outbound HTTP, chunked back over IPC, with timeouts
  ollama.ts          detection, install on request, binary discovery
src/providers/     one adapter per provider, one shared transport
src/store/         zustand stores: settings, chats, theme, bridge
src/components/    sidebar, header, model menu, conversation, composer, dialogs,
                   plus the three signature pieces: BergMark, DepthGauge,
                   WaterlineTitle
src/styles/        palette tokens and typography
scripts/           check suites (providers, app flow, first run)
build/             app icon: icon.png (1024px, taskbar/dock/window),
                   icon.ico (Windows multi-size), icon-192.png (page favicon)
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

## Acknowledgements

The HUD interface — the console chrome, the chamfered panels, the reactor
backdrops and the workshop-floor backdrop in Voice Mode — is adapted from the
UI of [Mark-LVII](https://github.com/FatihMakes/Mark-LVII) by FatihMakes
(CC BY-NC 4.0). IceBurg is a personal, non-commercial fan project, is not
affiliated with Mark-LVII or its author, and does not sell or commercialise
anything derived from it. The models, the voice stack and everything else are
IceBurg's own.

## Licence

MIT for IceBurg's own code. The UI concepts adapted from Mark-LVII remain
under CC BY-NC 4.0 (non-commercial use only, with attribution), as credited
above.
