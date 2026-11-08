# IceBurg — design and build plan

## Concept
An iceberg: a calm, cold surface with real depth underneath. The window stays quiet
while long answers sit above a sea that visibly sinks as the conversation grows.

## Palette

Dark (default)

| token     | value     | use                                               |
| --------- | --------- | ------------------------------------------------- |
| deep sea  | `#0A1A26` | page background                                   |
| glacier   | `#143544` | panels, sidebar, composer                         |
| frost     | `#DCEFF7` | text                                              |
| meltwater | `#5BC0DE` | active chat, send button, streaming cursor        |
| crevasse  | `#06101A` | inputs, code blocks, header ground                |
| abyss     | `#030C14` | where the background settles in a long chat       |

Light: ground `#E7F1F6`, panels `#F4FAFC`, ink `#0C202B`, accent darkened to
`#1585A4` so it keeps contrast against white text.

The accent is used in exactly three places: the marker on the active chat, the
send button, and the streaming cursor. Everything else is sea, ice and line.

## Type
Source Sans 3 for UI and prose (humanist, comfortable at 15–17px), JetBrains Mono
for code, model names and addresses. Both bundled locally. No all-caps labels, no
Inter, no Roboto. Prose is capped at 68ch so lines stay under 80 characters.
Scale: 14 / 15 / 17 / 20 / 26.

## Layout
A 62px rail for chats that widens to 248px with names and controls; a wide
centred conversation column; the composer as one slab pinned to the bottom. User
turns are quiet, right-aligned, bordered and unfilled. Assistant turns are plain
full-width text with no card around them.

## The one memorable thing: depth
The header, the rail and the window ground are mixed from glacier toward abyss as
a function of how far up you have scrolled a long conversation. At the top of a
long chat you are in sunlight; reading down, the room sinks. Short chats never
show it, because depth is relative to the length of the scroll, not its offset.
Nothing else in the interface is decorative.

## Motion
Only answers to actions: text arriving, the rail opening (200ms), the copy button
confirming, the composer switching to Stop, a spinner while models load. Every
transition is disabled under `prefers-reduced-motion`.

## Check against the rules
- No gradient washes: the only gradient is a 4% surface light at the top of the
  reading column.
- No identical rounded cards; replies have no container.
- No decorative arrows; one chevron in the switcher where it means "opens".
- No fade-ins and nothing animates on scroll.
- Two clearly different families, no uppercase eyebrow labels.
- Accent restricted to three elements, all of them functional.
- Light theme is a complete second palette with its own accent value.
- Focus is visible everywhere (`:focus-visible`), dialogs trap focus and return it.

## Code shape
```
electron/       main.js, preload.cjs, store.js, secrets.js, net.js, ollama.js
src/providers/  http.js (transport), ollama, openrouter, omniroute, gemini,
                custom, registry.js  — adding a provider is one file
src/store/      bridge.js, settings.js, chat.js, theme.js, first-run.js
src/components/ Sidebar, Header, ModelMenu, ChatView, Message, Composer,
                Markdown, CodeBlock, EmptyState, SettingsDialog, ModelPull,
                OllamaInstall, Modal, Toasts, ThemeToggle, icons
```
All network traffic goes through the main process: keys never enter the renderer,
and there is no CORS surface anywhere.
