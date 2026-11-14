// A live console clock: HH:MM:SS on one line, the date under it — mono,
// quiet, never focused. Decorative, so hidden from screen readers.
import { useEffect, useState } from 'react'

function stamp() {
  const now = new Date()
  return {
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    date: now
      .toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
      .toUpperCase(),
  }
}

export default function StatusClock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(stamp)

  useEffect(() => {
    const id = setInterval(() => setNow(stamp()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={`flex flex-col items-end leading-none ${className}`} aria-hidden="true">
      <span className="font-mono text-[1.15rem] font-light tracking-[0.08em] text-frost tabular-nums">
        {now.time}
      </span>
      <span className="mt-1 font-mono text-[0.5625rem] tracking-[0.24em] text-melt">{now.date}</span>
    </div>
  )
}
