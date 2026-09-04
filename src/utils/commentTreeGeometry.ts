export interface CommentTreeAnchor {
  bottom: number
  centerX: number
  centerY: number
  left: number
}

/** One path per parent: the final elbow ends the trunk, without an overshoot. */
export function buildCommentBranchPath(
  parent: CommentTreeAnchor,
  children: CommentTreeAnchor[],
  branchRadius: number,
  trunkExtendY?: number,
): string | null {
  if (!children.length && typeof trunkExtendY !== 'number')
    return null
  const coordinate = (value: number) => String(Math.round(value * 100) / 100)
  const x = parent.centerX
  const radii = children.map(child => Math.max(0, Math.min(
    branchRadius,
    child.left - x,
    child.centerY - parent.bottom,
  )))
  const lastIndex = children.length - 1
  let trunkEndY = lastIndex >= 0 ? children[lastIndex].centerY - radii[lastIndex] : parent.bottom
  if (typeof trunkExtendY === 'number' && Number.isFinite(trunkExtendY))
    trunkEndY = Math.max(trunkEndY, trunkExtendY)

  const commands: string[] = []
  if (trunkEndY > parent.bottom + 0.5)
    commands.push(`M ${coordinate(x)} ${coordinate(parent.bottom)} V ${coordinate(trunkEndY)}`)
  children.forEach((child, index) => {
    if (child.left <= x)
      return
    const radius = radii[index]
    if (radius <= 0) {
      commands.push(`M ${coordinate(x)} ${coordinate(child.centerY)} H ${coordinate(child.left)}`)
      return
    }
    commands.push(
      `M ${coordinate(x)} ${coordinate(child.centerY - radius)}`,
      `A ${coordinate(radius)} ${coordinate(radius)} 0 0 0 ${coordinate(x + radius)} ${coordinate(child.centerY)}`,
      `H ${coordinate(child.left)}`,
    )
  })
  return commands.length ? commands.join(' ') : null
}
