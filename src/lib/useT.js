// React hook bound to the settings store. Kept separate from i18n.js so the
// dictionaries stay importable anywhere (tests, scripts, the main process).
import { useSettings } from '../store/settings.js'
import { translate, isOtherLanguage, DEFAULT_LANGUAGE } from './i18n.js'

/** const { t, lang, other } = useT() */
export function useT() {
  const language = useSettings((state) => state.settings?.language ?? DEFAULT_LANGUAGE)
  return {
    lang: language,
    other: isOtherLanguage(language),
    t: (key, vars) => translate(language, key, vars),
  }
}
