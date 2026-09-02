<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
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

const videoList = ref<VideoElement[]>([])
const isLoading = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const page = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const requestFailed = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh } = useBewlyApp()
let requestGeneration = 0
let loadedAccountId = parseDedeUserID(document.cookie) ?? null
let reloadAfterActivation = false

function isCurrentRequest(generation: number, accountId: number | null) {
  return generation === requestGeneration
    && accountId === loadedAccountId
    && accountId === (parseDedeUserID(document.cookie) ?? null)
}

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  const accountId = parseDedeUserID(document.cookie) ?? null
  if (reloadAfterActivation || accountId !== loadedAccountId) {
    reloadAfterActivation = false
    void initData()
  }
  initPageAction()
})

onDeactivated(() => {
  reloadAfterActivation = isLoading.value
  requestGeneration++
  isLoading.value = false
})

onUnmounted(() => {
  requestGeneration++
})

function initPageAction() {
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
