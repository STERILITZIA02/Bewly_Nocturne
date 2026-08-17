<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import Progress from '~/components/Progress.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import type { HistoryResult, List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getCSRF, removeHttpFromUrl, scrollToTop } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'

const { t } = useI18n()
const toast = useToast()
const historys = reactive<Array<HistoryItem>>([])
const historyTabs = computed(() => [
  {
    id: 0,
    name: t('topbar.moments_dropdown.tabs.videos'),
  },
  {
    id: 1,
    name: t('topbar.moments_dropdown.tabs.live'),
  },
  {
    id: 2,
    name: t('topbar.moments_dropdown.tabs.articles'),
  },
])
/**
 * Active tab (0: archive, 1: live, 2: article)
 */
const activatedTab = ref<number>(0)
const isLoading = ref<boolean>(false)
// when noMoreContent is true, the user can't scroll down to load more content
const noMoreContent = ref<boolean>(false)
const loadError = ref(false)
const failedRequest = ref<{ type: Business, viewAt: number } | null>(null)
const livePage = ref<number>(1)
const historysWrap = ref<HTMLElement>() as Ref<HTMLElement>
let requestGeneration = 0

watch(activatedTab, (newVal: number | undefined, oldVal: number | undefined) => {
  if (newVal === oldVal)
    return

  requestGeneration++
  isLoading.value = false
  historys.length = 0
  noMoreContent.value = false
  loadError.value = false
  failedRequest.value = null
  if (historysWrap.value)
    scrollToTop(historysWrap.value)

  if (newVal === 0) {
    void getHistoryList(Business.ARCHIVE)
  }
  else if (newVal === 1) {
    livePage.value = 1
    void getHistoryList(Business.LIVE)
  }
  else if (newVal === 2) {
    void getHistoryList(Business.ARTICLE)
  }
}, { immediate: true })

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (isLoading.value || loadError.value || noMoreContent.value || historys.length === 0)
    return

  const lastViewAt = historys[historys.length - 1]?.view_at
  if (!lastViewAt)
    return

  if (activatedTab.value === 0) {
    void getHistoryList(Business.ARCHIVE, lastViewAt)
  }
  else if (activatedTab.value === 1) {
    void getHistoryList(Business.LIVE, lastViewAt)
  }
  else if (activatedTab.value === 2) {
    void getHistoryList(Business.ARTICLE, lastViewAt)
  }
}

useOptimizedScroll(
  historysWrap,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

onBeforeUnmount(() => {
  requestGeneration++
})

function onClickTab(tabId: number) {
  // Prevent changing tab when loading, cuz it will cause a bug
  if (isLoading.value)
    return

  noMoreContent.value = false

  activatedTab.value = tabId
}

/**
 * Return the URL of the history item
 * @param item history item
 * @return {string} url
 */
function getHistoryUrl(item: HistoryItem) {
  if (item.uri)
    return item.uri

  // Video
  if (item.history.business === Business.ARCHIVE) {
    if (item?.videos && item.videos > 0)
      return `//www.bilibili.com/video/${item.history.bvid}?p=${item.history.page}`
    return `//www.bilibili.com/video/${item.history.bvid}`
  }
  // Live
  else if (item.history.business === Business.LIVE) {
    return `//live.bilibili.com/${item.history.oid}`
  }
  // Article
  else if (item.history.business === Business.ARTICLE || item.history.business === Business.ARTICLE_LIST) {
    if (item.history.cid === 0)
      return `//www.bilibili.com/read/cv${item.history.oid}`
    else
      return `//www.bilibili.com/read/cv${item.history.cid}`
  }
  return ''
}

/**
 * Get history list
 * @param type
 * @param view_at Last viewed timestamp
 */
async function getHistoryList(type: Business, view_at = 0 as number) {
  if (isLoading.value)
    return
  if (noMoreContent.value)
    return

  const generation = requestGeneration
  isLoading.value = true
  loadError.value = false
  failedRequest.value = null

  try {
    const res: HistoryResult = await api.history.getHistoryList({
      type,
      view_at,
    })

    if (generation !== requestGeneration)
      return
    if (res.code !== 0 || !Array.isArray(res.data?.list))
      throw res

    // API success with an empty list is a normal empty/end state.
    if (res.data.list.length === 0) {
      noMoreContent.value = true
      return
    }

    historys.push(...res.data.list)
    loadError.value = false
    failedRequest.value = null
  }
  catch (error) {
    if (generation !== requestGeneration)
      return
    loadError.value = true
    failedRequest.value = { type, viewAt: view_at }
    noMoreContent.value = false
    if (!isExtensionContextInvalidatedError(error))
      console.error('Failed to load history list:', error)
  }
  finally {
    if (generation === requestGeneration)
      isLoading.value = false
  }
}

function retryFailedLoad() {
  const request = failedRequest.value
  if (!request || isLoading.value)
    return

  loadError.value = false
  noMoreContent.value = false
  void getHistoryList(request.type, request.viewAt)
}

function getHistoryItemKey(historyItem: HistoryItem): string {
  return `${historyItem.history.business}_${historyItem.history.oid}`
}

async function deleteHistoryItem(historyItem: HistoryItem) {
  const itemKey = getHistoryItemKey(historyItem)
  try {
    const res = await api.history.deleteHistoryItem({
      kid: itemKey,
      csrf: getCSRF(),
    })
    if (res.code !== 0) {
      toast.error(t('common.load_failed'))
      return
    }

    const currentIndex = historys.findIndex(item => getHistoryItemKey(item) === itemKey)
    if (currentIndex >= 0)
      historys.splice(currentIndex, 1)
  }
  catch (error) {
    console.error('Failed to delete history item:', error)
    toast.error(t('common.load_failed'))
  }
}

function initData() {
  requestGeneration++
  isLoading.value = false
  historys.length = 0
  noMoreContent.value = false
  loadError.value = false
  failedRequest.value = null
  if (historysWrap.value)
    scrollToTop(historysWrap.value)

  if (activatedTab.value === 0) {
    void getHistoryList(Business.ARCHIVE)
  }
  else if (activatedTab.value === 1) {
    livePage.value = 1
    void getHistoryList(Business.LIVE)
  }
  else if (activatedTab.value === 2) {
    void getHistoryList(Business.ARTICLE)
  }
}

defineExpose({
  initData,
})
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
    h="[calc(100vh-100px)]" max-h-500px important-overflow-y-overlay
    bg="$bew-elevated"
    w="380px"
    rounded="$bew-radius"
    pos="relative"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-surface-border-color"
    class="history-pop bew-popover"
    data-key="history"
    flex="~ col"
  >
    <!-- top bar -->
    <header
      flex="~ items-center justify-between"
      p="x-6"
      pos="sticky top-0 left-0"
      w="full"
      h-50px
      z="2"
    >
      <div flex="~">
        <div
          v-for="tab in historyTabs"
          :key="tab.id"
          m="r-4"
          transition="background-color duration-200, color duration-200, opacity duration-200"
          class="tab"
          :class="tab.id === activatedTab ? 'tab-selected' : ''"
          cursor="pointer"
          @click="onClickTab(tab.id)"
        >
          {{ tab.name }}
        </div>
      </div>
      <ALink
        href="https://www.bilibili.com/history"
        type="topBar"
        flex="~ items-center"
      >
        <span text="sm">{{ $t('common.view_all') }}</span>
      </ALink>
    </header>

    <!-- historys wrapper -->
    <main
      ref="historysWrap"
      overflow-y-auto
      rounded="$bew-radius"
      flex="~ col gap-2"
      p="x-4"
      flex-1
      min-h-0
      pos="relative"
    >
      <!-- loading -->
      <Loading
        v-if="isLoading && historys.length === 0"
        h="full"
        flex="~ items-center"
      />

      <!-- error -->
      <Empty
        v-else-if="loadError && historys.length === 0"
        pos="absolute top-0 left-0"
        bg="$bew-content"
        z="0" w="full" h="full"
        flex="~ items-center"
        rounded="$bew-radius"
        :description="$t('common.load_failed')"
      >
        <Button type="primary" @click="retryFailedLoad">
          {{ $t('common.operation.refresh') }}
        </Button>
      </Empty>

      <!-- empty -->
      <Empty
        v-else-if="historys.length === 0"
        pos="absolute top-0 left-0"
        bg="$bew-content"
        z="0" w="full" h="full"
        flex="~ items-center"
        rounded="$bew-radius"
      />

      <!-- historys -->
      <TransitionGroup name="list">
        <article
          v-for="historyItem in historys"
          :key="historyItem.kid"
          class="group popover-card"
          m="last:b-4" p="2"
          rounded="$bew-radius"
          hover:bg="$bew-fill-2"
          duration-300
        >
          <ALink
            class="popover-card__primary"
            :href="getHistoryUrl(historyItem)"
            :aria-label="historyItem.title"
            type="topBar"
          />
          <section class="popover-card__content" flex="~ gap-4 items-start">
            <!-- Video cover, live cover, ariticle cover -->
            <div
              class="popover-card__media"
              bg="$bew-skeleton"
              w="150px"
              flex="shrink-0"
            >
              <!-- Delete button -->
              <button
                type="button"
                class="group-hover:opacity-100 opacity-0 p-0 bew-shape-circle popover-card__interactive popover-card-action"
                :aria-label="$t('common.operation.delete')"
                pos="absolute top-0 right-0" z-1 w-24px h-24px
                bg="black opacity-60 hover:$bew-error-color"
                grid="~ place-items-center"
                m="1"
                text="white xs"
                duration-300
                border="rounded-full"
                @click.stop.prevent="deleteHistoryItem(historyItem)"
              >
                <i i-mingcute:close-line />
              </button>

              <!-- Video -->
              <template v-if="activatedTab === 0">
                <div pos="relative">
                  <img
                    w="150px" h-full
                    class="aspect-video"
                    :src="`${removeHttpFromUrl(
                      historyItem.cover,
                    )}@256w_144h_1c`"
                    :alt="historyItem.title"
                    object-cover
                  >
                  <div
                    pos="absolute bottom-0 right-0"
                    bg="black opacity-60"
                    m="1"
                    p="x-2 y-1"
                    text="white xs"
                    border="rounded-full"
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
                </div>
                <Progress
                  :percentage="
                    normalizePlaybackProgress(historyItem.progress, historyItem.duration)
                  "
                />
              </template>

              <!-- Live -->
              <template v-else-if="activatedTab === 1">
                <div pos="relative">
                  <img
                    w="150px"
                    class="aspect-video"
                    :src="`${removeHttpFromUrl(
                      historyItem.cover,
                    )}@256w_144h_1c`"
                    :alt="historyItem.title"
                    bg="contain"
                  >
                  <div
                    v-if="historyItem.live_status === 1"
                    pos="absolute top-0 left-0"
                    bg="$bew-theme-color"
                    text="xs $bew-on-theme-color"
                    p="x-2 y-1"
                    m="1"
                    rounded-full
                    font="semibold"
                  >
                    LIVE
                    <i i-svg-spinners:pulse-3 align-middle mt--0.2em />
                  </div>
                  <div
                    v-else
                    pos="absolute top-0 left-0"
                    bg="black opacity-60"
                    text="xs white"
                    p="x-2 y-1"
                    m="1"
                    rounded="full"
                  >
                    OFFLINE
                  </div>
                </div>
              </template>

              <!-- Article -->
              <div v-else-if="activatedTab === 2">
                <img
                  w="150px"
                  class="aspect-video"
                  :src="`${
                    Array.isArray(historyItem.covers)
                      ? historyItem.covers[0]
                      : ''
                  }@256w_144h_1c`"
                  object-cover
                  :alt="historyItem.title"
                  bg="contain"
                >
              </div>
            </div>

            <!-- Description -->
            <div>
              <h3
                class="keep-two-lines"
                overflow="hidden"
                text="ellipsis"
                break-anywhere
              >
                {{ historyItem.title }}
              </h3>
              <div text="$bew-text-2 sm" m="t-4" flex="~" align="items-center">
                <ALink
                  :href="`https://space.bilibili.com/${historyItem.author_mid}`"
                  type="topBar"
                  class="popover-card__interactive"
                >
                  {{ historyItem.author_name }}
                </ALink>
                <span
                  v-if="historyItem.live_status === 1"
                  text="$bew-theme-foreground"
                  flex
                  items-center
                  gap-1
                  m="l-2"
                >
                  LIVE
                  <i i-svg-spinners:pulse-3 align-middle mt--0.2em />
                </span>
              </div>
              <p text="$bew-text-2 sm">
                {{
                  useDateFormat(
                    historyItem.view_at * 1000,
                    'YYYY-MM-DD HH:mm:ss',
                  ).value
                }}
              </p>
            </div>
          </section>
        </article>
      </TransitionGroup>
      <!-- loading -->
      <Transition name="fade">
        <Loading v-if="isLoading && historys.length !== 0" m="b-4" />
        <div
          v-else-if="loadError && historys.length !== 0"
          class="history-pop__pagination-error"
        >
          <span>{{ $t('common.load_failed') }}</span>
          <Button type="secondary" size="small" @click="retryFailedLoad">
            {{ $t('common.operation.refresh') }}
          </Button>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/popoverCards";

.tab {
  --uno: "relative text-$bew-text-2";

  &::after {
    --uno: "absolute bottom-0 left-0 w-full h-12px bg-$bew-theme-color opacity-0 transform scale-x-0 -z-1";
    --uno: "transition-colors duration-200";
    content: "";
  }
}

.tab-selected {
  --uno: "font-bold text-$bew-text-1";

  &::after {
    --uno: "scale-x-80 opacity-40";
  }
}

.history-pop__pagination-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3) 0 var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
