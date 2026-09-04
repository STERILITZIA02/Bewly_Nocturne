<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import VideoListSkeleton from '~/components/VideoListSkeleton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import type { HistoryResult, List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import type { HistorySearchResult, List as HistorySearchItem } from '~/models/video/historySearch'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getCSRF, getUserID, removeHttpFromUrl } from '~/utils/main'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'

const { t } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()

const isLoading = ref<boolean>(false)
const requestFailed = ref(false)
const noMoreContent = ref<boolean>(false)
const historyList = reactive<Array<HistoryItem>>([])
const currentPageNum = ref<number>(1)
const keyword = ref<string>('')
const submittedKeyword = ref('')
const isClearingHistory = ref(false)
const historyStatus = ref<boolean>()
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
let historyCursor = 0
let requestGeneration = 0

const HistoryBusiness = computed(() => {
  return Business
})

onMounted(() => {
  void getHistoryList()
  getHistoryPauseStatus()

  initPageAction()
})

onScopeDispose(() => {
  requestGeneration++
  if (handleReachBottom.value === handleHistoryReachBottom)
    handleReachBottom.value = undefined
  if (handlePageRefresh.value === handleHistoryPageRefresh)
    handlePageRefresh.value = undefined
})

function isSearchMode(): boolean {
  return submittedKeyword.value.length > 0
}

function resetListState() {
  requestGeneration++
  historyList.length = 0
  historyCursor = 0
  currentPageNum.value = 1
  noMoreContent.value = false
  requestFailed.value = false
  isLoading.value = false
}

function reloadCurrentMode() {
  if (isClearingHistory.value)
    return
  resetListState()
  if (isSearchMode())
    void searchHistoryList()
  else
    void getHistoryList()
}

async function handleHistoryReachBottom() {
  if (isClearingHistory.value || isLoading.value || noMoreContent.value || requestFailed.value)
    return false

  if (isSearchMode())
    await searchHistoryList()
  else
    await getHistoryList()
  return true
}

function handleHistoryPageRefresh() {
  reloadCurrentMode()
}

function initPageAction() {
  handleReachBottom.value = handleHistoryReachBottom
  handlePageRefresh.value = handleHistoryPageRefresh
}

/**
 * Get history list
 */
async function getHistoryList() {
  if (isClearingHistory.value || isLoading.value || noMoreContent.value)
    return

  const generation = requestGeneration
  requestFailed.value = false
  isLoading.value = true
  try {
    while (!noMoreContent.value) {
      if (generation !== requestGeneration)
        return
      const requestedCursor = historyCursor
      let res: HistoryResult
      try {
        res = await api.history.getHistoryList({
          type: 'all',
          view_at: requestedCursor,
        })
      }
      catch (error) {
        if (generation === requestGeneration)
          requestFailed.value = true
        console.error('获取历史记录失败:', error)
        break
      }

      if (generation !== requestGeneration || isSearchMode())
        return
      if (res.code !== 0) {
        requestFailed.value = true
        break
      }

      const list = Array.isArray(res.data?.list) ? res.data.list : []
      if (list.length === 0) {
        noMoreContent.value = true
        break
      }

      requestFailed.value = false
      historyList.push(...list)
      const nextCursor = list[list.length - 1].view_at
      if (nextCursor === requestedCursor)
        noMoreContent.value = true
      else
        historyCursor = nextCursor

      if (list.length < 20)
        noMoreContent.value = true

      if (noMoreContent.value || await haveScrollbar())
        break
    }
  }
  finally {
    if (generation === requestGeneration)
      isLoading.value = false
  }
}

async function searchHistoryList() {
  const searchKeyword = submittedKeyword.value
  if (!searchKeyword || isClearingHistory.value || isLoading.value || noMoreContent.value)
    return

  const generation = requestGeneration
  requestFailed.value = false
  isLoading.value = true
  const page = currentPageNum.value
  try {
    const res: HistorySearchResult = await api.history.searchHistoryList({
      pn: page,
      keyword: searchKeyword,
    })
    if (generation !== requestGeneration || submittedKeyword.value !== searchKeyword)
      return
    if (res.code !== 0) {
      requestFailed.value = true
      return
    }

    const list = Array.isArray(res.data?.list) ? res.data.list : []
    requestFailed.value = false
    list.forEach((item: HistorySearchItem) => {
      historyList.push(item)
    })

    currentPageNum.value = page + 1
    noMoreContent.value = list.length < 20
  }
  catch (error) {
    if (generation === requestGeneration)
      requestFailed.value = true
    console.error('搜索历史记录失败:', error)
  }
  finally {
    if (generation === requestGeneration)
      isLoading.value = false
  }
}

function handleSearch() {
  if (isClearingHistory.value)
    return
  submittedKeyword.value = keyword.value.trim()
  reloadCurrentMode()
}

function retryHistoryRequest() {
  if (isLoading.value)
    return
  requestFailed.value = false
  if (isSearchMode())
    void searchHistoryList()
  else
    void getHistoryList()
}

function deleteHistoryItem(historyItem: HistoryItem) {
  const kid = `${historyItem.history.business}_${historyItem.history.oid}`
  api.history.deleteHistoryItem({
    kid,
    csrf: getCSRF(),
  })
    .then((res) => {
      if (res.code === 0) {
        const targetIndex = historyList.findIndex(item =>
          `${item.history.business}_${item.history.oid}` === kid,
        )
        if (targetIndex !== -1)
          historyList.splice(targetIndex, 1)
      }
    })
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

function getHistoryPauseStatus() {
  api.history.getHistoryPauseStatus()
    .then((res) => {
      if (res.code === 0)
        historyStatus.value = res.data
    })
}

function setHistoryPauseStatus(isPause: boolean) {
  api.history.setHistoryPauseStatus({
    csrf: getCSRF(),
    switch: isPause,
  })
    .then((res) => {
      if (res.code === 0)
        getHistoryPauseStatus()
    })
}

async function clearAllHistory() {
  if (isClearingHistory.value)
    return
  const generation = ++requestGeneration
  const accountId = getUserID()
  isClearingHistory.value = true
  isLoading.value = false
  try {
    const res = await api.history.clearAllHistory({ csrf: getCSRF() })
    if (generation !== requestGeneration || accountId !== getUserID())
      return
    if (res.code !== 0)
      throw new Error(res.message || t('history.clear_failed'))
    historyList.length = 0
    historyCursor = 0
    currentPageNum.value = 1
    noMoreContent.value = true
    requestFailed.value = false
  }
  catch (error) {
    if (generation === requestGeneration && accountId === getUserID()) {
      requestFailed.value = historyList.length === 0
      toast.error(error instanceof Error ? error.message : t('history.clear_failed'))
    }
  }
  finally {
    if (generation === requestGeneration)
      isClearingHistory.value = false
  }
}

async function handleClearAllWatchHistory() {
  const result = await showConfirmDialog(
    t('history.clear_all_watch_history_confirm'),
  )
  if (result)
    clearAllHistory()
}

async function handlePauseWatchHistory() {
  const result = await showConfirmDialog(
    t('history.pause_watch_history_confirm'),
  )
  if (result)
    setHistoryPauseStatus(true)
}

async function handleTurnOnWatchHistory() {
  const result = await showConfirmDialog(
    t('history.turn_on_watch_history_confirm'),
  )
  if (result)
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
      <VideoListSkeleton v-else-if="isLoading && historyList.length === 0" :count="5" />

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
            mr-8 px-4
            b-l="~ 2px dashed $bew-fill-2"
            group-hover:b-l="$bew-theme-color-40"
            shrink-0
            relative
            duration-300
            flex="important-xl:~ items-center justify-center"
            hidden
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
              text="sm $bew-text-3"
              group-hover:text="$bew-theme-foreground"
              bg="$bew-fill-1"
              group-hover:bg="$bew-theme-color-20"
              p="x-3 y-1"
              rounded="$bew-radius-half"
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
                  hover:bg="$bew-theme-color-10"
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
