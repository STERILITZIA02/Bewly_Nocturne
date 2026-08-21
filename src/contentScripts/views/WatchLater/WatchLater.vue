<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import IconButton from '~/components/IconButton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { useGridLayout } from '~/composables/useGridLayout'
import { settings } from '~/logic'
import { useLayoutEditSettingValue, vLayoutEditable } from '~/logic/layoutEdit'
import type { List as VideoItem, WatchLaterResult } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getCSRF, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'
import { openLinkInBackground } from '~/utils/tabs'
import { mergeWatchLaterItemsByAid } from '~/utils/watchLaterList'

import WatchLaterGridCard from './WatchLaterGridCard.vue'

const { t } = useI18n()
const { confirm: showConfirmDialog } = useConfirmDialog()
const { openIframeDrawer } = useBewlyApp()
const topBarStore = useTopBarStore()

const isLoading = ref(false)
const noMoreContent = ref(false)
const requestFailed = ref(false)
const currentWatchLaterList = ref<VideoItem[]>([])
const watchLaterCount = ref<number>(0)
const pendingAction = ref<{ accountId: number, aid: number } | null>(null)
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const pageNum = ref<number>(1)
const pageSize = ref<number>(20)
const watchLaterLayoutMode = useLayoutEditSettingValue(
  'page.watchLater.layout',
  () => settings.value.watchLaterLayoutMode,
)
const { gridClass: watchLaterGridClass, gridCssVars: watchLaterGridCssVars } = useGridLayout(() => 'adaptive')
let requestGeneration = 0
let loadedAccountId: number | null = null
let loadMoreTimer: ReturnType<typeof setTimeout> | null = null

function getCurrentAccountId(): number | null {
  const mid = Number(topBarStore.userInfo.mid)
  return topBarStore.isLogin && Number.isFinite(mid) && mid > 0 ? mid : null
}

function clearLoadMoreTimer() {
  if (loadMoreTimer) {
    clearTimeout(loadMoreTimer)
    loadMoreTimer = null
  }
}

function invalidateRequests(): number {
  clearLoadMoreTimer()
  isLoading.value = false
  return ++requestGeneration
}

function isCurrentRequest(generation: number, accountId: number): boolean {
  return generation === requestGeneration && accountId === getCurrentAccountId()
}

onMounted(() => {
  initPageAction()
  loadedAccountId = getCurrentAccountId()
  void initData()
})

watch(
  [() => topBarStore.isLogin, () => topBarStore.userInfo.mid],
  () => {
    const accountId = getCurrentAccountId()
    if (accountId === loadedAccountId)
      return

    loadedAccountId = accountId
    void initData()
  },
)

onBeforeUnmount(() => {
  invalidateRequests()
  handlePageRefresh.value = undefined
  handleReachBottom.value = undefined
})

async function initData() {
  const generation = invalidateRequests()
  const accountId = getCurrentAccountId()
  isLoading.value = false
  noMoreContent.value = false
  requestFailed.value = false
  currentWatchLaterList.value = []
  watchLaterCount.value = 0
  pendingAction.value = null
  pageNum.value = 1
  if (accountId === null)
    return

  await getWatchLaterListByPage(generation, accountId)
}

function getData() {
  const accountId = getCurrentAccountId()
  if (accountId !== null)
    void getWatchLaterListByPage(requestGeneration, accountId)
}

function retryWatchLaterRequest() {
  if (isLoading.value)
    return
  requestFailed.value = false
  getData()
}

function initPageAction() {
  handlePageRefresh.value = async () => {
    await initData()
  }

  handleReachBottom.value = async () => {
    if (isLoading.value || noMoreContent.value || requestFailed.value) {
      return
    }

    // 优化：添加延迟执行提高触发成功率
    clearLoadMoreTimer()
    const generation = requestGeneration
    loadMoreTimer = setTimeout(() => {
      loadMoreTimer = null
      if (generation !== requestGeneration)
        return
      if (!isLoading.value && !noMoreContent.value) {
        getData()
      }
    }, 50)
  }
}

/**
 * Get watch later list by page
 */
async function getWatchLaterListByPage(generation: number, accountId: number) {
  if (!isCurrentRequest(generation, accountId) || isLoading.value || noMoreContent.value || requestFailed.value) {
    return
  }

  requestFailed.value = false
  isLoading.value = true

  try {
    while (!noMoreContent.value) {
      const requestedPage = pageNum.value
      const res: WatchLaterResult = await api.watchlater.getWatchLaterListByPage({
        pn: requestedPage,
        ps: pageSize.value,
      })

      if (!isCurrentRequest(generation, accountId))
        return
      if (res.code !== 0) {
        requestFailed.value = true
        noMoreContent.value = false
        break
      }

      const list = Array.isArray(res.data?.list) ? res.data.list : []
      if (requestedPage === 1)
        watchLaterCount.value = Number.isFinite(res.data?.count) ? res.data.count : list.length

      currentWatchLaterList.value = mergeWatchLaterItemsByAid(currentWatchLaterList.value, list)
      requestFailed.value = false
      pageNum.value = requestedPage + 1
      noMoreContent.value = list.length < pageSize.value

      if (noMoreContent.value)
        break

      const hasScrollbar = await haveScrollbar()
      if (!isCurrentRequest(generation, accountId))
        return
      if (hasScrollbar)
        break
    }
  }
  catch (error) {
    if (isCurrentRequest(generation, accountId)) {
      requestFailed.value = true
      noMoreContent.value = false
      console.error('[WatchLater] Failed to load list:', error)
    }
  }
  finally {
    if (isCurrentRequest(generation, accountId))
      isLoading.value = false
  }
}

async function deleteWatchLaterItem(aid: number): Promise<boolean> {
  const accountId = getCurrentAccountId()
  if (!accountId || pendingAction.value)
    return false

  const action = { accountId, aid }
  pendingAction.value = action
  invalidateRequests()
  try {
    const res = await api.watchlater.removeFromWatchLater({
      aid,
      csrf: getCSRF(),
    })
    if (res.code !== 0 || accountId !== getCurrentAccountId())
      return false

    const currentIndex = currentWatchLaterList.value.findIndex(item => item.aid === aid)
    if (currentIndex !== -1) {
      currentWatchLaterList.value.splice(currentIndex, 1)
      watchLaterCount.value = Math.max(0, watchLaterCount.value - 1)
    }
    await topBarStore.commitWatchLaterMutation(aid, false, accountId)
    return true
  }
  catch (error) {
    console.error('[WatchLater] Failed to remove item:', error)
    return false
  }
  finally {
    if (pendingAction.value === action)
      pendingAction.value = null
  }
}

async function handleClearAllWatchLater() {
  const result = await showConfirmDialog(
    t('watch_later.clear_all_confirm'),
  )
  if (result) {
    const accountId = getCurrentAccountId()
    if (!accountId)
      return

    const generation = invalidateRequests()
    isLoading.value = true
    try {
      const res = await api.watchlater.clearAllWatchLater({
        csrf: getCSRF(),
      })
      if (res.code === 0 && accountId === getCurrentAccountId()) {
        currentWatchLaterList.value = []
        watchLaterCount.value = 0
        await topBarStore.commitWatchLaterClear(accountId)
        await initData()
      }
    }
    catch (error) {
      console.error('[WatchLater] Failed to clear list:', error)
    }
    finally {
      if (generation === requestGeneration)
        isLoading.value = false
    }
  }
}

async function handleRemoveWatchedVideos() {
  const result = await showConfirmDialog(
    t('watch_later.remove_watched_videos_confirm'),
  )
  if (result) {
    const accountId = getCurrentAccountId()
    if (!accountId)
      return

    const generation = invalidateRequests()
    isLoading.value = true
    try {
      const res = await api.watchlater.removeFromWatchLater({
        viewed: true,
        csrf: getCSRF(),
      })
      if (res.code === 0 && accountId === getCurrentAccountId()) {
        await topBarStore.invalidateWatchLaterMembership(accountId)
        await initData()
      }
    }
    catch (error) {
      console.error('[WatchLater] Failed to remove viewed items:', error)
    }
    finally {
      if (generation === requestGeneration)
        isLoading.value = false
    }
  }
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

function handleVideoLinkClick(bvid: string) {
  const videoUrl = `https://www.bilibili.com/video/${bvid}/`
  if (settings.value.videoCardLinkOpenMode === 'drawer') {
    openIframeDrawer(videoUrl) // 在抽屉打开
  }
  else if (settings.value.videoCardLinkOpenMode === 'currentTab') {
    window.open(videoUrl, '_self') // 在当前标签页打开
  }
  else if (settings.value.videoCardLinkOpenMode === 'background') {
    openLinkInBackground(videoUrl)
  }
  else {
    openLinkToNewTab(videoUrl) // 在新标签页打开
  }
}

async function openVideoPageAndRemove(item: VideoItem) {
  if (await deleteWatchLaterItem(item.aid))
    handleVideoLinkClick(item.bvid)
}

function playAndRemove(item: VideoItem) {
  void openVideoPageAndRemove(item)
}

function playInWatchLater(item: VideoItem) {
  handleLinkClick(`https://www.bilibili.com/list/watchlater?bvid=${item.bvid}`)
}

function remove(item: VideoItem) {
  void deleteWatchLaterItem(item.aid)
}

function isItemActionPending(): boolean {
  return pendingAction.value?.accountId === getCurrentAccountId()
}
</script>

<template>
  <div v-if="getCSRF()" flex="~ col md:row lg:row items-stretch" gap-4>
    <main
      v-layout-editable="'watch-later-layout'"
      data-layout-editable-id="watch-later-layout"
      w="full md:60% lg:70% xl:75%" order="2 md:1 lg:1" mb-6
    >
      <h3 class="bew-page-heading" text="$bew-text-1" mb-6>
        {{ t('watch_later.title') }} ({{ watchLaterCount }})
      </h3>
      <Empty v-if="requestFailed && !isLoading && currentWatchLaterList.length === 0" :description="$t('common.load_failed')">
        <Button type="primary" @click="retryWatchLaterRequest">
          {{ $t('common.operation.refresh') }}
        </Button>
      </Empty>
      <Empty v-else-if="watchLaterCount === 0 && !isLoading" />
      <template v-else>
        <Loading
          v-if="isLoading && currentWatchLaterList.length === 0 && watchLaterLayoutMode === 'list'"
          min-h="240px"
          flex="~ items-center"
        />
        <!-- watcher later list -->
        <TransitionGroup v-else-if="watchLaterLayoutMode === 'list'" name="list">
          <ALink
            v-for="item in currentWatchLaterList"
            :key="item.aid"
            :href="`https://www.bilibili.com/video/${item.bvid}/`"
            type="videoCard"
            class="group"
            flex cursor-pointer
          >
            <section
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
                  :src="removeHttpFromUrl(`${item.pic}@480w_270h_1c`)"
                  :alt="item.title"
                  object-cover
                >

                <!-- <div
                  pos="absolute bottom-0 right-0"
                  bg="black opacity-60"
                  m="2"
                  p="x-2 y-1"
                  text="white xs"
                  rounded="$bew-radius-half"
                >
                  {{ calcCurrentTime(item.duration) }}
                </div> -->
                <div

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
                      item.progress === -1
                        ? calcCurrentTime(item.duration)
                        : calcCurrentTime(item.progress)
                    } /
                      ${calcCurrentTime(item.duration)}`
                  }}
                </div>
                <div w-full pos="absolute bottom-0" bg="white opacity-60">
                  <Progress
                    :percentage="
                      normalizePlaybackProgress(item.progress, item.duration)
                    "
                  />
                </div>
              </div>

              <!-- Description -->
              <div flex justify-between w-full h-full>
                <div flex="~ col">
                  <a
                    class="keep-two-lines"
                    overflow="hidden"
                    un-text="lg overflow-ellipsis"
                    @click.stop.prevent="handleVideoLinkClick(item.bvid)"
                  >
                    {{ item.title }}
                  </a>
                  <a
                    un-text="$bew-text-2 sm"
                    m="t-4 b-2"
                    flex="~"
                    items-center
                    cursor-pointer
                    w-fit
                    rounded="$bew-radius"
                    hover:color="$bew-theme-color"
                    hover:bg="$bew-theme-color-10"
                    duration-300
                    pr-2
                    :href="`//space.bilibili.com/${item.owner.mid}`" target="_blank"
                    @click.stop
                  >
                    <img
                      :src="removeHttpFromUrl(`${item.owner.face}@40w_40h_1c`)"
                      w-30px
                      aspect-square
                      object-cover
                      alt=""
                      rounded="1/2"
                      mr-2
                    >
                    {{ item.owner.name }}
                  </a>
                  <p display="block xl:none" text="$bew-text-3 sm" mt-auto mb-2>
                    {{
                      useDateFormat(item.pubdate * 1000, 'YYYY-MM-DD HH:mm:ss')
                        .value
                    }}
                  </p>
                </div>

                <div flex items-center gap-1>
                  <Tooltip :content="t('watch_later.play_video')" placement="top">
                    <IconButton
                      :label="t('watch_later.play_video')"
                      :disabled="isItemActionPending()"
                      text="size-$bew-icon-size-lg $bew-text-3"
                      hover:color="$bew-theme-color"
                      opacity-0 group-hover:opacity-100
                      p-2
                      duration-300
                      @click.prevent.stop="playAndRemove(item)"
                    >
                      <div i-tabler:player-play aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip :content="t('watch_later.play_in_watch_later')" placement="top">
                    <IconButton
                      :label="t('watch_later.play_in_watch_later')"
                      :disabled="isItemActionPending()"
                      text="size-$bew-icon-size-lg $bew-text-3"
                      hover:color="$bew-theme-color"
                      opacity-0 group-hover:opacity-100
                      p-2
                      duration-300
                      @click.prevent.stop="playInWatchLater(item)"
                    >
                      <div i-tabler:list-check aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip :content="t('watch_later.remove_from_watch_later')" placement="top">
                    <IconButton
                      :label="t('watch_later.remove_from_watch_later')"
                      :disabled="isItemActionPending()"
                      text="size-$bew-icon-size-lg $bew-text-3"
                      hover:color="$bew-theme-color"
                      opacity-0 group-hover:opacity-100
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
          </ALink>
        </TransitionGroup>

        <div v-else class="watch-later-grid-root">
          <TransitionGroup
            tag="div"
            name="list"
            class="watch-later-grid"
            :class="watchLaterGridClass"
            :style="watchLaterGridCssVars"
          >
            <WatchLaterGridCard
              v-for="item in currentWatchLaterList"
              :key="item.aid"
              :item="item"
              :disabled="isItemActionPending()"
              @play-and-remove="playAndRemove"
              @play-in-watch-later="playInWatchLater"
              @remove="remove"
            />
            <article
              v-for="index in (isLoading && currentWatchLaterList.length === 0 ? 8 : 0)"
              :key="`watch-later-grid-skeleton-${index}`"
              class="watch-later-grid-skeleton"
              aria-hidden="true"
            >
              <div class="watch-later-grid-skeleton__media">
                <span />
              </div>
              <div class="watch-later-grid-skeleton__line" />
              <div class="watch-later-grid-skeleton__line watch-later-grid-skeleton__line--short" />
            </article>
          </TransitionGroup>
        </div>

        <!-- loading -->
        <Transition name="fade">
          <loading
            v-if="isLoading && currentWatchLaterList.length !== 0 && !noMoreContent"
            m="-t-4"
          />
        </Transition>
        <div
          v-if="requestFailed && !isLoading && currentWatchLaterList.length > 0"
          class="watch-later-load-more-error"
        >
          <span>{{ $t('common.load_failed') }}</span>
          <Button type="tertiary" @click="retryWatchLaterRequest">
            {{ $t('common.operation.refresh') }}
          </Button>
        </div>
      </template>
    </main>

    <aside relative w="full md:40% lg:30% xl:25%" order="1 md:2 lg:2">
      <div
        pos="sticky top-120px"
        w-full h="230px md:[calc(100vh-160px)]"
        my-10
        rounded="$bew-radius"
        overflow-hidden
      >
        <!-- Frosted Glass Cover -->
        <div
          pos="absolute top-0 left-0" w-full h-inherit
          z--1
        >
          <div
            absolute w-full h-inherit
            bg="$bew-fill-4"
          />
          <img
            v-if="currentWatchLaterList[0]"
            :src="removeHttpFromUrl(`${currentWatchLaterList[0].pic}@480w_270h_1c`)"
            w-full h-full object="cover center" blur-40px
            relative z--1
          >
        </div>

        <!-- Content -->
        <main
          pos="absolute top-0 left-0"
          w-full h-inherit
          overflow-overlay
          flex="~ col gap-4 justify-start"
          p-6
        >
          <picture
            class="hidden md:block"
            rounded="$bew-radius" style="box-shadow: 0 16px 24px -12px rgba(0, 0, 0, .36)"
            aspect-video mb-4 bg="$bew-skeleton"
          >
            <img
              v-if="currentWatchLaterList[0]" :src="removeHttpFromUrl(`${currentWatchLaterList[0].pic}@480w_270h_1c`)"
              rounded="$bew-radius" aspect-video w-full
            >
          </picture>

          <h3 class="bew-page-heading" text="white" style="text-shadow: 0 0 12px rgba(0,0,0,.3)">
            {{ t('watch_later.title') }} ({{ watchLaterCount }})
          </h3>
          <div v-if="watchLaterCount > 0" flex="~ col" gap-2 w-full>
            <Button
              color="rgba(255,255,255,.35)" block text-color="white" strong
              @click="handlePlayAll"
            >
              <template #left>
                <div i-tabler:player-play />
              </template>
              {{ t('common.play_all') }}
            </Button>
            <Button
              color="rgba(255,255,255,.35)" block text-color="white" strong
              @click="handleClearAllWatchLater"
            >
              <template #left>
                <div i-tabler:trash />
              </template>
              {{ t('watch_later.clear_all') }}
            </Button>
            <Button
              color="rgba(255,255,255,.35)" block text-color="white" strong
              @click="handleRemoveWatchedVideos"
            >
              <template #left>
                <div i-tabler:circle-minus />
              </template>
              {{ t('watch_later.remove_watched_videos') }}
            </Button>
          </div>
        </main>
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

.watch-later-grid-skeleton {
  display: flex;
  min-width: 0;
  padding: var(--bew-space-2);
  flex-direction: column;
  gap: var(--bew-space-3);
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
}

.watch-later-grid-skeleton__media {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--bew-skeleton);
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);

  span {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 20%,
      color-mix(in oklab, var(--bew-fill-4), transparent 35%) 50%,
      transparent 80%
    );
    animation: watch-later-skeleton-shimmer 1.4s linear infinite;
    transform: translateX(-100%);
  }
}

.watch-later-grid-skeleton__line {
  width: 100%;
  height: var(--bew-space-4);
  background: var(--bew-skeleton);
  border-radius: var(--bew-radius-sm);
  corner-shape: var(--bew-corner-shape);
}

.watch-later-grid-skeleton__line--short {
  width: 62%;
}

@keyframes watch-later-skeleton-shimmer {
  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .watch-later-grid-skeleton__media span {
    animation: none;
  }
}
</style>
