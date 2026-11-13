import { useSettings } from '../store/settings.js'
import { useTheme } from '../store/theme.js'
import { useT } from '../lib/useT.js'

// A word you can press. No sun, no moon, no icon: the label says what you get.
export default function ThemeToggle() {
  const theme = useTheme((state) => state.theme)
  const setTheme = useTheme((state) => state.set)
  const update = useSettings((state) => state.update)
  const { t } = useT()

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    update({ theme: next })
  }

  const target = theme === 'dark' ? t('theme_light') : t('theme_dark')

  return (
    <button
      type="button"
      onClick={toggle}
      className="tap-bare"
      aria-label={theme === 'dark' ? t('theme_switch_light') : t('theme_switch_dark')}
    >
      {target}
    </button>
  )
}
