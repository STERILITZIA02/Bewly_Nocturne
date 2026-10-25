<script setup lang="ts">
import { useDateFormat, useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ALink from '~/components/ALink.vue'
import Button from '~/components/Button.vue'
import Empty from '~/components/Empty.vue'
import IconButton from '~/components/IconButton.vue'
import LazyPicture from '~/components/LazyPicture.vue'
import LibraryDateRange from '~/components/LibraryDateRange.vue'
import type { LibraryFilterGroup } from '~/components/LibraryFilterMenu.vue'
import LibraryFilterMenu from '~/components/LibraryFilterMenu.vue'
import LibraryHero from '~/components/LibraryHero.vue'
import LibrarySearchField from '~/components/LibrarySearchField.vue'
import LibrarySidebarHeading from '~/components/LibrarySidebarHeading.vue'
import LibraryVideoCardSkeleton from '~/components/LibraryVideoCardSkeleton.vue'
import LibraryWorkspace from '~/components/LibraryWorkspace.vue'
import LoadingFill from '~/components/LoadingFill.vue'
import LoadingRing from '~/components/LoadingRing.vue'
import Progress from '~/components/Progress.vue'
import SettingsSegmentedControl from '~/components/Settings/components/SettingsSegmentedControl.vue'
import SmoothLoading from '~/components/SmoothLoading.vue'
import Tooltip from '~/components/Tooltip.vue'
import VideoListSkeleton from '~/components/VideoListSkeleton.vue'
import OpenTabsDialog from '~/components/WatchLater/OpenTabsDialog.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { CARD_WINDOW_THRESHOLD, useCardWindow } from '~/composables/useCardWindow'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { useGridLayout } from '~/composables/useGridLayout'
import { useLayoutMotion } from '~/composables/useLayoutMotion'
import { useLoadingRingPhase } from '~/composables/useLoadingRingPhase'
import { usePageViewState } from '~/composables/usePageViewState'
import { VIDEO_CARD_COVER_ASPECT_RATIO } from '~/constants/layout'
import { LIBRARY_AUTOFILL_PAGE_LIMIT } from '~/constants/library'
import { settings } from '~/logic'
import { isLayoutEditing, useLayoutEditSettingValue, vLayoutEditable } from '~/logic/layoutEdit'
import { applyWatchLaterUpdate } from '~/logic/watchLaterState'
import type { List as VideoItem, WatchLaterResult } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import { createAccountLifetime } from '~/utils/accountLifetime'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getCSRF, getUserID, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { retiringListTransition, retiringTransition } from '~/utils/motionPresence'
import { openLinkInBackground } from '~/utils/tabs'
import { getVideoPlaybackProgress, getVideoProgressPercentage, getVideoWatchState } from '~/utils/videoVisitHistory'
import { updateOwnedWatchLater } from '~/utils/watchLater'
import { getWatchLaterAuthor, getWatchLaterPlaybackUrl, mergeWatchLaterItemsByAid, normalizeWatchLaterItem } from '~/utils/watchLaterList'

import { useWatchLaterBatch } from './useWatchLaterBatch'
import { useWatchLaterBulkAction } from './useWatchLaterBulkAction'
import type { WatchLaterFilters, WatchLaterSortOrder } from './watchLaterFilters'
import { createWatchLaterFilters, filterWatchLaterItems, hasWatchLaterFilters, sortWatchLaterItems, watchLaterAddedBounds } from './watchLaterFilters'
import WatchLaterGridCard from './WatchLaterGridCard.vue'
import WatchLaterPlayAllCard from './WatchLaterPlayAllCard.vue'
import WatchLaterSelectionOverlay from './WatchLaterSelectionOverlay.vue'

const { t } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()
const { openIframeDrawer } = useBewlyApp()
const topBarStore = useTopBarStore()
const showOpenTabsDialog = ref(false)

const viewState = usePageViewState('watch-later')
const isLoading = ref(false)
const isRefreshing = ref(false)
const refreshFailed = ref(false)
const noMoreContent = viewState.ref('noMoreContent', false)
const requestFailed = ref(false)
const currentWatchLaterList = viewState.ref<VideoItem[]>('items', [])
const searchQuery = viewState.ref('query', '')
const advancedFilters = viewState.ref('filters', createWatchLaterFilters())
const sortOrder = viewState.ref<WatchLaterSortOrder>('sort', 'newest')
const filtersActive = computed(() => Boolean(searchQuery.value.trim() || hasWatchLaterFilters(advancedFilters.value)))
const filteredItems = computed(() => sortWatchLaterItems(filterWatchLaterItems(currentWatchLaterList.value, searchQuery.value, advancedFilters.value.progress, advancedFilters.value.duration, item => getVideoWatchState({ aid: item.aid, bvid: item.bvid, cid: item.cid, epid: item.bangumi?.ep_id }), advancedFilters.value), sortOrder.value))
// The filter behind the search field's funnel; a custom date opens the range on the rail.
const PROGRESS = ['all', 'unstarted'] as const
const ADDED = ['all', 'custom'] as const
const DURATIONS = ['all', 'short', 'medium', 'long', 'extraLong'] as const
const PROGRESS_ICONS = { all: 'i-tabler:list', unstarted: 'i-tabler:eye-off' } as const
const ADDED_ICONS = { all: 'i-tabler:infinity', custom: 'i-tabler:calendar-cog' } as const
const DURATION_ICONS = { all: 'i-tabler:clock', short: 'i-tabler:clock-hour-2', medium: 'i-tabler:clock-hour-5', long: 'i-tabler:clock-hour-8', extraLong: 'i-tabler:clock-hour-11' } as const
const filterGroups = computed<LibraryFilterGroup[]>(() => [
  { key: 'progress', title: t('library_tools.filter_progress'), value: advancedFilters.value.progress, options: PROGRESS.map(value => ({ value, label: t(`watch_later.filters.progress_${value}`), icon: PROGRESS_ICONS[value] })) },
  { key: 'added', title: t('library_tools.filter_added'), value: advancedFilters.value.added, options: ADDED.map(value => ({ value, label: t(value === 'all' ? 'history.filters.period_all' : 'library_tools.date_custom'), icon: ADDED_ICONS[value] })) },
  { key: 'duration', title: t('library_tools.filter_duration'), value: advancedFilters.value.duration, options: DURATIONS.map(value => ({ value, label: t(`watch_later.filters.duration_${value}`), icon: DURATION_ICONS[value] })) },
])
function selectFilter(key: string, value: string) {
  advancedFilters.value = key === 'added' && value === 'all'
    ? { ...advancedFilters.value, added: 'all', startDate: '', endDate: '' }
    : { ...advancedFilters.value, [key]: value } as WatchLaterFilters
}
function updateFilterDate(key: 'startDate' | 'endDate', value: string) {
  advancedFilters.value = { ...advancedFilters.value, [key]: value }
}
const invalidRange = computed(() => watchLaterAddedBounds(advancedFilters.value) === null)
const layoutOptions = computed(() => [
  { label: t('library_tools.layout_list'), value: 'list' as const },
  { label: t('library_tools.layout_grid'), value: 'grid' as const },
])
const watchLaterCount = computed(() => topBarStore.watchLaterCount ?? 0)
const pendingAction = shallowRef<{ accountId: number, aid: number } | null>(null)
const { handlePageRefresh, handleReachBottom, haveScrollbar, scrollViewportRef } = useBewlyApp()
const pageNum = viewState.ref<number>('page', 1)
const pageSize = ref<number>(20)
const watchLaterLayoutMode = useLayoutEditSettingValue(
  'page.watchLater.layout',
  () => settings.value.watchLaterLayoutMode,
)
const { gridClass: watchLaterGridClass } = useGridLayout(() => 'adaptive')
const cardContainer = ref<HTMLElement | null>(null)
const cardColumns = ref(1)
const cardWidth = ref(0)
const cardGap = ref(0)
useResizeObserver(cardContainer, () => {
  const container = cardContainer.value
  if (!container)
    return
  const style = getComputedStyle(container)
  cardColumns.value = watchLaterLayoutMode.value === 'list' ? 1 : Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length)
  cardWidth.value = container.clientWidth / cardColumns.value
  cardGap.value = Number.parseFloat(style.rowGap) || 0
})
const cardWindow = useCardWindow({
  root: scrollViewportRef,
  container: cardContainer,
  keys: computed(() => filteredItems.value.map(item => item.aid)),
  columns: cardColumns,
  gap: cardGap,
  enabled: computed(() => currentWatchLaterList.value.length > CARD_WINDOW_THRESHOLD),
  estimatedHeight: computed(() => watchLaterLayoutMode.value === 'list' ? 190 : cardWidth.value / VIDEO_CARD_COVER_ASPECT_RATIO + 112),
  layout: computed(() => `${watchLaterLayoutMode.value}:${settings.value.videoCardTitleFontSize}:${settings.value.videoCardAuthorFontSize}`),
  canRelease: key => !isLayoutEditing.value && pendingAction.value?.aid !== key,
})
const renderedRows = computed(() => cardWindow.ranges.value.flatMap<{ key: string, height: number | undefined, items: VideoItem[] }>(range => range.height !== undefined
  ? [{ key: `spacer:${range.start}`, height: range.height, items: [] as VideoItem[] }]
  : filteredItems.value.slice(range.start, range.end).map(item => ({ key: String(item.aid), height: undefined, items: [item] }))))
let requestGeneration = 0
let loadedAccountId: number | null = null
let watchLaterExtensionContextInvalidated = false
const actionLifetime = createAccountLifetime(getCurrentAccountId)
const batch = useWatchLaterBatch({
  visibleIds: () => filteredItems.value.map(item => item.aid),
  captureOwner: () => actionLifetime.capture(),
  remove: deleteWatchLaterItem,
})
const bulkAction = useWatchLaterBulkAction({
  capture: () => actionLifetime.capture(),
  getCSRF,
  blocked: () => watchLaterExtensionContextInvalidated || isLoading.value || Boolean(pendingAction.value) || batch.busy.value,
  confirm: kind => showConfirmDialog(t(kind === 'clear' ? 'watch_later.clear_all_confirm' : 'watch_later.remove_watched_videos_confirm')),
  async submit(kind, owner, csrf) {
    const accountId = Number(owner.accountId)
    const generation = invalidateRequests()
    isLoading.value = true
    try {
      const response = kind === 'clear'
        ? await api.watchlater.clearAllWatchLater({ accountId, csrf })
        : await api.watchlater.removeFromWatchLater({ accountId, viewed: true, csrf })
      if (!owner.isCurrent() || !isCurrentRequest(generation, accountId))
        return
      if (response?.code !== 0)
        throw response
      if (response.watchLaterUpdate)
        applyWatchLaterUpdate(response.watchLaterUpdate)
      if (kind === 'clear') {
        currentWatchLaterList.value = []
        noMoreContent.value = true
      }
      else {
        await initData()
      }
    }
    finally {
      if (generation === requestGeneration)
        isLoading.value = false
    }
  },
  onError(error) {
    if (!settleExtensionContextInvalidation(error))
      toast.error(t('common.operation_failed'))
  },
})
const requiresFullLibrary = computed(() => filtersActive.value || sortOrder.value === 'oldest' || batch.managing.value)
let viewRefreshTimer: ReturnType<typeof setTimeout> | undefined
let viewDirty = false
let replaceView = false
let readController: AbortController | undefined
let loadingLibrary = false

async function loadCompleteLibrary(refresh = false) {
  if ((!refresh && (!requiresFullLibrary.value || noMoreContent.value)) || loadingLibrary || watchLaterExtensionContextInvalidated || batch.busy.value)
    return
  const accountId = getCurrentAccountId()
  if (!accountId)
    return
  const generation = invalidateRequests()
  const controller = new AbortController()
  readController = controller
  isLoading.value = loadingLibrary = true
  isRefreshing.value = refresh
  requestFailed.value = false
  try {
    const response = await api.watchlater.getWatchLaterLibrary({ accountId }, { signal: controller.signal })
    if (!isCurrentRequest(generation, accountId))
      return
    if (response.code !== 0 || !Array.isArray(response.data?.list) || !Number.isSafeInteger(response.data.count) || response.data.count < 0)
      throw new Error('Watch Later library unavailable')
    let list = mergeWatchLaterItemsByAid([], response.data.list.map(normalizeWatchLaterItem).filter((item): item is VideoItem => Boolean(item)))
    // Some responses contain only a prefix. Complete the existing server pages
    // before exposing an oldest-first order or an all-results selection.
    for (let pn = Math.floor(response.data.list.length / pageSize.value) + 1; list.length < response.data.count && pn <= Math.ceil(response.data.count / pageSize.value); pn++) {
      const page = await api.watchlater.getWatchLaterListByPage({ accountId, pn, ps: pageSize.value }, { signal: controller.signal })
      if (!isCurrentRequest(generation, accountId))
        return
      if (page.code !== 0 || !Array.isArray(page.data?.list))
        throw new Error('Watch Later page unavailable')
      const incoming = page.data.list.map(normalizeWatchLaterItem).filter((item): item is VideoItem => Boolean(item))
      const merged = mergeWatchLaterItemsByAid(list, incoming)
      if (merged.length === list.length)
        break
      list = merged
    }
    if (list.length < response.data.count)
      throw new Error('Watch Later library incomplete')
    currentWatchLaterList.value = list
    noMoreContent.value = currentWatchLaterList.value.length >= response.data.count
    pageNum.value = Math.floor(currentWatchLaterList.value.length / pageSize.value) + 1
  }
  catch (error) {
    if (!controller.signal.aborted && isCurrentRequest(generation, accountId) && !settleExtensionContextInvalidation(error)) {
      requestFailed.value = true
      refreshFailed.value = refresh
    }
  }
  finally {
    if (readController === controller) {
      readController = undefined
      isLoading.value = loadingLibrary = false
      isRefreshing.value = false
    }
  }
}
watch([searchQuery, advancedFilters], () => batch.clearSelection())
watch([searchQuery, advancedFilters, sortOrder, batch.managing], () => {
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
  if (requiresFullLibrary.value)
    void loadCompleteLibrary()
  else if (loadingLibrary)
    invalidateRequests()
})
function clearFilters() {
  searchQuery.value = ''
  advancedFilters.value = createWatchLaterFilters()
}

function scheduleViewRefresh() {
  if (!viewDirty || document.hidden || isLoading.value || pendingAction.value || batch.busy.value || bulkAction.pending.value || viewRefreshTimer !== undefined)
    return
  viewRefreshTimer = setTimeout(() => {
    viewRefreshTimer = undefined
    if (document.hidden || isLoading.value || pendingAction.value || batch.busy.value || bulkAction.pending.value)
      return
    const replace = replaceView
    viewDirty = false
    replaceView = false
    void (replace ? handleWatchLaterPageRefresh() : refreshViewHead())
  }, 800)
}

watch(() => topBarStore.watchLaterUpdate, (update) => {
  if (!update || update.type !== 'change' || update.accountId !== getCurrentAccountId())
    return
  const change = update.change
  if (change.type === 'clear') {
    currentWatchLaterList.value = []
    pageNum.value = 1
    noMoreContent.value = true
  }
  else if (change.type === 'remove') {
    currentWatchLaterList.value = currentWatchLaterList.value.filter(item => item.aid !== change.entry.aid)
    pageNum.value = Math.max(1, Math.ceil(currentWatchLaterList.value.length / pageSize.value))
    noMoreContent.value = currentWatchLaterList.value.length >= watchLaterCount.value
  }
  else {
    viewDirty = true
    replaceView ||= change.type === 'invalidate'
    scheduleViewRefresh()
  }
}, { flush: 'sync' })
watch(pendingAction, scheduleViewRefresh)
watch(batch.busy, scheduleViewRefresh)
watch(bulkAction.pending, scheduleViewRefresh)
watch(isLoading, scheduleViewRefresh)

async function refreshViewHead() {
  const accountId = getCurrentAccountId()
  if (!accountId || watchLaterExtensionContextInvalidated)
    return
  const generation = invalidateRequests()
  try {
    const response = await api.watchlater.getWatchLaterListByPage({ accountId, pn: 1, ps: pageSize.value })
    if (!isCurrentRequest(generation, accountId) || response.code !== 0 || !response.data)
      return
    const list = response.data.list.map(normalizeWatchLaterItem).filter((item): item is VideoItem => Boolean(item))
    currentWatchLaterList.value = mergeWatchLaterItemsByAid(list, currentWatchLaterList.value)
    pageNum.value = Math.max(2, Math.ceil(currentWatchLaterList.value.length / pageSize.value))
    noMoreContent.value = currentWatchLaterList.value.length >= watchLaterCount.value
  }
  catch (error) {
    if (!settleExtensionContextInvalidation(error))
      requestFailed.value = true
  }
}

function handleViewVisibility() {
  if (document.hidden) {
    clearTimeout(viewRefreshTimer)
    viewRefreshTimer = undefined
  }
  else {
    scheduleViewRefresh()
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleViewVisibility)
})

function getCurrentAccountId(): number | null {
  const mid = Number(topBarStore.userInfo.mid)
  return topBarStore.isLogin && Number.isFinite(mid) && mid > 0 && getUserID() === String(mid) ? mid : null
}

function invalidateRequests(): number {
  readController?.abort()
  readController = undefined
  loadingLibrary = false
  isLoading.value = false
  isRefreshing.value = false
  refreshFailed.value = false
  return ++requestGeneration
}

function settleExtensionContextInvalidation(error: unknown): boolean {
  if (!isExtensionContextInvalidatedError(error))
    return false

  watchLaterExtensionContextInvalidated = true
  requestFailed.value = false
  pendingAction.value = null
  invalidateRequests()
  return true
}

function isCurrentRequest(generation: number, accountId: number): boolean {
  return generation === requestGeneration && accountId === getCurrentAccountId()
}

onMounted(() => {
  initPageAction()
  loadedAccountId = getCurrentAccountId()
  if (viewState.restored && (currentWatchLaterList.value.length || noMoreContent.value)) {
    if (viewState.read('revision', '') !== queueRevision()) {
      viewDirty = replaceView = true
      scheduleViewRefresh()
    }
  }
  else {
    void initData()
  }
})

function queueRevision() {
  const update = topBarStore.watchLaterUpdate
  const version = update?.type === 'snapshot' ? update.snapshot : update
  return version ? `${version.epoch}:${version.revision}` : ''
}
viewState.capture('revision', queueRevision)
batch.managing.value = viewState.read('managing', false)
batch.selected.value = viewState.read('selected', new Set<number>())
viewState.capture('managing', () => batch.managing.value)
viewState.capture('selected', () => batch.selected.value)

watch(
  [() => topBarStore.isLogin, () => topBarStore.userInfo.mid],
  () => {
    const accountId = getCurrentAccountId()
    if (accountId === loadedAccountId)
      return

    actionLifetime.invalidate()
    bulkAction.reset()
    batch.reset()
    sortOrder.value = 'newest'
    clearFilters()
    loadedAccountId = accountId
    void initData()
  },
)

onBeforeUnmount(() => {
  clearTimeout(viewRefreshTimer)
  document.removeEventListener('visibilitychange', handleViewVisibility)
  actionLifetime.dispose()
  bulkAction.reset()
  invalidateRequests()
  if (handlePageRefresh.value === handleWatchLaterPageRefresh)
    handlePageRefresh.value = undefined
  if (handleReachBottom.value === handleWatchLaterReachBottom)
    handleReachBottom.value = undefined
})

async function initData() {
  if (watchLaterExtensionContextInvalidated)
    return

  const generation = invalidateRequests()
  const accountId = getCurrentAccountId()
  isLoading.value = false
  noMoreContent.value = false
  requestFailed.value = false
  currentWatchLaterList.value = []
  pendingAction.value = null
  pageNum.value = 1
  if (accountId === null)
    return

  if (requiresFullLibrary.value)
    await loadCompleteLibrary()
  else
    await getWatchLaterListByPage(generation, accountId)
}

async function getData(): Promise<boolean> {
  if (batch.busy.value)
    return false
  const accountId = getCurrentAccountId()
  return accountId !== null
    ? getWatchLaterListByPage(requestGeneration, accountId)
    : false
}

function retryWatchLaterRequest() {
  if (watchLaterExtensionContextInvalidated || isLoading.value)
    return
  requestFailed.value = false
  if (refreshFailed.value) {
    void handleWatchLaterPageRefresh()
    return
  }
  void (requiresFullLibrary.value ? loadCompleteLibrary() : getData())
}

async function handleWatchLaterPageRefresh() {
  if (watchLaterExtensionContextInvalidated || isLoading.value || pendingAction.value || batch.busy.value || bulkAction.pending.value)
    return
  const accountId = getCurrentAccountId()
  if (accountId === null)
    return
  // Keep the visible snapshot and its keyed DOM until a replacement succeeds.
  // A complete queue uses its existing endpoint; a partial queue only rereads
  // the loaded prefix, so refreshing never fetches the unseen remainder.
  if (requiresFullLibrary.value || (noMoreContent.value && currentWatchLaterList.value.length > pageSize.value)) {
    await loadCompleteLibrary(true)
    return
  }
  const targetLength = Math.max(pageSize.value, currentWatchLaterList.value.length)
  const generation = invalidateRequests()
  const controller = new AbortController()
  readController = controller
  isLoading.value = isRefreshing.value = true
  requestFailed.value = false
  try {
    let list: VideoItem[] = []
    let nextPage = 1
    let exhausted = false
    while (!exhausted && list.length < targetLength) {
      const response = await api.watchlater.getWatchLaterListByPage({ accountId, pn: nextPage, ps: pageSize.value }, { signal: controller.signal })
      if (!isCurrentRequest(generation, accountId))
        return
      if (response.code !== 0 || !Array.isArray(response.data?.list) || !Number.isSafeInteger(response.data.count) || response.data.count < 0)
        throw new Error('Watch Later refresh unavailable')
      const incoming = response.data.list.map(normalizeWatchLaterItem).filter((item): item is VideoItem => Boolean(item))
      const merged = mergeWatchLaterItemsByAid(list, incoming)
      if (merged.length === list.length && list.length < response.data.count)
        throw new Error('Watch Later refresh stalled')
      list = merged
      nextPage++
      exhausted = response.data.list.length < pageSize.value || list.length >= response.data.count
    }
    currentWatchLaterList.value = list
    pageNum.value = nextPage
    noMoreContent.value = exhausted
  }
  catch (error) {
    if (!controller.signal.aborted && isCurrentRequest(generation, accountId) && !settleExtensionContextInvalidation(error)) {
      requestFailed.value = true
      refreshFailed.value = true
    }
  }
  finally {
    if (readController === controller) {
      readController = undefined
      isLoading.value = isRefreshing.value = false
    }
  }
}

async function handleWatchLaterReachBottom(): Promise<boolean> {
  if (watchLaterExtensionContextInvalidated || requiresFullLibrary.value || isLoading.value || noMoreContent.value || requestFailed.value || pendingAction.value || batch.busy.value || bulkAction.pending.value)
    return false

  // Observer and geometry fallback signals share the request/loading guards.
  // Awaiting the page request lets App recheck a still-intersecting sentinel
  // after the list has settled, without adding polling or another observer.
  return getData()
}

function initPageAction() {
  handlePageRefresh.value = handleWatchLaterPageRefresh
  handleReachBottom.value = handleWatchLaterReachBottom
}

/**
 * Get watch later list by page
 */
async function getWatchLaterListByPage(generation: number, accountId: number): Promise<boolean> {
  if (watchLaterExtensionContextInvalidated || !isCurrentRequest(generation, accountId) || isLoading.value || noMoreContent.value || requestFailed.value)
    return false

  requestFailed.value = false
  isLoading.value = true
  const controller = new AbortController()
  readController = controller
  let pagesRead = 0

  try {
    while (!noMoreContent.value) {
      const requestedPage = pageNum.value
      const res: WatchLaterResult = await api.watchlater.getWatchLaterListByPage({
        accountId,
        pn: requestedPage,
        ps: pageSize.value,
      }, { signal: controller.signal })

      if (!isCurrentRequest(generation, accountId))
        return false
      if (res.code !== 0) {
        requestFailed.value = true
        noMoreContent.value = false
        break
      }

      const payload = res.data
      if (
        !payload
        || !Array.isArray(payload.list)
        || !Number.isSafeInteger(payload.count)
        || payload.count < 0
      ) {
        requestFailed.value = true
        noMoreContent.value = false
        break
      }

      const list = payload.list.map(normalizeWatchLaterItem).filter((item): item is VideoItem => Boolean(item))
      const previousListLength = currentWatchLaterList.value.length
      const mergedList = mergeWatchLaterItemsByAid(currentWatchLaterList.value, list)
      const madeProgress = mergedList.length > previousListLength
      currentWatchLaterList.value = mergedList
      requestFailed.value = false
      pageNum.value = requestedPage + 1
      noMoreContent.value = payload.list.length < pageSize.value
        || mergedList.length >= payload.count
        || !madeProgress

      pagesRead++
      if (noMoreContent.value || filtersActive.value || pagesRead >= LIBRARY_AUTOFILL_PAGE_LIMIT)
        break

      const hasScrollbar = await haveScrollbar()
      if (!isCurrentRequest(generation, accountId))
        return false
      if (hasScrollbar)
        break
    }
  }
  catch (error) {
    if (settleExtensionContextInvalidation(error))
      return false

    if (isCurrentRequest(generation, accountId)) {
      requestFailed.value = true
      noMoreContent.value = false
      console.error('[WatchLater] Failed to load list:', error)
    }
  }
  finally {
    if (isCurrentRequest(generation, accountId))
      isLoading.value = false
    if (readController === controller)
      readController = undefined
  }

  return true
}

async function deleteWatchLaterItem(aid: number): Promise<boolean> {
  const accountId = getCurrentAccountId()
  if (watchLaterExtensionContextInvalidated || !accountId || pendingAction.value || bulkAction.pending.value)
    return false

  const action = { accountId, aid }
  const owner = actionLifetime.capture()
  pendingAction.value = action
  const generation = invalidateRequests()
  try {
    const result = await updateOwnedWatchLater({ aid }, 'remove', {
      accountId: owner.accountId,
      isCurrent: () => owner.isCurrent() && isCurrentRequest(generation, accountId),
    }, topBarStore)
    if (result.status !== 'success' || !owner.isCurrent() || !isCurrentRequest(generation, accountId))
      return false

    const currentIndex = currentWatchLaterList.value.findIndex(item => item.aid === aid)
    if (currentIndex !== -1) {
      currentWatchLaterList.value.splice(currentIndex, 1)
      // Removal shifts position-based server pages. Re-read the last partial
      // page and let aid deduplication fill the gap without clearing the list.
      pageNum.value = Math.max(1, Math.ceil(currentWatchLaterList.value.length / pageSize.value))
      noMoreContent.value = currentWatchLaterList.value.length >= watchLaterCount.value
    }
    return true
  }
  catch (error) {
    if (!settleExtensionContextInvalidation(error))
      console.error('[WatchLater] Failed to remove item:', error)
    return false
  }
  finally {
    if (pendingAction.value === action)
      pendingAction.value = null
  }
}

async function handleClearAllWatchLater() {
  await bulkAction.run('clear')
}

async function handleRemoveWatchedVideos() {
  await bulkAction.run('viewed')
}

function handlePlayAll() {
  openLinkToNewTab('https://www.bilibili.com/list/watchlater')
}

function handleLinkClick(url: string) {
  if (settings.value.videoCardLinkOpenMode === 'drawer') {
    openIframeDrawer(url) // 在抽屉打开
  }
  else if (settings.value.videoCardLinkOpenMode === 'currentTab') {
    window.open(url, '_self') // 在当前标签页打开
  }
  else if (settings.value.videoCardLinkOpenMode === 'background') {
    openLinkInBackground(url)
  }
  else {
    openLinkToNewTab(url) // 在新标签页打开
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

async function openVideoPageAndRemove(item: VideoItem) {
  const owner = actionLifetime.capture()
  const { aid } = item
  const url = getWatchLaterPlaybackUrl(item)
  if (!url)
    return
  if (await deleteWatchLaterItem(aid) && owner.isCurrent())
    handleLinkClick(url)
}

function playAndRemove(item: VideoItem) {
  void openVideoPageAndRemove(item)
}

function playInWatchLater(item: VideoItem) {
  const url = getWatchLaterPlaybackUrl(item, true)
  if (url)
    handleLinkClick(url)
}

function remove(item: VideoItem) {
  void deleteWatchLaterItem(item.aid)
}

function isItemActionPending(): boolean {
  return batch.busy.value || bulkAction.pending.value || pendingAction.value?.accountId === getCurrentAccountId()
}
// Filtering waits for the whole queue, so the number of matches is unknown
// until it arrives: the ring, never skeletons. No matches show under the head.
const pendingRef = ref<{ $el: Element }>()
const pendingLoading = computed(() => filtersActive.value && isLoading.value && !filteredItems.value.length)
const pendingPhase = useLoadingRingPhase(() => pendingLoading.value, () => pendingRef.value?.$el)
const showSkeletons = computed(() => isLoading.value && !isRefreshing.value && !filtersActive.value)
const hasNoMatches = computed(() => filtersActive.value && watchLaterCount.value > 0 && !isLoading.value && !filteredItems.value.length && !requestFailed.value)
useLayoutMotion(cardContainer, () => `${watchLaterLayoutMode.value}:${filteredItems.value.map(item => item.aid).join(',')}`)
</script>

<template>
  <LibraryWorkspace v-if="getCSRF()" :label="t('watch_later.title')">
    <main
      v-layout-editable="'watch-later-layout'"
      :aria-busy="isLoading || batch.busy.value"
      data-layout-editable-id="watch-later-layout"
    >
      <Button v-if="requiresFullLibrary && !noMoreContent && !isLoading && !requestFailed" type="secondary" :disabled="batch.busy.value" @click="loadCompleteLibrary()">
        {{ t('common.load_more') }}
      </Button>
      <Empty
        v-if="requestFailed && !isLoading && currentWatchLaterList.length === 0" text-only fill :description="$t('common.load_failed')" :action-label="$t('common.operation.refresh')"
        @action="retryWatchLaterRequest"
      />
      <Empty v-else-if="watchLaterCount === 0 && (!isLoading || isRefreshing)" text-only fill :description="$t('common.no_data')" role="status" />
      <template v-else>
        <!-- The queue's head: the first cover across the top, the stacked queue and Play All. -->
        <Transition name="library-hero" :duration="300">
          <LibraryHero v-if="!batch.managing.value" :image="currentWatchLaterList[0]?.pic" :media-pending="isLoading && !currentWatchLaterList.length" :label="t('watch_later.title')" class="watch-later-hero">
            <h2 class="watch-later-hero__title">
              {{ t('watch_later.title') }}
            </h2>
            <span class="watch-later-hero__meta">{{ t('library_tools.video_count', { count: watchLaterCount }) }}</span>
            <template #actions>
              <WatchLaterPlayAllCard
                :items="currentWatchLaterList" :total="watchLaterCount" :loading="isLoading" :disabled="watchLaterCount === 0"
                @play="handlePlayAll"
              />
            </template>
          </LibraryHero>
        </Transition>
        <LoadingFill v-if="pendingPhase !== 'idle'" ref="pendingRef" :loading="pendingLoading" />
        <Empty v-else-if="hasNoMatches" text-only fill :description="t('library_tools.no_matches')" role="status" />
        <VideoListSkeleton
          v-else-if="showSkeletons && currentWatchLaterList.length === 0 && watchLaterLayoutMode === 'list'"
          :count="5"
          :action-count="3"
        />
        <!-- watcher later list -->
        <div v-else-if="watchLaterLayoutMode === 'list'" ref="cardContainer">
          <TransitionGroup name="library-list" :css="currentWatchLaterList.length <= CARD_WINDOW_THRESHOLD" v-bind="currentWatchLaterList.length <= CARD_WINDOW_THRESHOLD ? retiringListTransition : {}">
            <template v-for="row in renderedRows" :key="row.key">
              <div v-if="row.height !== undefined" :style="{ height: `${row.height}px` }" aria-hidden="true" />
              <div
                v-for="item in row.items"
                :key="item.aid"
                :ref="element => cardWindow.setElement(item.aid, element)"
                :data-motion-key="item.aid"
                class="watch-later-list-card group"
                flex cursor-pointer
              >
                <ALink
                  :inert="batch.managing.value ? true : undefined"
                  class="watch-later-list-card__overlay"
                  :href="getWatchLaterPlaybackUrl(item)"
                  type="videoCard"
                  :aria-label="item.title"
                />
                <section
                  :inert="batch.managing.value ? true : undefined"
                  class="watch-later-list-card__content"
                  rounded="$bew-thumb-radius"
                  flex="~ gap-6 col md:col lg:row items-start"
                  relative
                  group-hover:bg="$bew-fill-2"
                  duration-300 w-full
                  p-2 m-1
                  content-visibility-auto
                >
                  <!-- Cover -->
                  <div
                    pos="relative"
                    bg="$bew-skeleton"
                    w="full md:full lg:250px"
                    flex="shrink-0"
                    rounded="$bew-thumb-radius"
                    overflow-hidden
                    style="aspect-ratio: var(--bew-video-cover-aspect-ratio)"
                  >
                    <LazyPicture
                      v-if="item.pic"
                      responsive-cover
                      aspect-ratio="var(--bew-video-cover-aspect-ratio)"
                      w="full"
                      h-full
                      :src="removeHttpFromUrl(`${item.pic}@480w_270h_1c`)"
                      :alt="item.title"
                      object-cover
                    />

                    <!-- The cover carries no text: only the watched line along its
                         bottom edge; the times are in the details. -->
                    <div class="watch-later-list-card__progress">
                      <Progress
                        :percentage="
                          getVideoProgressPercentage({ aid: item.aid, bvid: item.bvid, cid: item.cid, epid: item.bangumi?.ep_id }, item.progress, item.duration)
                        "
                      />
                    </div>
                  </div>

                  <!-- Description -->
                  <div flex justify-between w-full h-full>
                    <div flex="~ col">
                      <ALink
                        class="watch-later-list-card__action keep-two-lines"
                        :href="getWatchLaterPlaybackUrl(item)"
                        type="videoCard"
                        un-text="lg"
                      >
                        {{ item.title }}
                      </ALink>
                      <a
                        class="watch-later-list-card__action"
                        un-text="$bew-text-2 sm"
                        m="t-4 b-2"
                        flex="~"
                        items-center
                        cursor-pointer
                        w-fit
                        rounded="$bew-interactive-radius"
                        hover:color="$bew-theme-foreground"
                        hover:bg="$bew-theme-surface"
                        duration-300
                        pr-2
                        :href="getWatchLaterAuthor(item).authorUrl" target="_blank"
                        @click.stop
                      >
                        <img
                          v-if="getWatchLaterAuthor(item).authorFace"
                          :src="removeHttpFromUrl(`${getWatchLaterAuthor(item).authorFace}@40w_40h_1c`)"
                          w-30px
                          aspect-square
                          class="bew-shape-circle"
                          object-cover
                          alt=""
                          mr-2
                        >
                        {{ getWatchLaterAuthor(item).name }}
                      </a>
                      <p class="watch-later-list-card__times">
                        {{ `${item.progress === -1 ? calcCurrentTime(item.duration) : calcCurrentTime(getVideoPlaybackProgress({ aid: item.aid, bvid: item.bvid, cid: item.cid, epid: item.bangumi?.ep_id }, item.progress, item.duration)?.progress ?? 0)} / ${calcCurrentTime(item.duration)}` }}
                      </p>
                      <p display="block xl:none" text="$bew-text-2 sm" mt-auto mb-2>
                        {{
                          useDateFormat(item.pubdate * 1000, 'YYYY-MM-DD HH:mm:ss')
                            .value
                        }}
                      </p>
                    </div>

                    <div class="watch-later-list-card__actions" flex items-center gap-1>
                      <Tooltip :content="t('watch_later.play_video')" placement="top">
                        <IconButton
                          class="watch-later-list-card__action"
                          :label="t('watch_later.play_video')"
                          :disabled="isItemActionPending() || !getWatchLaterPlaybackUrl(item)"
                          text="size-$bew-icon-size-lg $bew-text-3"
                          hover:color="$bew-theme-foreground"
                          p-2
                          duration-300
                          @click.prevent.stop="playAndRemove(item)"
                        >
                          <div i-tabler:player-play aria-hidden="true" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip :content="t('watch_later.play_in_watch_later')" placement="top">
                        <IconButton
                          class="watch-later-list-card__action"
                          :label="t('watch_later.play_in_watch_later')"
                          :disabled="isItemActionPending() || !getWatchLaterPlaybackUrl(item)"
                          text="size-$bew-icon-size-lg $bew-text-3"
                          hover:color="$bew-theme-foreground"
                          p-2
                          duration-300
                          @click.prevent.stop="playInWatchLater(item)"
                        >
                          <div i-tabler:list-check aria-hidden="true" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip :content="t('watch_later.remove_from_watch_later')" placement="top">
                        <IconButton
                          class="watch-later-list-card__action"
                          :label="t('watch_later.remove_from_watch_later')"
                          :disabled="isItemActionPending()"
                          text="size-$bew-icon-size-lg $bew-text-3"
                          hover:color="$bew-theme-foreground"
                          p-2
                          duration-300
                          @click.prevent.stop="remove(item)"
                        >
                          <div i-tabler:trash aria-hidden="true" />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </div>
                </section>
                <WatchLaterSelectionOverlay
                  v-if="batch.managing.value" :label="item.title" :selected="batch.selected.value.has(item.aid)"
                  :disabled="isLoading || batch.busy.value" @toggle="batch.toggle(item.aid)"
                />
              </div>
            </template>
          </TransitionGroup>
        </div>

        <div v-else class="watch-later-grid-root">
          <div
            ref="cardContainer"
            class="watch-later-grid"
            :class="watchLaterGridClass"
          >
            <TransitionGroup name="library-list" :css="currentWatchLaterList.length <= CARD_WINDOW_THRESHOLD" v-bind="currentWatchLaterList.length <= CARD_WINDOW_THRESHOLD ? retiringListTransition : {}">
              <template v-for="row in renderedRows" :key="row.key">
                <div v-if="row.height !== undefined" :style="{ height: `${row.height}px`, gridColumn: '1 / -1' }" aria-hidden="true" />
                <div v-for="item in row.items" :key="item.aid" :ref="element => cardWindow.setElement(item.aid, element)" :data-motion-key="item.aid" class="watch-later-grid-slot">
                  <WatchLaterGridCard
                    :key="item.aid"
                    :inert="batch.managing.value ? true : undefined"
                    :item="item"
                    :disabled="isItemActionPending()"
                    @play-and-remove="playAndRemove"
                    @play-in-watch-later="playInWatchLater"
                    @remove="remove"
                  />
                  <WatchLaterSelectionOverlay
                    v-if="batch.managing.value" :label="item.title" :selected="batch.selected.value.has(item.aid)"
                    :disabled="isLoading || batch.busy.value" @toggle="batch.toggle(item.aid)"
                  />
                </div>
              </template>
              <LibraryVideoCardSkeleton
                v-for="index in (showSkeletons ? (currentWatchLaterList.length === 0 ? 8 : 4) : 0)"
                :key="`watch-later-grid-skeleton-${index}`"
              />
            </TransitionGroup>
          </div>
        </div>

        <VideoListSkeleton
          v-if="showSkeletons && currentWatchLaterList.length !== 0 && !noMoreContent && watchLaterLayoutMode === 'list'"
          :count="2"
          :action-count="3"
        />
        <SmoothLoading v-if="filtersActive && filteredItems.length" :show="isLoading && !isRefreshing" />
        <Empty
          v-if="requestFailed && !isLoading && currentWatchLaterList.length > 0"
          text-only class="watch-later-load-more-error" :description="$t('common.load_failed')" :action-label="$t('common.operation.refresh')" @action="retryWatchLaterRequest"
        />
      </template>
    </main>

    <template #sidebar="{ contentId }">
      <div class="library-rail-content">
        <LibrarySidebarHeading :title="t('watch_later.title')" :content-id="contentId" :count="watchLaterCount" />
        <fieldset class="watch-later-controls library-rail-content" :disabled="isItemActionPending()" :aria-label="t('watch_later.title')">
          <div class="library-rail-tools library-rail-tools--ruled">
            <LibrarySearchField v-model="searchQuery" :label="t('library_tools.watch_later_search')" :filter-active="hasWatchLaterFilters(advancedFilters)">
              <template #filter>
                <LibraryFilterMenu :label="t('library_tools.filters')" :groups="filterGroups" :disabled="isItemActionPending()" @select="selectFilter" />
              </template>
            </LibrarySearchField>
            <div class="watch-later-layout-switcher" :class="{ 'watch-later-layout-switcher--sort-only': !settings.enableGridLayoutSwitcher }">
              <SettingsSegmentedControl
                v-if="settings.enableGridLayoutSwitcher" v-model="settings.watchLaterLayoutMode" class="library-rail-segments bew-segment-control--secondary"
                :options="layoutOptions" :label="t('settings.watch_later_layout_mode')"
              />
              <Tooltip class="watch-later-sort" :content="t(`watch_later.sort_${sortOrder}`)" placement="bottom" teleport>
                <IconButton
                  class="watch-later-sort-button" :label="t(`watch_later.sort_${sortOrder}`)" :data-sort-order="sortOrder"
                  @click="sortOrder = sortOrder === 'newest' ? 'oldest' : 'newest'"
                >
                  <i :class="sortOrder === 'newest' ? 'i-tabler:sort-descending' : 'i-tabler:sort-ascending'" aria-hidden="true" />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <LibraryDateRange
            :open="advancedFilters.added === 'custom'" :title="t('library_tools.date_range')" :start="advancedFilters.startDate" :end="advancedFilters.endDate"
            :invalid="invalidRange" :disabled="isItemActionPending()" @update="updateFilterDate"
          />
          <Button
            class="library-sidebar-action" :type="batch.managing.value ? 'primary' : 'default'"
            role="switch" :aria-checked="batch.managing.value"
            @click="batch.toggleManaging"
          >
            <template #left>
              <div :class="batch.managing.value ? 'i-tabler:check' : 'i-tabler:list-check'" aria-hidden="true" />
            </template>
            {{ t('watch_later.batch_manage') }}
          </Button>
          <Transition name="page-fade" mode="out-in" v-bind="retiringTransition">
            <div v-if="batch.managing.value" key="selection" class="library-rail-actions">
              <Button
                class="library-sidebar-action" :disabled="isLoading || !noMoreContent || !filteredItems.length" :aria-pressed="batch.allSelected.value"
                @click="batch.toggleAll"
              >
                {{ t(batch.allSelected.value ? 'watch_later.unselect_all' : 'watch_later.select_all') }}
              </Button>
              <Button
                type="primary" class="library-sidebar-action" :disabled="isLoading || !batch.selected.value.size"
                @click="batch.removeSelected"
              >
                <template #left>
                  <LoadingRing :loading="batch.busy.value">
                    <i i-tabler:trash aria-hidden="true" />
                  </LoadingRing>
                </template>
                {{ t('watch_later.remove_selected', { count: batch.selected.value.size }) }}
              </Button>
              <p v-if="batch.failed.value" class="watch-later-batch-error" role="alert">
                {{ t('common.operation_failed') }}
              </p>
            </div>
            <div v-else key="actions" class="library-rail-actions">
              <Button class="library-sidebar-action" @click="showOpenTabsDialog = true">
                <template #left>
                  <span i-tabler:browser-plus aria-hidden="true" />
                </template>
                {{ t('watch_later.open_tabs.title') }}
              </Button>
              <Button
                class="library-sidebar-action watch-later-refresh-button" :disabled="isLoading"
                :aria-busy="isLoading" @click="handleWatchLaterPageRefresh"
              >
                <template #left>
                  <LoadingRing :loading="isLoading">
                    <i i-tabler:refresh aria-hidden="true" />
                  </LoadingRing>
                </template>
                {{ t('watch_later.refresh') }}
              </Button>
              <Button
                v-if="watchLaterCount > 0" class="library-sidebar-action watch-later-action--warning"
                @click="handleRemoveWatchedVideos"
              >
                <template #left>
                  <div i-tabler:circle-minus aria-hidden="true" />
                </template>
                {{ t('watch_later.remove_watched_videos') }}
              </Button>
              <Button
                v-if="watchLaterCount > 0" class="library-sidebar-action watch-later-action--danger"
                @click="handleClearAllWatchLater"
              >
                <template #left>
                  <div i-tabler:trash aria-hidden="true" />
                </template>
                {{ t('watch_later.clear_all') }}
              </Button>
            </div>
          </Transition>
        </fieldset>
      </div>
    </template>
    <OpenTabsDialog v-if="showOpenTabsDialog" @close="showOpenTabsDialog = false" />
  </LibraryWorkspace>
  <Empty
    v-else text-only class="library-workspace-login" :description="t('common.please_log_in_first')" :action-label="t('common.login')"
    @action="jumpToLoginPage"
  />
</template>

<style lang="scss" scoped>
.watch-later-action--warning {
  --bew-library-action-foreground: var(--bew-warning-foreground);
}
.watch-later-action--danger {
  --bew-library-action-foreground: var(--bew-error-foreground);
}
.watch-later-layout-switcher {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 60%) minmax(0, 1fr);
  align-items: center;
  min-width: 0;

  .library-rail-segments {
    grid-column: 2;
    width: 100%;
    min-width: 0;
  }
}
.watch-later-sort {
  grid-column: 3;
  justify-self: start;
  margin-inline-start: var(--bew-space-1);
}
.watch-later-layout-switcher--sort-only .watch-later-sort {
  grid-column: 2;
  justify-self: center;
  margin: 0;
}
.watch-later-sort-button {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  color: var(--bew-text-1);

  i {
    font-size: var(--bew-control-icon-size);
  }
  &:is(:hover, :focus-visible):not(:disabled) {
    color: var(--bew-message-icon-hover);
  }
}
.watch-later-list-card__progress {
  position: absolute;
  inset: auto 0 0;
}
.watch-later-list-card__times {
  margin: 0 0 var(--bew-space-1);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
  font-variant-numeric: tabular-nums;
}
.watch-later-hero {
  position: relative;
  margin-bottom: var(--bew-space-6);
}
.watch-later-hero__title {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-display);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-display);
}
.watch-later-hero__meta {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
  font-variant-numeric: tabular-nums;
}
.watch-later-controls {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.watch-later-batch-error {
  margin: 0;
  color: var(--bew-error-foreground);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.watch-later-grid-slot {
  position: relative;
  min-width: 0;
}
.watch-later-list-card {
  position: relative;
}

.watch-later-list-card__overlay {
  position: absolute;
  z-index: 1;
  inset: 0;
}

.watch-later-list-card__action {
  position: relative;
  z-index: 2;
}
.watch-later-list-card__actions {
  opacity: 0;
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}
.watch-later-list-card:is(:hover, :focus-within) .watch-later-list-card__actions {
  opacity: 1;
}
@media (hover: none) {
  .watch-later-list-card__actions {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .watch-later-list-card__actions {
    transition: none;
  }
}

.watch-later-grid-root {
  min-width: 0;
  container-type: inline-size;
}

.watch-later-grid {
  min-width: 0;
}

.watch-later-load-more-error {
  display: flex;
  min-height: var(--bew-control-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
}
</style>
