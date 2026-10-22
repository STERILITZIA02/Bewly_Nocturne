import { CardRowMetrics } from './cardRowMetrics'
import { resolveVirtualSpacerSize } from './momentsLayout'

export interface MasonryWindowSnapshot {
  width: number
  gap: number
  keys: string[]
  columns: string[][]
  heights: Array<[string, number]>
}

/**
 * Derived height index. The caller remains the sole owner of measured card
 * heights and of the column arrays, which only grow by `push` or are replaced.
 * A grown column extends its rows; a replaced column rebuilds alone; a changed
 * layout key (width, gap, measurement revision) or column count rebuilds all.
 */
export function createMomentColumnIndex<T>(keyOf: (item: T) => string, heightOf: (item: T) => number, gapOf: number | (() => number)) {
  let gap = typeof gapOf === 'function' ? gapOf() : gapOf
  let columns: { items: T[], count: number, metrics: CardRowMetrics }[] = []
  let layout: unknown
  const locations = new Map<string, { column: number, row: number }>()

  function buildColumn(items: T[], column: number) {
    const metrics = new CardRowMetrics()
    metrics.reset(items.map((item, row) => {
      locations.set(keyOf(item), { column, row })
      return heightOf(item) + gap
    }))
    return { items, count: items.length, metrics }
  }

  function sync(next: T[][], layoutKey: unknown) {
    if (layout !== layoutKey || next.length !== columns.length) {
      layout = layoutKey
      // The layout key covers the measured gap, so read it once per rebuild.
      gap = typeof gapOf === 'function' ? gapOf() : gapOf
      locations.clear()
      columns = next.map(buildColumn)
      return
    }
    next.forEach((items, column) => {
      const current = columns[column]
      if (current.items === items && current.count === items.length)
        return
      if (current.items === items && items.length > current.count) {
        const added = items.slice(current.count)
        current.metrics.append(added.map((item, offset) => {
          locations.set(keyOf(item), { column, row: current.count + offset })
          return heightOf(item) + gap
        }))
        current.count = items.length
        return
      }
      for (const [key, location] of locations) {
        if (location.column === column)
          locations.delete(key)
      }
      columns[column] = buildColumn(items, column)
    })
  }

  function updateHeight(key: string, height: number) {
    const location = locations.get(key)
    if (location)
      columns[location.column].metrics.set(location.row, height + gap)
  }

  /** Stack height (rows plus inner gaps) of a column the index is in sync with. */
  function stackHeight(items: T[]): number | undefined {
    const column = columns.find(entry => entry.items === items)
    if (!column || column.count !== items.length)
      return undefined
    return column.count ? column.metrics.total - gap : 0
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

  function offsetOf(key: string) {
    const location = locations.get(key)
    return location ? columns[location.column].metrics.offset(location.row) : undefined
  }

  return { sync, updateHeight, stackHeight, locate: (key: string) => locations.get(key), offsetOf, window }
}
