<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import type { PreciousItem, PreciousResult } from '~/models/video/precious'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

interface VideoElement {
  uniqueId: string
  item?: PreciousItem
  displayData?: Video
}

defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const videoList = ref<VideoElement[]>([])
const isLoading = ref<boolean>(false)
const noMoreContent = ref<boolean>(true) // 入站必刷没有分页
const requestFailed = ref<boolean>(false)
const { handlePageRefresh } = useBewlyApp()
let requestGeneration = 0
let reloadAfterActivation = false

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  if (reloadAfterActivation) {
    reloadAfterActivation = false
    void initData()
  }
  initPageAction()
})

onDeactivated(() => {
  reloadAfterActivation = isLoading.value
  requestGeneration++
  if (isLoading.value)
    emit('afterLoading')
  isLoading.value = false
})

onUnmounted(() => {
  requestGeneration++
})

async function initData() {
  const generation = ++requestGeneration
  videoList.value = []
  requestFailed.value = false
  await getData(generation)
}

async function getData(generation: number) {
  emit('beforeLoading')
  isLoading.value = true
  try {
    await getPreciousVideos(generation)
  }
  finally {
    if (generation === requestGeneration) {
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

function initPageAction() {
  handlePageRefresh.value = async () => {
    initData()
  }
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformPreciousVideo(item: PreciousItem): Video {
  return {
    id: Number(item.aid),
    aid: item.aid,
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    desc: decodeHtmlEntities(item.desc),
    cover: item.pic,
    author: item.owner
      ? {
          name: decodeHtmlEntities(item.owner.name),
          authorFace: item.owner.face,
          mid: item.owner.mid,
        }
      : undefined,
    view: item.stat?.view,
    danmaku: item.stat?.danmaku,
    like: item.stat?.like,
    likeStr: item.stat?.like_str ?? item.stat?.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    cid: item.cid,
    threePointV2: [],
  }
}

async function getPreciousVideos(generation: number) {
  try {
    const response: PreciousResult = await api.ranking.getPreciousVideos()

    if (generation !== requestGeneration)
      return

    if (response.code === 0) {
      requestFailed.value = false
      const list = Array.isArray(response.data?.list) ? response.data.list : []
      videoList.value = list.map(item => ({
        uniqueId: `${item.aid}`,
        item,
        displayData: transformPreciousVideo(item),
      }))
    }
    else {
      requestFailed.value = true
    }
  }
  catch (error) {
    if (generation === requestGeneration) {
      requestFailed.value = true
      console.error('[Precious] Failed to load videos:', error)
    }
  }
  finally {
    if (generation === requestGeneration)
      videoList.value = videoList.value.filter(video => video.item)
  }
}

defineExpose({ initData })
</script>

<template>
  <div>
    <VideoCardGrid
      :items="videoList"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      :request-failed="requestFailed"
      :transform-item="(item: VideoElement) => item.displayData"
      :get-item-key="(item: VideoElement) => item.uniqueId"
      :is-skeleton-item="(item: VideoElement) => !item.item"
      show-preview
      @refresh="initData"
      @load-more="() => {}"
    />
  </div>
</template>
