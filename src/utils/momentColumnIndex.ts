import { CardRowMetrics } from './cardRowMetrics'
import { resolveVirtualSpacerSize } from './momentsLayout'

/** Derived height index. The caller remains the sole owner of measured card heights. */
export function createMomentColumnIndex<T>(keyOf: (item: T) => string, heightOf: (item: T) => number, gap: number) {
  let columns: { items: T[], count: number, metrics: CardRowMetrics }[] = []
  let layout: unknown
  const locations = new Map<string, { column: number, row: number }>()

  function sync(next: T[][], layoutKey: unknown) {
    if (layout === layoutKey && next.length === columns.length && next.every((items, index) => columns[index].items === items && columns[index].count === items.length))
      return
    layout = layoutKey
    locations.clear()
    columns = next.map((items, column) => {
      const metrics = new CardRowMetrics()
      metrics.reset(items.map((item, row) => {
        locations.set(keyOf(item), { column, row })
        return heightOf(item) + gap
      }))
      return { items, count: items.length, metrics }
    })
  }

  function updateHeight(key: string, height: number) {
    const location = locations.get(key)
    if (location)
      columns[location.column].metrics.set(location.row, height + gap)
  }

  function window(start: number, end: number, retained: ReadonlySet<string> = new Set()) {
    const retainedRows = new Map<number, number[]>()
    for (const key of retained) {
      const position = locations.get(key)
      if (position) {
        const rows = retainedRows.get(position.column) ?? []
        rows.push(position.row)
        retainedRows.set(position.column, rows)
      }
    }
    return columns.map(({ items, metrics }, column) => {
      const count = items.length
      const total = metrics.offset(count)
      let first = start >= total ? count : metrics.rowAt(Math.max(0, start))
      if (first < count && metrics.offset(first + 1) - gap < start)
        first++
      const last = end < 0 ? 0 : Math.min(count, metrics.rowAt(end) + 1)
      const pinned = retainedRows.get(column)
      if (pinned?.length) {
        const rows = [...new Set([...Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index), ...pinned])].sort((a, b) => a - b)
        const gaps = rows.map((row, index) => index && row > rows[index - 1] + 1
          ? resolveVirtualSpacerSize(metrics.offset(row) - metrics.offset(rows[index - 1] + 1), gap)
          : 0)
        return {
          topPad: resolveVirtualSpacerSize(metrics.offset(rows[0]), gap),
          bottomPad: resolveVirtualSpacerSize(total - metrics.offset(rows[rows.length - 1] + 1), gap),
          items: rows.map(row => items[row]),
          ...(gaps.some(Boolean) ? { gaps } : {}),
        }
      }
      return {
        topPad: resolveVirtualSpacerSize(metrics.offset(first), gap),
        bottomPad: resolveVirtualSpacerSize(total - metrics.offset(last), gap),
        items: items.slice(first, last),
      }
    })
  }

  return { sync, updateHeight, window }
}
