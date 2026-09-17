<script setup lang="ts">
import { useDateFormat, useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import IconButton from '~/components/IconButton.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import VideoListSkeleton from '~/components/VideoListSkeleton.vue'
import OpenTabsDialog from '~/components/WatchLater/OpenTabsDialog.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { CARD_WINDOW_THRESHOLD, useCardWindow } from '~/composables/useCardWindow'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { useGridLayout } from '~/composables/useGridLayout'
import { settings } from '~/logic'
import { isLayoutEditing, useLayoutEditSettingValue, vLayoutEditable } from '~/logic/layoutEdit'
import type { List as VideoItem, WatchLaterResult } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import { createAccountLifetime } from '~/utils/accountLifetime'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getCSRF, getUserID, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'
import { openLinkInBackground } from '~/utils/tabs'
import { updateOwnedWatchLater } from '~/utils/watchLater'
import { getWatchLaterAuthor, getWatchLaterPlaybackUrl, mergeWatchLaterItemsByAid, normalizeWatchLaterItem } from '~/utils/watchLaterList'

import WatchLaterGridCard from './WatchLaterGridCard.vue'

const { t } = useI18n()
const { confirm: showConfirmDialog } = useConfirmDialog()
const { openIframeDrawer } = useBewlyApp()
const topBarStore = useTopBarStore()
const showOpenTabsDialog = ref(false)

const isLoading = ref(false)
const noMoreContent = ref(false)
const requestFailed = ref(false)
const currentWatchLaterList = ref<VideoItem[]>([])
const watchLaterCount = ref<number>(0)
const pendingAction = shallowRef<{ accountId: number, aid: number } | null>(null)
const { handlePageRefresh, handleReachBottom, haveScrollbar, scrollViewportRef } = useBewlyApp()
const pageNum = ref<number>(1)
const pageSize = ref<number>(20)
const watchLaterLayoutMode = useLayoutEditSettingValue(
  'page.watchLater.layout',
  () => settings.value.watchLaterLayoutMode,
)
const { gridClass: watchLaterGridClass, gridCssVars: watchLaterGridCssVars } = useGridLayout(() => 'adaptive')
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
  keys: computed(() => currentWatchLaterList.value.map(item => item.aid)),
  columns: cardColumns,
  gap: cardGap,
  enabled: computed(() => currentWatchLaterList.value.length > CARD_WINDOW_THRESHOLD),
  estimatedHeight: computed(() => watchLaterLayoutMode.value === 'list' ? 190 : cardWidth.value * 9 / 16 + 112),
  layout: computed(() => `${watchLaterLayoutMode.value}:${settings.value.videoCardTitleFontSize}:${settings.value.videoCardAuthorFontSize}`),
  canRelease: key => !isLayoutEditing.value && pendingAction.value?.aid !== key,
})
const renderedRows = computed(() => cardWindow.ranges.value.flatMap<{ key: string, height: number | undefined, items: VideoItem[] }>(range => range.height !== undefined
  ? [{ key: `spacer:${range.start}`, height: range.height, items: [] as VideoItem[] }]
  : currentWatchLaterList.value.slice(range.start, range.end).map(item => ({ key: String(item.aid), height: undefined, items: [item] }))))
let requestGeneration = 0
let loadedAccountId: number | null = null
let watchLaterExtensionContextInvalidated = false
const actionLifetime = createAccountLifetime(getCurrentAccountId)
let appliedInvalidationVersion = topBarStore.watchLaterInvalidationVersion
watch([() => topBarStore.watchLaterInvalidationVersion, pendingAction], ([version, pending]) => {
  if (version === appliedInvalidationVersion || pending || getCurrentAccountId() === null)
    return
  appliedInvalidationVersion = version
  void initData()
})

function getCurrentAccountId(): number | null {
  const mid = Number(topBarStore.userInfo.mid)
  return topBarStore.isLogin && Number.isFinite(mid) && mid > 0 && getUserID() === String(mid) ? mid : null
}

function invalidateRequests(): number {
  isLoading.value = false
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
  void initData()
})

watch(
  [() => topBarStore.isLogin, () => topBarStore.userInfo.mid],
  () => {
    const accountId = getCurrentAccountId()
    if (accountId === loadedAccountId)
      return

    actionLifetime.invalidate()
    loadedAccountId = accountId
    void initData()
  },
)

onBeforeUnmount(() => {
  actionLifetime.dispose()
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
  watchLaterCount.value = 0
  pendingAction.value = null
  pageNum.value = 1
  if (accountId === null)
    return

  await getWatchLaterListByPage(generation, accountId)
}

async function getData(): Promise<boolean> {
  const accountId = getCurrentAccountId()
  return accountId !== null
    ? getWatchLaterListByPage(requestGeneration, accountId)
    : false
}

function retryWatchLaterRequest() {
  if (watchLaterExtensionContextInvalidated || isLoading.value)
    return
  requestFailed.value = false
  void getData()
}

async function handleWatchLaterPageRefresh() {
  if (watchLaterExtensionContextInvalidated || isLoading.value || pendingAction.value)
    return
  await initData()
}

async function handleWatchLaterReachBottom(): Promise<boolean> {
  if (watchLaterExtensionContextInvalidated || isLoading.value || noMoreContent.value || requestFailed.value || pendingAction.value)
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

  try {
    while (!noMoreContent.value) {
      const requestedPage = pageNum.value
      const res: WatchLaterResult = await api.watchlater.getWatchLaterListByPage({
        pn: requestedPage,
        ps: pageSize.value,
      })

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
      if (requestedPage === 1)
        watchLaterCount.value = payload.count

      const previousListLength = currentWatchLaterList.value.length
      const mergedList = mergeWatchLaterItemsByAid(currentWatchLaterList.value, list)
      const madeProgress = mergedList.length > previousListLength
      currentWatchLaterList.value = mergedList
      requestFailed.value = false
      pageNum.value = requestedPage + 1
      noMoreContent.value = payload.list.length < pageSize.value
        || mergedList.length >= payload.count
        || !madeProgress

      if (noMoreContent.value)
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
  }

  return true
}

async function deleteWatchLaterItem(aid: number): Promise<boolean> {
  const accountId = getCurrentAccountId()
  if (watchLaterExtensionContextInvalidated || !accountId || pendingAction.value)
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
      watchLaterCount.value = Math.max(0, watchLaterCount.value - 1)
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
  if (watchLaterExtensionContextInvalidated)
    return

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
      if (res.code === 0 && isCurrentRequest(generation, accountId)) {
        currentWatchLaterList.value = []
        watchLaterCount.value = 0
        await topBarStore.commitWatchLaterClear(accountId)
        if (isCurrentRequest(generation, accountId))
          await initData()
      }
    }
    catch (error) {
      if (!settleExtensionContextInvalidation(error))
        console.error('[WatchLater] Failed to clear list:', error)
    }
    finally {
      if (generation === requestGeneration)
        isLoading.value = false
    }
  }
}

async function handleRemoveWatchedVideos() {
  if (watchLaterExtensionContextInvalidated)
    return

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
      if (res.code === 0 && isCurrentRequest(generation, accountId)) {
        await topBarStore.invalidateWatchLaterMembership(accountId)
        if (isCurrentRequest(generation, accountId))
          await initData()
      }
    }
    catch (error) {
      if (!settleExtensionContextInvalidation(error))
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
      <header flex="~ col items-start" gap-4 mb-6>
        <h3 class="bew-page-heading" text="$bew-text-1">
          {{ t('watch_later.title') }} ({{ watchLaterCount }})
        </h3>
        <Button type="secondary" @click="showOpenTabsDialog = true">
          {{ $t('watch_later.open_tabs.title') }}
        </Button>
      </header>
      <Empty v-if="requestFailed && !isLoading && currentWatchLaterList.length === 0" :description="$t('common.load_failed')">
        <Button type="primary" @click="retryWatchLaterRequest">
          {{ $t('common.operation.refresh') }}
        </Button>
      </Empty>
      <Empty v-else-if="watchLaterCount === 0 && !isLoading" />
      <template v-else>
        <VideoListSkeleton
          v-if="isLoading && currentWatchLaterList.length === 0 && watchLaterLayoutMode === 'list'"
          :count="5"
          :action-count="3"
        />
        <!-- watcher later list -->
        <div v-else-if="watchLaterLayoutMode === 'list'" ref="cardContainer">
          <template v-for="row in renderedRows" :key="row.key">
            <div v-if="row.height !== undefined" :style="{ height: `${row.height}px` }" aria-hidden="true" />
            <div
              v-for="item in row.items"
              :key="item.aid"
              :ref="element => cardWindow.setElement(item.aid, element)"
              class="watch-later-list-card group"
              flex cursor-pointer
            >
              <ALink
                class="watch-later-list-card__overlay"
                :href="getWatchLaterPlaybackUrl(item)"
                type="videoCard"
                :aria-label="item.title"
              />
              <section
                class="watch-later-list-card__content"
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
                    v-if="item.pic"
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
                    <ALink
                      class="watch-later-list-card__action keep-two-lines"
                      :href="getWatchLaterPlaybackUrl(item)"
                      type="videoCard"
                      overflow="hidden"
                      un-text="lg overflow-ellipsis"
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
                      rounded="$bew-radius"
                      hover:color="$bew-theme-color"
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
                        class="watch-later-list-card__action"
                        :label="t('watch_later.play_video')"
                        :disabled="isItemActionPending() || !getWatchLaterPlaybackUrl(item)"
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
                        class="watch-later-list-card__action"
                        :label="t('watch_later.play_in_watch_later')"
                        :disabled="isItemActionPending() || !getWatchLaterPlaybackUrl(item)"
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
                        class="watch-later-list-card__action"
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
            </div>
          </template>
        </div>

        <div v-else class="watch-later-grid-root">
          <div
            ref="cardContainer"
            class="watch-later-grid"
            :class="watchLaterGridClass"
            :style="watchLaterGridCssVars"
          >
            <template v-for="row in renderedRows" :key="row.key">
              <div v-if="row.height !== undefined" :style="{ height: `${row.height}px`, gridColumn: '1 / -1' }" aria-hidden="true" />
              <div v-for="item in row.items" :key="item.aid" :ref="element => cardWindow.setElement(item.aid, element)" class="watch-later-grid-slot">
                <WatchLaterGridCard
                  :key="item.aid"
                  :item="item"
                  :disabled="isItemActionPending()"
                  @play-and-remove="playAndRemove"
                  @play-in-watch-later="playInWatchLater"
                  @remove="remove"
                />
              </div>
            </template>
            <article
              v-for="index in (isLoading ? (currentWatchLaterList.length === 0 ? 8 : 4) : 0)"
              :key="`watch-later-grid-skeleton-${index}`"
              class="watch-later-grid-skeleton"
              aria-hidden="true"
            >
              <SkeletonBlock class="watch-later-grid-skeleton__media" height="auto" radius="media" />
              <div class="watch-later-grid-skeleton__body">
                <div class="watch-later-grid-skeleton__title">
                  <SkeletonBlock height="var(--bew-font-size-title)" />
                  <SkeletonBlock width="82%" height="var(--bew-font-size-title)" />
                </div>
                <div class="watch-later-grid-skeleton__author">
                  <SkeletonBlock width="var(--bew-space-6)" height="var(--bew-space-6)" radius="circle" />
                  <SkeletonBlock width="104px" height="var(--bew-line-height-control)" />
                </div>
              </div>
            </article>
          </div>
        </div>

        <VideoListSkeleton
          v-if="isLoading && currentWatchLaterList.length !== 0 && !noMoreContent && watchLaterLayoutMode === 'list'"
          :count="2"
          :action-count="3"
        />
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
      <CoverSidebarSurface
        :cover="currentWatchLaterList[0]?.pic ? removeHttpFromUrl(`${currentWatchLaterList[0].pic}@480w_270h_1c`) : ''"
        pos="sticky top-120px"
        w-full h="230px md:[calc(100vh-160px)]"
        my-10
        rounded="$bew-radius"
        overflow-hidden
      >
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
            rounded="$bew-radius" style="box-shadow: var(--bew-sidebar-media-shadow)"
            aspect-video mb-4 bg="$bew-skeleton"
          >
            <img
              v-if="currentWatchLaterList[0]" :src="removeHttpFromUrl(`${currentWatchLaterList[0].pic}@480w_270h_1c`)"
              rounded="$bew-radius" aspect-video w-full
            >
          </picture>

          <h3 class="bew-page-heading" style="color: var(--bew-sidebar-text); text-shadow: var(--bew-sidebar-text-shadow)">
            {{ t('watch_later.title') }} ({{ watchLaterCount }})
          </h3>
          <div v-if="watchLaterCount > 0" flex="~ col" gap-2 w-full>
            <Button
              class="bew-cover-sidebar__action" type="primary" block
              @click="handlePlayAll"
            >
              <template #left>
                <div i-tabler:player-play />
              </template>
              {{ t('common.play_all') }}
            </Button>
            <Button
              class="bew-cover-sidebar__action" block
              @click="handleClearAllWatchLater"
            >
              <template #left>
                <div i-tabler:trash />
              </template>
              {{ t('watch_later.clear_all') }}
            </Button>
            <Button
              class="bew-cover-sidebar__action" block
              @click="handleRemoveWatchedVideos"
            >
              <template #left>
                <div i-tabler:circle-minus />
              </template>
              {{ t('watch_later.remove_watched_videos') }}
            </Button>
          </div>
        </main>
      </CoverSidebarSurface>
    </aside>
    <OpenTabsDialog v-if="showOpenTabsDialog" @close="showOpenTabsDialog = false" />
  </div>
  <Empty v-else mt-6 :description="t('common.please_log_in_first')">
    <Button type="primary" @click="jumpToLoginPage()">
      {{ $t('common.login') }}
    </Button>
  </Empty>
</template>

<style lang="scss" scoped>
.watch-later-grid-slot {
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
  width: 100% !important;
  aspect-ratio: 16 / 9;
}

.watch-later-grid-skeleton__author {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.watch-later-grid-skeleton__body {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.watch-later-grid-skeleton__title {
  display: grid;
  grid-template-rows: repeat(2, var(--bew-line-height-title));
  align-items: center;
}
</style>
