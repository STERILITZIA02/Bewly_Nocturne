<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import Empty from '~/components/Empty.vue'
import LibraryBleedStrip from '~/components/LibraryBleedStrip.vue'
import LibraryDateRange from '~/components/LibraryDateRange.vue'
import type { LibraryFilterGroup } from '~/components/LibraryFilterMenu.vue'
import LibraryFilterMenu from '~/components/LibraryFilterMenu.vue'
import LibrarySearchField from '~/components/LibrarySearchField.vue'
import LibrarySidebarHeading from '~/components/LibrarySidebarHeading.vue'
import LibraryWorkspace from '~/components/LibraryWorkspace.vue'
import LoadingFill from '~/components/LoadingFill.vue'
import LoadingRing from '~/components/LoadingRing.vue'
import Progress from '~/components/Progress.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import SmoothLoading from '~/components/SmoothLoading.vue'
import type { Video } from '~/components/VideoCard/types'
import VideoCard from '~/components/VideoCard/VideoCard.vue'
import type { VideoCardContextMenuExtraOption } from '~/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { CardWindowSnapshot } from '~/composables/useCardWindow'
import { CARD_WINDOW_THRESHOLD, useCardWindow } from '~/composables/useCardWindow'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { useLayoutMotion } from '~/composables/useLayoutMotion'
import { useLibraryBatchSelection } from '~/composables/useLibraryBatchSelection'
import { useLoadingRingPhase } from '~/composables/useLoadingRingPhase'
import { usePageSearchIntent } from '~/composables/usePageSearchIntent'
import { usePageViewState } from '~/composables/usePageViewState'
import { VIDEO_CARD_COVER_ASPECT_RATIO } from '~/constants/layout'
import SelectionOverlay from '~/contentScripts/views/WatchLater/WatchLaterSelectionOverlay.vue'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { HistoryGroupInterval } from '~/logic/storage'
import type { List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getAdaptiveGridColumnCount } from '~/utils/gridLayout'
import { getHistoryUrl, getHistoryVideoIdentity } from '~/utils/historyTarget'
import { normalizeIntlLocale } from '~/utils/locale'
import { getCSRF, getUserID, removeHttpFromUrl } from '~/utils/main'
import { retiringTransition } from '~/utils/motionPresence'
import { clearVideoVisitHistory, getVideoProgressPercentage, removeVideoVisitHistory } from '~/utils/videoVisitHistory'

import type { HistoryFilters, HistorySortOrder } from './historyFilters'
import { hasHistoryFilters, historyRangeBounds } from './historyFilters'
import HistoryGroupRow from './HistoryGroupRow.vue'
import type { HistoryGroup } from './historyGroups'
import { HISTORY_GROUP_INTERVALS, historyGroupHours, historyItemKey } from './historyGroups'
import HistoryGroupSkeleton from './HistoryGroupSkeleton.vue'
import { useHistoryTimeline } from './useHistoryTimeline'

const { t, locale } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()

const { handlePageRefresh, handleReachBottom, haveScrollbar, scrollViewportRef, requestLoadMoreCheck } = useBewlyApp()
const topBarStore = useTopBarStore()
const viewState = usePageViewState('history')
const sortOrder = viewState.ref<HistorySortOrder>('sort', 'newest')
const interval = computed(() => settings.value.historyGroupInterval)
const accountId = computed(() => resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid))
const timeline = useHistoryTimeline({
  api: api.history,
  getAccountId: () => getUserID() === String(accountId.value) ? accountId.value : null,
  getCSRF,
  haveScrollbar,
  onWriteError: () => toast.error(t('common.operation_failed')),
  onDeleted: (items) => { void removeVideoVisitHistory(items.map(getHistoryVideoIdentity)) },
  onCleared: () => { void clearVideoVisitHistory() },
  getGroupInterval: () => interval.value,
  getSortOrder: () => sortOrder.value,
})
const { isLoading, requestFailed, requestStalled, noMoreContent, historyList, keyword, submittedKeyword, filters, contentType, filtersActive, isClearingHistory, historyStatus, setHistoryPauseStatus, clearAllHistory } = timeline
viewState.capture('timeline', timeline.snapshot)
const collapsedGroups = viewState.ref('collapsedGroups', new Set<string>())
const stripSnapshots = new Map<string, CardWindowSnapshot>(viewState.read('strips', []))
watch(accountId, () => stripSnapshots.clear(), { flush: 'post' })
const groupRefs = new Map<string, { $el: HTMLElement, captureSnapshot: () => CardWindowSnapshot }>()
const cardRefs = new Map<string, { canRecycle: boolean }>()
const canReleaseCard = (key: string) => cardRefs.get(key)?.canRecycle !== false
viewState.capture('strips', () => {
  groupRefs.forEach((group, key) => stripSnapshots.set(key, group.captureSnapshot()))
  return [...stripSnapshots]
})
const mutationKey = (item: HistoryItem) => `${item.history.business}_${item.history.oid}`
const dateFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { dateStyle: 'medium' }))
const timeFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
// Rows of the chosen interval (user-specified): an hour, eight hours or a day,
// each under its date heading; part-day groups add their hours.
const historyGroups = timeline.groups
watch(() => historyGroups.value.map(group => `group:${group.key}`), (keys) => {
  const current = new Set(keys)
  for (const key of stripSnapshots.keys()) {
    if (!current.has(key))
      stripSnapshots.delete(key)
  }
})
function saveStripSnapshot(key: string, snapshot: CardWindowSnapshot) {
  if (historyGroups.value.some(group => `group:${group.key}` === key))
    stripSnapshots.set(key, snapshot)
}
// The group the list starts at, chosen in the day strip; choosing the first
// day brings back the whole list. Only the plain newest-first list starts late.
const startGroupKey = ref<string>()
const plainList = computed(() => !submittedKeyword.value && sortOrder.value === 'newest' && !hasHistoryFilters(filters.value))
const shownGroups = computed(() => {
  const groups = historyGroups.value
  const start = plainList.value ? groups.findIndex(group => group.key === startGroupKey.value) : -1
  return start > 0 ? groups.slice(start) : groups
})
function groupLabel(group: HistoryGroup) {
  if (!group.start)
    return t('history.unknown_date')
  return [dateFormatter.value.format(group.start), historyGroupHours(group)].filter(Boolean).join(' ')
}
const batch = useLibraryBatchSelection({
  keys: () => shownGroups.value.filter(group => !collapsedGroups.value.has(group.key)).flatMap(group => group.items.map(mutationKey)),
  captureOwner: timeline.capture,
  remove: timeline.deleteSelectedHistoryItem,
  commit: timeline.commitSelectedHistoryItems,
})
const controlsDisabled = computed(() => batch.busy.value || isClearingHistory.value || timeline.deleting.size > 0)
// Filtered reads (search, filters, a content type) scan pages for an unknown
// number of matches: they show the ring, never skeletons. Unfiltered pages
// have a known size and keep skeletons.
const pendingRef = ref<{ $el: Element }>()
const pendingLoading = computed(() => filtersActive.value && isLoading.value && !historyList.length)
const pendingPhase = useLoadingRingPhase(() => pendingLoading.value, () => pendingRef.value?.$el)
const showSkeletons = computed(() => isLoading.value && !filtersActive.value)
batch.managing.value = viewState.read('managing', false)
batch.selected.value = viewState.read('selected', new Set<string>())
viewState.capture('managing', () => batch.managing.value)
viewState.capture('selected', () => batch.selected.value)
// Recheck the shared sentinel when a request finishes or folding a group
// exposes the bottom; IntersectionObserver need not emit another entry then.
watch([isLoading, controlsDisabled, collapsedGroups, sortOrder, interval, startGroupKey], () => {
  if (!isLoading.value && !controlsDisabled.value && !requestFailed.value && !noMoreContent.value)
    requestLoadMoreCheck?.()
}, { flush: 'post' })
function updateFilters(value: HistoryFilters) {
  if (controlsDisabled.value)
    return
  filters.value = value
  handleSearch()
}
// The filter behind the search field's funnel; a custom period opens the
// date range on the rail.
const DURATIONS = ['all', 'short', 'medium', 'long', 'extraLong'] as const
const PERIODS = ['all', 'today', 'yesterday', 'week', 'custom'] as const
const DEVICES = ['all', 'pc', 'phone', 'tablet', 'tv'] as const
const DURATION_ICONS = { all: 'i-tabler:clock', short: 'i-tabler:clock-hour-2', medium: 'i-tabler:clock-hour-5', long: 'i-tabler:clock-hour-8', extraLong: 'i-tabler:clock-hour-11' } as const
const PERIOD_ICONS = { all: 'i-tabler:infinity', today: 'i-tabler:calendar-event', yesterday: 'i-tabler:calendar-minus', week: 'i-tabler:calendar-week', custom: 'i-tabler:calendar-cog' } as const
const SORT_ORDERS = ['newest', 'oldest'] as const
const SORT_ICONS = { newest: 'i-tabler:sort-descending', oldest: 'i-tabler:sort-ascending' } as const
const DEVICE_ICONS = { all: 'i-tabler:devices', pc: 'i-tabler:device-desktop', phone: 'i-tabler:device-mobile', tablet: 'i-tabler:device-tablet', tv: 'i-tabler:device-tv' } as const
const filterGroups = computed<LibraryFilterGroup[]>(() => [
  { key: 'duration', title: t('library_tools.filter_duration'), value: filters.value.duration, options: DURATIONS.map(value => ({ value, label: t(`watch_later.filters.duration_${value}`), icon: DURATION_ICONS[value] })) },
  { key: 'period', title: t('library_tools.filter_watched'), value: filters.value.period, options: PERIODS.map(value => ({ value, label: t(value === 'custom' ? 'library_tools.date_custom' : `history.filters.period_${value}`), icon: PERIOD_ICONS[value] })) },
  { key: 'device', title: t('library_tools.filter_device'), value: filters.value.device, options: DEVICES.map(value => ({ value, label: t(`history.filters.device_${value}`), icon: DEVICE_ICONS[value] })) },
  { key: 'sort', title: t('library_tools.filter_sort'), value: sortOrder.value, options: SORT_ORDERS.map(value => ({ value, label: t(`history.sort_${value}`), icon: SORT_ICONS[value] })) },
])
// The funnel lights for any filter, and for the oldest-first order too.
const filterActive = computed(() => hasHistoryFilters(filters.value) || sortOrder.value !== 'newest')
function selectFilter(key: string, value: string) {
  if (key === 'sort') {
    sortOrder.value = value as HistorySortOrder
    resetHistoryPosition()
  }
  else if (key === 'period') {
    updateFilters({ ...filters.value, period: value as HistoryFilters['period'], ...(value === 'custom' ? {} : { startDate: '', endDate: '' }) })
  }
  else {
    updateFilters({ ...filters.value, [key]: value })
  }
}
function updateFilterDate(key: 'startDate' | 'endDate', value: string) {
  updateFilters({ ...filters.value, [key]: value })
}
const invalidRange = computed(() => historyRangeBounds(filters.value) === null)
const contentTypes = ['all', 'archive', 'pgc', 'live', 'article'] as const
const railContentOptions = computed(() => contentTypes.map(value => ({ value, label: t(value === 'all' ? 'history.all_history' : `library_tools.type_${value}`) })))
function selectRailContent(value: string) {
  if (controlsDisabled.value)
    return
  const type = contentTypes.find(type => type === value)
  if (type) {
    contentType.value = type
    void handleSearch()
  }
}

const historyContent = ref<HTMLElement | null>(null)
const historyContainer = ref<HTMLElement | null>(null)
// Cards slide into place when one leaves its row.
const layoutMotion = useLayoutMotion(historyContainer, () => String(timeline.contentRevision.value), {
  selector: '[data-history-key]',
  key: 'data-history-key',
})
// The group interval works like batch management (user-specified): its rail
// button fades out for the choices, and a choice brings it back.
const INTERVAL_ICONS: Record<HistoryGroupInterval, string> = { hour: 'i-tabler:clock-hour-3', period: 'i-tabler:clock-hour-8', day: 'i-tabler:calendar' }
const choosingInterval = ref(false)
function selectInterval(value: HistoryGroupInterval) {
  choosingInterval.value = false
  if (value === interval.value)
    return
  layoutMotion.cancel()
  collapsedGroups.value = new Set()
  startGroupKey.value = undefined
  settings.value.historyGroupInterval = value
}
// Cards keep the size of the adaptive video grid's columns (user-specified):
// a row shows as many as the grid would fit across the content.
const CARD_GAP = 16
const containerWidth = ref(0)
const cardColumns = computed(() => getAdaptiveGridColumnCount(containerWidth.value, CARD_GAP))
const cardWidth = computed(() => containerWidth.value ? (containerWidth.value - CARD_GAP * (cardColumns.value - 1)) / cardColumns.value : 0)
useResizeObserver(historyContent, (entries) => {
  const width = entries[0]?.contentRect.width
  if (width)
    containerWidth.value = width
})
// On the low side: a card scrolled out of its strip skips rendering at this
// size, and must not make the row taller than its visible cards.
const cardHeight = computed(() => Math.round(cardWidth.value / VIDEO_CARD_COVER_ASPECT_RATIO + 56))
const HEADING_HEIGHT = 28
// Matches `.history-groups`' gap: wide enough that the wheel over it scrolls
// the page rather than a row's strip (user request).
const rowGap = ref(48)
const rowHeight = computed(() => HEADING_HEIGHT + 12 + cardWidth.value / VIDEO_CARD_COVER_ASPECT_RATIO + 80)
const groupByKey = computed(() => new Map(shownGroups.value.map(group => [`group:${group.key}`, group])))
const cardWindow = useCardWindow({
  root: scrollViewportRef,
  container: historyContainer,
  keys: computed(() => shownGroups.value.map(group => `group:${group.key}`)),
  columns: ref(1),
  gap: rowGap,
  enabled: computed(() => historyList.length > CARD_WINDOW_THRESHOLD),
  estimatedHeight: rowHeight,
  estimateHeight: key => collapsedGroups.value.has(groupByKey.value.get(String(key))?.key ?? '') ? HEADING_HEIGHT : rowHeight.value,
  layout: computed(() => `${interval.value}:${Math.round(cardWidth.value)}:${settings.value.interfaceFontSize}`),
  canRelease: key => !groupByKey.value.get(String(key))?.items.some(item => timeline.deleting.has(mutationKey(item)) || !canReleaseCard(historyItemKey(item))),
})
type RenderedHistoryRow = { kind: 'group', key: string, group: HistoryGroup } | { kind: 'spacer', key: string, height: number }
const renderedRows = computed(() => cardWindow.ranges.value.flatMap<RenderedHistoryRow>(range => range.height !== undefined
  ? [{ kind: 'spacer' as const, key: `spacer:${range.start}`, height: range.height }]
  : shownGroups.value.slice(range.start, range.end).map(group => ({ kind: 'group' as const, key: `group:${group.key}`, group }))))
// The day strip over the content: each loaded day, starting the list at its first group.
const dayFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { month: 'short', day: 'numeric', weekday: 'short' }))
const historyDays = computed(() => {
  const now = new Date()
  const dayKey = (offset: number) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`
  }
  const [today, yesterday] = [dayKey(0), dayKey(1)]
  const days = new Map<string, { key: string, label: string }>()
  for (const group of historyGroups.value) {
    if (group.dayKey === 'unknown' || days.has(group.dayKey))
      continue
    const [year, month, day] = group.dayKey.split('-').map(Number)
    const label = group.dayKey === today
      ? t('history.filters.period_today')
      : group.dayKey === yesterday ? t('history.filters.period_yesterday') : dayFormatter.value.format(new Date(year, month - 1, day))
    days.set(group.dayKey, { key: group.dayKey, label })
  }
  return [...days.values()]
})
function jumpToDay(dayKey: string) {
  const group = historyGroups.value.find(group => group.dayKey === dayKey)
  if (group)
    selectStartGroup(group.key)
}
// The list below starts at the chosen group (user-specified): its history
// loads in place of the scroll, the later pages following as usual.
function selectStartGroup(groupKey: string) {
  if (controlsDisabled.value || groupKey === (startGroupKey.value ?? historyGroups.value[0]?.key))
    return
  layoutMotion.cancel()
  batch.clearSelection()
  startGroupKey.value = groupKey === historyGroups.value[0]?.key ? undefined : groupKey
}
// The day strip shows with a second day, or held by skeletons on the first page.
const showDayStrip = computed(() => historyDays.value.length > 1 || (showSkeletons.value && !historyList.length))
function toggleHistoryGroup(key: string) {
  if (controlsDisabled.value)
    return
  const next = new Set(collapsedGroups.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  layoutMotion.cancel()
  collapsedGroups.value = next
}

function resetHistoryPosition() {
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
}
function handleSearch(event?: KeyboardEvent) {
  if (event?.isComposing || controlsDisabled.value)
    return
  batch.clearSelection()
  collapsedGroups.value = new Set()
  startGroupKey.value = undefined
  resetHistoryPosition()
  timeline.handleSearch()
}
function clearSearch() {
  if (controlsDisabled.value)
    return
  batch.clearSelection()
  collapsedGroups.value = new Set()
  startGroupKey.value = undefined
  resetHistoryPosition()
  timeline.clearSearch()
}
watch(keyword, (value) => {
  if (!value.trim() && submittedKeyword.value)
    clearSearch()
})
// Removing one record is in the card's shared menu (user-specified), not on the card.
function getHistoryMenuGroups(item: unknown): VideoCardContextMenuExtraOption[][] {
  const record = item as HistoryItem
  return [[{ key: 'history:remove', name: t('history.remove_from_history'), icon: 'i-tabler:trash', color: 'text-$bew-error-color', run: () => void timeline.deleteHistoryItem(record) }]]
}

function formatHistoryTime(item: HistoryItem) {
  const date = new Date(item.view_at * 1000)
  return Number.isFinite(date.getTime()) ? timeFormatter.value.format(date) : '—'
}
function getHistoryItemTag(item: HistoryItem) {
  if (item.history.business === Business.LIVE)
    return t('search.categories.live')
  return item.history.business === Business.PGC ? t('history.media') : ''
}
function getHistoryItemProgressText(item: HistoryItem) {
  if (item.history.business !== Business.ARCHIVE && item.history.business !== Business.PGC)
    return ''
  // -1 means the whole video was watched.
  return `${calcCurrentTime(item.progress === -1 ? item.duration : item.progress)} / ${calcCurrentTime(item.duration)}`
}
function getHistoryItemCover(item: HistoryItem) {
  if ((item.history.business === 'article' || item.history.business === 'article-list') && item.covers)
    return removeHttpFromUrl(`${item.covers[0]}`)
  return removeHttpFromUrl(item.cover)
}
function hasWatchProgress(item: HistoryItem) {
  return item.history.business === Business.ARCHIVE || item.history.business === Business.PGC
}
// One card model per record (records are replaced, never mutated); the
// watched time, kind and progress sit where a card shows its date.
const videoModels = computed(() => {
  void locale.value
  return new WeakMap<HistoryItem, Video>()
})
function getHistoryVideo(item: HistoryItem): Video {
  let video = videoModels.value.get(item)
  if (!video) {
    const archive = item.history.business === Business.ARCHIVE
    const live = item.history.business === Business.LIVE
    video = {
      id: item.kid,
      title: item.show_title || item.title,
      cover: getHistoryItemCover(item),
      author: item.author_name ? { name: item.author_name, authorFace: item.author_face, mid: item.author_mid || undefined } : undefined,
      capsuleText: [formatHistoryTime(item), getHistoryItemTag(item), getHistoryItemProgressText(item)].filter(Boolean).join(' · '),
      duration: item.duration,
      aid: archive ? item.history.oid : undefined,
      bvid: archive ? item.history.bvid || undefined : undefined,
      cid: archive ? item.history.cid || undefined : undefined,
      epid: item.history.business === Business.PGC ? item.history.epid || undefined : undefined,
      roomid: live ? item.history.oid : undefined,
      goto: live ? 'live' : undefined,
      liveStatus: item.live_status,
      url: getHistoryUrl(item),
      threePointV2: [],
    }
    videoModels.value.set(item, video)
  }
  return video
}

let mounted = false
onMounted(() => {
  mounted = true
  timeline.activate(viewState.read<ReturnType<typeof timeline.snapshot> | undefined>('timeline', undefined))
  handleReachBottom.value = handleHistoryReachBottom
  handlePageRefresh.value = handleHistoryPageRefresh
})
usePageSearchIntent(AppPage.History, (query) => {
  keyword.value = query
  handleSearch()
})
watch(accountId, () => {
  if (mounted) {
    batch.reset()
    collapsedGroups.value = new Set()
    startGroupKey.value = undefined
    sortOrder.value = 'newest'
    resetHistoryPosition()
    timeline.activate()
  }
}, { flush: 'sync' })
onScopeDispose(() => {
  timeline.dispose()
  if (handleReachBottom.value === handleHistoryReachBottom)
    handleReachBottom.value = undefined
  if (handlePageRefresh.value === handleHistoryPageRefresh)
    handlePageRefresh.value = undefined
})
function handleHistoryReachBottom() {
  return requestFailed.value || controlsDisabled.value ? Promise.resolve(false) : timeline.load()
}
function handleHistoryPageRefresh() {
  if (controlsDisabled.value)
    return
  batch.clearSelection()
  collapsedGroups.value = new Set()
  startGroupKey.value = undefined
  resetHistoryPosition()
  void timeline.refreshCurrentMode()
}
function retryHistoryRequest() {
  if (!controlsDisabled.value)
    void timeline.retry()
}

async function handleClearAllWatchHistory() {
  if (controlsDisabled.value)
    return
  const owner = timeline.capture()
  const result = await showConfirmDialog(
    t('history.clear_all_watch_history_confirm'),
  )
  if (result && owner.isCurrent() && !controlsDisabled.value)
    void clearAllHistory()
}

async function handlePauseWatchHistory() {
  if (timeline.isUpdatingStatus.value || historyStatus.value !== false)
    return
  const owner = timeline.capture()
  const result = await showConfirmDialog(
    t('history.pause_watch_history_confirm'),
  )
  if (result && owner.isCurrent())
    setHistoryPauseStatus(true)
}

async function handleTurnOnWatchHistory() {
  if (timeline.isUpdatingStatus.value || historyStatus.value !== true)
    return
  const owner = timeline.capture()
  const result = await showConfirmDialog(
    t('history.turn_on_watch_history_confirm'),
  )
  if (result && owner.isCurrent())
    setHistoryPauseStatus(false)
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}
</script>

<template>
  <LibraryWorkspace v-if="getCSRF()" :label="t('history.title')">
    <main ref="historyContent" class="history-content" :style="cardWidth ? { '--history-card-width': `${cardWidth}px`, '--history-card-height': `${cardHeight}px` } : undefined">
      <!-- The first unfiltered page holds the strip with chips of the same height. -->
      <section v-if="showDayStrip" class="history-day-strip" :aria-label="t('library_tools.days')" :aria-busy="historyDays.length <= 1">
        <LibraryBleedStrip v-if="historyDays.length <= 1" :label="t('library_tools.days')" compact>
          <SkeletonBlock v-for="index in 6" :key="index" width="calc(var(--bew-space-12) + var(--bew-space-4))" height="var(--bew-control-height)" radius="full" />
        </LibraryBleedStrip>
        <LibraryBleedStrip v-else :label="t('library_tools.days')" compact>
          <button v-for="day in historyDays" :key="day.key" type="button" class="history-day-strip__day" @click="jumpToDay(day.key)">
            {{ day.label }}
          </button>
        </LibraryBleedStrip>
      </section>
      <p v-if="submittedKeyword" class="history-query-summary" role="status">
        {{ t('library_tools.search_results', { query: submittedKeyword }) }}
      </p>
      <LoadingFill v-if="pendingPhase !== 'idle'" ref="pendingRef" :loading="pendingLoading" />
      <Empty
        v-else-if="requestFailed && !isLoading && historyList.length === 0" text-only fill :description="$t(requestStalled ? 'common.pagination_stalled' : 'common.load_failed')" :action-label="$t('common.operation.refresh')"
        @action="retryHistoryRequest"
      />
      <Empty v-else-if="noMoreContent && !isLoading && !historyList.length" text-only fill :description="t(filtersActive ? 'library_tools.no_matches' : 'common.no_data')" role="status" />
      <HistoryGroupSkeleton v-else-if="showSkeletons && !historyList.length" :cards="cardColumns + 1" />

      <!-- One row per group; a new interval or starting group (chosen in the
           day strip) fades the rows over. -->
      <Transition v-else name="page-fade" mode="out-in" v-bind="retiringTransition">
        <div :key="`${interval}:${startGroupKey ?? ''}`" ref="historyContainer" class="history-groups">
          <template v-for="entry in renderedRows" :key="entry.key">
            <div v-if="entry.kind === 'spacer'" :style="{ height: `${entry.height}px` }" aria-hidden="true" />
            <HistoryGroupRow
              v-else :ref="component => { const row = component as { $el: HTMLElement, captureSnapshot: () => CardWindowSnapshot } | null; row ? groupRefs.set(entry.key, row) : groupRefs.delete(entry.key); cardWindow.setElement(entry.key, row?.$el ?? null) }" :data-history-cell="entry.key"
              :label="groupLabel(entry.group)" :expanded="!collapsedGroups.has(entry.group.key)" :disabled="controlsDisabled"
              :items="entry.group.items" :card-width="cardWidth" :can-release="canReleaseCard" :snapshot="stripSnapshots.get(entry.key)" @snapshot="saveStripSnapshot(entry.key, $event)"
              @toggle="toggleHistoryGroup(entry.group.key)"
            >
              <template #default="{ item, setElement }">
                <div :ref="setElement" class="history-card" :data-history-key="historyItemKey(item)">
                  <VideoCard
                    :ref="component => { const card = component as { canRecycle: boolean } | null; card ? cardRefs.set(historyItemKey(item), card) : cardRefs.delete(historyItemKey(item)) }"
                    :video="getHistoryVideo(item)" :menu-item="item" :get-menu-extra-groups="getHistoryMenuGroups"
                    :show-watch-later="item.history.business === Business.ARCHIVE" :inert="batch.managing.value ? true : undefined"
                  >
                    <!-- The cover carries no text (user-specified): only the watched line. -->
                    <template v-if="hasWatchProgress(item)" #coverBottom>
                      <Progress :percentage="getVideoProgressPercentage(getHistoryVideoIdentity(item), item.progress, item.duration)" />
                    </template>
                  </VideoCard>
                  <SelectionOverlay
                    v-if="batch.managing.value" :label="item.show_title || item.title"
                    :selected="batch.selected.value.has(mutationKey(item))" :disabled="batch.busy.value"
                    @toggle="batch.toggle(mutationKey(item))"
                  />
                </div>
              </template>
            </HistoryGroupRow>
          </template>
        </div>
      </Transition>

      <Empty
        v-if="requestFailed && !isLoading && historyList.length > 0" text-only class="history-load-more-error" :description="$t(requestStalled ? 'common.pagination_stalled' : 'common.load_failed')" :action-label="$t('common.operation.refresh')"
        @action="retryHistoryRequest"
      />

      <HistoryGroupSkeleton v-if="showSkeletons && historyList.length !== 0 && !noMoreContent" :rows="1" :cards="cardColumns + 1" />
      <SmoothLoading v-if="filtersActive && historyList.length" :show="isLoading" />
    </main>

    <template #sidebar="{ contentId }">
      <div class="library-rail-content">
        <LibrarySidebarHeading
          hide-title :title="t('history.title')" :model-value="contentType" :options="railContentOptions" :content-id="contentId"
          :disabled="controlsDisabled"
          @update:model-value="selectRailContent"
        />
        <fieldset class="history-controls library-rail-content" :disabled="controlsDisabled" :aria-label="t('history.title')">
          <div class="library-rail-tools library-rail-tools--ruled">
            <LibrarySearchField
              v-model="keyword" :label="t('history.search_watch_history')" :clearable="Boolean(submittedKeyword)" :filter-active="filterActive" @submit="handleSearch()"
              @clear="clearSearch"
            >
              <template #filter>
                <LibraryFilterMenu :label="t('library_tools.filters')" :groups="filterGroups" :disabled="controlsDisabled" @select="selectFilter" />
              </template>
            </LibrarySearchField>
          </div>
          <LibraryDateRange
            :open="filters.period === 'custom'" :title="t('library_tools.date_range')" :start="filters.startDate" :end="filters.endDate"
            :invalid="invalidRange" :disabled="controlsDisabled" @update="updateFilterDate"
          />
          <Transition name="page-fade" mode="out-in" v-bind="retiringTransition">
            <div
              v-if="choosingInterval" key="intervals" class="library-rail-actions" role="radiogroup" :aria-label="t('settings.history_group_interval')"
              @keydown.esc.stop="choosingInterval = false"
            >
              <Button
                v-for="value in HISTORY_GROUP_INTERVALS" :key="value" class="library-sidebar-action" :type="value === interval ? 'primary' : 'default'"
                role="radio" :aria-checked="value === interval" @click="selectInterval(value)"
              >
                <template #left>
                  <i :class="INTERVAL_ICONS[value]" />
                </template>
                {{ t(`history.group_${value}`) }}
              </Button>
            </div>
            <Button
              v-else key="interval" class="library-sidebar-action" :disabled="batch.managing.value" aria-haspopup="true"
              @click="choosingInterval = true"
            >
              <template #left>
                <i :class="INTERVAL_ICONS[interval]" />
              </template>
              {{ t('history.group_button', { interval: t(`history.group_${interval}`) }) }}
            </Button>
          </Transition>
          <Button
            class="library-sidebar-action" :type="batch.managing.value ? 'primary' : 'default'"
            role="switch" :aria-checked="batch.managing.value" @click="choosingInterval = false; batch.toggleManaging()"
          >
            <template #left>
              <i :class="batch.managing.value ? 'i-tabler:check' : 'i-tabler:list-check'" />
            </template>
            {{ t('watch_later.batch_manage') }}
          </Button>
          <Transition name="page-fade" mode="out-in" v-bind="retiringTransition">
            <div v-if="batch.managing.value" key="selection" class="library-rail-actions">
              <Button class="library-sidebar-action" :disabled="!historyList.length" :aria-pressed="batch.allSelected.value" @click="batch.toggleAll">
                <template #left>
                  <i i-tabler:checks />
                </template>
                {{ t(batch.allSelected.value ? 'watch_later.unselect_all' : 'history.select_results') }}
              </Button>
              <Button class="library-sidebar-action" type="primary" :disabled="!batch.selected.value.size" @click="batch.removeSelected">
                <template #left>
                  <LoadingRing :loading="batch.busy.value">
                    <i i-tabler:trash />
                  </LoadingRing>
                </template>
                {{ t('watch_later.remove_selected', { count: batch.selected.value.size }) }}
              </Button>
              <p v-if="batch.failed.value" class="history-batch-error" role="alert">
                {{ t('common.operation_failed') }}
              </p>
            </div>
            <div v-else key="actions" class="library-rail-actions">
              <Button
                class="library-sidebar-action history-refresh-button" :disabled="isLoading"
                :aria-busy="isLoading" @click="!isLoading && handleHistoryPageRefresh()"
              >
                <template #left>
                  <LoadingRing :loading="isLoading">
                    <i i-tabler:refresh aria-hidden="true" />
                  </LoadingRing>
                </template>
                {{ t('history.refresh') }}
              </Button>
              <Button
                v-if="historyStatus === undefined"
                class="library-sidebar-action" :disabled="timeline.isReadingStatus.value"
                @click="timeline.getHistoryPauseStatus"
              >
                <template #left>
                  <LoadingRing :loading="timeline.isReadingStatus.value">
                    <i i-tabler:refresh />
                  </LoadingRing>
                </template>
                {{ t('history.retry_recording_status') }}
              </Button>
              <Button
                v-else-if="!historyStatus"
                class="library-sidebar-action history-action--warning"
                :disabled="timeline.isUpdatingStatus.value" :aria-busy="timeline.isUpdatingStatus.value"
                @click="handlePauseWatchHistory"
              >
                <template #left>
                  <div i-tabler:player-pause />
                </template>
                {{ $t('history.pause_watch_history') }}
              </Button>
              <Button
                v-else
                class="library-sidebar-action history-action--success"
                :disabled="timeline.isUpdatingStatus.value" :aria-busy="timeline.isUpdatingStatus.value"
                @click="handleTurnOnWatchHistory"
              >
                <template #left>
                  <div i-tabler:player-play />
                </template>
                {{ $t('history.turn_on_watch_history') }}
              </Button>
              <Button
                class="library-sidebar-action history-action--danger"
                :disabled="isClearingHistory"
                @click="handleClearAllWatchHistory"
              >
                <template #left>
                  <div i-tabler:trash />
                </template>
                {{ $t('history.clear_all_watch_history') }}
              </Button>
            </div>
          </Transition>
        </fieldset>
      </div>
    </template>
  </LibraryWorkspace>
  <Empty
    v-else text-only class="library-workspace-login" :description="t('common.please_log_in_first')" :action-label="t('common.login')"
    @action="jumpToLoginPage"
  />
</template>

<style lang="scss" scoped>
@use "../../../styles/bleedStrip";
.history-action--warning {
  --bew-library-action-foreground: var(--bew-warning-foreground);
}
.history-action--success {
  --bew-library-action-foreground: var(--bew-success-foreground);
}
.history-action--danger {
  --bew-library-action-foreground: var(--bew-error-foreground);
}
.history-controls {
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}
.history-batch-error {
  margin: 0;
  color: var(--bew-error-foreground);
  font-size: var(--bew-font-size-control);
}
.history-query-summary {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}
.history-content,
.history-groups {
  // Later and positioned: it slides up over the pinned day strip.
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-12);
  min-width: 0;
}
// Each loaded day, starting the list at it; pinned like the Moments up-list.
.history-day-strip {
  @include bleedStrip.bar(var(--bew-control-height), var(--bew-space-6));
}
.history-day-strip__day {
  flex: none;
  height: var(--bew-control-height);
  padding-inline: var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    color var(--bew-duration-fast) var(--bew-ease-standard);
  &:hover {
    background: var(--bew-fill-2);
    color: var(--bew-text-1);
  }
  &:focus-visible {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: var(--bew-space-0-5);
  }
}
// A card of the group's strip, as wide as an adaptive-grid column.
.history-card {
  position: relative;
  flex: none;
  width: var(--history-card-width, var(--bew-video-card-min-width));
}
.history-groups .history-card :deep(.video-card-container) {
  contain-intrinsic-size: auto var(--history-card-width, var(--bew-video-card-min-width)) auto
    var(--history-card-height, 224px);
}
@media (prefers-reduced-motion: reduce) {
  .history-day-strip__day {
    transition: none;
  }
}

.history-load-more-error {
  display: flex;
  min-height: var(--bew-control-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
}
</style>
