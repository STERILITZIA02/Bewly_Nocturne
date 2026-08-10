function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export interface AnchoredFloatingMenuPosition {
  top: number
  left: number
  width: number
  maxHeight: number
  openUp: boolean
}

export function computeAnchoredFloatingMenuPosition(
  anchor: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width'>,
  desiredHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  maximumHeight: number,
): AnchoredFloatingMenuPosition {
  const inset = 8
  const gap = 8
  const width = Math.min(anchor.width, Math.max(0, viewportWidth - inset * 2))
  const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - gap - inset)
  const spaceAbove = Math.max(0, anchor.top - gap - inset)
  const openUp = desiredHeight > spaceBelow && spaceAbove > spaceBelow
  const maxHeight = Math.min(maximumHeight, openUp ? spaceAbove : spaceBelow)
  const left = clamp(anchor.left, inset, Math.max(inset, viewportWidth - width - inset))

  return {
    top: openUp ? anchor.top - gap : anchor.bottom + gap,
    left,
    width,
    maxHeight,
    openUp,
  }
}

export function computeFloatingMenuPosition(
  anchor: { top: number, right: number, bottom: number },
  viewportWidth: number,
  viewportHeight: number,
) {
  const inset = 8
  const gap = 8
  const availableWidth = Math.max(0, viewportWidth - inset * 2)
  const availableHeight = Math.max(0, viewportHeight - inset * 2)
  const width = Math.min(240, availableWidth)
  const maxHeight = Math.min(406, availableHeight)
  const left = clamp(anchor.right - width, inset, Math.max(inset, viewportWidth - width - inset))

  const belowTop = anchor.bottom + gap
  const hasEnoughSpaceBelow = viewportHeight - inset - belowTop >= maxHeight
  const top = hasEnoughSpaceBelow
    ? belowTop
    : Math.max(inset, anchor.top - gap - maxHeight)

  return { left, top, width, maxHeight }
}
