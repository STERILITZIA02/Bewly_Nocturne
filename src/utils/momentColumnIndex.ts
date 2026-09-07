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

  function window(start: number, end: number) {
    return columns.map(({ items, metrics }) => {
      const count = items.length
      const total = metrics.offset(count)
      let first = start >= total ? count : metrics.rowAt(Math.max(0, start))
      if (first < count && metrics.offset(first + 1) - gap < start)
        first++
      const last = end < 0 ? 0 : Math.min(count, metrics.rowAt(end) + 1)
      return {
        topPad: resolveVirtualSpacerSize(metrics.offset(first), gap),
        bottomPad: resolveVirtualSpacerSize(total - metrics.offset(last), gap),
        items: items.slice(first, last),
      }
    })
  }

  return { sync, updateHeight, window }
}
