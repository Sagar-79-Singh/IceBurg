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
