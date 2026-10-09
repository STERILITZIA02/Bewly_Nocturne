import type { VideoSearchFilters } from '../types'
import { parseLocalCalendarDate, toLocalDate } from './localDate'

/**
 * 获取时间范围参数
 */
export function getTimeRangeParams(filters: VideoSearchFilters): { pubtimeBegin?: number, pubtimeEnd?: number } {
  const { timeRange, customStartDate, customEndDate } = filters

  // 自定义日期范围
  if (timeRange === 'custom') {
    // 如果没有输入任何日期，返回空
    if (!customStartDate && !customEndDate)
      return {}

    let begin = 0
    let end = Math.floor(Date.now() / 1000)

    // 解析开始日期
    if (customStartDate) {
      const parsedStart = parseLocalCalendarDate(customStartDate)
      if (parsedStart)
        begin = Math.floor(toLocalDate(parsedStart).getTime() / 1000)
    }

    // 解析结束日期（设置为当天的23:59:59）
    if (customEndDate) {
      const parsedEnd = parseLocalCalendarDate(customEndDate)
      if (parsedEnd) {
        const endDate = toLocalDate(parsedEnd)
        endDate.setHours(23, 59, 59, 999)
        end = Math.floor(endDate.getTime() / 1000)
      }
    }

    // 如果开始日期大于结束日期，交换它们
    if (begin > 0 && end > 0 && begin > end)
      [begin, end] = [end, begin]

    return {
      pubtimeBegin: begin,
      pubtimeEnd: end,
    }
  }

  // 预设日期范围
  if (timeRange === 'all')
    return {}

  const now = Math.floor(Date.now() / 1000)
  let begin = 0
  switch (timeRange) {
    case 'day':
      begin = now - 24 * 3600
      break
    case 'week':
      begin = now - 7 * 24 * 3600
      break
    case 'halfyear':
      begin = now - 180 * 24 * 3600
      break
    default:
      begin = 0
  }
  if (begin <= 0)
    return {}
  return {
    pubtimeBegin: begin,
    pubtimeEnd: now,
  }
}

/**
 * 构建视频搜索参数
 */
export function buildVideoSearchParams(options: {
  loadMore: boolean
  context: string
  filters: VideoSearchFilters
}) {
  const { loadMore, context, filters } = options
  const rangeParams = getTimeRangeParams(filters)
  return {
    context: loadMore ? context : '',
    filters: {
      duration: filters.duration,
      order: filters.order,
      ...rangeParams,
    },
  }
}

/**
 * 去重辅助函数
 */
export function dedupeByKey<T>(items: T[], keyGetter: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  items.forEach((item) => {
    const key = keyGetter(item)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  })
  return result
}
