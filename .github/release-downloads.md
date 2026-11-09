### Downloads

| Platform | File |
| --- | --- |
| Windows 10/11 (x64), installer | `IceBurg-*-win-x64.exe` |
| Windows (x64), portable, no install | `IceBurg-*-win-x64-portable.exe` |
| Linux (x64), run anywhere | `IceBurg-*-linux-x86_64.AppImage` |
| Debian / Ubuntu (x64) | `IceBurg-*-linux-amd64.deb` |
| macOS (Intel and Apple silicon) | `IceBurg-*-mac-*.dmg` |

The `.deb` installs with `sudo apt install ./IceBurg-*.deb` (or `sudo dpkg -i IceBurg-*.deb`).
The portable `.exe` runs as-is, with no installer and no admin rights.
The macOS build is unsigned, so the first launch needs a right-click on the app
and then Open. The Linux AppImage only needs `chmod +x` before you run it.

IceBurg looks for Ollama on first launch and asks before installing anything.
Cloud providers need an API key, added in settings.
