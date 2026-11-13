// The IceBurg mark: the app icon, drawn in code so it can take the accent colour,
// scale cleanly, and sit in the interface the way other apps show their own logo.
//
// A sharp berg above the line, a much larger mass below it, and one glint where
// the two meet. `weight` picks a detail level: the 20px header mark leaves out the
// underwater facets so it stays legible.
export default function BergMark({ size = 22, weight = 'solid', className = '' }) {
  const water = weight === 'solid' ? 0.52 : 0.5
  return (
    <svg
      width={size}
      height={size * 1.16}
      viewBox="0 0 40 46"
      className={className}
      role="img"
      aria-label="IceBurg"
    >
      {/* above the waterline: pale ice */}
      <polygon points="20,2 26,18 33,26 27,27 20,27 13,26 15,17" fill="var(--frost)" />
      <polygon points="20,2 26,18 24,26 20,27" fill="var(--glint)" opacity="0.55" />
      {/* below the waterline: cut planes, deepest at the keel */}
      {weight === 'solid' && (
        <>
          <polygon
            points="13,28 20,28 20,44 16,38"
            fill="var(--melt)"
            opacity="0.34"
          />
          <polygon points="20,28 27,28 24,40 20,44" fill="var(--melt)" opacity="0.22" />
          <polygon points="27,28 33,27 28,34" fill="var(--melt)" opacity="0.16" />
          <polygon points="7,27 13,28 16,38" fill="var(--melt)" opacity="0.12" />
        </>
      )}
      {weight !== 'solid' && (
        <polygon points="13,28 20,28 20,42 16,36" fill="var(--melt)" opacity="0.3" />
      )}
      {/* the waterline itself */}
      <line
        x1="2"
        y1={water * 46}
        x2="38"
        y2={water * 46}
        stroke="var(--melt)"
        strokeWidth="1.6"
      />
    </svg>
  )
}
