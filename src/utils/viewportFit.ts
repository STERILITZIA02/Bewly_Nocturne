/**
 * How far to move a box sideways so it keeps `inset` from the viewport's left
 * and right edges: 0 when it fits, negative to move it left. A box wider than
 * the room keeps its left edge in.
 */
export function getViewportShiftX(box: { left: number, right: number }, viewportWidth: number, inset: number) {
  if (box.right > viewportWidth - inset)
    return Math.max(viewportWidth - inset - box.right, inset - box.left)
  return box.left < inset ? inset - box.left : 0
}
