<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { settings } from '~/logic'
import type { List as VideoItem, WatchLaterResult } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getCSRF, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'
import { openLinkInBackground } from '~/utils/tabs'
import { mergeWatchLaterItemsByAid } from '~/utils/watchLaterList'

const { t } = useI18n()
const { confirm: showConfirmDialog } = useConfirmDialog()
const { openIframeDrawer } = useBewlyApp()
const topBarStore = useTopBarStore()

const isLoading = ref(false)
const noMoreContent = ref(false)
const requestFailed = ref(false)
const currentWatchLaterList = ref<VideoItem[]>([])
const watchLaterCount = ref<number>(0)
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const pageNum = ref<number>(1)
const pageSize = ref<number>(20)
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

function initPageAction() {
  handlePageRefresh.value = async () => {
    await initData()
  }

  handleReachBottom.value = async () => {
    if (isLoading.value || noMoreContent.value) {
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
  if (!isCurrentRequest(generation, accountId) || isLoading.value || noMoreContent.value) {
    return
  }

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
  if (!accountId)
    return false

  invalidateRequests()
  let res
  try {
    res = await api.watchlater.removeFromWatchLater({
      aid,
      csrf: getCSRF(),
    })
  }
  catch (error) {
    console.error('[WatchLater] Failed to remove item:', error)
    return false
  }
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

async function handleOpenVideoPageAndRemove(bvid: string, aid: number) {
  if (await deleteWatchLaterItem(aid))
    handleVideoLinkClick(bvid)
}
</script>

<template>
  <div v-if="getCSRF()" flex="~ col md:row lg:row items-stretch" gap-4>
    <main w="full md:60% lg:70% xl:75%" order="2 md:1 lg:1" mb-6>
      <h3 class="bew-page-heading" text="$bew-text-1" mb-6>
        {{ t('watch_later.title') }} ({{ watchLaterCount }})
      </h3>
      <Empty v-if="requestFailed && !isLoading" :description="$t('common.load_failed')">
        <Button type="primary" @click="initData">
          {{ $t('common.operation.refresh') }}
        </Button>
      </Empty>
      <Empty v-else-if="watchLaterCount === 0 && !isLoading" />
      <template v-else>
        <!-- watcher later list -->
        <TransitionGroup name="list">
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
                    <button
                      text="size-$bew-icon-size-lg $bew-text-3"
                      hover:color="$bew-theme-color"
                      opacity-0 group-hover:opacity-100
                      p-2
                      duration-300
                      @click.prevent.stop="handleOpenVideoPageAndRemove(item.bvid, item.aid)"
                    >
                      <div i-tabler:player-play />
                    </button>
                  </Tooltip>
                  <Tooltip :content="t('watch_later.play_in_watch_later')" placement="top">
                    <button
                      text="size-$bew-icon-size-lg $bew-text-3"
                      hover:color="$bew-theme-color"
                      opacity-0 group-hover:opacity-100
                      p-2
                      duration-300
                      @click.prevent.stop="handleLinkClick(`https://www.bilibili.com/list/watchlater?bvid=${item.bvid}`)"
                    >
                      <div i-tabler:list-check />
                    </button>
                  </Tooltip>
                  <Tooltip :content="t('watch_later.remove_from_watch_later')" placement="top">
                    <button
                      text="size-$bew-icon-size-lg $bew-text-3"
                      hover:color="$bew-theme-color"
                      opacity-0 group-hover:opacity-100
                      p-2
                      duration-300
                      @click.prevent.stop="deleteWatchLaterItem(item.aid)"
                    >
                      <div i-tabler:trash />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </section>
          </ALink>
        </TransitionGroup>
        <!-- loading -->
        <Transition name="fade">
          <loading
            v-if="isLoading && currentWatchLaterList.length !== 0 && !noMoreContent"
            m="-t-4"
          />
        </Transition>
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
</style>
