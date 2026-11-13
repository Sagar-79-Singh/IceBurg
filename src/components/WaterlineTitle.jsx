// Signature 1: the waterline title.
//
// A chat's title sits on a thin, slowly moving line of water. Under the line the
// title is repeated, mirrored and very faint, like a reflection. The first
// message starts below this block, in the darker water.
//
// All motion is CSS (keyframes in index.css) so reduced-motion can stop it; no
// SMIL is used because a media query cannot switch that off.
import { useT } from '../lib/useT.js'

export default function WaterlineTitle({ title, meta }) {
  const { t } = useT()
  const label = title || t('header_new_chat')

  return (
    <div className="relative">
      <h1
        className="display truncate text-[clamp(1.65rem,2.5vw,2.45rem)] text-frost"
        title={label}
      >
        {label}
      </h1>

      {/* The surface. One long ripple, a slower second wave, and a glint that
          travels along the line now and then. Decorative only. */}
      <div className="waterline" aria-hidden="true">
        <svg viewBox="0 0 600 10" preserveAspectRatio="none">
          <g className="waterline-slide">
            <path
              className="waterline-wave"
              d="M0 5 Q 50 1.2 100 5 T 200 5 T 300 5 T 400 5 T 500 5 T 600 5 T 700 5"
              opacity="0.85"
            />
            <path
              className="waterline-wave waterline-wave-slow"
              d="M0 6.6 Q 50 9.4 100 6.6 T 200 6.6 T 300 6.6 T 400 6.6 T 500 6.6 T 600 6.6 T 700 6.6"
              opacity="0.4"
            />
          </g>
          <path className="waterline-glint" d="M0 5 H 78" />
        </svg>

        {/* The reflection: the same words, flipped, fading as it sinks. */}
        <span className="waterline-mirror" style={{ opacity: 0.16 }}>
          <span
            className="waterline-mirror-in text-[clamp(1.65rem,2.5vw,2.45rem)]"
            aria-hidden="true"
          >
            {label}
          </span>
        </span>
      </div>

      {meta && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 pt-10">{meta}</div>
      )}
    </div>
  )
}
