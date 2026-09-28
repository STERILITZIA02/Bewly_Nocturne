<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import type { GridLayoutType } from '~/logic'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveCookieMatchedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { getUserID } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'

interface VideoElement {
  uniqueId: string
  item?: MomentItem
  displayData?: Video
}

interface SeriesGroup {
  key: string
  seasonId?: number
  latest: VideoElement
  updates: VideoElement[]
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
// Server order defines the latest update; only an authoritative season ID joins
// entries. Trailers and extras remain available with their original titles.
const seriesGroups = computed(() => groupSeriesUpdates(videoList.value))

function groupSeriesUpdates(items: VideoElement[]): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>()
  for (const entry of items) {
    const id = entry.item?.modules.module_dynamic.major.pgc?.season_id
    const seasonId = typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : undefined
    const key = seasonId ? `season:${seasonId}` : `update:${entry.uniqueId}`
    const group = groups.get(key)
    if (group)
      group.updates.push(entry)
    else
      groups.set(key, { key, seasonId, latest: entry, updates: [entry] })
  }
  return [...groups.values()]
}

function getUpdateHref(entry: VideoElement): string | undefined {
  const episodeId = entry.displayData?.epid
  return episodeId ? `https://www.bilibili.com/bangumi/play/ep${episodeId}` : undefined
}
const isLoading = ref<boolean>(false)
const needToLoginFirst = tabState.ref<boolean>('needToLoginFirst', false)
const offset = tabState.ref<string>('offset', '')
const updateBaseline = tabState.ref<string>('updateBaseline', '')
const noMoreContent = tabState.ref<boolean>('noMoreContent', false)
const requestFailed = tabState.ref<boolean>('requestFailed', false)
const { handleReachBottom, handlePageRefresh } = useBewlyApp()
const topBarStore = useTopBarStore()
let requestGeneration = 0
let componentActive = false

function getSubscribedSeriesAccountId() {
  return resolveCookieMatchedAccountId(topBarStore.userInfo.mid, getUserID())
}

function isSubscribedSeriesRequestCurrent(generation: number, requestAccountId: ReturnType<typeof getSubscribedSeriesAccountId>) {
  return tabState.isCurrent() && generation === requestGeneration && requestAccountId !== undefined && requestAccountId === getSubscribedSeriesAccountId()
}

onMounted(() => {
  componentActive = true
  initPageAction()
  if (!tabState.restored)
    void initData()
  else if (!hasSettled.value)
    void getData(requestGeneration, getSubscribedSeriesAccountId())
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
  if (!tabState.isCurrent())
    return
  hasSettled.value = false
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

async function getData(generation: number, requestAccountId: ReturnType<typeof getSubscribedSeriesAccountId>) {
  if (!isSubscribedSeriesRequestCurrent(generation, requestAccountId))
    return
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
      const previousOffset = offset.value
      offset.value = response.data.offset
      updateBaseline.value = response.data.update_baseline

      const items = Array.isArray(response.data?.items) ? response.data.items : []
      const knownIds = new Set(videoList.value.map(item => item.uniqueId))
      const newItems = items.filter((item) => {
        if (knownIds.has(item.id_str))
          return false
        knownIds.add(item.id_str)
        return true
      }).map((item: MomentItem) => ({
        uniqueId: `${item.id_str}`,
        item,
        displayData: transformSubscribedSeriesVideo({ uniqueId: `${item.id_str}`, item }),
      }))

      videoList.value = [...videoList.value, ...newItems]
      noMoreContent.value = !response.data.has_more || items.length === 0 || !offset.value
        || offset.value === '0' || offset.value === previousOffset
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
    if (tabState.isCurrent() && generation === requestGeneration)
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
      :items="seriesGroups"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      :request-failed="requestFailed"
      :need-to-login-first="needToLoginFirst"
      :transform-item="(group: SeriesGroup) => group.latest.displayData"
      :get-item-key="(group: SeriesGroup) => `${group.key}:${group.latest.uniqueId}`"
      video-type="bangumi"
      :show-watch-later="true"
      @refresh="initData"
      @login="jumpToLoginPage"
      @load-more="handleLoadMore"
    >
      <template #afterCard="{ item: group }">
        <div v-if="group.seasonId || group.updates.length > 1" class="series-group-actions">
          <ALink v-if="group.seasonId" :href="`https://www.bilibili.com/bangumi/play/ss${group.seasonId}`" type="videoCard" class="series-open">
            {{ $t('home.series.open') }}
            <i i-mingcute:arrow-right-line aria-hidden="true" />
          </ALink>
          <details v-if="group.updates.length > 1" class="series-updates">
            <summary>{{ $t('home.series.more_updates', { count: group.updates.length - 1 }) }}</summary>
            <div class="series-updates-list">
              <template v-for="update in group.updates.slice(1)" :key="update.uniqueId">
                <ALink v-if="getUpdateHref(update)" :href="getUpdateHref(update)" type="videoCard" class="series-update-link">
                  <span>{{ update.displayData?.title }}</span>
                  <span class="series-update-time">{{ update.displayData?.capsuleText }}</span>
                </ALink>
              </template>
            </div>
          </details>
        </div>
      </template>
    </VideoCardGrid>
  </div>
</template>

<style scoped lang="scss">
.series-group-actions {
  align-self: start;
  display: grid;
  gap: var(--bew-space-1);
  padding: var(--bew-space-2) var(--bew-space-2) 0;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.series-open {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--bew-control-height);
  padding-inline: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-foreground);
  font-weight: var(--bew-font-weight-medium);
  &:hover {
    background: var(--bew-fill-1);
  }
}
.series-updates {
  summary {
    min-height: var(--bew-control-height);
    padding: var(--bew-space-2);
    border-radius: var(--bew-interactive-radius);
    color: var(--bew-text-2);
    cursor: pointer;
    &:hover {
      background: var(--bew-fill-1);
    }
  }
}
.series-updates-list {
  max-height: calc(var(--bew-space-12) * 5);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.series-update-link {
  display: grid;
  gap: var(--bew-space-1);
  padding: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  overflow-wrap: anywhere;
  color: var(--bew-text-1);
  &:hover {
    background: var(--bew-fill-1);
  }
}
.series-update-time {
  color: var(--bew-text-2);
}
</style>
