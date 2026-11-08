import { useSettings } from '../store/settings.js'
import { useTheme } from '../store/theme.js'
import { SunIcon, MoonIcon } from './icons.jsx'

// One control, one palette swap. The choice is stored with the other settings.
export default function ThemeToggle() {
  const theme = useTheme((state) => state.theme)
  const setTheme = useTheme((state) => state.set)
  const update = useSettings((state) => state.update)

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    update({ theme: next })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-quiet btn-icon"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
