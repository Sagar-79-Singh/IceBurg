## 0.6.0

### Added

- Voice Mode: a full-window HUD opened from the top bar (the waveform icon next to the theme toggle). Same conversation as the chat behind it — everything you say or type in the HUD lands in the shared history, and the HUD is themed and tinted like the rest of IceBurg.
- Face presence: a procedural Canvas 2D face (blinking, breathing, eye saccades, brows that ride the phrases, a small nod on stressed words) or a reactor orb with a gauge ring, arcs that spin faster while thinking, and a spectrum ring fed by the live mic. No image assets — the face weighs nothing and retints with the app accent. Switch between face and orb in the drawer; the choice persists.
- Voice out, locally and keyless: replies are read aloud with the system speech engine (window.speechSynthesis). The mouth is driven from the text with one language-agnostic rule set (Unicode normalisation, accent stripping, letters mapped to closed/wide/round/open/teeth visemes), scheduled against speech boundary events with wall-clock timing in seconds, smoothed between shapes. Code is never read, markdown/emoji/URLs are stripped, and long answers put one short spoken line in your ears while the full text waits in the panel.
- Voice in, locally and keyless: push-to-talk (hold Ctrl+Space, window-scoped) and click-to-talk with silence detection, transcribed by Whisper tiny (quantised) running in a Web Worker on the CPU via transformers.js. The model downloads once, with your permission first, then lives in the on-disk cache — the microphone audio never leaves the machine.
- Voice settings drawer (gear, top right): face/orb, voice picker, speech rate, microphone picker (by name, falls back to the system default), speak-replies on/off, STT language hint (auto/English/Hindi), and an ice-blue accent override (or match the theme).
- Status faces: the HUD looks away while thinking, meets your eyes while listening, glances down when new text lands, and its lids droop when idle. Esc or the stop button cuts speech instantly; Ctrl+Space never works while the assistant is speaking — the mic stays shut, plus a short tail, so it never hears itself.
- Linux without speech voices gets an in-app note with the speech-dispatcher/espeak-ng fix instead of a crash.
- `npm run check` now covers the viseme rule set, the voice state machine (truth table + echo-guard invariants + fuzz) and a jsdom drive of the whole HUD (header opens it, one shared history, persisted face toggle, Escape closes it).

### Changed

- Replies in Voice Mode are steered to 1–3 spoken-friendly sentences; code and long answers go to the panel with a one-line spoken pointer.

## 0.5.1

### Fixed

- The app renders styled again. 0.5.0 shipped without any Tailwind utilities (the content globs only scanned *.js/*.jsx, so after the TypeScript migration they matched nothing and no utility classes were generated). The globs now cover the extensions the app is actually written in, and the built CSS is byte-for-byte identical to the last working build.
- index.html pointed at the deleted /src/main.jsx; it now points at /src/main.tsx.
- `npm run check` now also rebuilds the renderer and fails if the emitted CSS is missing its Tailwind utilities, so this cannot regress silently.

## 0.5.0

### Changed

- Under the hood: IceBurg is now fully written in TypeScript and checked strictly (window, Electron main process, preload, providers, tool runner and the check suites). Nothing about how the app looks, answers or opens tools changed.
- `npm run build` now also bundles the Electron main process and preload (`electron/main.mjs`, `electron/preload.cjs`), so a fresh clone still runs and packages exactly as before.

## 0.4.2

### Changed

- Replies default to Hinglish, always. No matter which language you write in, the assistant answers in Hinglish unless you say otherwise; chat titles follow the same language. You can change this in Settings.
- New language setting in Settings: Hinglish (default), English, हिन्दी (Hindi), or any other language by name. Hinglish, English and Hindi fully translate the app itself — menus, buttons, settings, Ollama setup, model menu, toasts, errors, the works — while "Other" keeps the interface in English and has the assistant reply in the language you name.
- Provider and stream errors are shown in the configured language instead of raw English.

### Fixed

- "Play a random song on YouTube" no longer plays a Short. The search page is parsed properly (Shorts and Reels shelves are skipped), "random" picks from the top real videos, and everything else still falls back to the search page when YouTube can't be reached.

## 0.4.1

### Fixed

- Compound computer tasks no longer fall through to the model. "Hey yo bro can you open youtube and play 'Koi Mil Gaya' song sung by Tony Kakkar" now resolves to YouTube and plays the top result with autoplay, exactly as if you had said "open YouTube and play ...". Fillers, determiners and negations in front of the request are handled; "on spotify" at the end can re-bind the tool; questions and negations still never open anything.

### Added

- The chat's name is decided after the first answer instead of echoing the opening words. Streaming chats get a 2-to-6 word title written by the active model (asked silently in the background; user-renamed chats are never touched). Computer-task chats are named from the task itself, e.g. "Play Koi Mil Gaya song sung by Tony Kakkar" or "Open YouTube".

## 0.4.0

### Added

- Play anything on YouTube from the composer. "Play Koi Mila Gaya song on YouTube" fetches the top result and opens it with autoplay, in the installed YouTube PWA when there is one (otherwise in the browser). If YouTube can't be reached, the search page opens instead — no silent failures, ever.
- "search X on ..." across the web tools: Gmail, GitHub, Google, Reddit, Maps, Spotify, Netflix, X and YouTube build the right search URL and open it, same PWA-first rule. "play X on <tool>" works on YouTube; elsewhere it opens that tool's search page with an honest note.
- A new catalog entry for Google search itself.
- Common typos of tool names ("Youtbe", "yotube", "gamil", "spotfy") are recognised.

## 0.3.1

### Fixed

- Computer tasks understand natural requests. "Can you open youtube please??" now opens YouTube (and "could you please open up the gmail app", "I want to open spotify" — anything with a known tool name after a filler-and-verb prefix). The model is only involved for messages that are not a known tool, exactly as before, and questions, compound asks ("open youtube and play lofi") and negations ("don't open youtube") never open anything.

### Changed

- The window no longer shows raw model ids. The switcher, composer, waterline and message meta display a derived short name ("Qwen 2.5 Coder", "DeepSeek R1", "Gemma 3"); the full id remains in the model list, in hover tooltips, and in every request to the provider.

## 0.3.0

### Added

- Computer tasks. Type "open YouTube", "open Gmail", "open Spotify" or "open Brave" in the composer and IceBurg opens it on your machine. If the thing you asked for is installed as an app, that app opens; otherwise an installed PWA (a Chrome or Edge app) is used; otherwise the website opens in your browser. Works for YouTube, Gmail, Google Calendar, Drive and Maps, Spotify, Brave, Claude, ChatGPT, VS Code, Slack, Discord, Notion, Figma, WhatsApp, Telegram, X, Reddit, Netflix and GitHub.
- Heavy local services always ask first. OmniRoute and FreeLLMAPI start only after you confirm, and open their dashboards once running. IceBurg never starts anything without your say-so.
- Tool results are shown in the chat as short notes ("Opened YouTube in its installed app."). Tasks that need confirmation arrive as a card with Open and Cancel buttons.

### Changed

- The composer hints that "open youtube" works, and computer tasks work even before a model is picked.

## 0.2.3

### Fixed

- The Windows and Linux installers are published again. The v0.2.2 release contains only the macOS .dmg files because the release job failed before the installers could be attached; the job is fixed.

### Changed

- No changes to the app itself.

## 0.2.2

### Fixed

- macOS: the build now runs on a current macOS runner. The old one was retired by GitHub, so .dmg files were not being produced.

- Linux: the terminal that runs the Ollama install now waits for Enter, so the result stays on screen.

### Changed

- API keys are only sent to the address saved for that provider. A request to any other address is refused with a clear message.

- README: added a note about starting the AppImage on Ubuntu 24.04.

- Release notes now come from CHANGELOG.md instead of being generated automatically.

## 0.2.1 and earlier

See the releases page.
