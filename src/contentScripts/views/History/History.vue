<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'
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
import { getCSRF, getUserID, removeHttpFromUrl } from '~/utils/main'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'

import { useHistoryTimeline } from './useHistoryTimeline'

const { t } = useI18n()
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
    <main w="full md:60% lg:70% xl:75%" order="2 md:1 lg:1" mb-6>
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
      <TransitionGroup v-else name="list">
        <div
          v-for="historyItem in historyList"
          :key="historyItem.kid"
          class="history-list-card group"
          flex
          cursor-pointer
        >
          <ALink
            class="history-list-card__overlay"
            type="videoCard"
            :href="getHistoryUrl(historyItem)"
            :aria-label="historyItem.show_title || historyItem.title"
          />
          <!-- time slot -->
          <div
            class="bew-history-time-slot"
            b-l="~ 2px dashed $bew-fill-2"
            group-hover:b-l="$bew-theme-foreground"
            shrink-0
            relative
            duration-300
          >
            <!-- hidden lg:flex -->
            <!-- Dot -->
            <i
              pos="absolute left--1px"
              w-2
              h-2
              rounded-6
              bg="$bew-fill-3"
              group-hover:bg="$bew-theme-color"
              transform="~ translate-x--1/2"
              duration-300
            />
            <div
              class="bew-history-time-chip"
              text="$bew-text-3"
              group-hover:text="$bew-theme-foreground"
              bg="$bew-fill-1"
              group-hover:bg="$bew-theme-surface"
              duration-300
            >
              {{
                useDateFormat(historyItem.view_at * 1000, 'YYYY-MM-DD HH:mm:ss')
                  .value
              }}
            </div>
          </div>

          <section
            class="history-list-card__content"
            rounded="$bew-radius"
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
              rounded="$bew-radius"
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
                v-if="historyItem.history.business !== HistoryBusiness.ARCHIVE"
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
                  Livestreaming
                </template>
                <template
                  v-else-if="historyItem.history.business === HistoryBusiness.PGC"
                >
                  PGC
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
                <a
                  class="history-list-card__action"
                  :href="`${getHistoryUrl(historyItem)}`" target="_blank"
                  :title="historyItem.show_title ? historyItem.show_title : historyItem.title"
                >
                  <h3
                    class="keep-two-lines"
                    overflow="hidden"
                    text="lg overflow-ellipsis"
                  >
                    {{ historyItem.show_title ? historyItem.show_title : historyItem.title }}
                  </h3>
                </a>
                <a
                  class="history-list-card__action"
                  un-text="$bew-text-2 sm"
                  m="t-4 b-2"
                  flex="~ items-center"
                  cursor-pointer
                  w-fit
                  rounded="$bew-radius"
                  hover:color="$bew-theme-color"
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
                    w-30px
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
                    Live
                  </span>
                </a>
                <div
                  display="xl:none"
                  flex items-center
                  text="$bew-text-3 sm"
                  mt-auto
                >
                  <span text-xl mr-2 lh-0>
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
                    {{
                      useDateFormat(historyItem.view_at * 1000, 'YYYY-MM-DD HH:mm:ss')
                        .value
                    }}
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="history-list-card__action"
                :aria-label="$t('common.operation.delete')"
                text="size-$bew-icon-size-lg $bew-text-3"
                hover:color="$bew-theme-color"
                opacity-0 group-hover:opacity-100
                p-2
                duration-300
                @click.prevent.stop="deleteHistoryItem(historyItem)"
              >
                <div i-tabler:trash />
              </button>
            </div>
          </section>
        </div>
      </TransitionGroup>

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
      <div pos="sticky top-120px" flex="~ col gap-4" justify-start my-10 w-full>
        <input
          v-model.trim="keyword"
          type="text"
          :placeholder="t('history.search_watch_history')"
          :aria-label="t('history.search_watch_history')"
          class="history-search-input p-x-14px lh-35px h-35px"
          rounded="$bew-radius"
          bg="$bew-content-solid"
          shadow="$bew-shadow-1"
          w-full
          @keyup.enter="handleSearch"
        >
        <Button
          block
          style="
            --b-button-shadow: var(--bew-shadow-1);
          "
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
          style="
            --b-button-shadow: var(--bew-shadow-1);
          "
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
          style="
            --b-button-shadow: var(--bew-shadow-1);
          "
          @click="handleTurnOnWatchHistory"
        >
          <template #left>
            <div i-ph:play-circle-bold />
          </template>
          {{ $t('history.turn_on_watch_history') }}
        </Button>
      </div>
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
.history-list-card {
  position: relative;
}

.history-list-card__overlay {
  position: absolute;
  z-index: 1;
  inset: 0;
}

.history-list-card__action {
  position: relative;
  z-index: 2;
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
