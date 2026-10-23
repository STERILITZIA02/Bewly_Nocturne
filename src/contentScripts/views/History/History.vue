<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import IconButton from '~/components/IconButton.vue'
import LazyPicture from '~/components/LazyPicture.vue'
import LibrarySearchField from '~/components/LibrarySearchField.vue'
import LibrarySidebarHeading from '~/components/LibrarySidebarHeading.vue'
import LibraryVideoCardSkeleton from '~/components/LibraryVideoCardSkeleton.vue'
import LibraryWorkspace from '~/components/LibraryWorkspace.vue'
import LoadingRing from '~/components/LoadingRing.vue'
import SettingsSegmentedControl from '~/components/Settings/components/SettingsSegmentedControl.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import VideoListSkeleton from '~/components/VideoListSkeleton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { CARD_WINDOW_THRESHOLD, useCardWindow } from '~/composables/useCardWindow'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { useLayoutMotion } from '~/composables/useLayoutMotion'
import { useLibraryBatchSelection } from '~/composables/useLibraryBatchSelection'
import { usePageViewState } from '~/composables/usePageViewState'
import { useVideoCardSharedStyles } from '~/composables/useVideoCardSharedStyles'
import { VIDEO_CARD_COVER_ASPECT_RATIO } from '~/constants/layout'
import SelectionOverlay from '~/contentScripts/views/WatchLater/WatchLaterSelectionOverlay.vue'
import { settings } from '~/logic'
import type { List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getAdaptiveGridColumnCount } from '~/utils/gridLayout'
import { getHistoryResumeUrl, getHistoryUrl, getHistoryVideoIdentity } from '~/utils/historyTarget'
import { normalizeIntlLocale } from '~/utils/locale'
import { getCSRF, getUserID, removeHttpFromUrl } from '~/utils/main'
import { retiringListTransition } from '~/utils/motionPresence'
import { clearVideoVisitHistory, getVideoProgressPercentage, removeVideoVisitHistory } from '~/utils/videoVisitHistory'

import HistoryAdvancedFilters from './HistoryAdvancedFilters.vue'
import HistoryDayToggle from './HistoryDayToggle.vue'
import type { HistoryFilters, HistorySortOrder } from './historyFilters'
import { sortHistoryItems } from './historyFilters'
import type { HistoryDayGroup, HistoryWindowCell } from './historyWindow'
import { createHistoryWindow, historyDayKey, historyItemKey } from './historyWindow'
import { useHistoryDayMotion } from './useHistoryDayMotion'
import { useHistoryTimeline } from './useHistoryTimeline'

const { t, locale } = useI18n()
const { textStyle } = useVideoCardSharedStyles()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()

const { handlePageRefresh, handleReachBottom, haveScrollbar, scrollViewportRef, requestLoadMoreCheck } = useBewlyApp()
const topBarStore = useTopBarStore()
const viewState = usePageViewState('history')
const accountId = computed(() => resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid))
const timeline = useHistoryTimeline({
  api: api.history,
  getAccountId: () => getUserID() === String(accountId.value) ? accountId.value : null,
  getCSRF,
  haveScrollbar,
  onWriteError: () => toast.error(t('common.operation_failed')),
  onDeleted: (item) => { void removeVideoVisitHistory(getHistoryVideoIdentity(item)) },
  onCleared: () => { void clearVideoVisitHistory() },
})
const { isLoading, requestFailed, noMoreContent, historyList, keyword, submittedKeyword, filters, contentType, filtersActive, isClearingHistory, historyStatus, setHistoryPauseStatus, clearAllHistory } = timeline
viewState.capture('timeline', timeline.snapshot)
const sortOrder = viewState.ref<HistorySortOrder>('sort', 'newest')
const sortedHistory = computed(() => sortHistoryItems(historyList, sortOrder.value))
const collapsedDays = viewState.ref('collapsedDays', new Set<string>())
const mutationKey = (item: HistoryItem) => `${item.history.business}_${item.history.oid}`
const batch = useLibraryBatchSelection({
  keys: () => sortedHistory.value.filter(item => !collapsedDays.value.has(historyDayKey(item))).map(mutationKey),
  captureOwner: timeline.capture,
  remove: async (key) => {
    const item = historyList.find(item => mutationKey(item) === key)
    return item ? timeline.deleteHistoryItem(item) : true
  },
})
const controlsDisabled = computed(() => batch.busy.value || isClearingHistory.value || timeline.deleting.size > 0)
batch.managing.value = viewState.read('managing', false)
batch.selected.value = viewState.read('selected', new Set<string>())
viewState.capture('managing', () => batch.managing.value)
viewState.capture('selected', () => batch.selected.value)
// Recheck the shared sentinel when a request finishes or collapsing a day
// exposes the bottom; IntersectionObserver need not emit another entry then.
watch([isLoading, controlsDisabled, collapsedDays, sortOrder], () => {
  if (!isLoading.value && !controlsDisabled.value && !requestFailed.value && !noMoreContent.value)
    requestLoadMoreCheck?.()
}, { flush: 'post' })
function updateFilters(value: HistoryFilters) {
  if (controlsDisabled.value)
    return
  filters.value = value
  handleSearch()
}
function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'newest' ? 'oldest' : 'newest'
  resetHistoryPosition()
}
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
const HistoryBusiness = computed(() => Business)
const dateFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { dateStyle: 'medium' }))
const timeFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
const historyGroups = computed(() => {
  const groups = new Map<string, HistoryDayGroup>()
  for (const item of sortedHistory.value) {
    const date = new Date(item.view_at * 1000)
    const valid = Number.isFinite(date.getTime())
    const key = historyDayKey(item)
    let group = groups.get(key)
    if (!group) {
      group = { key, label: valid ? dateFormatter.value.format(date) : t('history.unknown_date'), items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()]
})

const historyContainer = ref<HTMLElement | null>(null)
const dayMotion = useHistoryDayMotion(historyContainer)
const layoutMotion = useLayoutMotion(historyContainer, () => `${settings.value.historyLayout}:${sortedHistory.value.map(historyItemKey).join(',')}`, {
  selector: '[data-history-cell]',
  key: 'data-history-cell',
  enabled: () => !dayMotion.active.value,
})
watch(dayMotion.active, (active) => {
  if (!active && !isLoading.value && !requestFailed.value && !noMoreContent.value)
    requestLoadMoreCheck?.()
})
const containerWidth = ref(0)
const rowGap = ref(8)
const columns = computed(() => settings.value.historyLayout === 'grid' ? getAdaptiveGridColumnCount(containerWidth.value, rowGap.value) : 1)
const windowCells = computed(() => createHistoryWindow(historyGroups.value, columns.value, collapsedDays.value))
const cellByKey = computed(() => new Map(windowCells.value.map(cell => [cell.key, cell])))
const windowEnabled = computed(() => historyList.length > CARD_WINDOW_THRESHOLD)
const estimatedCardHeight = computed(() => settings.value.historyLayout === 'grid'
  ? Math.max(0, (containerWidth.value - rowGap.value * (columns.value - 1)) / columns.value - 24) / VIDEO_CARD_COVER_ASPECT_RATIO + 152
  : 140)
const cardWindow = useCardWindow({
  root: scrollViewportRef,
  container: historyContainer,
  keys: computed(() => windowCells.value.map(cell => cell.key)),
  columns,
  gap: rowGap,
  enabled: windowEnabled,
  estimatedHeight: estimatedCardHeight,
  estimateHeight: (key) => {
    const cell = cellByKey.value.get(String(key))
    return cell?.kind === 'padding' ? 0 : cell?.kind === 'heading' ? 28 + (cell.first ? 0 : 24 - rowGap.value) + (settings.value.historyLayout === 'grid' ? 0 : 4) : estimatedCardHeight.value
  },
  layout: computed(() => `${settings.value.historyLayout}:${columns.value}:${Math.round(containerWidth.value)}`),
  canRelease: (key) => {
    const cell = cellByKey.value.get(String(key))
    return cell?.kind !== 'item' || !timeline.deleting.has(`${cell.item.history.business}_${cell.item.history.oid}`)
  },
})
type RenderedHistoryCell = Exclude<HistoryWindowCell, { kind: 'padding' }> | { kind: 'spacer', key: string, height: number }
const renderedCells = computed(() => cardWindow.ranges.value.flatMap<RenderedHistoryCell>(range => range.height !== undefined
  ? [{ kind: 'spacer' as const, key: `spacer:${range.start}`, height: range.height }]
  : windowCells.value.slice(range.start, range.end).filter(cell => cell.kind !== 'padding')))
function toggleHistoryDay(key: string, event?: MouseEvent) {
  if (controlsDisabled.value)
    return
  const next = new Set(collapsedDays.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  void dayMotion.run(() => {
    layoutMotion.cancel()
    collapsedDays.value = next
  }, event?.detail === 0)
}
function measureHistoryLayout(width = historyContainer.value?.clientWidth) {
  const grid = historyContainer.value?.querySelector<HTMLElement>('.history-window')
  const style = grid ? getComputedStyle(grid) : undefined
  const availableWidth = width ? Math.max(0, width - (Number.parseFloat(style?.paddingInlineStart ?? '') || 0)) : 0
  if (availableWidth && availableWidth !== containerWidth.value) {
    dayMotion.cancel()
    containerWidth.value = availableWidth
  }
  if (style)
    rowGap.value = Number.parseFloat(style.rowGap) || (settings.value.historyLayout === 'grid' ? 16 : 8)
}
useResizeObserver(historyContainer, entries => measureHistoryLayout(entries[0]?.contentRect.width))
watch(() => settings.value.historyLayout, () => {
  dayMotion.cancel()
  void nextTick(() => measureHistoryLayout())
})
const layoutOptions = computed(() => [
  { label: t('library_tools.layout_list'), value: 'list' as const },
  { label: t('library_tools.layout_grid'), value: 'grid' as const },
])

function resetHistoryPosition() {
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
}
function handleSearch(event?: KeyboardEvent) {
  if (event?.isComposing || controlsDisabled.value)
    return
  batch.clearSelection()
  dayMotion.cancel()
  collapsedDays.value = new Set()
  resetHistoryPosition()
  timeline.handleSearch()
}
function clearSearch() {
  if (controlsDisabled.value)
    return
  batch.clearSelection()
  dayMotion.cancel()
  collapsedDays.value = new Set()
  resetHistoryPosition()
  timeline.clearSearch()
}
watch(keyword, (value) => {
  if (!value.trim() && submittedKeyword.value)
    clearSearch()
})
async function deleteHistoryItem(item: HistoryItem) {
  const owner = timeline.capture()
  const container = historyContainer.value
  const root = container?.getRootNode() as Document | ShadowRoot | undefined
  const focused = root?.activeElement
  const activeCard = focused?.closest<HTMLElement>('[data-history-key]')
  const index = historyList.indexOf(item)
  const neighbor = historyList[index + 1] ?? historyList[index - 1]
  const wasFocused = activeCard?.dataset.historyKey === historyItemKey(item)
  await timeline.deleteHistoryItem(item)
  await nextTick()
  if (!owner.isCurrent() || historyList.includes(item) || !wasFocused || !neighbor || (root?.activeElement && root.activeElement !== document.body && root.activeElement !== focused))
    return
  const nextCard = Array.from(container?.querySelectorAll<HTMLElement>('[data-history-key]') ?? []).find(element => element.dataset.historyKey === historyItemKey(neighbor))
  nextCard?.querySelector<HTMLButtonElement>('.history-list-card__delete')?.focus({ preventScroll: true })
}

function formatHistoryTime(item: HistoryItem) {
  const date = new Date(item.view_at * 1000)
  return Number.isFinite(date.getTime()) ? timeFormatter.value.format(date) : '—'
}
let mounted = false
onMounted(() => {
  mounted = true
  timeline.activate(viewState.read<ReturnType<typeof timeline.snapshot> | undefined>('timeline', undefined))
  handleReachBottom.value = handleHistoryReachBottom
  handlePageRefresh.value = handleHistoryPageRefresh
})
watch(accountId, () => {
  if (mounted) {
    batch.reset()
    dayMotion.cancel()
    collapsedDays.value = new Set()
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
  return requestFailed.value || controlsDisabled.value || dayMotion.active.value ? Promise.resolve(false) : timeline.load()
}
function handleHistoryPageRefresh() {
  if (controlsDisabled.value)
    return
  batch.clearSelection()
  dayMotion.cancel()
  collapsedDays.value = new Set()
  resetHistoryPosition()
  void timeline.refreshCurrentMode()
}
function retryHistoryRequest() {
  if (!controlsDisabled.value)
    void timeline.retry()
}

function getHistoryItemCover(item: HistoryItem) {
  if (item.history.business === 'article' || item.history.business === 'article-list') {
    if (item.covers)
      return removeHttpFromUrl(`${item.covers[0]}`)
  }

  return removeHttpFromUrl(item.cover)
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
    <main class="history-content">
      <p v-if="submittedKeyword" class="history-query-summary" role="status">
        {{ t('library_tools.search_results', { query: submittedKeyword }) }}
      </p>
      <Empty
        v-if="requestFailed && !isLoading && historyList.length === 0" text-only fill :description="$t('common.load_failed')" :action-label="$t('common.operation.refresh')"
        @action="retryHistoryRequest"
      />
      <Empty v-else-if="noMoreContent && !isLoading && !historyList.length" text-only fill :description="t(filtersActive ? 'library_tools.no_matches' : 'common.no_data')" role="status" />
      <VideoListSkeleton v-else-if="isLoading && historyList.length === 0 && settings.historyLayout === 'list'" class="history-timeline-skeleton" :count="5" history />

      <!-- historyList -->
      <div v-else ref="historyContainer" class="history-groups">
        <TransitionGroup
          name="library-list" tag="div" class="history-window" v-bind="dayMotion.active.value ? dayMotion.transitionProps.value : windowEnabled ? {} : retiringListTransition" :css="!windowEnabled && !dayMotion.active.value"
          :style="{ '--history-columns': columns, '--history-gap': settings.historyLayout === 'grid' ? 'var(--bew-space-4)' : 'var(--bew-space-2)' }"
        >
          <template v-for="entry in renderedCells" :key="entry.key">
            <div v-if="entry.kind === 'spacer'" :style="{ height: `${entry.height}px`, gridColumn: '1 / -1' }" aria-hidden="true" />
            <h4 v-else-if="entry.kind === 'heading'" :ref="element => cardWindow.setElement(entry.key, element)" :data-history-cell="entry.key" class="history-day-heading" :class="{ 'history-day-heading--first': entry.first, 'history-day-heading--grid': settings.historyLayout === 'grid' }">
              <HistoryDayToggle :label="entry.label" :expanded="entry.expanded" :disabled="controlsDisabled" @toggle="toggleHistoryDay(entry.groupKey, $event)" />
            </h4>
            <div
              v-else-if="entry.kind === 'item'"
              :ref="element => cardWindow.setElement(entry.key, element)"
              :data-history-key="historyItemKey(entry.item)"
              :data-history-cell="entry.key"
              :aria-label="entry.date"
              class="history-list-card group"
              :style="textStyle"
              :class="{ 'history-list-card--grid': settings.historyLayout === 'grid' }"
              cursor-pointer
            >
              <ALink
                :inert="batch.managing.value ? true : undefined"
                class="history-list-card__overlay"
                type="videoCard"
                :href="getHistoryUrl(entry.item)"
                :aria-label="entry.item.show_title || entry.item.title"
              />
              <section
                class="history-list-card__content bew-history-row"
                :inert="batch.managing.value ? true : undefined"
              >
                <!-- Cover -->
                <div
                  class="history-list-card__media"
                  pos="relative"
                  bg="$bew-skeleton"
                  w-full
                  rounded="$bew-thumb-radius"
                  overflow-hidden
                  style="aspect-ratio: var(--bew-video-cover-aspect-ratio)"
                >
                  <LazyPicture
                    responsive-cover
                    aspect-ratio="var(--bew-video-cover-aspect-ratio)"
                    w="full"
                    h-full
                    :src="`${getHistoryItemCover(entry.item)}@480w_270h_1c`"
                    :alt="entry.item.title"
                    object-cover
                  />

                  <span
                    v-if="entry.item.history.business === HistoryBusiness.LIVE || entry.item.history.business === HistoryBusiness.PGC"
                    pos="absolute right-0 top-0"
                    bg="$bew-selected-bg"
                    text="xs $bew-text-1"
                    p="x-2 y-1"
                    m-1
                    rounded="$bew-interactive-radius"
                  >
                    <template
                      v-if="entry.item.history.business === HistoryBusiness.LIVE"
                    >
                      {{ t('search.categories.live') }}
                    </template>
                    <template
                      v-else-if="entry.item.history.business === HistoryBusiness.PGC"
                    >
                      {{ t('history.media') }}
                    </template>
                  </span>

                  <div
                    v-if="
                      entry.item.history.business === HistoryBusiness.ARCHIVE
                        || entry.item.history.business === HistoryBusiness.PGC
                    "
                    pos="absolute bottom-0 right-0"
                    bg="black opacity-60"
                    m="2"
                    p="x-2 y-1"
                    text="white xs"
                    rounded="$bew-interactive-radius"
                  >
                    <!--  When progress = -1 means that the user watched the full video -->
                    {{
                      `${
                        entry.item.progress === -1
                          ? calcCurrentTime(entry.item.duration)
                          : calcCurrentTime(entry.item.progress)
                      } /
                      ${calcCurrentTime(entry.item.duration)}`
                    }}
                  </div>
                  <div w-full pos="absolute bottom-0" bg="white opacity-60">
                    <Progress
                      v-if="
                        entry.item.history.business === HistoryBusiness.ARCHIVE
                          || entry.item.history.business === HistoryBusiness.PGC
                      "
                      :percentage="
                        getVideoProgressPercentage(getHistoryVideoIdentity(entry.item), entry.item.progress, entry.item.duration)
                      "
                    />
                  </div>
                </div>

                <!-- Description -->
                <div flex justify-between w-full h-full>
                  <div class="history-list-card__details" flex="~ col">
                    <div
                      :title="entry.item.show_title ? entry.item.show_title : entry.item.title"
                    >
                      <h3
                        class="keep-two-lines history-list-card__title"
                        overflow="hidden"
                        text="overflow-ellipsis"
                      >
                        {{ entry.item.show_title ? entry.item.show_title : entry.item.title }}
                      </h3>
                    </div>
                    <a
                      class="history-list-card__action"
                      un-text="$bew-text-2"
                      m="t-2 b-2"
                      flex="~ items-center"
                      cursor-pointer
                      w-fit
                      rounded="$bew-interactive-radius"
                      hover:color="$bew-theme-foreground"
                      hover:bg="$bew-theme-surface"
                      duration-300
                      pr-2
                      :href="entry.item.author_mid ? `https://space.bilibili.com/${entry.item.author_mid}` : entry.item.uri" target="_blank"
                    >
                      <span v-if="settings.historyLayout !== 'grid'" class="history-author-avatar bew-shape-circle">
                        <LazyPicture
                          :src="removeHttpFromUrl(`${entry.item.author_face || entry.item.cover}@40w_40h_1c`)"
                          aspect-ratio="1 / 1"
                          :show-skeleton="false"
                          alt=""
                        />
                      </span>
                      {{
                        entry.item.author_name
                          ? entry.item.author_name
                          : entry.item.title
                      }}
                      <span
                        v-if="entry.item.live_status === 1"
                        text="$bew-text-1"
                        flex
                        items-center
                        gap-1
                        m="l-2"
                      ><div i-tabler:live-photo />
                        {{ t('search.user.live') }}
                      </span>
                    </a>
                    <div
                      class="flex history-list-card__time"
                      items-center
                      text="$bew-text-3"
                      mt-auto
                    >
                      <span text="$bew-icon-size-sm" mr-2 lh-0>
                        <i
                          v-if="entry.item.history.dt === 1 || entry.item.history.dt === 3 || entry.item.history.dt === 5 || entry.item.history.dt === 7"
                          i-tabler:device-mobile
                        />
                        <i v-if="entry.item.history.dt === 2" i-tabler:device-tv />
                        <i
                          v-if="entry.item.history.dt === 4 || entry.item.history.dt === 6" i-tabler:device-tablet
                        />
                        <i v-if="entry.item.history.dt === 33" i-tabler:device-tv />
                      </span>
                      <span>
                        {{ formatHistoryTime(entry.item) }}
                      </span>
                      <ALink
                        v-if="getHistoryResumeUrl(entry.item)"
                        :href="getHistoryResumeUrl(entry.item)"
                        type="videoCard"
                        class="history-list-card__action history-resume-link"
                      >
                        {{ t('history.continue_watching') }}
                      </ALink>
                    </div>
                  </div>

                  <IconButton
                    class="history-list-card__action history-list-card__delete" shape="smooth-rect"
                    :label="$t('common.operation.delete')"
                    :disabled="timeline.deleting.has(`${entry.item.history.business}_${entry.item.history.oid}`)"
                    @click.prevent.stop="deleteHistoryItem(entry.item)"
                  >
                    <div i-tabler:trash />
                  </IconButton>
                </div>
              </section>
              <SelectionOverlay
                v-if="batch.managing.value" :label="entry.item.show_title || entry.item.title"
                :selected="batch.selected.value.has(mutationKey(entry.item))" :disabled="batch.busy.value"
                @toggle="batch.toggle(mutationKey(entry.item))"
              />
            </div>
          </template>
          <div v-if="isLoading && !historyList.length && settings.historyLayout === 'grid'" key="loading:date" class="history-day-heading history-day-heading--first history-day-heading--grid" aria-hidden="true">
            <SkeletonBlock width="112px" height="var(--bew-line-height-title)" />
          </div>
          <LibraryVideoCardSkeleton
            v-for="index in (isLoading && settings.historyLayout === 'grid' ? (historyList.length ? columns : columns * 2) : 0)"
            :key="`loading:${index}`" history
          />
        </TransitionGroup>
      </div>

      <Empty
        v-if="requestFailed && !isLoading && historyList.length > 0" text-only class="history-load-more-error" :description="$t('common.load_failed')" :action-label="$t('common.operation.refresh')"
        @action="retryHistoryRequest"
      />

      <VideoListSkeleton
        v-if="isLoading && historyList.length !== 0 && !noMoreContent && settings.historyLayout === 'list'"
        class="history-timeline-skeleton"
        :count="2"
        history
      />
    </main>

    <template #sidebar="{ contentId }">
      <div class="library-rail-content">
        <LibrarySidebarHeading
          hide-title :title="t('history.title')" :model-value="contentType" :options="railContentOptions" :content-id="contentId"
          :disabled="controlsDisabled"
          @update:model-value="selectRailContent"
        />
        <fieldset class="history-controls library-rail-content" :disabled="controlsDisabled" :aria-label="t('history.title')">
          <div class="library-rail-tools">
            <LibrarySearchField v-model="keyword" :label="t('history.search_watch_history')" :clearable="Boolean(submittedKeyword)" @submit="handleSearch()" @clear="clearSearch" />
            <div class="history-layout-switcher" :class="{ 'history-layout-switcher--sort-only': !settings.enableGridLayoutSwitcher }">
              <SettingsSegmentedControl
                v-if="settings.enableGridLayoutSwitcher" v-model="settings.historyLayout"
                class="library-rail-segments bew-segment-control--secondary" :options="layoutOptions" :label="t('settings.history_layout')"
              />
              <Tooltip :content="t(`history.sort_${sortOrder}`)" placement="top">
                <IconButton class="history-sort-button" :label="t(`history.sort_${sortOrder}`)" :data-sort-order="sortOrder" @click="toggleSortOrder">
                  <i :class="sortOrder === 'newest' ? 'i-tabler:sort-descending' : 'i-tabler:sort-ascending'" />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <HistoryAdvancedFilters :model-value="filters" :disabled="controlsDisabled" @update:model-value="updateFilters" />
          <Button
            class="library-sidebar-action" :type="batch.managing.value ? 'primary' : 'default'"
            role="switch" :aria-checked="batch.managing.value" @click="batch.toggleManaging"
          >
            <template #left>
              <i :class="batch.managing.value ? 'i-tabler:check' : 'i-tabler:list-check'" />
            </template>
            {{ t('watch_later.batch_manage') }}
          </Button>
          <div v-if="batch.managing.value" class="library-rail-actions">
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
          <div v-else class="library-rail-actions">
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
@use "../../../styles/videoList";
@use "../../../styles/contentCard";
@use "./historyTimeline";
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
.history-layout-switcher {
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
.history-sort-button {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  margin-inline-start: var(--bew-space-1);
  color: var(--bew-text-1);
  i {
    font-size: var(--bew-control-icon-size);
  }
  &:hover:not(:disabled) {
    color: var(--bew-message-icon-hover);
  }
}
.history-layout-switcher--sort-only > :last-child {
  grid-column: 2;
  justify-self: center;
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
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-6);
  min-width: 0;
}

.history-list-card--grid .history-list-card__content {
  align-content: start;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bew-space-3);
}
.history-list-card--grid .history-list-card__details {
  @include contentCard.video-details;
}
.history-list-card--grid .history-list-card__action {
  margin: 0;
}
.history-list-card__content > div:last-child > div {
  min-width: 0;
  flex: 1;
}
.history-author-avatar {
  flex: none;
  width: var(--bew-space-6);
  height: var(--bew-space-6);
  margin-right: var(--bew-space-2);
  overflow: hidden;
}
.history-list-card {
  position: relative;
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);

  &:is(:hover, :focus-within) .history-list-card__content {
    background: var(--bew-fill-1);
  }

  &:is(:hover, :focus-within) .history-list-card__delete {
    opacity: 1;
  }
}

.history-list-card__title {
  @include contentCard.video-title;
}

.history-list-card__overlay {
  position: absolute;
  z-index: 1;
  inset: 0;
  border-radius: inherit;
  corner-shape: inherit;
}

.history-list-card__action {
  @include contentCard.video-subtitle;
  position: relative;
  z-index: 2;

  &:hover,
  &:focus-visible {
    color: var(--bew-theme-foreground);
  }
}

.history-list-card__time {
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.history-list-card__delete {
  align-self: flex-start;
  width: var(--bew-icon-button-size-md);
  height: var(--bew-icon-button-size-md);
  // The row padding equals the card radius, so the corner leaves no concentric constraint.
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-3);
  font-size: var(--bew-icon-size-md);
  opacity: 0;

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-fill-1);
  }
}

.history-resume-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--bew-control-height-sm);
  margin-left: var(--bew-space-3);
  padding-inline: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-foreground);
  font-weight: var(--bew-font-weight-medium);

  &:hover {
    background: var(--bew-theme-surface);
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
