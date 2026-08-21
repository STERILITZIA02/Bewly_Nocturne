export function clampRangeValue(value: number, min: number, max: number): number {
  const lower = Math.min(min, max)
  const upper = Math.max(min, max)
  if (!Number.isFinite(value))
    return lower
  return Math.min(upper, Math.max(lower, value))
}

export function getRangeProgress(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min)
    return 0

  const clamped = clampRangeValue(value, min, max)
  return ((clamped - min) / (max - min)) * 100
}
