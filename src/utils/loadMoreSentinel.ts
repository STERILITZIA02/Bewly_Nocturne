export interface VerticalRect {
  top: number
  bottom: number
}

export function isSentinelWithinLoadThreshold(
  viewportRect: VerticalRect,
  sentinelRect: VerticalRect,
  threshold: number,
): boolean {
  return sentinelRect.top <= viewportRect.bottom + Math.max(0, threshold)
    && sentinelRect.bottom >= viewportRect.top
}
