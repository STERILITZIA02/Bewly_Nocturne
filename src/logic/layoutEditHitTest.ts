export interface LayoutEditableHitRect {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

export interface LayoutEditableHitCandidate {
  depth?: number
  rect: LayoutEditableHitRect
}

export function pickLayoutEditableAtPoint<T extends LayoutEditableHitCandidate>(
  candidates: readonly T[],
  x: number,
  y: number,
): T | undefined {
  let match: T | undefined
  let matchArea = Number.POSITIVE_INFINITY
  let matchDepth = -1

  for (const candidate of candidates) {
    const { rect } = candidate
    if (rect.width <= 0 || rect.height <= 0)
      continue
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
      continue

    const depth = candidate.depth ?? 0
    const area = rect.width * rect.height
    if (area < matchArea || (area === matchArea && depth > matchDepth)) {
      match = candidate
      matchDepth = depth
      matchArea = area
    }
  }

  return match
}
