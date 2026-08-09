export function mergeWatchLaterItemsByAid<T extends { aid: number }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set<number>()
  return [...existing, ...incoming].filter((item) => {
    if (!Number.isFinite(item.aid) || seen.has(item.aid))
      return false
    seen.add(item.aid)
    return true
  })
}
