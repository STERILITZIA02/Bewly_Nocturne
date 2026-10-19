/** CSS time tokens may be serialized in seconds or milliseconds; WAAPI uses ms. */
export function getMotionDuration(style: CSSStyleDeclaration, property: string, fallback = 200): number {
  const value = style.getPropertyValue(property).trim()
  const match = /^(\d+(?:\.\d*)?|\.\d+)(ms|s)$/.exec(value)
  if (value === '0')
    return 0
  if (!match)
    return fallback
  const duration = Number(match[1]) * (match[2] === 's' ? 1000 : 1)
  return Number.isFinite(duration) ? duration : fallback
}

/**
 * Duration for a move across `steps` discrete positions. One step keeps the
 * base duration; longer travel always takes longer, growing sublinearly so a
 * distant jump stays responsive instead of crawling.
 */
export function getTravelDuration(base: number, steps: number): number {
  return base * Math.max(1, steps) ** 0.4
}
