<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import type { GridLayoutType } from '~/logic'
import { parseDedeUserID } from '~/logic/loginStatus'
import type { FollowingLiveResult, List as FollowingLiveItem } from '~/models/live/getFollowingLiveList'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

interface VideoElement {
  uniqueId: string
  item?: FollowingLiveItem
  displayData?: Video
}

const { gridLayout } = defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const tabState = useHomeTabState()
const hasSettled = tabState.ref('hasSettled', false)
const videoList = tabState.ref<VideoElement[]>('videoList', [])
const isLoading = ref<boolean>(false)
const needToLoginFirst = tabState.ref<boolean>('needToLoginFirst', false)
const page = tabState.ref<number>('page', 1)
const noMoreContent = tabState.ref<boolean>('noMoreContent', false)
const requestFailed = tabState.ref<boolean>('requestFailed', false)
const { handleReachBottom, handlePageRefresh } = useBewlyApp()
let requestGeneration = 0
let loadedAccountId = parseDedeUserID(document.cookie) ?? null

function isCurrentRequest(generation: number, accountId: number | null) {
  return tabState.isCurrent() && generation === requestGeneration
    && accountId === loadedAccountId
    && accountId === (parseDedeUserID(document.cookie) ?? null)
}

onMounted(() => {
  initPageAction()
  if (!tabState.restored)
    void initData()
  else if (!hasSettled.value)
    void getData(requestGeneration, loadedAccountId)
})

onUnmounted(() => {
  requestGeneration++
})

function initPageAction() {
  if (!tabState.isCurrent())
    return
  handleReachBottom.value = async () => {
    if (isLoading.value)
      return
    if (noMoreContent.value)
      return

    handleLoadMore()
  }
  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    initData()
  }
}

async function initData() {
  if (!tabState.isCurrent())
    return
  hasSettled.value = false
  const generation = ++requestGeneration
  loadedAccountId = parseDedeUserID(document.cookie) ?? null
  const accountId = loadedAccountId
  needToLoginFirst.value = false
  page.value = 1
  videoList.value = []
  noMoreContent.value = false
  requestFailed.value = false

  if (accountId === null) {
    needToLoginFirst.value = true
    return
  }

  await getData(generation, accountId)
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformLiveVideo(item: VideoElement): Video | undefined {
  if (!item.item)
    return undefined

  const liveItem = item.item
  return {
    id: liveItem.roomid,
    title: decodeHtmlEntities(liveItem.title),
    cover: liveItem.room_cover,
    author: {
      name: decodeHtmlEntities(liveItem.uname),
      authorFace: liveItem.face,
      mid: liveItem.uid,
    },
    viewStr: liveItem.text_small,
    displayTags: [decodeHtmlEntities(liveItem.area_name_v2)].filter(Boolean),
    roomid: liveItem.roomid,
    liveStatus: liveItem.live_status,
    threePointV2: [],
  }
}

async function getData(generation = requestGeneration, accountId = loadedAccountId) {
  if (!isCurrentRequest(generation, accountId))
    return
  emit('beforeLoading')
  isLoading.value = true

  try {
    // 初次加载时多加载几批确保有足够内容
    for (let i = 0; i < 3 && !noMoreContent.value; i++) {
      if (!await getLiveVideos(generation, accountId))
        break
    }
  }
  finally {
    if (isCurrentRequest(generation, accountId)) {
      hasSettled.value = true
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

async function getLiveVideos(generation = requestGeneration, accountId = loadedAccountId) {
  if (!isCurrentRequest(generation, accountId))
    return false
  if (noMoreContent.value)
    return true

  try {
    const response: FollowingLiveResult = await api.live.getFollowingLiveList({
      page: page.value,
      page_size: 9,
    })

    if (!isCurrentRequest(generation, accountId))
      return false

    if (response.code === -101) {
      noMoreContent.value = false
      needToLoginFirst.value = true
      requestFailed.value = false
      return false
    }

    if (response.code === 0) {
      needToLoginFirst.value = false
      requestFailed.value = false
      const list = Array.isArray(response.data?.list) ? response.data.list : []
      if (list.length < 9)
        noMoreContent.value = true

      page.value++

      const newItems = list.map((item: FollowingLiveItem) => ({
        uniqueId: `${item.roomid}`,
        item,
        displayData: transformLiveVideo({ uniqueId: `${item.roomid}`, item }),
      }))

      videoList.value = [...videoList.value, ...newItems]
      return true
    }
    requestFailed.value = true
    noMoreContent.value = false
    return false
  }
  catch (error) {
    if (isCurrentRequest(generation, accountId)) {
      requestFailed.value = true
      noMoreContent.value = false
      console.error('[Live] Failed to load followed live rooms:', error)
    }
    return false
  }
}

// 供 VideoCardGrid 预加载调用的函数
async function handleLoadMore() {
  if (isLoading.value || noMoreContent.value)
    return

  isLoading.value = true
  const generation = requestGeneration
  const accountId = loadedAccountId
  try {
    await getLiveVideos(generation, accountId)
  }
  finally {
    if (isCurrentRequest(generation, accountId))
      isLoading.value = false
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

defineExpose({ initData })
</script>

<template>
  <VideoCardGrid
    :items="videoList"
    :grid-layout="gridLayout"
    :loading="isLoading"
    :no-more-content="noMoreContent"
    :request-failed="requestFailed"
    :need-to-login-first="needToLoginFirst"
    :transform-item="(item: VideoElement) => item.displayData"
    :get-item-key="(item: VideoElement) => item.uniqueId"
    :show-watch-later="false"
    show-preview
    @refresh="initData"
    @login="jumpToLoginPage"
    @load-more="handleLoadMore"
  />
</template>
