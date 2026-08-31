<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { getUserID } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'

interface VideoElement {
  uniqueId: string
  item?: MomentItem
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
const offset = ref<string>('')
const updateBaseline = ref<string>('')
const noMoreContent = ref<boolean>(false)
const requestFailed = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh } = useBewlyApp()
const topBarStore = useTopBarStore()
let requestGeneration = 0
let reloadAfterActivation = false
let componentActive = false

function getSubscribedSeriesAccountId() {
  return String(topBarStore.userInfo.mid || getUserID() || 0)
}

function isSubscribedSeriesRequestCurrent(generation: number, requestAccountId: string) {
  return generation === requestGeneration && requestAccountId === getSubscribedSeriesAccountId()
}

onMounted(() => {
  componentActive = true
  initData()
  initPageAction()
})

onActivated(() => {
  componentActive = true
  if (reloadAfterActivation) {
    reloadAfterActivation = false
    void initData()
  }
  initPageAction()
})

onDeactivated(() => {
  componentActive = false
  reloadAfterActivation = isLoading.value
  requestGeneration++
  if (isLoading.value)
    emit('afterLoading')
  isLoading.value = false
})

onUnmounted(() => {
  componentActive = false
  requestGeneration++
})

watch(() => topBarStore.userInfo.mid, () => {
  if (componentActive)
    void initData()
})

async function initData() {
  const generation = ++requestGeneration
  const requestAccountId = getSubscribedSeriesAccountId()
  needToLoginFirst.value = false
  offset.value = ''
  updateBaseline.value = ''
  videoList.value = []
  noMoreContent.value = false
  requestFailed.value = false

  await getData(generation, requestAccountId)
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformSubscribedSeriesVideo(item: VideoElement): Video | undefined {
  if (!item.item)
    return undefined

  const momentItem = item.item
  return {
    id: momentItem.modules.module_author.mid,
    title: decodeHtmlEntities(`${momentItem.modules.module_dynamic.major.pgc?.title}`),
    cover: `${momentItem.modules.module_dynamic.major.pgc?.cover}`,
    author: {
      name: decodeHtmlEntities(momentItem.modules.module_author.name),
      authorUrl: momentItem.modules.module_author.jump_url,
      authorFace: momentItem.modules.module_author.face,
      mid: momentItem.modules.module_author.mid,
    },
    viewStr: momentItem.modules.module_dynamic.major.pgc?.stat.play,
    danmakuStr: momentItem.modules.module_dynamic.major.pgc?.stat.danmaku,
    likeStr: momentItem.modules.module_dynamic.major.pgc?.stat.like,
    capsuleText: decodeHtmlEntities(momentItem.modules.module_author.pub_time),
    epid: momentItem.modules.module_dynamic.major.pgc?.epid,
    threePointV2: [],
  }
}

async function getData(generation: number, requestAccountId: string) {
  emit('beforeLoading')
  isLoading.value = true

  try {
    // 初次加载时多加载几批确保有足够内容
    for (let i = 0; i < 3 && !noMoreContent.value; i++) {
      if (!await getSubscribedSeriesVideos(generation, requestAccountId))
        break
    }
  }
  finally {
    if (isSubscribedSeriesRequestCurrent(generation, requestAccountId)) {
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

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

async function getSubscribedSeriesVideos(
  generation = requestGeneration,
  requestAccountId = getSubscribedSeriesAccountId(),
) {
  if (!isSubscribedSeriesRequestCurrent(generation, requestAccountId))
    return false
  if (noMoreContent.value)
    return true

  if (offset.value === '0') {
    noMoreContent.value = true
    return true
  }

  try {
    const response: MomentResult = await api.moment.getMoments({
      type: 'pgc',
      offset: offset.value || undefined,
      update_baseline: updateBaseline.value,
    })

    if (!isSubscribedSeriesRequestCurrent(generation, requestAccountId))
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
      offset.value = response.data.offset
      updateBaseline.value = response.data.update_baseline

      const items = Array.isArray(response.data?.items) ? response.data.items : []
      const newItems = items.map((item: MomentItem) => ({
        uniqueId: `${item.id_str}`,
        item,
        displayData: transformSubscribedSeriesVideo({ uniqueId: `${item.id_str}`, item }),
      }))

      videoList.value = [...videoList.value, ...newItems]
      if (items.length === 0)
        noMoreContent.value = true
      return true
    }
    requestFailed.value = true
    noMoreContent.value = false
    return false
  }
  catch (error) {
    if (isSubscribedSeriesRequestCurrent(generation, requestAccountId)) {
      requestFailed.value = true
      noMoreContent.value = false
      reportRuntimeFailure('Failed to load subscribed series', error)
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
  const requestAccountId = getSubscribedSeriesAccountId()
  try {
    await getSubscribedSeriesVideos(generation, requestAccountId)
  }
  finally {
    if (isSubscribedSeriesRequestCurrent(generation, requestAccountId))
      isLoading.value = false
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
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
      :need-to-login-first="needToLoginFirst"
      :transform-item="(item: VideoElement) => item.displayData"
      :get-item-key="(item: VideoElement) => item.uniqueId"
      video-type="bangumi"
      :show-watch-later="true"
      @refresh="initData"
      @login="jumpToLoginPage"
      @load-more="handleLoadMore"
    />
  </div>
</template>
