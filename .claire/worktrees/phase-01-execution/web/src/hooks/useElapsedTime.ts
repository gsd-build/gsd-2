// GSD Web UI — Elapsed Time Hook
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useState, useEffect } from 'react'

/** Format milliseconds into human-readable elapsed time: "1h 23m 45s" */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || h > 0) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

/** Hook that returns a ticking elapsed time string from a Unix timestamp (ms) */
export function useElapsedTime(startTime: number | undefined | null): string {
  const [elapsed, setElapsed] = useState(() =>
    startTime ? Date.now() - startTime : 0
  )

  useEffect(() => {
    if (!startTime) return
    setElapsed(Date.now() - startTime)
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000)
    return () => clearInterval(id)
  }, [startTime])

  return formatElapsed(elapsed)
}
