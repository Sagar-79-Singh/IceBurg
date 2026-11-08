/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // RGB triplets, so opacity modifiers work: text-frost/85, bg-glacier/60.
        sea: 'rgb(var(--sea-rgb) / <alpha-value>)',
        glacier: 'rgb(var(--glacier-rgb) / <alpha-value>)',
        frost: 'rgb(var(--frost-rgb) / <alpha-value>)',
        melt: 'rgb(var(--melt-rgb) / <alpha-value>)',
        crevasse: 'rgb(var(--crevasse-rgb) / <alpha-value>)',
        abyss: 'rgb(var(--abyss-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        'on-melt': 'rgb(var(--on-melt-rgb) / <alpha-value>)',
        // Hairlines carry their own alpha.
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
      },
      fontFamily: {
        sans: ['"Source Sans 3 Variable"', '"Source Sans 3"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.5' }],
        sm: ['0.8125rem', { lineHeight: '1.55' }],
        base: ['0.9375rem', { lineHeight: '1.65' }],
        md: ['1.0625rem', { lineHeight: '1.7' }],
        lg: ['1.25rem', { lineHeight: '1.45' }],
        xl: ['1.625rem', { lineHeight: '1.3' }],
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
      },
      maxWidth: {
        prose: '68ch',
      },
      transitionDuration: {
        DEFAULT: '160ms',
      },
    },
  },
  plugins: [],
}
