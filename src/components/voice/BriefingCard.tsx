// The startup briefing on screen: the day's headlines, brought in by the face
// during its hello. Shows instead of the conversation log while the briefing
// is up; Dismiss hands the rail back. No chat history is touched.
import { useMemo } from 'react'
import { useBriefing } from '../../store/briefing.ts'
import { useT } from '../../lib/useT.ts'
import { replayLeadSpeech, retryBriefing } from '../../voice/briefing.ts'
import { openExternal } from '../../store/bridge.ts'

const pad = (value: number): string => String(value).padStart(2, '0')

const stamp = (pubDate: string): string => {
  const parsed = Date.parse(pubDate)
  if (!Number.isFinite(parsed)) return ''
  const date = new Date(parsed)
  const day = pad(date.getDate())
  const month = date.toLocaleString(undefined, { month: 'short' }).toUpperCase()
  return `${day} ${month} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function BriefingCard() {
  const { t } = useT()
  const phase = useBriefing((state) => state.phase)
  const items = useBriefing((state) => state.items)
  const message = useBriefing((state) => state.message)
  const dismiss = useBriefing((state) => state.dismiss)
  const dateline = useMemo(() => {
    const now = new Date()
    const weekday = now.toLocaleString(undefined, { weekday: 'short' }).toUpperCase()
    const day = pad(now.getDate())
    const month = now.toLocaleString(undefined, { month: 'short' }).toUpperCase()
    return `${weekday} ${day} ${month}`
  }, [])

  return (
    <div
      className="flex h-full min-h-0 flex-col border-l border-line-strong bg-[color-mix(in_srgb,var(--surface)_55%,var(--crevasse))] max-[900px]:border-l-0 max-[900px]:border-t"
      role="status"
      aria-live="polite"
      data-briefing={phase}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line-strong bg-[color-mix(in_srgb,var(--melt)_6%,transparent)] px-4">
        <p className="flex items-center gap-2 font-mono text-[0.5625rem] uppercase tracking-[0.26em] text-melt">
          <span className="hud-tick" aria-hidden="true" style={{ width: 3, height: '0.7rem' }} />
          {t('briefing_title')}
        </p>
        <span className="font-mono text-[0.5rem] uppercase tracking-[0.24em] text-muted">{dateline}</span>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {phase === 'greeting' && (
          <div className="px-1 pt-2" aria-label={t('briefing_loading')}>
            <p className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.3em] text-muted">
              <span className="hud-dot" aria-hidden="true" />
              {t('briefing_loading')}
            </p>
            <div className="mt-4 space-y-3">
              {[0.92, 0.78, 0.86, 0.64, 0.71].map((width, index) => (
                <div key={index} className="briefing-skeleton" style={{ width: `${width * 100}%`, animationDelay: `${index * 0.12}s` }} />
              ))}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-muted">{t('briefing_unavailable_tag')}</p>
            <p className="max-w-[34ch] text-base leading-snug text-frost/85">
              {message || t('briefing_unavailable')}
            </p>
            <button type="button" className="hud-btn" onClick={() => void retryBriefing()}>
              {t('briefing_retry')}
            </button>
          </div>
        )}

        {phase === 'news' && (
          <ol className="flex flex-col">
            {items.map((item, index) => (
              <li key={`${index}-${item.link}`}>
                <button
                  type="button"
                  className="briefing-item group"
                  onClick={() => void openExternal(item.link)}
                  title={t('briefing_open_aria')}
                  aria-label={`${item.title} — ${item.source || 'Google News'}`}
                >
                  <span className="briefing-index">{pad(index + 1)}</span>
                  <span className="min-w-0">
                    <span className="briefing-headline">{item.title}</span>
                    <span className="briefing-meta">
                      {item.source && <span className="text-melt">{item.source}</span>}
                      {item.source && <span aria-hidden="true"> · </span>}
                      <span className="tabular-nums">{stamp(item.pubDate)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {message && (
              <li aria-hidden="true" className="px-2 pb-1 pt-3 text-center font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                {message}
              </li>
            )}
          </ol>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex h-12 shrink-0 items-center justify-between border-t border-line-strong px-4">
        <button
          type="button"
          className="hud-btn disabled:cursor-not-allowed disabled:opacity-35"
          onClick={replayLeadSpeech}
          disabled={phase !== 'news'}
        >
          {t('briefing_read_again')}
        </button>
        <button type="button" className="hud-btn hud-btn-solid" onClick={dismiss}>
          {t('briefing_dismiss')}
        </button>
      </div>
    </div>
  )
}
