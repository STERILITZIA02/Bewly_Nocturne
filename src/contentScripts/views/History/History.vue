<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import VideoListSkeleton from '~/components/VideoListSkeleton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import type { List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { normalizeIntlLocale } from '~/utils/locale'
import { getCSRF, getUserID, removeHttpFromUrl } from '~/utils/main'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'

import { useHistoryTimeline } from './useHistoryTimeline'

const { t, locale } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()

const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const topBarStore = useTopBarStore()
const accountId = computed(() => resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid))
const timeline = useHistoryTimeline({
  api: api.history,
  getAccountId: () => getUserID() === String(accountId.value) ? accountId.value : null,
  getCSRF,
  haveScrollbar,
  onWriteError: () => toast.error(t('common.operation_failed')),
})
const { isLoading, requestFailed, noMoreContent, historyList, keyword, isClearingHistory, historyStatus, deleteHistoryItem, setHistoryPauseStatus, clearAllHistory, handleSearch } = timeline
const HistoryBusiness = computed(() => Business)
const dateFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { dateStyle: 'medium' }))
const timeFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
const historyGroups = computed(() => {
  const groups = new Map<string, { key: string, label: string, items: HistoryItem[] }>()
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
  if (mounted)
    timeline.activate()
}, { flush: 'sync' })
onScopeDispose(() => {
  timeline.dispose()
  if (handleReachBottom.value === handleHistoryReachBottom)
    handleReachBottom.value = undefined
  if (handlePageRefresh.value === handleHistoryPageRefresh)
    handlePageRefresh.value = undefined
})
function handleHistoryReachBottom() {
  return requestFailed.value ? Promise.resolve(false) : timeline.load()
}
function handleHistoryPageRefresh() {
  timeline.reloadCurrentMode()
}
function retryHistoryRequest() {
  void timeline.load()
}

/**
 * Return the URL of the history item
 * @param item history item
 * @return {string} url
 */
function getHistoryUrl(item: HistoryItem): string {
  if (item.uri)
    return item.uri

  // Video
  if (item.history.business === Business.ARCHIVE) {
    if (item?.videos && item.videos > 0)
      return `https://www.bilibili.com/video/${item.history.bvid}?p=${item.history.page}`
    return `https://www.bilibili.com/video/${item.history.bvid}`
  }
  // Live
  else if (item.history.business === Business.LIVE) {
    return `https://live.bilibili.com/${item.history.oid}`
  }
  // Article
  else if (item.history.business === Business.ARTICLE || item.history.business === Business.ARTICLE_LIST) {
    if (item.history.cid === 0)
      return `https://www.bilibili.com/read/cv${item.history.oid}`
    else
      return `https://www.bilibili.com/read/cv${item.history.cid}`
  }
  return ''
}

function getHistoryResumeUrl(item: HistoryItem): string | undefined {
  if (![Business.ARCHIVE, Business.PGC].includes(item.history.business as Business)
    || !Number.isFinite(item.progress) || item.progress <= 0 || item.progress >= item.duration) {
    return undefined
  }
  try {
    const url = new URL(getHistoryUrl(item))
    if (url.hostname !== 'www.bilibili.com' || !/^https?:$/.test(url.protocol)
      || !/^\/(?:video|bangumi\/play)\//.test(url.pathname)) {
      return undefined
    }
    url.searchParams.set('t', String(Math.floor(item.progress)))
    return url.toString()
  }
  catch {
    return undefined
  }
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
      <h3 class="bew-page-heading" text="$bew-text-1" mb-6>
        {{ $t('history.title') }}
      </h3>
      <Empty v-if="requestFailed && !isLoading && historyList.length === 0" :description="$t('common.load_failed')">
        <Button type="primary" @click="retryHistoryRequest">
          {{ $t('common.operation.refresh') }}
        </Button>
      </Empty>
      <VideoListSkeleton v-else-if="isLoading && historyList.length === 0" :count="5" history />

      <!-- historyList -->
      <div v-else class="history-groups">
        <section v-for="group in historyGroups" :key="group.key" class="history-day-group">
          <h4 class="history-day-heading">
            {{ group.label }}
          </h4>
          <TransitionGroup name="list" tag="div" class="history-day-list">
            <div
              v-for="historyItem in group.items"
              :key="historyItem.kid"
              class="history-list-card group"
              content-visibility-auto
              cursor-pointer
            >
              <ALink
                class="history-list-card__overlay"
                type="videoCard"
                :href="getHistoryUrl(historyItem)"
                :aria-label="historyItem.show_title || historyItem.title"
              />
              <section
                class="history-list-card__content bew-history-row"
              >
                <!-- Cover -->
                <div
                  pos="relative"
                  bg="$bew-skeleton"
                  w-full
                  rounded="$bew-media-radius"
                  overflow-hidden
                  aspect-video
                >
                  <img
                    w="full"
                    aspect-video
                    :src="`${getHistoryItemCover(historyItem)}@480w_270h_1c`"
                    :alt="historyItem.title"
                    object-cover
                  >

                  <span
                    v-if="historyItem.history.business === HistoryBusiness.LIVE || historyItem.history.business === HistoryBusiness.PGC"
                    pos="absolute right-0 top-0"
                    bg="$bew-theme-color"
                    text="xs $bew-on-theme-color"
                    p="x-2 y-1"
                    m-1
                    rounded="$bew-radius-half"
                  >
                    <template
                      v-if="historyItem.history.business === HistoryBusiness.LIVE"
                    >
                      {{ t('search.categories.live') }}
                    </template>
                    <template
                      v-else-if="historyItem.history.business === HistoryBusiness.PGC"
                    >
                      {{ t('history.media') }}
                    </template>
                  </span>

                  <div
                    v-if="
                      historyItem.history.business === HistoryBusiness.ARCHIVE
                        || historyItem.history.business === HistoryBusiness.PGC
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
                        historyItem.progress === -1
                          ? calcCurrentTime(historyItem.duration)
                          : calcCurrentTime(historyItem.progress)
                      } /
                      ${calcCurrentTime(historyItem.duration)}`
                    }}
                  </div>
                  <div w-full pos="absolute bottom-0" bg="white opacity-60">
                    <Progress
                      v-if="
                        historyItem.history.business === HistoryBusiness.ARCHIVE
                          || historyItem.history.business === HistoryBusiness.PGC
                      "
                      :percentage="
                        normalizePlaybackProgress(historyItem.progress, historyItem.duration)
                      "
                    />
                  </div>
                </div>

                <!-- Description -->
                <div flex justify-between w-full h-full>
                  <div flex="~ col">
                    <div
                      :title="historyItem.show_title ? historyItem.show_title : historyItem.title"
                    >
                      <h3
                        class="keep-two-lines history-list-card__title"
                        overflow="hidden"
                        text="overflow-ellipsis"
                      >
                        {{ historyItem.show_title ? historyItem.show_title : historyItem.title }}
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
                      :href="historyItem.author_mid ? `https://space.bilibili.com/${historyItem.author_mid}` : historyItem.uri" target="_blank"
                    >
                      <img
                        :src="
                          removeHttpFromUrl(`${historyItem.author_face
                            ? historyItem.author_face
                            : historyItem.cover}@40w_40h_1c`)
                        "
                        w-6 h-6
                        aspect-square
                        class="bew-shape-circle"
                        object-cover
                        alt=""
                        mr-2
                      >
                      {{
                        historyItem.author_name
                          ? historyItem.author_name
                          : historyItem.title
                      }}
                      <span
                        v-if="historyItem.live_status === 1"
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
                          v-if="historyItem.history.dt === 1 || historyItem.history.dt === 3 || historyItem.history.dt === 5 || historyItem.history.dt === 7"
                          i-mingcute:cellphone-line
                        />
                        <i v-if="historyItem.history.dt === 2" i-mingcute:tv-1-line />
                        <i
                          v-if="historyItem.history.dt === 4 || historyItem.history.dt === 6" i-mingcute:pad-line
                        />
                        <i v-if="historyItem.history.dt === 33" i-mingcute:tv-2-line />
                      </span>
                      <span>
                        {{ formatHistoryTime(historyItem) }}
                      </span>
                      <ALink
                        v-if="getHistoryResumeUrl(historyItem)"
                        :href="getHistoryResumeUrl(historyItem)"
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
                    @click.prevent.stop="deleteHistoryItem(historyItem)"
                  >
                    <div i-tabler:trash />
                  </IconButton>
                </div>
              </section>
            </div>
          </TransitionGroup>
        </section>
      </div>

      <div v-if="requestFailed && !isLoading && historyList.length > 0" class="history-load-more-error">
        <span>{{ $t('common.load_failed') }}</span>
        <Button type="tertiary" @click="retryHistoryRequest">
          {{ $t('common.operation.refresh') }}
        </Button>
      </div>

      <!-- no more content -->
      <Empty v-if="noMoreContent" class="py-4" :description="$t('common.no_more_content')" />

      <VideoListSkeleton
        v-if="isLoading && historyList.length !== 0 && !noMoreContent"
        :count="2"
        history
      />
    </main>

    <aside relative w="full md:40% lg:30% xl:25%" order="1 md:2 lg:2">
      <CoverSidebarSurface
        class="history-sidebar-panel" pos="sticky top-120px" flex="~ col gap-4" justify-start my-10
        w-full
      >
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
.history-content,
.history-groups {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-6);
  min-width: 0;
}

.history-day-heading {
  margin: 0 0 var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.history-day-list {
  display: grid;
  gap: var(--bew-space-2);
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
  contain-intrinsic-size: auto 136px;

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
