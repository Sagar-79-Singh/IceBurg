// Signature 2: the depth gauge.
//
// A thin vertical rule in the conversation's left margin. One tick per message,
// a mono depth label every fourth tick (one message = 2 m), and a diamond at the
// reading line. Ticks travel with their message, so the gauge is a real measure of
// the conversation rather than decoration. This is what replaces the old
// darkening veil: depth is counted, not shaded.
import { useEffect, useRef, useState } from 'react'

const METRES_PER_MESSAGE = 2
const LABEL_EVERY = 4

export default function DepthGauge({ nodeRef, count }) {
  const [ticks, setTicks] = useState([])
  const [readingLine, setReadingLine] = useState(0)
  const frame = useRef(0)

  // A plain effect, not a layout effect: the gauge lives beside the scroller, so it
  // must not measure before the whole conversation has been committed.
  useEffect(() => {
    const node = nodeRef?.current
    if (!node) return

    const measure = () => {
      const box = node.getBoundingClientRect()
      const line = box.height * 0.34
      const items = [...node.querySelectorAll('[data-depth-item]')]
      const next = items.map((item, index) => ({
        index,
        y: item.getBoundingClientRect().top - box.top,
      }))
      setTicks(next)
      setReadingLine(line)
    }

    // rAF keeps a fast scroll from laying out on every frame.
    const raf = window.requestAnimationFrame?.bind(window)
    const caf = window.cancelAnimationFrame?.bind(window)
    const schedule = () => {
      if (!raf) return measure()
      if (caf) caf(frame.current)
      frame.current = raf(measure)
    }

    measure()
    node.addEventListener('scroll', schedule, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    observer?.observe(node)
    return () => {
      if (caf) caf(frame.current)
      node.removeEventListener('scroll', schedule)
      observer?.disconnect()
    }
  }, [nodeRef, count])

  if (!count) return null

  // The message being read: the last one to have crossed the reading line.
  let current = 0
  ticks.forEach((tick) => {
    if (tick.y <= readingLine) current = tick.index
  })

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 w-[58px]" aria-hidden="true">
      <div className="absolute inset-y-0 left-[13px] w-px bg-line" />

      {ticks.map((tick) => {
        const lit = tick.index === current
        const labelled = tick.index % LABEL_EVERY === 0 || tick.index === count - 1
        // Only the ticks near the visible part of the column are drawn.
        const viewport = nodeRef?.current?.clientHeight || 900
        const onScreen = tick.y > -16 && tick.y < viewport + 16
        if (!onScreen) return null
        return (
          <div
            key={tick.index}
            className="absolute left-0 flex h-4 items-center gap-2"
            style={{ top: tick.y - 8 }}
          >
            <span className={lit ? 'gauge-tick gauge-tick-lit' : 'gauge-tick'} />
            {labelled && (
              <span className={`meta meta-tight ${lit ? 'text-frost' : 'text-muted'}`}>
                {tick.index * METRES_PER_MESSAGE} m
              </span>
            )}
          </div>
        )
      })}

      {/* The reading line: where the eye is, always visible. */}
      <div className="absolute inset-x-0" style={{ top: readingLine }}>
        <div className="gauge-marker" />
      </div>
    </div>
  )
}
