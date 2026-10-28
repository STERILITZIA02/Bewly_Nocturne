import { getSearchPubtimeRange } from '~/utils/searchUrl'

import type { VideoSearchFilters } from '../types'

/**
 * 构建视频搜索参数
 */
export function buildVideoSearchParams(options: {
  loadMore: boolean
  context: string
  filters: VideoSearchFilters
}) {
  const { loadMore, context, filters } = options
  const rangeParams = getSearchPubtimeRange(filters)
  return {
    context: loadMore ? context : '',
    filters: {
      duration: filters.duration,
      order: filters.order,
      tids: filters.tids || undefined,
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
