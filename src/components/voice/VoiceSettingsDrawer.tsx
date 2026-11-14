// The gear drawer: face/orb, voice, rate, microphone, spoken replies, STT
// language, accent — everything Voice Mode persists, in one place.
import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../lib/useT.ts'
import { useSettings } from '../../store/settings.ts'
import { listVoices, onVoicesChanged } from '../../voice/speech.ts'
import { listMicrophones, type AudioInputInfo } from '../../voice/mic.ts'
import { stt, type SttStatus } from '../../voice/stt.ts'
import { useVoice } from '../../store/voice.ts'

const ACCENT_SWATCHES: Array<{ id: string; value: string; labelKey: string }> = [
  { id: 'theme', value: '', labelKey: 'voice_accent_theme' },
  { id: 'melt', value: '#5bc0de', labelKey: 'voice_accent_glacier' },
  { id: 'aqua', value: '#6fe3ff', labelKey: 'voice_accent_glint' },
  { id: 'sky', value: '#8fd0ff', labelKey: 'voice_accent_deep' },
]

export default function VoiceSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const drawerOpenClass = open ? 'translate-x-0' : 'translate-x-full'
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices())
  const [mics, setMics] = useState<AudioInputInfo[]>([])
  const [sttStatus, setSttStatus] = useState<SttStatus>(() => stt.getSnapshot().status)
  const [sttProgress, setSttProgress] = useState(() => stt.getSnapshot().progress)
  const [sttError, setSttError] = useState(() => stt.getSnapshot().error)

  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), [])
  useEffect(
    () =>
      stt.subscribe((snapshot) => {
        setSttStatus(snapshot.status)
        setSttProgress(snapshot.progress)
        setSttError(snapshot.error)
      }),
    [],
  )

  // Re-enumerate microphones each time the drawer opens; labels only exist
  // after permission was granted at least once.
  useEffect(() => {
    if (!open) return
    let alive = true
    void listMicrophones().then((list) => {
      if (alive) setMics(list)
    })
    return () => {
      alive = false
    }
  }, [open])

  // A stored device id goes stale when the headset is unplugged: re-find the
  // same microphone by name, or fall back to the system default.
  useEffect(() => {
    if (!settings.voiceInputDeviceId || mics.length === 0) return
    if (mics.some((mic) => mic.deviceId === settings.voiceInputDeviceId)) return
    const byLabel = settings.voiceInputDeviceLabel
      ? mics.find((mic) => mic.label === settings.voiceInputDeviceLabel)
      : undefined
    update(byLabel ? { voiceInputDeviceId: byLabel.deviceId } : { voiceInputDeviceId: '', voiceInputDeviceLabel: '' })
  }, [mics, settings.voiceInputDeviceId, settings.voiceInputDeviceLabel, update])

  const selectedMic = useMemo(() => {
    if (!settings.voiceInputDeviceId) return ''
    return mics.some((mic) => mic.deviceId === settings.voiceInputDeviceId) ? settings.voiceInputDeviceId : ''
  }, [mics, settings.voiceInputDeviceId])

  const pickMic = (deviceId: string) => {
    const mic = mics.find((item) => item.deviceId === deviceId)
    update({ voiceInputDeviceId: deviceId, voiceInputDeviceLabel: mic?.label ?? '' })
  }

  const sttConsent = settings.voiceSttConsent
  const downloadModel = () => {
    update({ voiceSttConsent: true })
    stt.load()
  }

  return (
    <>
      {open && <div className="absolute inset-0 z-10 bg-scrim/60" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`absolute right-0 top-0 z-20 flex h-full w-[330px] max-w-[92vw] transform flex-col border-l border-line bg-glacier transition-transform duration-200 ease-out ${drawerOpenClass}`}
        aria-hidden={!open}
        aria-label={t('voice_settings_aria')}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="display text-[1.05rem] text-frost">{t('voice_settings_aria')}</span>
          <button type="button" onClick={onClose} className="tap-bare" aria-label={t('modal_close')}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Presence */}
          <section>
            <p className="label">{t('voice_face_section')}</p>
            <div className="flex gap-2" role="radiogroup" aria-label={t('voice_face_section')}>
              {(['face', 'orb'] as const).map((faceMode) => {
                const active = settings.voiceFaceMode === faceMode
                return (
                  <button
                    key={faceMode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-voice-choice={faceMode}
                    onClick={() => update({ voiceFaceMode: faceMode })}
                    className={`voice-choice ${active ? 'is-active' : ''}`}
                  >
                    {faceMode === 'face' ? t('voice_face') : t('voice_orb')}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Voice output */}
          <section className="mt-6">
            <label className="label" htmlFor="voice-picker">{t('voice_voice_label')}</label>
            <select
              id="voice-picker"
              className="field"
              value={settings.voiceVoiceURI}
              onChange={(event) => update({ voiceVoiceURI: event.target.value })}
            >
              <option value="">{t('voice_voice_default')}</option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} — {voice.lang}
                </option>
              ))}
            </select>

            <label className="label mt-4" htmlFor="voice-rate">
              {t('voice_rate_label')} <span className="meta">{settings.voiceRate.toFixed(2)}×</span>
            </label>
            <input
              id="voice-rate"
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={settings.voiceRate}
              onChange={(event) => update({ voiceRate: Number(event.target.value) })}
              className="voice-range w-full"
              aria-valuemin={0.5}
              aria-valuemax={2}
              aria-valuenow={settings.voiceRate}
            />

            <label className="mt-4 flex cursor-pointer items-center gap-3 text-base text-frost">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--melt)]"
                checked={settings.voiceSpeakReplies}
                onChange={(event) => update({ voiceSpeakReplies: event.target.checked })}
              />
              {t('voice_speak_replies')}
            </label>
          </section>

          {/* Microphone */}
          <section className="mt-6">
            <label className="label" htmlFor="voice-mic">{t('voice_mic_label')}</label>
            <select id="voice-mic" className="field" value={selectedMic} onChange={(event) => pickMic(event.target.value)}>
              <option value="">{t('voice_mic_default')}</option>
              {mics.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>{mic.label}</option>
              ))}
            </select>

            <label className="label mt-4" htmlFor="voice-stt-language">{t('voice_stt_language')}</label>
            <select
              id="voice-stt-language"
              className="field"
              value={settings.voiceSttLanguage}
              onChange={(event) => update({ voiceSttLanguage: event.target.value })}
            >
              <option value="auto">{t('voice_stt_auto')}</option>
              <option value="en">{t('voice_stt_en')}</option>
              <option value="hi">{t('voice_stt_hi')}</option>
            </select>
          </section>

          {/* STT model */}
          <section className="mt-6 border border-line p-3">
            <p className="label">{t('voice_stt_section')}</p>
            <p className="text-[0.85rem] leading-snug text-muted">{t('voice_stt_model_note')}</p>
            {sttStatus === 'ready' ? (
              <p className="meta mt-2 text-melt">{t('voice_stt_ready')}</p>
            ) : sttStatus === 'loading' ? (
              <>
                <p className="meta mt-2">{t('voice_stt_downloading', { n: Math.round(sttProgress * 100) })}</p>
                <div className="mt-1 h-1 w-full bg-crevasse">
                  <div className="h-full bg-melt transition-[width] duration-150" style={{ width: `${Math.round(sttProgress * 100)}%` }} />
                </div>
              </>
            ) : sttStatus === 'error' ? (
              <>
                <p className="mt-2 text-[0.85rem] leading-snug text-frost">{t('voice_stt_error')}</p>
                {sttError && <p className="meta mt-1 break-words text-[0.7rem]">{sttError}</p>}
                <button type="button" className="tap mt-2" onClick={downloadModel}>{t('voice_stt_retry')}</button>
              </>
            ) : (
              <button type="button" className="tap tap-solid mt-3 border-0 px-4 py-2" onClick={downloadModel}>
                {t('voice_stt_download')}
              </button>
            )}
            {!sttConsent && sttStatus === 'idle' && (
              <p className="meta mt-2 text-[0.7rem]">Asks once before downloading.</p>
            )}
          </section>

          {/* Accent */}
          <section className="mt-6">
            <p className="label">{t('voice_accent_label')}</p>
            <div className="flex gap-2">
              {ACCENT_SWATCHES.map((swatch) => {
                const active = settings.voiceAccent === swatch.value
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`voice-swatch ${active ? 'is-active' : ''}`}
                    style={swatch.value ? { background: swatch.value } : undefined}
                    onClick={() => update({ voiceAccent: swatch.value })}
                    title={t(swatch.labelKey)}
                    aria-label={t(swatch.labelKey)}
                  />
                )
              })}
            </div>
            <p className="meta mt-2 text-[0.7rem]">{t((ACCENT_SWATCHES.find((s) => s.value === settings.voiceAccent) || ACCENT_SWATCHES[0]!).labelKey)}</p>
          </section>
        </div>
      </aside>
    </>
  )
}
