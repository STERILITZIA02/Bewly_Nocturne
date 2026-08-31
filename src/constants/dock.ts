export type DockCollapseMode = 'button' | 'hidden' | 'automatic'

export function shouldShowDockCollapseButton(mode: DockCollapseMode): boolean {
  return mode === 'button'
}

export function shouldAutoCollapseDock(mode: DockCollapseMode): boolean {
  return mode === 'automatic'
}

export function getDockCollapsedStateForMode(mode: DockCollapseMode, isHovered: boolean): boolean {
  return shouldAutoCollapseDock(mode) && !isHovered
}

export function getPreservedDockStageSize(
  preserveSize: boolean,
  width: number,
  height: number,
): { width: number, height: number } | undefined {
  if (!preserveSize || !width || !height)
    return undefined

  return { width, height }
}

export function resolveDockCollapsedShellSize(measuredSize: number, expectedSize: number): number {
  const safeExpectedSize = Number.isFinite(expectedSize) && expectedSize > 0 ? expectedSize : 1
  const tolerance = Math.max(2, safeExpectedSize * 0.1)
  if (!Number.isFinite(measuredSize) || Math.abs(measuredSize - safeExpectedSize) > tolerance)
    return safeExpectedSize
  return measuredSize
}
