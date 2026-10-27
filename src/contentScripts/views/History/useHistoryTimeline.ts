import { computed, reactive, ref, shallowReactive, shallowRef, watch } from 'vue'

import { LIBRARY_AUTOFILL_PAGE_LIMIT } from '~/constants/library'
import type { HistoryGroupInterval } from '~/logic/storage'
import type { HistoryResult, List as HistoryItem } from '~/models/history/history'
import type { HistorySearchResult } from '~/models/video/historySearch'
import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import type api from '~/utils/api'

import type { HistoryContentFilter, HistorySortOrder } from './historyFilters'
import { createHistoryFilters, hasHistoryFilters, historyRangeBounds, matchesHistoryFilters } from './historyFilters'
import { createHistoryGroupIndex } from './historyGroups'

interface HistoryDependencies {
  api: typeof api.history
  getAccountId: () => AccountId
  getCSRF: () => string
  haveScrollbar: () => Promise<boolean>
  onWriteError: (error: unknown) => void
  onDeleted?: (items: HistoryItem[]) => void
  onCleared?: () => void
  getGroupInterval: () => HistoryGroupInterval
  getSortOrder: () => HistorySortOrder
}

/** Owns the timeline, paging cursor and writes for one mounted account view. */
export function useHistoryTimeline(dependencies: HistoryDependencies) {
  const lifetime = createAccountLifetime(dependencies.getAccountId)
  const isLoading = ref(false)
  const requestFailed = ref(false)
  const requestStalled = ref(false)
  const noMoreContent = ref(false)
  // Rows are server records replaced or removed whole; only the array is tracked.
  const historyList = shallowReactive<HistoryItem[]>([])
  const groupIndex = createHistoryGroupIndex()
  const groups = shallowRef(groupIndex.reset([], dependencies.getGroupInterval(), dependencies.getSortOrder()))
  const contentRevision = ref(0)
  function resetGroups() {
    groups.value = groupIndex.reset(historyList, dependencies.getGroupInterval(), dependencies.getSortOrder())
    contentRevision.value++
  }
  const stopGrouping = watch([dependencies.getGroupInterval, dependencies.getSortOrder], resetGroups)
  const batchedDeletes = new Set<string>()
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
  let cursor = { max: 0, view_at: 0, business: '' }
  const seenCursors = new Set<string>()
  let page = 1
  let generation = 0
  let statusRevision = 0
  let readController: AbortController | undefined
  let refreshFailed = false
  let hasLoaded = false

  function resetListState() {
    generation++
    readController?.abort()
    readController = undefined
    historyList.length = 0
    batchedDeletes.clear()
    resetGroups()
    seenReadKeys.clear()
    const end = historyRangeBounds(filters.value)?.end
    cursor = { max: 0, view_at: end !== undefined && Number.isFinite(end) ? end : 0, business: '' }
    seenCursors.clear()
    page = 1
    noMoreContent.value = false
    requestFailed.value = false
    requestStalled.value = false
    refreshFailed = false
    hasLoaded = false
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
    let nextCursor = refresh ? { max: 0, view_at: bounds?.end ?? 0, business: '' } : cursor
    const cursors = refresh ? new Set<string>() : seenCursors
    let ended = false
    const isCurrent = () => owner.isCurrent() && version === generation
    const controller = new AbortController()
    readController = controller
    let pagesRead = 0
    isLoading.value = true
    requestFailed.value = false
    requestStalled.value = false
    try {
      do {
        if (!isCurrent())
          return false
        const response: HistoryResult | HistorySearchResult = query
          ? await dependencies.api.searchHistoryList({ pn: nextPage, keyword: query }, { signal: controller.signal })
          : await dependencies.api.getHistoryList({ type: 'all', ...nextCursor }, { signal: controller.signal })
        if (!isCurrent())
          return false
        if (response.code !== 0 || !Array.isArray(response.data?.list))
          throw response
        const items = response.data.list
        const keys = items.map(item => `${item.history.business}:${item.history.oid}:${item.view_at}`)
        const newSourceRecords = keys.filter(key => !sourceKeys.has(key)).length
        let followingCursor = nextCursor
        let stalled = items.length > 0 && newSourceRecords === 0
        if (query) {
          const data = (response as HistorySearchResult).data
          if (typeof data.has_more !== 'boolean' || data.page?.pn !== nextPage)
            throw new Error('History search page unavailable')
          ended = !data.has_more
          stalled ||= !items.length && !ended
        }
        else {
          const value = (response as HistoryResult).data.cursor
          if (!value || !Number.isSafeInteger(value.max) || !Number.isFinite(value.view_at) || typeof value.business !== 'string')
            throw new Error('History cursor unavailable')
          followingCursor = { max: value.max, view_at: value.view_at, business: value.business }
          ended = (!items.length && value.max === 0 && value.view_at === 0) || Boolean(bounds && value.view_at < bounds.start)
          const key = JSON.stringify(followingCursor)
          stalled ||= !ended && (key === JSON.stringify(nextCursor) || cursors.has(key) || value.view_at <= 0)
        }
        if (stalled) {
          requestStalled.value = true
          throw new Error('History pagination stalled')
        }
        const added = items.filter((item) => {
          const key = `${item.history.business}:${item.history.oid}:${item.view_at}`
          if (sourceKeys.has(key))
            return false
          sourceKeys.add(key)
          return matchesHistoryFilters(item, type, bounds, activeFilters)
        })
        draft.push(...added)
        if (!refresh && added.length) {
          groups.value = groupIndex.append(added)
          contentRevision.value++
        }
        pagesRead++
        if (query) {
          nextPage++
        }
        else {
          nextCursor = followingCursor
          cursors.add(JSON.stringify(nextCursor))
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
        resetGroups()
        seenReadKeys.clear()
        sourceKeys.forEach(key => seenReadKeys.add(key))
        seenCursors.clear()
        cursors.forEach(key => seenCursors.add(key))
      }
      refreshFailed = false
      page = nextPage
      cursor = nextCursor
      noMoreContent.value = ended
      hasLoaded = true
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

  function commitDeletes(keys: readonly string[]) {
    if (!keys.length)
      return
    const removed = new Set(keys)
    dependencies.onDeleted?.(keys.flatMap(key => groupIndex.get(key) ?? []))
    historyList.splice(0, historyList.length, ...historyList.filter(item => !removed.has(`${item.history.business}_${item.history.oid}`)))
    groups.value = groupIndex.remove(keys)
    keys.forEach(key => batchedDeletes.delete(key))
    contentRevision.value++
  }

  async function deleteHistoryItem(item: HistoryItem, batched = false) {
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
      if (version === generation) {
        if (batched)
          batchedDeletes.add(kid)
        else commitDeletes([kid])
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

  function snapshot() {
    commitDeletes([...batchedDeletes])
    return {
      accountId: dependencies.getAccountId(),
      items: historyList.slice(),
      keyword: keyword.value,
      submittedKeyword: submittedKeyword.value,
      filters: { ...filters.value },
      contentType: contentType.value,
      noMoreContent: noMoreContent.value,
      cursor,
      page,
      seenReadKeys: [...seenReadKeys],
      seenCursors: [...seenCursors],
      hasLoaded,
    }
  }

  function activate(saved?: ReturnType<typeof snapshot>) {
    resetAccount()
    if (saved && saved.accountId === dependencies.getAccountId()) {
      historyList.push(...saved.items)
      resetGroups()
      keyword.value = saved.keyword
      submittedKeyword.value = saved.submittedKeyword
      filters.value = saved.filters
      contentType.value = saved.contentType
      noMoreContent.value = saved.noMoreContent
      cursor = saved.cursor
      page = saved.page
      saved.seenReadKeys.forEach(key => seenReadKeys.add(key))
      saved.seenCursors.forEach(key => seenCursors.add(key))
      hasLoaded = saved.hasLoaded
    }
    if (!hasLoaded)
      void load()
    void getHistoryPauseStatus()
  }

  return {
    groups,
    contentRevision,
    deleteSelectedHistoryItem(key: string) {
      const item = groupIndex.get(key)
      return item ? deleteHistoryItem(item, true) : Promise.resolve(true)
    },
    commitSelectedHistoryItems: () => commitDeletes([...batchedDeletes]),
    isLoading,
    requestFailed,
    requestStalled,
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
    snapshot,
    resetAccount,
    capture: lifetime.capture,
    dispose() {
      commitDeletes([...batchedDeletes])
      stopGrouping()
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
