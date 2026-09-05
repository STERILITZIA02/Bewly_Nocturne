import { computed, onMounted, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import type { SearchRequest } from '~/constants/searchApi'
import { settings } from '~/logic'

import type { SearchCategory } from '../types'
import { dedupeByKey } from '../utils/searchHelpers'
import { useLoadMore } from './useLoadMore'
import { usePagination } from './usePagination'
import { useSearchRequest } from './useSearchRequest'

interface SearchListRequestContext {
  keyword: string
  page: number
  loadMore: boolean
  context: string
}

interface SearchListPageOptions<T> {
  category: SearchCategory
  keyword: () => string
  initialPage: () => number | undefined
  buildRequest: (context: SearchListRequestContext) => SearchRequest
  itemKey: (item: T) => string
  transformItems?: (items: any[]) => T[]
  onPageChange: (page: number) => void
}

/** Array-result pages share request ownership and pagination, while retaining their own adapters and views. */
export function useSearchListPage<T>(options: SearchListPageOptions<T>) {
  const { haveScrollbar, handleBackToTop } = useBewlyApp()
  const paginationMode = computed(() => settings.value.searchResultsPaginationMode)
  const request = useSearchRequest<T[]>(options.category)
  const { isLoading, error, results, requestScope } = request
  const pagination = usePagination()
  const { currentPage, totalResults, totalPages } = pagination
  const loadMore = useLoadMore(async () => {
    const previousCount = results.value?.length ?? 0
    const success = await performSearch(true)
    return { success, appendedCount: Math.max(0, (results.value?.length ?? 0) - previousCount) }
  }, { isLoading: () => isLoading.value })

  function runSearch(page: number, append: boolean, updateUrl = false): Promise<boolean> {
    const keyword = options.keyword().trim()
    if (!keyword)
      return Promise.resolve(false)
    const previousLength = results.value?.length ?? 0
    return request.search(options.buildRequest({ keyword, page, loadMore: append, context: pagination.context.value }), (response) => {
      const rawData = response.data
      if (!rawData)
        return false
      const rawItems = Array.isArray(rawData.result) ? rawData.result : []
      const incoming = options.transformItems ? options.transformItems(rawItems) : rawItems as T[]
      results.value = append && results.value
        ? dedupeByKey([...results.value, ...incoming], options.itemKey)
        : incoming
      pagination.extractPagination(rawData, incoming.length)
      pagination.updatePage(page)
      loadMore.setHasMore(pagination.hasMore.value)
      if (paginationMode.value === 'scroll') {
        const appendedCount = Math.max(results.value.length - previousLength, 0)
        loadMore.setExhausted(rawItems.length === 0 || (appendedCount <= 0 && page >= totalPages.value))
      }
      if (updateUrl)
        options.onPageChange(page)
      return true
    })
  }

  async function performSearch(append: boolean): Promise<boolean> {
    const isLoadMore = paginationMode.value === 'scroll' && append
    if (isLoadMore && (isLoading.value || loadMore.exhausted.value))
      return false
    if (!isLoadMore)
      loadMore.setExhausted(false)
    const page = isLoadMore ? pagination.getNextPage(true) : (currentPage.value || pagination.getNextPage(false))
    const success = await runSearch(page, isLoadMore)
    if (success && isLoadMore)
      await loadMore.handleLoadMoreCompletion(haveScrollbar)
    return success
  }

  function handlePageChange(page: number, updateUrl = true, scrollToTop = true): Promise<boolean> {
    if (paginationMode.value !== 'pagination' || !options.keyword().trim())
      return Promise.resolve(false)
    if (scrollToTop)
      handleBackToTop()
    return runSearch(page, false, updateUrl)
  }

  function refreshCurrentPage() {
    return paginationMode.value === 'pagination'
      ? handlePageChange(currentPage.value, false, false)
      : performSearch(false)
  }

  function restorePage(page: number): Promise<boolean> {
    if (page === currentPage.value)
      return Promise.resolve(true)
    if (paginationMode.value === 'pagination')
      return handlePageChange(page, false, false)
    pagination.updatePage(page)
    return performSearch(false)
  }

  function resetAll() {
    request.reset()
    pagination.reset()
    loadMore.reset()
    results.value = []
  }

  watch([() => options.keyword().trim(), requestScope], () => {
    resetAll()
    if (options.keyword().trim())
      void performSearch(false)
  })
  onMounted(() => {
    if (!options.keyword().trim())
      return
    const page = options.initialPage()
    if (page && page > 1)
      pagination.updatePage(page)
    void performSearch(false)
  })

  return {
    paginationMode,
    isLoading,
    error,
    results,
    currentPage,
    totalResults,
    totalPages,
    hasMore: loadMore.hasMore,
    exhausted: loadMore.exhausted,
    requestLoadMore: loadMore.requestLoadMore,
    needsManualLoadMore: loadMore.needsManualLoadMore,
    resumeLoadMore: loadMore.resumeLoadMore,
    handlePageChange,
    refreshCurrentPage,
    restorePage,
    performSearch,
    resetAll,
  }
}
