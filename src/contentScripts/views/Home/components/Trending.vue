<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import type { GridLayoutType } from '~/logic'
import type { List as VideoItem, TrendingResult } from '~/models/video/trending'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { reportRuntimeFailure } from '~/utils/messaging'

interface VideoElement {
  uniqueId: string
  item?: VideoItem
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
const pn = tabState.ref<number>('pn', 1)
const noMoreContent = tabState.ref<boolean>('noMoreContent', false)
const requestFailed = tabState.ref('requestFailed', false)
let requestGeneration = 0
const { handleReachBottom, handlePageRefresh } = useBewlyApp()

onMounted(() => {
  initPageAction()
  if (!tabState.restored)
    void initData()
  else if (!hasSettled.value)
    void getData(requestGeneration)
})

async function initData() {
  if (!tabState.isCurrent())
    return
  hasSettled.value = false
  const generation = ++requestGeneration
  noMoreContent.value = false
  requestFailed.value = false
  videoList.value = []
  pn.value = 1
  await getData(generation)
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformTrendingVideo(item: VideoElement): Video | undefined {
  if (!item.item)
    return undefined

  const videoItem = item.item
  return {
    id: Number(videoItem.aid),
    aid: videoItem.aid,
    duration: videoItem.duration,
    title: decodeHtmlEntities(videoItem.title),
    desc: decodeHtmlEntities(videoItem.desc),
    cover: videoItem.pic,
    author: {
      name: decodeHtmlEntities(videoItem.owner.name),
      authorFace: videoItem.owner.face,
      mid: videoItem.owner.mid,
    },
    view: typeof videoItem.stat.view === 'number' ? videoItem.stat.view : Number(videoItem.stat.view),
    danmaku: typeof videoItem.stat.danmaku === 'number' ? videoItem.stat.danmaku : Number(videoItem.stat.danmaku),
    like: typeof videoItem.stat.like === 'number' ? videoItem.stat.like : Number(videoItem.stat.like),
    likeStr: typeof videoItem.stat.like_str === 'string'
      ? videoItem.stat.like_str
      : String(videoItem.stat.like),
    publishedTimestamp: videoItem.pubdate,
    bvid: videoItem.bvid,
    displayTags: [decodeHtmlEntities(videoItem.rcmd_reason.content)].filter(Boolean),
    cid: videoItem.cid,
    threePointV2: [],
  }
}

async function getData(generation: number) {
  emit('beforeLoading')
  isLoading.value = true
  try {
    await getTrendingVideos(generation)
  }
  finally {
    if (tabState.isCurrent() && generation === requestGeneration) {
      hasSettled.value = true
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

function initPageAction() {
  if (!tabState.isCurrent())
    return
  handleReachBottom.value = async () => {
    if (!isLoading.value && !noMoreContent.value)
      handleLoadMore()
  }

  handlePageRefresh.value = async () => {
    initData()
  }
}

async function getTrendingVideos(generation: number) {
  if (noMoreContent.value)
    return

  try {
    const page = pn.value
    const response: TrendingResult = await api.video.getPopularVideos({
      pn: page,
      ps: 30,
    })

    if (!tabState.isCurrent() || generation !== requestGeneration)
      return

    if (response.code !== 0 || !Array.isArray(response.data?.list))
      throw new Error(response.message || 'Popular videos request failed')

    const newItems = response.data.list.map((item: VideoItem) => ({
      uniqueId: `${item.aid}`,
      item,
      displayData: transformTrendingVideo({ uniqueId: `${item.aid}`, item }),
    }))

    const existingIds = new Set(videoList.value.map(item => item.uniqueId))
    videoList.value.push(...newItems.filter((item) => {
      if (existingIds.has(item.uniqueId))
        return false
      existingIds.add(item.uniqueId)
      return true
    }))
    pn.value = page + 1
    noMoreContent.value = response.data.no_more
    requestFailed.value = false

    // 初次加载且数据不足时继续加载
    if (newItems.length > 0 && videoList.value.length < 30 && !noMoreContent.value) {
      await getTrendingVideos(generation)
    }
  }
  catch (error) {
    if (tabState.isCurrent() && generation === requestGeneration) {
      requestFailed.value = true
      reportRuntimeFailure('Failed to load popular videos', error)
    }
  }
}

function retryTrendingRequest() {
  if (isLoading.value)
    return
  if (requestFailed.value) {
    requestFailed.value = false
    void getData(requestGeneration)
  }
  else {
    void initData()
  }
}

// 供 VideoCardGrid 预加载调用的函数
async function handleLoadMore() {
  if (isLoading.value || noMoreContent.value || requestFailed.value)
    return

  const generation = requestGeneration
  isLoading.value = true
  try {
    await getTrendingVideos(generation)
  }
  finally {
    if (tabState.isCurrent() && generation === requestGeneration)
      isLoading.value = false
  }
}

defineExpose({ initData })

onScopeDispose(() => {
  requestGeneration++
})
</script>

<template>
  <VideoCardGrid
    :items="videoList"
    :grid-layout="gridLayout"
    :loading="isLoading"
    :no-more-content="noMoreContent"
    :request-failed="requestFailed"
    :transform-item="(item: VideoElement) => item.displayData"
    :get-item-key="(item: VideoElement) => item.uniqueId"
    show-preview
    @refresh="retryTrendingRequest"
    @load-more="handleLoadMore"
  />
</template>
