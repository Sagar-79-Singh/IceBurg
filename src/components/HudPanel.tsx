// The HUD panel: chamfered translucent ice with a lit header strip —
// an accent tick, a letterspaced title and an optional mono code at the
// far edge (LIVE / names / counts). Content goes in .hud-body.
import type React from 'react'

export default function HudPanel({
  title,
  code,
  right,
  className = '',
  bodyClassName = '',
  children,
}: {
  title?: string
  code?: string
  right?: React.ReactNode
  className?: string
  bodyClassName?: string
  children?: React.ReactNode
}) {
  return (
    <section className={`hud-panel ${className}`}>
      {title && (
        <header className="hud-panel-head">
          <span className="hud-tick" aria-hidden="true" />
          <h2 className="hud-title">{title}</h2>
          {right ?? (code ? <span className="hud-code">{code}</span> : null)}
        </header>
      )}
      <div className={`hud-body ${bodyClassName}`}>{children}</div>
    </section>
  )
}
