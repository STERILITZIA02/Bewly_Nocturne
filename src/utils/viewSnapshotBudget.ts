const MAX_ESTIMATE_DEPTH = 3

/**
 * Low-cost size of a parked view: one per scalar field, the element count of
 * every array / Map / Set, and the same for nested containers up to a small
 * depth. Entities inside a list are counted once, never walked or serialized.
 */
export function estimateSnapshotEntries(value: unknown, depth = 0): number {
  if (!value || typeof value !== 'object')
    return 1
  if (Array.isArray(value)) {
    if (depth >= MAX_ESTIMATE_DEPTH)
      return value.length
    let entries = value.length
    // Only nested containers add to the count (e.g. [key, measurement] tuples).
    for (const item of value) {
      if (Array.isArray(item))
        entries += item.length
    }
    return entries
  }
  if (value instanceof Map || value instanceof Set)
    return value.size
  if (depth >= MAX_ESTIMATE_DEPTH)
    return 1
  let entries = 0
  for (const field of Object.values(value))
    entries += estimateSnapshotEntries(field, depth + 1)
  return Math.max(1, entries)
}
