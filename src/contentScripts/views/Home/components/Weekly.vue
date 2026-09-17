<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useFloatingMenuPosition } from '~/composables/useFloatingMenuPosition'
import { useHomeTabState } from '~/composables/useHomeTabState'
import { HOME_SEARCH_STAGE_HEIGHT } from '~/constants/layout'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { PopularSeriesItem, PopularSeriesListResult, PopularSeriesOneResult, PopularSeriesVideoItem } from '~/models/video/popularSeries'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { reportRuntimeFailure } from '~/utils/messaging'

interface VideoElement extends PopularSeriesVideoItem {
  displayData?: Video
}

defineProps<{
  gridLayout: GridLayoutType
  topBarVisibility: boolean
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const { handleBackToTop, handlePageRefresh, mainAppRef, scrollViewportRef } = useBewlyApp()

const tabState = useHomeTabState()
const hasSettled = tabState.ref('hasSettled', false)
const isLoading = ref<boolean>(true)

const seriesList = tabState.ref<PopularSeriesItem[]>('seriesList', [])
const activatedSeries = tabState.ref<PopularSeriesItem | null>('activatedSeries', null)
const videoList = tabState.ref<VideoElement[]>('videoList', [])
const noMoreContent = tabState.ref<boolean>('noMoreContent', true) // 每周必看没有分页
const requestFailed = tabState.ref('requestFailed', false)
let requestGeneration = 0

// 下拉选择器相关
const searchQuery = tabState.ref<string>('searchQuery', '')
const showDropdown = ref<boolean>(false)
const containerRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const dropdownId = `weekly-series-${getCurrentInstance()?.uid}`
const { position: dropdownPosition, start, stop, scheduleUpdate } = useFloatingMenuPosition(containerRef, dropdownRef, 400)
onClickOutside(dropdownRef, () => closeDropdown(), { ignore: [containerRef] })

const filteredSeriesList = computed(() => {
  if (!searchQuery.value.trim()) {
    return seriesList.value
  }
  const query = searchQuery.value.toLowerCase()
  return seriesList.value.filter(item =>
    (item.name || `第${item.number}期`).toLowerCase().includes(query)
    || String(item.number).includes(query),
  )
})

function openDropdown() {
  start()
  showDropdown.value = true
  void nextTick(() => {
    if (!showDropdown.value)
      return
    scheduleUpdate()
    searchInputRef.value?.focus({ preventScroll: true })
  })
}

function handleDropdownKeydown(event: KeyboardEvent) {
  const options = Array.from(dropdownRef.value?.querySelectorAll<HTMLButtonElement>('.series-item') ?? [])
  const index = options.indexOf(event.target as HTMLButtonElement)
  let nextIndex: number
  if (event.key === 'ArrowDown')
    nextIndex = (index + 1) % options.length
  else if (event.key === 'ArrowUp')
    nextIndex = (Math.max(0, index) - 1 + options.length) % options.length
  else if (index >= 0 && event.key === 'Home')
    nextIndex = 0
  else if (index >= 0 && event.key === 'End')
    nextIndex = options.length - 1
  else
    return
  event.preventDefault()
  options[nextIndex]?.focus()
}

function handleDropdownFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && dropdownRef.value?.contains(event.relatedTarget))
    return
  closeDropdown()
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformWeeklyVideo(item: PopularSeriesVideoItem, rank: number): Video {
  return {
    id: Number(item.aid),
    aid: item.aid,
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    desc: decodeHtmlEntities(item.desc),
    cover: item.pic,
    author: {
      name: decodeHtmlEntities(item.owner?.name),
      authorFace: item.owner?.face,
      mid: item.owner?.mid,
    },
    view: item.stat?.view,
    danmaku: item.stat?.danmaku,
    like: item.stat?.like,
    likeStr: item.stat?.like_str ?? item.stat?.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    cid: item.cid,
    rank,
    threePointV2: [],
  }
}

onMounted(() => {
  isLoading.value = false
  if (!tabState.restored) {
    void initData()
  }
  else if (!hasSettled.value) {
    if (activatedSeries.value)
      void getSeriesOne()
    else
      void initData()
  }
  initPageAction()
})

onBeforeUnmount(() => {
  requestGeneration++
  showDropdown.value = false
})

function initPageAction() {
  if (!tabState.isCurrent())
    return
  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return
    await initData()
  }
}

async function initData() {
  if (!tabState.isCurrent())
    return
  hasSettled.value = false
  const generation = ++requestGeneration
  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false
  videoList.value.length = 0
  seriesList.value.length = 0
  activatedSeries.value = null

  try {
    const res: PopularSeriesListResult = await api.ranking.getPopularSeriesList()
    if (!tabState.isCurrent() || generation !== requestGeneration)
      return
    if (res?.code !== 0 || !Array.isArray(res.data?.list))
      throw new Error(res?.message || 'Weekly series request failed')
    seriesList.value = [...res.data.list].sort((a, b) => (b.number || 0) - (a.number || 0))
    if (seriesList.value.length) {
      activatedSeries.value = seriesList.value[0]
      await fetchSeriesOne(generation, seriesList.value[0])
    }
  }
  catch (error) {
    if (tabState.isCurrent() && generation === requestGeneration) {
      requestFailed.value = true
      reportRuntimeFailure('Failed to load weekly series', error)
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

async function fetchSeriesOne(generation: number, series: PopularSeriesItem | null) {
  if (!series)
    return

  const res: PopularSeriesOneResult = await api.ranking.getPopularSeriesOne({
    number: series.number,
  })
  if (!tabState.isCurrent() || generation !== requestGeneration || activatedSeries.value?.number !== series.number)
    return
  if (res?.code !== 0 || !Array.isArray(res.data?.list))
    throw new Error(res?.message || 'Weekly videos request failed')
  videoList.value = res.data.list.map((item, index) => ({
    ...item,
    displayData: transformWeeklyVideo(item, index + 1),
  }))
}

async function getSeriesOne() {
  if (!tabState.isCurrent())
    return
  hasSettled.value = false
  const generation = ++requestGeneration
  const series = activatedSeries.value
  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false
  videoList.value.length = 0
  try {
    await fetchSeriesOne(generation, series)
  }
  catch (error) {
    if (tabState.isCurrent() && generation === requestGeneration) {
      requestFailed.value = true
      reportRuntimeFailure('Failed to load weekly videos', error)
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

function retryWeeklyRequest() {
  if (isLoading.value)
    return
  if (requestFailed.value && activatedSeries.value)
    void getSeriesOne()
  else
    void initData()
}

function selectSeries(item: PopularSeriesItem) {
  activatedSeries.value = item
  closeDropdown(true)
  handleBackToTop(Math.min(
    scrollViewportRef.value?.scrollTop ?? 0,
    settings.value.useSearchPageModeOnHomePage ? HOME_SEARCH_STAGE_HEIGHT : 0,
  ))
  void getSeriesOne()
}

function closeDropdown(restoreFocus = false) {
  showDropdown.value = false
  searchQuery.value = ''
  stop()
  if (restoreFocus)
    triggerRef.value?.focus({ preventScroll: true })
}

defineExpose({ initData })
</script>

<template>
  <div flex="~ col" w-full>
    <!-- 期号选择器 -->
    <div
      ref="containerRef"
      pos="relative" mb-20px w-280px
    >
      <button
        ref="triggerRef"
        type="button"
        :aria-expanded="showDropdown"
        :aria-controls="dropdownId"
        w-full
        p="x-4 y-2"
        bg="$bew-fill-1"
        rounded="$bew-radius"
        text="$bew-text-1"
        cursor="pointer"
        flex="~"
        justify="between"
        items="center"
        :ring="showDropdown ? '2px $bew-theme-color' : ''"
        duration-300
        @click="showDropdown ? closeDropdown() : openDropdown()"
        @keydown.down.prevent="openDropdown"
        @keydown.up.prevent="openDropdown"
      >
        <span v-if="activatedSeries" truncate mr-2>
          {{ activatedSeries.name || `第${activatedSeries.number}期` }}
        </span>
        <span v-else text="$bew-text-3" truncate mr-2>{{ $t('home.weekly_choose_series') }}</span>
        <!-- arrow -->
        <div
          border="~ solid t-0 l-0 r-2 b-2"
          :border-color="showDropdown ? '$bew-theme-color' : '$bew-fill-4'"
          p="3px"
          ml-2
          display="inline-block"
          :transform="`~ ${!showDropdown ? 'rotate-45 -translate-y-1/4' : 'rotate-225 translate-y-1/4'}`"
          transition="background-color duration-200, color duration-200, border-color duration-200, box-shadow duration-200"
        />
      </button>

      <Teleport :to="mainAppRef">
        <Transition :name="dropdownPosition.openUp ? 'dropdown-up' : 'dropdown'">
          <div
            v-if="showDropdown"
            :id="dropdownId"
            ref="dropdownRef"
            class="weekly-series-popover bew-popover-surface"
            role="region"
            :aria-label="$t('home.weekly_choose_series')"
            :style="{
              'top': `${dropdownPosition.top}px`,
              'left': `${dropdownPosition.left}px`,
              'width': `${dropdownPosition.width}px`,
              'maxHeight': `${dropdownPosition.maxHeight}px`,
              'transform': dropdownPosition.openUp ? 'translateY(-100%)' : undefined,
              '--bew-dropdown-origin': dropdownPosition.openUp ? 'bottom center' : 'top center',
            }"
            pos="fixed" z="$bew-z-control-menu" flex="~ col" of-hidden
            @keydown="handleDropdownKeydown"
            @keydown.esc.stop.prevent="closeDropdown(true)"
            @focusout="handleDropdownFocusOut"
          >
            <!-- 搜索框 -->
            <div p-3 shrink-0 border-b="1px solid $bew-border-color">
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                :placeholder="$t('home.weekly_search_placeholder')"
                :aria-label="$t('home.weekly_search_placeholder')"
                w-full px-3 py-2 rounded="$bew-radius"
                bg="$bew-fill-2" border="1px solid transparent"
                text="$bew-text-1" outline-none
                transition="background-color duration-200, color duration-200, border-color duration-200, box-shadow duration-200"
                focus:border="$bew-theme-focus-ring"
              >
            </div>

            <!-- 列表 -->
            <div of-y-auto min-h-0 p-2 flex="~ col gap-1" class="bew-popover__scroll">
              <button
                v-for="item in filteredSeriesList"
                :key="item.number"
                type="button"
                :aria-pressed="activatedSeries?.number === item.number"
                :class="{ active: activatedSeries?.number === item.number }"
                class="series-item"
                p="x-2 y-2"
                rounded="$bew-radius"
                cursor-pointer text-left shrink-0
                transition="background-color duration-200, color duration-200, border-color duration-200, box-shadow duration-200"
                bg="hover:$bew-fill-2"
                @click="selectSeries(item)"
              >
                {{ item.name || `第${item.number}期` }}
              </button>
              <div
                v-if="filteredSeriesList.length === 0"
                p="x-2 y-4" text="center $bew-text-3"
              >
                {{ $t('home.weekly_no_matching_series') }}
              </div>
            </div>
          </div>
        </Transition>

        <!-- 遮罩 外部滚动时关闭下拉菜单 -->
        <div
          v-if="showDropdown"
          aria-hidden="true"
          pos="fixed top-0 left-0" w-full h-full
          z="$bew-z-control-backdrop"
          @click="closeDropdown()"
          @wheel="closeDropdown()"
        />
      </Teleport>
    </div>

    <!-- 视频网格 -->
    <div w-full>
      <VideoCardGrid
        :items="videoList"
        :grid-layout="gridLayout"
        :loading="isLoading"
        :no-more-content="noMoreContent"
        :request-failed="requestFailed"
        :transform-item="(item: VideoElement) => item.displayData"
        :get-item-key="(item: VideoElement) => item.aid"
        show-preview
        @refresh="retryWeeklyRequest"
        @load-more="() => {}"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.series-item.active {
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
}
</style>
