import { useSettings } from '../store/settings.js'
import { useTheme } from '../store/theme.js'

// A word you can press. No sun, no moon, no icon: the label says what you get.
export default function ThemeToggle() {
  const theme = useTheme((state) => state.theme)
  const setTheme = useTheme((state) => state.set)
  const update = useSettings((state) => state.update)

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    update({ theme: next })
  }

  const target = theme === 'dark' ? 'Light' : 'Dark'

  return (
    <button
      type="button"
      onClick={toggle}
      className="tap-bare"
      aria-label={`Switch to ${target.toLowerCase()} theme`}
    >
      {target}
    </button>
  )
}
