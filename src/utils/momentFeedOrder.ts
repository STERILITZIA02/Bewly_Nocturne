export function countVisibleNewMomentItems<T>(
  sourceItems: readonly T[],
  filteredItems: readonly T[],
  originalNewCount: number,
  getCollaborativeKey: (item: T) => string | null,
): number {
  const normalizedNewCount = Number.isFinite(originalNewCount)
    ? Math.max(0, Math.floor(originalNewCount))
    : 0
  const unreadItems = new Set(sourceItems.slice(0, normalizedNewCount))
  const seenCollaborativeKeys = new Set<string>()
  let visibleNewCount = 0

  for (const item of filteredItems) {
    const collaborativeKey = getCollaborativeKey(item)
    if (collaborativeKey) {
      if (seenCollaborativeKeys.has(collaborativeKey))
        continue
      seenCollaborativeKeys.add(collaborativeKey)
    }

    if (unreadItems.has(item))
      visibleNewCount++
  }

  return visibleNewCount
}
