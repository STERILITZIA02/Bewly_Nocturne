import { computed, reactive, ref } from 'vue'

import { LIBRARY_AUTOFILL_PAGE_LIMIT } from '~/constants/library'
import type { HistoryResult, List as HistoryItem } from '~/models/history/history'
import type { HistorySearchResult } from '~/models/video/historySearch'
import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import type api from '~/utils/api'

import type { HistoryContentFilter } from './historyFilters'
import { createHistoryFilters, hasHistoryFilters, historyRangeBounds, matchesHistoryFilters } from './historyFilters'

interface HistoryDependencies {
  api: typeof api.history
  getAccountId: () => AccountId
  getCSRF: () => string
  haveScrollbar: () => Promise<boolean>
  onWriteError: (error: unknown) => void
  onDeleted?: (item: HistoryItem) => void
  onCleared?: () => void
}

/** Owns the timeline, paging cursor and writes for one mounted account view. */
export function useHistoryTimeline(dependencies: HistoryDependencies) {
  const lifetime = createAccountLifetime(dependencies.getAccountId)
  const isLoading = ref(false)
  const requestFailed = ref(false)
  const noMoreContent = ref(false)
  const historyList = reactive<HistoryItem[]>([])
  const keyword = ref('')
  const submittedKeyword = ref('')
  const filters = ref(createHistoryFilters())
  const contentType = ref<HistoryContentFilter>('all')
  const filtersActive = computed(() => Boolean(submittedKeyword.value || hasHistoryFilters(filters.value) || contentType.value !== 'all'))
  const isClearingHistory = ref(false)
  const historyStatus = ref<boolean>()
  const isReadingStatus = ref(false)
  const isUpdatingStatus = ref(false)
  const deleting = reactive(new Set<string>())
  const seenReadKeys = new Set<string>()
  let cursor = 0
  let page = 1
  let generation = 0
  let statusRevision = 0
  let readController: AbortController | undefined
  let refreshFailed = false

  function resetListState() {
    generation++
    readController?.abort()
    readController = undefined
    historyList.length = 0
    seenReadKeys.clear()
    const end = historyRangeBounds(filters.value)?.end
    cursor = end !== undefined && Number.isFinite(end) ? end : 0
    page = 1
    noMoreContent.value = false
    requestFailed.value = false
    refreshFailed = false
    isLoading.value = false
  }

  async function load(refresh = false) {
    const owner = lifetime.capture()
    if (!owner.isCurrent() || isLoading.value || (!refresh && noMoreContent.value) || isClearingHistory.value || deleting.size > 0)
      return false
    const version = generation
    const query = submittedKeyword.value
    const activeFilters = { ...filters.value }
    const bounds = historyRangeBounds(activeFilters)
    if (bounds === null)
      return false
    const type = contentType.value
    const draft = refresh ? [] : historyList
    const sourceKeys = refresh ? new Set<string>() : seenReadKeys
    let nextPage = refresh ? 1 : page
    let nextCursor = refresh ? bounds?.end ?? 0 : cursor
    let ended = false
    const isCurrent = () => owner.isCurrent() && version === generation
    const controller = new AbortController()
    readController = controller
    let pagesRead = 0
    isLoading.value = true
    requestFailed.value = false
    try {
      do {
        if (!isCurrent())
          return false
        const response: HistoryResult | HistorySearchResult = query
          ? await dependencies.api.searchHistoryList({ pn: nextPage, keyword: query }, { signal: controller.signal })
          : await dependencies.api.getHistoryList({ type: 'all', view_at: nextCursor }, { signal: controller.signal })
        if (!isCurrent())
          return false
        if (response.code !== 0)
          throw response
        const items = Array.isArray(response.data?.list) ? response.data.list : []
        let newSourceRecords = 0
        for (const item of items) {
          const key = `${item.history.business}:${item.history.oid}:${item.view_at}`
          if (!sourceKeys.has(key)) {
            sourceKeys.add(key)
            newSourceRecords++
          }
        }
        const seen = new Set(draft.map(item => `${item.history.business}:${item.history.oid}:${item.view_at}`))
        draft.push(...items.filter((item) => {
          const key = `${item.history.business}:${item.history.oid}:${item.view_at}`
          if (!matchesHistoryFilters(item, type, bounds, activeFilters) || seen.has(key))
            return false
          seen.add(key)
          return true
        }))
        pagesRead++
        if (query) {
          nextPage++
          ended = items.length < 20 || newSourceRecords === 0
          if (!filtersActive.value)
            break
        }
        else {
          const previousCursor = nextCursor
          nextCursor = items.at(-1)?.view_at ?? previousCursor
          ended = items.length < 20 || newSourceRecords === 0 || (previousCursor > 0 && nextCursor >= previousCursor) || Boolean(bounds && nextCursor < bounds.start)
        }
        if (!refresh) {
          page = nextPage
          cursor = nextCursor
          noMoreContent.value = ended
        }
        // Keep each scan bounded; the shared viewport sentinel schedules the next
        // scan if sparse results still leave the bottom visible.
        if (pagesRead >= LIBRARY_AUTOFILL_PAGE_LIMIT)
          break
      } while (!ended && (refresh ? draft.length < Math.max(20, historyList.length) : !await dependencies.haveScrollbar()))
      if (!isCurrent())
        return false
      if (refresh) {
        historyList.splice(0, historyList.length, ...draft)
        seenReadKeys.clear()
        sourceKeys.forEach(key => seenReadKeys.add(key))
      }
      refreshFailed = false
      page = nextPage
      cursor = nextCursor
      noMoreContent.value = ended
      return isCurrent()
    }
    catch {
      if (isCurrent()) {
        requestFailed.value = true
        refreshFailed = refresh
      }
      return false
    }
    finally {
      if (isCurrent())
        isLoading.value = false
      if (readController === controller)
        readController = undefined
    }
  }

  function reloadCurrentMode() {
    if (isClearingHistory.value)
      return
    resetListState()
    void load()
  }

  function refreshCurrentMode() {
    if (isClearingHistory.value || deleting.size)
      return
    generation++
    readController?.abort()
    isLoading.value = false
    return load(true)
  }

  async function deleteHistoryItem(item: HistoryItem) {
    const owner = lifetime.capture()
    const kid = `${item.history.business}_${item.history.oid}`
    if (!owner.isCurrent() || deleting.has(kid) || isClearingHistory.value)
      return false
    // A page fetched before this write must not restore a confirmed deletion.
    if (readController) {
      generation++
      readController.abort()
      readController = undefined
      isLoading.value = false
    }
    const version = generation
    deleting.add(kid)
    try {
      const response = await dependencies.api.deleteHistoryItem({ kid, csrf: dependencies.getCSRF() })
      if (!owner.isCurrent())
        return false
      if (response.code !== 0)
        throw response
      dependencies.onDeleted?.(item)
      if (version === generation) {
        for (let index = historyList.length - 1; index >= 0; index--) {
          if (`${historyList[index].history.business}_${historyList[index].history.oid}` === kid)
            historyList.splice(index, 1)
        }
      }
      return true
    }
    catch (error) {
      if (owner.isCurrent())
        dependencies.onWriteError(error)
      return false
    }
    finally {
      if (owner.isCurrent())
        deleting.delete(kid)
    }
  }

  async function getHistoryPauseStatus() {
    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return
    const revision = ++statusRevision
    isReadingStatus.value = true
    try {
      const response = await dependencies.api.getHistoryPauseStatus()
      if (owner.isCurrent() && revision === statusRevision && response.code === 0 && typeof response.data === 'boolean')
        historyStatus.value = response.data
    }
    catch {
      // Unknown status stays unknown; writes report their own failures.
    }
    finally {
      if (owner.isCurrent() && revision === statusRevision)
        isReadingStatus.value = false
    }
  }

  async function setHistoryPauseStatus(isPause: boolean) {
    const owner = lifetime.capture()
    if (!owner.isCurrent() || isUpdatingStatus.value)
      return
    isUpdatingStatus.value = true
    statusRevision++
    isReadingStatus.value = false
    try {
      const response = await dependencies.api.setHistoryPauseStatus({ csrf: dependencies.getCSRF(), switch: isPause })
      if (!owner.isCurrent())
        return
      if (response.code !== 0)
        throw response
      const revision = ++statusRevision
      const confirmed = await dependencies.api.getHistoryPauseStatus()
      if (!owner.isCurrent() || revision !== statusRevision)
        return
      if (confirmed.code !== 0 || typeof confirmed.data !== 'boolean')
        throw confirmed
      historyStatus.value = confirmed.data
      if (confirmed.data !== isPause)
        throw new Error('history-status-not-confirmed')
    }
    catch (error) {
      if (owner.isCurrent())
        dependencies.onWriteError(error)
    }
    finally {
      if (owner.isCurrent())
        isUpdatingStatus.value = false
    }
  }

  async function clearAllHistory() {
    const owner = lifetime.capture()
    if (!owner.isCurrent() || isClearingHistory.value)
      return
    const version = ++generation
    readController?.abort()
    isClearingHistory.value = true
    isLoading.value = false
    try {
      const response = await dependencies.api.clearAllHistory({ csrf: dependencies.getCSRF() })
      if (!owner.isCurrent() || version !== generation)
        return
      if (response.code !== 0)
        throw response
      resetListState()
      dependencies.onCleared?.()
      noMoreContent.value = true
    }
    catch (error) {
      if (owner.isCurrent())
        dependencies.onWriteError(error)
    }
    finally {
      if (owner.isCurrent())
        isClearingHistory.value = false
    }
  }

  function resetAccount() {
    lifetime.invalidate()
    filters.value = createHistoryFilters()
    contentType.value = 'all'
    resetListState()
    statusRevision++
    keyword.value = ''
    submittedKeyword.value = ''
    historyStatus.value = undefined
    isReadingStatus.value = false
    isClearingHistory.value = false
    isUpdatingStatus.value = false
    deleting.clear()
  }

  function activate() {
    resetAccount()
    void load()
    void getHistoryPauseStatus()
  }

  return {
    isLoading,
    requestFailed,
    noMoreContent,
    historyList,
    keyword,
    submittedKeyword,
    filters,
    contentType,
    filtersActive,
    isClearingHistory,
    historyStatus,
    isUpdatingStatus,
    deleting,
    load,
    reloadCurrentMode,
    refreshCurrentMode,
    retry: () => load(refreshFailed),
    deleteHistoryItem,
    getHistoryPauseStatus,
    isReadingStatus,
    setHistoryPauseStatus,
    clearAllHistory,
    activate,
    resetAccount,
    capture: lifetime.capture,
    dispose() {
      lifetime.dispose()
      seenReadKeys.clear()
      readController?.abort()
      generation++
    },
    clearSearch() {
      keyword.value = ''
      if (submittedKeyword.value) {
        submittedKeyword.value = ''
        reloadCurrentMode()
      }
    },
    handleSearch() {
      if (isClearingHistory.value || historyRangeBounds(filters.value) === null)
        return
      submittedKeyword.value = keyword.value.trim()
      reloadCurrentMode()
    },
  }
}
