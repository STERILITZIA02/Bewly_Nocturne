<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import IconButton from '~/components/IconButton.vue'
import LazyPicture from '~/components/LazyPicture.vue'
import SettingsSegmentedControl from '~/components/Settings/components/SettingsSegmentedControl.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import VideoListSkeleton from '~/components/VideoListSkeleton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { CARD_WINDOW_THRESHOLD, useCardWindow } from '~/composables/useCardWindow'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
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
import { clearVideoVisitHistory, getVideoProgressPercentage, removeVideoVisitHistory } from '~/utils/videoVisitHistory'

import type { HistoryDayGroup, HistoryWindowCell } from './historyWindow'
import { createHistoryWindow, historyItemKey } from './historyWindow'
import { useHistoryTimeline } from './useHistoryTimeline'

const { t, locale } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()

const { handlePageRefresh, handleReachBottom, haveScrollbar, scrollViewportRef } = useBewlyApp()
const topBarStore = useTopBarStore()
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
const { isLoading, requestFailed, noMoreContent, historyList, keyword, submittedKeyword, date: selectedDate, contentType, filtersActive, isClearingHistory, historyStatus, setHistoryPauseStatus, clearAllHistory } = timeline
const contentTypes = ['all', 'archive', 'pgc', 'live', 'article'] as const
const HistoryBusiness = computed(() => Business)
const dateFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { dateStyle: 'medium' }))
const timeFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
const historyGroups = computed(() => {
  const groups = new Map<string, HistoryDayGroup>()
  for (const item of historyList) {
    const date = new Date(item.view_at * 1000)
    const valid = Number.isFinite(date.getTime())
    const key = valid ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` : 'unknown'
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
const containerWidth = ref(0)
const rowGap = ref(8)
const columns = computed(() => settings.value.historyLayout === 'grid' ? getAdaptiveGridColumnCount(containerWidth.value, settings.value.gridColumns) : 1)
const windowCells = computed(() => createHistoryWindow(historyGroups.value, columns.value))
const cellByKey = computed(() => new Map(windowCells.value.map(cell => [cell.key, cell])))
const windowEnabled = computed(() => historyList.length > CARD_WINDOW_THRESHOLD)
const estimatedCardHeight = computed(() => settings.value.historyLayout === 'grid'
  ? Math.max(0, (containerWidth.value - rowGap.value * (columns.value - 1)) / columns.value - 24) * 9 / 16 + 152
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
    return cell?.kind === 'padding' ? 0 : cell?.kind === 'heading' ? 22 + (cell.first ? 0 : 24 - rowGap.value) + (settings.value.historyLayout === 'grid' ? 0 : 4) : estimatedCardHeight.value
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
function measureHistoryLayout(width = historyContainer.value?.clientWidth) {
  if (width && width !== containerWidth.value)
    containerWidth.value = width
  const grid = historyContainer.value?.querySelector<HTMLElement>('.history-window')
  if (grid)
    rowGap.value = Number.parseFloat(getComputedStyle(grid).rowGap) || (settings.value.historyLayout === 'grid' ? 16 : 8)
}
useResizeObserver(historyContainer, entries => measureHistoryLayout(entries[0]?.contentRect.width))
watch(() => settings.value.historyLayout, () => nextTick(() => measureHistoryLayout()))
const layoutOptions = computed(() => [
  { label: t('settings.history_layout_list'), value: 'list' as const },
  { label: t('settings.history_layout_grid'), value: 'grid' as const },
])

function resetHistoryPosition() {
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
}
function handleSearch(event?: KeyboardEvent) {
  if (event?.isComposing)
    return
  resetHistoryPosition()
  timeline.handleSearch()
}
function clearSearch() {
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
  timeline.activate()
  handleReachBottom.value = handleHistoryReachBottom
  handlePageRefresh.value = handleHistoryPageRefresh
})
watch(accountId, () => {
  if (mounted) {
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
  return requestFailed.value || filtersActive.value ? Promise.resolve(false) : timeline.load()
}
function handleHistoryPageRefresh() {
  resetHistoryPosition()
  timeline.reloadCurrentMode()
}
function retryHistoryRequest() {
  void timeline.load()
}

function getHistoryItemCover(item: HistoryItem) {
  if (item.history.business === 'article' || item.history.business === 'article-list') {
    if (item.covers)
      return removeHttpFromUrl(`${item.covers[0]}`)
  }

  return removeHttpFromUrl(item.cover)
}

async function handleClearAllWatchHistory() {
  const owner = timeline.capture()
  const result = await showConfirmDialog(
    t('history.clear_all_watch_history_confirm'),
  )
  if (result && owner.isCurrent())
    clearAllHistory()
}

async function handlePauseWatchHistory() {
  const owner = timeline.capture()
  const result = await showConfirmDialog(
    t('history.pause_watch_history_confirm'),
  )
  if (result && owner.isCurrent())
    setHistoryPauseStatus(true)
}

async function handleTurnOnWatchHistory() {
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
  <div v-if="getCSRF()" flex="~ col md:row lg:row" gap-4>
    <main class="history-content" w="full md:60% lg:70% xl:75%" order="2 md:1 lg:1" mb-6>
      <header class="history-toolbar">
        <h3 class="bew-page-heading" text="$bew-text-1">
          {{ $t('history.title') }}
        </h3>
        <SettingsSegmentedControl v-if="settings.enableGridLayoutSwitcher" v-model="settings.historyLayout" :options="layoutOptions" :label="t('settings.history_layout')" />
      </header>
      <p v-if="submittedKeyword" class="history-query-summary" role="status">
        {{ t('library_tools.search_results', { query: submittedKeyword }) }}
      </p>
      <Empty v-if="requestFailed && !isLoading && historyList.length === 0" :description="$t('common.load_failed')">
        <Button type="primary" @click="retryHistoryRequest">
          {{ $t('common.operation.refresh') }}
        </Button>
      </Empty>
      <VideoListSkeleton v-else-if="isLoading && historyList.length === 0 && settings.historyLayout === 'list'" :count="5" history />

      <!-- historyList -->
      <div v-else ref="historyContainer" class="history-groups">
        <TransitionGroup name="list" tag="div" class="history-window" :css="!windowEnabled" :style="{ '--history-columns': columns, '--history-gap': settings.historyLayout === 'grid' ? 'var(--bew-space-4)' : 'var(--bew-space-2)' }">
          <template v-for="entry in renderedCells" :key="entry.key">
            <div v-if="entry.kind === 'spacer'" :style="{ height: `${entry.height}px`, gridColumn: '1 / -1' }" aria-hidden="true" />
            <h4 v-else-if="entry.kind === 'heading'" :ref="element => cardWindow.setElement(entry.key, element)" class="history-day-heading" :class="{ 'history-day-heading--first': entry.first, 'history-day-heading--grid': settings.historyLayout === 'grid' }">
              {{ entry.label }}
            </h4>
            <div
              v-else-if="entry.kind === 'item'"
              :ref="element => cardWindow.setElement(entry.key, element)"
              :data-history-key="historyItemKey(entry.item)"
              :aria-label="entry.date"
              class="history-list-card group"
              :class="{ 'history-list-card--grid': settings.historyLayout === 'grid' }"
              cursor-pointer
            >
              <ALink
                class="history-list-card__overlay"
                type="videoCard"
                :href="getHistoryUrl(entry.item)"
                :aria-label="entry.item.show_title || entry.item.title"
              />
              <section
                class="history-list-card__content bew-history-row"
              >
                <!-- Cover -->
                <div
                  class="history-list-card__media"
                  pos="relative"
                  bg="$bew-skeleton"
                  w-full
                  rounded="$bew-media-radius"
                  overflow-hidden
                  aspect-video
                >
                  <LazyPicture
                    w="full"
                    aspect-video
                    :src="`${getHistoryItemCover(entry.item)}@480w_270h_1c`"
                    :alt="entry.item.title"
                    object-cover
                  />

                  <span
                    v-if="entry.item.history.business === HistoryBusiness.LIVE || entry.item.history.business === HistoryBusiness.PGC"
                    pos="absolute right-0 top-0"
                    bg="$bew-theme-color"
                    text="xs $bew-on-theme-color"
                    p="x-2 y-1"
                    m-1
                    rounded="$bew-radius-half"
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
                    rounded="$bew-radius-half"
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
                  <div flex="~ col">
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
                      un-text="$bew-text-2 sm"
                      m="t-2 b-2"
                      flex="~ items-center"
                      cursor-pointer
                      w-fit
                      rounded="$bew-radius"
                      hover:color="$bew-theme-foreground"
                      hover:bg="$bew-theme-surface"
                      duration-300
                      pr-2
                      :href="entry.item.author_mid ? `https://space.bilibili.com/${entry.item.author_mid}` : entry.item.uri" target="_blank"
                    >
                      <span class="history-author-avatar bew-shape-circle">
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
                        text="$bew-theme-foreground"
                        flex
                        items-center
                        gap-1
                        m="l-2"
                      ><div i-tabler:live-photo />
                        {{ t('search.user.live') }}
                      </span>
                    </a>
                    <div
                      class="flex"
                      items-center
                      text="$bew-text-3 sm"
                      mt-auto
                    >
                      <span text="$bew-icon-size-sm" mr-2 lh-0>
                        <i
                          v-if="entry.item.history.dt === 1 || entry.item.history.dt === 3 || entry.item.history.dt === 5 || entry.item.history.dt === 7"
                          i-mingcute:cellphone-line
                        />
                        <i v-if="entry.item.history.dt === 2" i-mingcute:tv-1-line />
                        <i
                          v-if="entry.item.history.dt === 4 || entry.item.history.dt === 6" i-mingcute:pad-line
                        />
                        <i v-if="entry.item.history.dt === 33" i-mingcute:tv-2-line />
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
                    class="history-list-card__action history-list-card__delete"
                    :label="$t('common.operation.delete')"
                    :disabled="timeline.deleting.has(`${entry.item.history.business}_${entry.item.history.oid}`)"
                    @click.prevent.stop="deleteHistoryItem(entry.item)"
                  >
                    <div i-tabler:trash />
                  </IconButton>
                </div>
              </section>
            </div>
          </template>
          <div v-if="isLoading && !historyList.length && settings.historyLayout === 'grid'" key="loading:date" class="history-day-heading history-day-heading--first history-day-heading--grid" aria-hidden="true">
            <SkeletonBlock width="112px" height="var(--bew-line-height-title)" />
          </div>
          <article v-for="index in (isLoading && settings.historyLayout === 'grid' ? (historyList.length ? columns : columns * 2) : 0)" :key="`loading:${index}`" class="history-grid-skeleton" aria-hidden="true">
            <SkeletonBlock class="history-grid-skeleton__cover" height="auto" radius="media" />
            <div class="history-grid-skeleton__details">
              <div class="history-grid-skeleton__title">
                <SkeletonBlock width="88%" height="var(--bew-font-size-title)" />
                <SkeletonBlock width="68%" height="var(--bew-font-size-title)" />
              </div>
              <div class="history-grid-skeleton__author">
                <SkeletonBlock width="var(--bew-space-6)" height="var(--bew-space-6)" radius="circle" />
                <SkeletonBlock width="45%" height="var(--bew-line-height-control)" />
              </div>
              <div class="history-grid-skeleton__time">
                <SkeletonBlock width="60%" height="var(--bew-line-height-control)" />
              </div>
            </div>
          </article>
        </TransitionGroup>
      </div>

      <div v-if="requestFailed && !isLoading && historyList.length > 0" class="history-load-more-error">
        <span>{{ $t('common.load_failed') }}</span>
        <Button type="tertiary" @click="retryHistoryRequest">
          {{ $t('common.operation.refresh') }}
        </Button>
      </div>

      <Button v-if="filtersActive && !noMoreContent && !isLoading && !requestFailed" type="secondary" @click="timeline.load()">
        {{ t('library_tools.load_more_matches') }}
      </Button>
      <p v-if="filtersActive && !isLoading && !historyList.length && !requestFailed" role="status">
        {{ t('library_tools.no_matches') }}
      </p>

      <!-- no more content -->
      <Empty v-if="noMoreContent && (!filtersActive || historyList.length)" class="py-4" :description="$t('common.no_more_content')" />

      <VideoListSkeleton
        v-if="isLoading && historyList.length !== 0 && !noMoreContent && settings.historyLayout === 'list'"
        :count="2"
        history
      />
    </main>

    <aside relative w="full md:40% lg:30% xl:25%" order="1 md:2 lg:2">
      <CoverSidebarSurface
        class="history-sidebar-panel" pos="sticky top-120px" flex="~ col gap-4" justify-start my-10
        w-full
      >
        <div class="history-search-row">
          <input
            v-model.trim="keyword"
            type="text"
            :placeholder="t('history.search_watch_history')"
            :aria-label="t('history.search_watch_history')"
            class="history-search-input"
            rounded="$bew-radius"
            w-full
            @keyup.enter="handleSearch"
          >
          <IconButton v-if="keyword || submittedKeyword" class="bew-icon-button--control" :label="t('library_tools.clear_search')" @click="clearSearch">
            <i i-mingcute:close-line />
          </IconButton>
          <IconButton class="bew-icon-button--control" :label="t('common.search')" @click="handleSearch()">
            <i i-mingcute:search-line />
          </IconButton>
        </div>
        <label class="history-filter-field">
          <span>{{ t('library_tools.date') }}</span>
          <input v-model="selectedDate" type="date" @change="handleSearch()">
        </label>
        <Button v-if="selectedDate" type="tertiary" @click="selectedDate = ''; handleSearch()">
          {{ t('library_tools.all_dates') }}
        </Button>
        <label class="history-filter-field">
          <span>{{ t('library_tools.content_type') }}</span>
          <select v-model="contentType" @change="handleSearch()">
            <option v-for="value in contentTypes" :key="value" :value="value">{{ t(`library_tools.type_${value}`) }}</option>
          </select>
        </label>
        <Button v-if="filtersActive" type="tertiary" @click="keyword = ''; selectedDate = ''; contentType = 'all'; handleSearch()">
          {{ t('search.filters.clear') }}
        </Button>
        <Button
          block
          class="bew-cover-sidebar__action"
          :disabled="isClearingHistory"
          @click="handleClearAllWatchHistory"
        >
          <template #left>
            <div i-tabler:trash />
          </template>
          {{ $t('history.clear_all_watch_history') }}
        </Button>
        <Button
          v-if="!historyStatus"
          block
          class="bew-cover-sidebar__action"
          @click="handlePauseWatchHistory"
        >
          <template #left>
            <div i-ph:pause-circle-bold />
          </template>
          {{ $t('history.pause_watch_history') }}
        </Button>
        <Button
          v-else
          block
          class="bew-cover-sidebar__action"
          @click="handleTurnOnWatchHistory"
        >
          <template #left>
            <div i-ph:play-circle-bold />
          </template>
          {{ $t('history.turn_on_watch_history') }}
        </Button>
      </CoverSidebarSurface>
    </aside>
  </div>
  <Empty v-else mt-6 :description="t('common.please_log_in_first')">
    <Button type="primary" @click="jumpToLoginPage()">
      {{ $t('common.login') }}
    </Button>
  </Empty>
</template>

<style lang="scss" scoped>
@use "../../../styles/videoList";
.history-search-row {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
}
.history-search-row input {
  min-width: 0;
  flex: 1;
}
.history-filter-field {
  display: grid;
  gap: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
}
.history-filter-field input,
.history-filter-field select {
  min-width: 0;
  width: 100%;
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-content-alt-solid);
  color: var(--bew-text-1);
  font: inherit;
  color-scheme: inherit;
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

.history-day-heading {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: calc(var(--bew-space-6) - var(--history-gap));
  padding-bottom: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.history-day-heading--first {
  padding-top: 0;
}
.history-day-heading--grid {
  padding-bottom: 0;
}
.history-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-4);
}
.history-window {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--history-columns), minmax(0, 1fr));
  gap: var(--history-gap);
}
.history-list-card--grid .history-list-card__content {
  height: 100%;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bew-space-3);
}
.history-list-card--grid .history-list-card__title {
  min-height: calc(var(--bew-line-height-title) * 2);
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
.history-grid-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3);
  border-radius: var(--bew-card-radius);
}
.history-grid-skeleton__cover {
  width: 100% !important;
  aspect-ratio: 16 / 9;
}
.history-grid-skeleton__title {
  display: grid;
  grid-template-rows: repeat(2, var(--bew-line-height-title));
  align-items: center;
}
.history-grid-skeleton__author {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-block: var(--bew-space-2);
}
.history-grid-skeleton__time {
  display: flex;
  align-items: center;
  min-height: var(--bew-control-height-sm);
}

.history-sidebar-panel {
  padding: var(--bew-space-6);
}
.history-search-input {
  flex-shrink: 0;
  min-height: var(--bew-control-height);
  padding-inline: var(--bew-space-3);
  color: var(--bew-sidebar-text);
  background: var(--bew-sidebar-control);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.history-list-card {
  position: relative;
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);

  &:is(:hover, :focus-within) .history-list-card__content {
    background: var(--bew-fill-1);
  }

  &:is(:hover, :focus-within) .history-list-card__delete {
    opacity: 1;
  }
}

.history-list-card__title {
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);
  font-weight: var(--bew-font-weight-semibold);
}

.history-list-card__overlay {
  position: absolute;
  z-index: 1;
  inset: 0;
  border-radius: inherit;
  corner-shape: inherit;
}

.history-list-card__action {
  position: relative;
  z-index: 2;
}

.history-list-card__delete {
  align-self: flex-start;
  width: var(--bew-icon-button-size-md);
  height: var(--bew-icon-button-size-md);
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
