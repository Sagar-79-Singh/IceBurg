/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // RGB triplets, so opacity modifiers work: text-frost/85, bg-glacier/60.
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        glacier: 'rgb(var(--glacier-rgb) / <alpha-value>)',
        frost: 'rgb(var(--frost-rgb) / <alpha-value>)',
        melt: 'rgb(var(--melt-rgb) / <alpha-value>)',
        glint: 'rgb(var(--glint-rgb) / <alpha-value>)',
        crevasse: 'rgb(var(--crevasse-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        'on-melt': 'rgb(var(--on-melt-rgb) / <alpha-value>)',
        // Hairlines carry their own alpha.
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans Variable"', '"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Martian Mono Variable"', '"Martian Mono"', 'ui-monospace', 'monospace'],
      },
      // Nothing under 14px. The hierarchy comes from the gap between these and
      // the display sizes below, not from shrinking labels.
      fontSize: {
        // The floor is 14px, including xs: legacy names are raised, not kept.
        xs: ['0.875rem', { lineHeight: '1.5' }],
        sm: ['0.9375rem', { lineHeight: '1.55' }],
        micro: ['0.875rem', { lineHeight: '1.4' }], // metadata, mono
        base: ['0.9375rem', { lineHeight: '1.6' }], // controls
        prose: ['1.0625rem', { lineHeight: '1.65' }], // read text
        lg: ['1.1875rem', { lineHeight: '1.5' }],
        lead: ['1.25rem', { lineHeight: '1.45' }],
      },
      // Deliberately not a shared scale: each shape in the app is its own shape.
      transitionDuration: {
        DEFAULT: '160ms',
      },
      screens: {
        rail: '1100px',
      },
    },
  },
  plugins: [],
}
