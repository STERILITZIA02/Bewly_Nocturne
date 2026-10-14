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
