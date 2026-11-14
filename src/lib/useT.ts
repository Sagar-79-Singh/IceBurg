// React hook bound to the settings store. Kept separate from i18n.ts so the
// dictionaries stay importable anywhere (tests, scripts, the main process).
import { useSettings } from '../store/settings.ts'
import { translate, isOtherLanguage, DEFAULT_LANGUAGE } from './i18n.ts'

/** const { t, lang, other } = useT() */
export function useT() {
  const language = useSettings((state) => state.settings?.language ?? DEFAULT_LANGUAGE)
  return {
    lang: language,
    other: isOtherLanguage(language),
    t: (key: string, vars?: Record<string, string | number>) => translate(language, key, vars),
  }
}
