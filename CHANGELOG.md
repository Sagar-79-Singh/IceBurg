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
