import { useMemo } from 'react'
import { useSettings, activeAdapter, providerStatus } from '../store/settings.ts'
import { useChat } from '../store/chat.ts'
import { useT } from '../lib/useT.ts'
import BergMark from './BergMark.tsx'

// The empty console: a reactor holding the berg. Concentric dashed rings with a
// slow rotating tick ring, the mark in the middle, and the one question that
// matters — is the machine ready? Every value below comes from the real
// settings and detection state, nothing invented.
function ReactorBerg() {
  const { t } = useT()
  return (
    <div className="relative mx-auto flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
      <div className="hud-glow absolute inset-0" aria-hidden="true" />
      <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full" role="img" aria-label={t('empty_svg_label')}>
        {/* outer graduation ring */}
        <circle cx="120" cy="120" r="112" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
        <g className="reactor-spin" style={{ transformOrigin: '120px 120px' }}>
          {Array.from({ length: 48 }, (_, i) => {
            const angle = (i * 7.5 * Math.PI) / 180
            const long = i % 4 === 0
            const r1 = long ? 92 : 100
            const r2 = 112
            return (
              <line
                key={i}
                x1={120 + Math.cos(angle) * r1}
                y1={120 + Math.sin(angle) * r1}
                x2={120 + Math.cos(angle) * r2}
                y2={120 + Math.sin(angle) * r2}
                stroke={long ? 'var(--melt)' : 'var(--line-strong)'}
                strokeWidth={long ? 1.6 : 1}
                opacity={long ? 0.9 : 0.7}
              />
            )
          })}
        </g>
        {/* tracking ring with two lit arcs */}
        <circle cx="120" cy="120" r="76" fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="120" cy="120" r="76" fill="none" stroke="var(--melt)" strokeWidth="6" strokeDasharray="96 380" strokeLinecap="butt" transform="rotate(-90 120 120)" opacity="0.9" />
        <circle cx="120" cy="120" r="76" fill="none" stroke="var(--glint)" strokeWidth="6" strokeDasharray="34 442" transform="rotate(140 120 120)" opacity="0.95" />
        {/* inner ring */}
        <circle cx="120" cy="120" r="56" fill="color-mix(in srgb, var(--melt) 7%, var(--crevasse))" stroke="var(--melt)" strokeWidth="0.8" strokeOpacity="0.55" />
      </svg>
      <div className="reactor-breathe relative z-10 flex flex-col items-center gap-1">
        <BergMark size={64} weight="solid" />
        <span className="font-mono text-[0.5rem] uppercase tracking-[0.42em] text-melt">IceBurg</span>
      </div>
    </div>
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
    <div className="relative flex min-h-0 flex-1 items-center overflow-y-auto px-6 pb-8 pt-6">
      <div className="pointer-events-none absolute inset-0 hud-scan" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-[1080px] flex-col items-center gap-6 py-4 min-[1024px]:flex-row min-[1024px]:gap-14">
        <ReactorBerg />

        <div className="min-w-0 flex-1 text-center min-[1024px]:text-left">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.34em] text-melt">
            IceBurg <span className="text-muted">//</span> {t('header_sub')}
          </p>
          <h1 className="display mt-3 text-[clamp(2rem,3.6vw,3rem)] text-frost">
            {t('empty_hero_1')}
            <br />
            {t('empty_hero_2')}
          </h1>

          <p className="mx-auto mt-4 max-w-[44ch] text-prose leading-[1.6] text-muted min-[1024px]:mx-0" role="status">
            {statusLine}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 min-[1024px]:justify-start">
            <button type="button" onClick={focusComposer} className="hud-btn hud-btn-solid px-5 py-2.5">
              {t('empty_start')}
            </button>
            {!ready && (
              <button
                type="button"
                className="hud-btn"
                onClick={() => onOpenSettings(settings.activeProvider)}
              >
                {needsSetup ? t('empty_add_provider') : t('empty_pick_model')}
              </button>
            )}
            {ready && (
              <button
                type="button"
                className="hud-btn"
                onClick={() => send(t('empty_first_question_text'))}
              >
                {t('empty_first_question')}
              </button>
            )}
          </div>

          <p className="mt-6 max-w-[52ch] font-mono text-[0.5625rem] uppercase leading-[1.9] tracking-[0.14em] text-muted/80">
            {ready ? t('empty_meta_ready') : t('empty_meta_keys')}
          </p>
        </div>
      </div>
    </div>
  )
}
