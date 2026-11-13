import { useMemo } from 'react'
import { useSettings, activeAdapter, providerStatus } from '../store/settings.ts'
import { useChat } from '../store/chat.ts'
import { useT } from '../lib/useT.ts'

// A line drawing of a berg cut by the waterline, one sentence about the state of
// the machine, and one action. Nothing else.
function BergDrawing() {
  const { t } = useT()
  return (
    <svg
      viewBox="0 0 320 210"
      className="w-full max-w-[420px]"
      role="img"
      aria-label={t('empty_svg_label')}
    >
      {/* above the water: only a ninth of it */}
      <polygon
        points="158,18 196,86 214,104 132,104 128,72"
        fill="none"
        stroke="var(--frost)"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
      <path d="M158 18 L166 104" stroke="var(--line-strong)" strokeWidth="1" />
      <path d="M128 72 L166 78 L214 104" stroke="var(--line-strong)" strokeWidth="1" />

      {/* the waterline, drawn once, straight, with a small glint at the cut */}
      <line x1="8" y1="106" x2="312" y2="106" stroke="var(--melt)" strokeWidth="1.5" />
      <line x1="120" y1="106" x2="180" y2="106" stroke="var(--glint)" strokeWidth="2" />

      {/* below: the mass, drawn as flat cut planes */}
      <polygon
        points="132,108 214,108 190,176 160,198 118,158"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="1.2"
        strokeLinejoin="miter"
      />
      <path d="M132 108 L160 198 M214 108 L160 198 M118 158 L214 108 M132 108 L190 176" stroke="var(--line)" strokeWidth="1" />
      {/* the faintest reflection of the surface */}
      <line x1="118" y1="112" x2="228" y2="112" stroke="var(--line)" strokeWidth="1" />
    </svg>
  )
}

export default function EmptyState({ onOpenSettings, ollamaDown = false, ollamaModels = 0 }: { onOpenSettings: (tab?: string) => void; ollamaDown?: boolean; ollamaModels?: number }) {
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const send = useChat((state) => state.send)
  const { t } = useT()

  const active = useMemo(() => activeAdapter({ settings, keys }), [settings, keys])
  const status = providerStatus({ settings, keys }, settings.activeProvider)
  const ready = status.ready && Boolean(active.model)
  const needsSetup = !status.ready
  const localDown = ollamaDown && settings.activeProvider === 'ollama'

  // How many models this machine actually has, as detected at launch.
  const localModels = ollamaModels
  const statusLine = ready
    ? settings.activeProvider === 'ollama'
      ? localModels > 0
        ? localModels === 1
          ? t('empty_status_local_one')
          : t('empty_status_local_many', { n: localModels })
        : t('empty_status_local_zero')
      : t('empty_status_ready_cloud', { label: active.label, model: active.model })
    : localDown
      ? t('empty_status_down')
      : t('empty_status_none')

  const focusComposer = () => document.getElementById('composer')?.focus()

  return (
    <div className="relative flex min-h-0 flex-1 items-center overflow-y-auto px-8 pb-10 pt-6">
      <div className="flex w-full max-w-[980px] flex-col gap-8 min-[980px]:flex-row min-[980px]:items-center min-[980px]:gap-14">
        <div className="shrink-0 self-start min-[980px]:w-[46%]">
          <BergDrawing />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="display text-[clamp(2rem,3.4vw,2.9rem)] text-frost">
            {t('empty_hero_1')}
            <br />
            {t('empty_hero_2')}
          </h1>

          <p className="mt-4 max-w-[42ch] text-prose leading-[1.6] text-muted" role="status">
            {statusLine}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-5">
            <button type="button" onClick={focusComposer} className="tap tap-solid border-0 px-4 py-2">
              {t('empty_start')}
            </button>
            {!ready && (
              <button
                type="button"
                className="tap-bare"
                onClick={() => onOpenSettings(settings.activeProvider)}
              >
                {needsSetup ? t('empty_add_provider') : t('empty_pick_model')}
              </button>
            )}
            {ready && (
              <button
                type="button"
                className="tap-bare"
                onClick={() => send(t('empty_first_question_text'))}
              >
                {t('empty_first_question')}
              </button>
            )}
          </div>

          <p className="meta mt-8 max-w-[44ch] leading-[1.7]">
            {ready ? t('empty_meta_ready') : t('empty_meta_keys')}
          </p>
        </div>
      </div>
    </div>
  )
}
