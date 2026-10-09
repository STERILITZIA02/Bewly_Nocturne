import type { CommentTreeAnchor } from '~/utils/commentTreeGeometry'
import { buildCommentBranchPath } from '~/utils/commentTreeGeometry'

interface Anchor extends CommentTreeAnchor { toggleY: number }
interface Branch {
  parentAnchor: Anchor
  childAnchors: Anchor[]
  collapsed: boolean
  collapseParentBody: boolean
  trunkExtendY?: number
}

export function getCommentReplyBranchToggleY(branch: Branch, radius: number) {
  const { parentAnchor: parent, childAnchors: children } = branch
  if (branch.collapsed)
    return branch.collapseParentBody ? parent.centerY : Math.max(parent.bottom + radius, parent.toggleY)
  if (!children.length)
    return Math.max(parent.bottom + radius, parent.toggleY)
  const end = children[children.length - 1].centerY
  const minimum = parent.bottom + radius
  const maximum = end - radius
  return maximum <= minimum ? parent.bottom + (end - parent.bottom) / 2 : Math.min(Math.max(parent.toggleY, minimum), maximum)
}

export function getCommentReplyBranchPath(branch: Branch, branchRadius: number, toggleHitRadius: number) {
  const { parentAnchor: parent, childAnchors: children } = branch
  if (!branch.collapsed)
    return buildCommentBranchPath(parent, children, branchRadius, branch.trunkExtendY)
  const coordinate = (value: number) => String(Math.round(value * 100) / 100)
  if (branch.collapseParentBody)
    return `M ${coordinate(parent.centerX)} ${coordinate(parent.centerY)}`
  const end = Math.max(getCommentReplyBranchToggleY(branch, toggleHitRadius) + toggleHitRadius, parent.bottom + toggleHitRadius * 2)
  return `M ${coordinate(parent.centerX)} ${coordinate(parent.bottom)} V ${coordinate(end)}`
}
