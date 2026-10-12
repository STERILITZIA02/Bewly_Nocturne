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

export interface AnchoredPopoverPosition {
  top: number
  left: number
  openUp: boolean
}

export type FloatingAnchor = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width'>
export type PopoverPositionResolver = (anchor: FloatingAnchor, popup: { width: number, height: number }, viewportWidth: number, viewportHeight: number) => AnchoredPopoverPosition
export type TooltipPlacement = 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'

export function computeTooltipPosition(anchor: FloatingAnchor, popup: { width: number, height: number }, viewportWidth: number, viewportHeight: number, placement: TooltipPlacement): AnchoredPopoverPosition {
  const inset = 8
  let left = anchor.left + (anchor.width - popup.width) / 2
  let top = anchor.top - popup.height - inset
  if (placement.startsWith('bottom')) {
    top = anchor.bottom + inset
    if (top + popup.height > viewportHeight - inset)
      top = anchor.top - popup.height - inset
    if (placement === 'bottom-left')
      left = anchor.left
    if (placement === 'bottom-right')
      left = anchor.right - popup.width
  }
  else if (placement === 'left' || placement === 'right') {
    left = placement === 'left' ? anchor.left - popup.width - inset : anchor.right + inset
    top = anchor.top + (anchor.bottom - anchor.top - popup.height) / 2
  }
  else if (top < inset) {
    top = anchor.bottom + inset
  }
  return {
    left: clamp(left, inset, Math.max(inset, viewportWidth - popup.width - inset)),
    top: clamp(top, inset, Math.max(inset, viewportHeight - popup.height - inset)),
    openUp: top < anchor.top,
  }
}

export function computeAnchoredPopoverPosition(
  anchor: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width'>,
  popup: { width: number, height: number },
  viewportWidth: number,
  viewportHeight: number,
): AnchoredPopoverPosition {
  const inset = 16
  const gap = 8
  const spaceBelow = viewportHeight - anchor.bottom - gap - inset
  const spaceAbove = anchor.top - gap - inset
  const openUp = popup.height > spaceBelow && spaceAbove > spaceBelow
  const idealTop = openUp
    ? anchor.top - gap - popup.height
    : anchor.bottom + gap
  const idealLeft = anchor.left + anchor.width / 2 - popup.width / 2

  return {
    top: clamp(idealTop, inset, Math.max(inset, viewportHeight - popup.height - inset)),
    left: clamp(idealLeft, inset, Math.max(inset, viewportWidth - popup.width - inset)),
    openUp,
  }
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

export interface FloatingMenuPosition {
  top?: string
  bottom?: string
  left: string
  width: string
  maxHeight: string
  direction: 'up' | 'down'
}

export function computeFloatingMenuPosition(
  anchor: { top: number, right: number, bottom: number },
  viewportWidth: number,
  viewportHeight: number,
): FloatingMenuPosition {
  const inset = 8
  const gap = 8
  const availableWidth = Math.max(0, viewportWidth - inset * 2)
  const availableHeight = Math.max(0, viewportHeight - inset * 2)
  const width = Math.min(240, availableWidth)
  const maximumHeight = Math.min(406, availableHeight)
  const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - gap - inset)
  const spaceAbove = Math.max(0, anchor.top - gap - inset)
  const openUp = maximumHeight > spaceBelow && spaceAbove > spaceBelow
  const maxHeight = Math.min(maximumHeight, openUp ? spaceAbove : spaceBelow)
  const left = clamp(anchor.right - width, inset, Math.max(inset, viewportWidth - width - inset))

  return {
    top: openUp ? undefined : `${anchor.bottom + gap}px`,
    bottom: openUp ? `${viewportHeight - anchor.top + gap}px` : undefined,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    direction: openUp ? 'up' : 'down',
  }
}
