import { computed, reactive, ref } from 'vue'

import type { HistoryResult, List as HistoryItem } from '~/models/history/history'
import type { HistorySearchResult } from '~/models/video/historySearch'
import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import type api from '~/utils/api'

import type { HistoryContentFilter } from './historyFilters'
import { historyDateBounds, matchesHistoryFilters } from './historyFilters'

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
  const date = ref('')
  const contentType = ref<HistoryContentFilter>('all')
  const filtersActive = computed(() => Boolean(submittedKeyword.value || date.value || contentType.value !== 'all'))
  const isClearingHistory = ref(false)
  const historyStatus = ref<boolean>()
  const isUpdatingStatus = ref(false)
  const deleting = reactive(new Set<string>())
  let cursor = 0
  let page = 1
  let generation = 0
  let statusRevision = 0
  let readController: AbortController | undefined

  function resetListState() {
    generation++
    readController?.abort()
    readController = undefined
    historyList.length = 0
    cursor = historyDateBounds(date.value)?.end ?? 0
    page = 1
    noMoreContent.value = false
    requestFailed.value = false
    isLoading.value = false
  }

  async function load() {
    const owner = lifetime.capture()
    if (!owner.isCurrent() || isLoading.value || noMoreContent.value || isClearingHistory.value)
      return false
    const version = generation
    const query = submittedKeyword.value
    const bounds = historyDateBounds(date.value)
    const type = contentType.value
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
          ? await dependencies.api.searchHistoryList({ pn: page, keyword: query }, { signal: controller.signal })
          : await dependencies.api.getHistoryList({ type: 'all', view_at: cursor }, { signal: controller.signal })
        if (!isCurrent())
          return false
        if (response.code !== 0)
          throw response
        const items = Array.isArray(response.data?.list) ? response.data.list : []
        const seen = new Set(historyList.map(item => `${item.history.business}:${item.history.oid}:${item.view_at}`))
        historyList.push(...items.filter((item) => {
          const key = `${item.history.business}:${item.history.oid}:${item.view_at}`
          if (!matchesHistoryFilters(item, type, bounds) || seen.has(key))
            return false
          seen.add(key)
          return true
        }))
        pagesRead++
        if (query) {
          page++
          noMoreContent.value = items.length < 20
          if (!bounds && type === 'all')
            return true
        }
        else {
          const nextCursor = items.at(-1)?.view_at ?? cursor
          noMoreContent.value = items.length < 20 || nextCursor === cursor || Boolean(bounds && nextCursor < bounds.start)
          cursor = nextCursor
        }
        // Explicit filtered browsing consumes at most three pages per action.
        if (filtersActive.value && pagesRead >= 3)
          break
      } while (!noMoreContent.value && !await dependencies.haveScrollbar())
      return isCurrent()
    }
    catch {
      if (isCurrent())
        requestFailed.value = true
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

  async function deleteHistoryItem(item: HistoryItem) {
    const owner = lifetime.capture()
    const version = generation
    const kid = `${item.history.business}_${item.history.oid}`
    if (!owner.isCurrent() || deleting.has(kid) || isClearingHistory.value)
      return
    deleting.add(kid)
    try {
      const response = await dependencies.api.deleteHistoryItem({ kid, csrf: dependencies.getCSRF() })
      if (!owner.isCurrent())
        return
      if (response.code !== 0)
        throw response
      dependencies.onDeleted?.(item)
      if (version === generation) {
        const index = historyList.findIndex(entry => `${entry.history.business}_${entry.history.oid}` === kid)
        if (index >= 0)
          historyList.splice(index, 1)
      }
    }
    catch (error) {
      if (owner.isCurrent())
        dependencies.onWriteError(error)
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
    try {
      const response = await dependencies.api.getHistoryPauseStatus()
      if (owner.isCurrent() && revision === statusRevision && response.code === 0)
        historyStatus.value = response.data
    }
    catch {
      // Unknown status stays unknown; writes report their own failures.
    }
  }

  async function setHistoryPauseStatus(isPause: boolean) {
    const owner = lifetime.capture()
    if (!owner.isCurrent() || isUpdatingStatus.value)
      return
    isUpdatingStatus.value = true
    statusRevision++
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
      if (confirmed.code !== 0)
        throw confirmed
      historyStatus.value = confirmed.data
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
    date.value = ''
    contentType.value = 'all'
    resetListState()
    statusRevision++
    keyword.value = ''
    submittedKeyword.value = ''
    historyStatus.value = undefined
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
    date,
    contentType,
    filtersActive,
    isClearingHistory,
    historyStatus,
    isUpdatingStatus,
    deleting,
    load,
    reloadCurrentMode,
    deleteHistoryItem,
    setHistoryPauseStatus,
    clearAllHistory,
    activate,
    resetAccount,
    capture: lifetime.capture,
    dispose() {
      lifetime.dispose()
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
      if (isClearingHistory.value || (date.value && !historyDateBounds(date.value)))
        return
      submittedKeyword.value = keyword.value.trim()
      reloadCurrentMode()
    },
  }
}
