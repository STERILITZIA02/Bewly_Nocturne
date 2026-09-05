<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import UserCard from '~/components/UserCard/UserCard.vue'
import UserCardSkeleton from '~/components/UserCard/UserCardSkeleton.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'

import Pagination from '../components/Pagination.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
import { convertLiveRoomData, convertUserCardData, formatNumber } from '../searchTransforms'
import type { LiveSearchFilters } from '../types'
import { dedupeByKey } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: LiveSearchFilters
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()

function convertSearchUser(user: unknown) {
  return convertUserCardData(user, index => t('search.user.sample_title', { index }))
}

const { haveScrollbar, handleBackToTop } = useBewlyApp()

// 分页模式：scroll 滚动加载，pagination 翻页
const paginationMode = computed(() => settings.value.searchResultsPaginationMode)

// 用户关系管理
const {
  userRelations,
  batchQueryUserRelations,
  updateUserRelation,
  reset: resetUserRelations,
} = useUserRelations()

// 搜索请求管理
const {
  isLoading,
  error,
  results,
  requestScope,
  search,
  reset: resetSearch,
} = useSearchRequest<any>('live')

// 分页管理
const {
  currentPage,
  totalResults,
  totalPages,
  hasMore: paginationHasMore,
  extractPagination,
  updatePage,
  getNextPage,
  reset: resetPagination,
} = usePagination()

// 直播间和主播的独立总数
const liveRoomTotalResults = ref(0)
const liveUserTotalResults = ref(0)

// 无限加载管理
const {
  hasMore,
  exhausted,
  requestLoadMore,
  needsManualLoadMore,
  resumeLoadMore,
  handleLoadMoreCompletion,
  setHasMore,
  setExhausted,
  reset: resetLoadMore,
} = useLoadMore(async () => {
  const previousCount = getCurrentResultLength()
  const success = await performSearch(true)
  const appendedCount = Math.max(0, getCurrentResultLength() - previousCount)
  return { success, appendedCount }
}, {
  isLoading: () => isLoading.value,
})

// 获取直播间列表
const liveRoomList = computed(() => {
  if (!results.value?.result)
    return []
  return Array.isArray(results.value.result.live_room) ? results.value.result.live_room : []
})

// 获取主播列表
const liveUserList = computed(() => {
  if (!results.value?.result)
    return []
  return Array.isArray(results.value.result.live_user) ? results.value.result.live_user : []
})

// Grid 布局：直播搜索结果使用 adaptive 布局
const gridLayout: GridLayoutType = 'adaptive'

// 转换后的直播间列表
const transformedLiveRoomList = computed(() => {
  return liveRoomList.value.map((live: unknown) => convertLiveRoomData(live))
})

// 检查是否在翻页模式下且不在第一页
const isInPaginationNonFirstPage = computed(() => {
  return paginationMode.value === 'pagination' && currentPage.value > 1
})

// 是否显示空状态（仅在 live_user 子分类或 all 子分类下两个列表都为空时）
const showEmptyState = computed(() => {
  if (isLoading.value)
    return false

  if (props.filters.subCategory === 'live_user')
    return liveUserList.value.length === 0

  if (props.filters.subCategory === 'all')
    return liveUserList.value.length === 0 && liveRoomList.value.length === 0

  // live_room 子分类由 VideoCardGrid 处理空状态
  return false
})

function formatResultCount(count: number): string {
  return formatNumber(count)
}

// Transform 函数：数据已经转换过了，直接返回
function transformLiveRoom(room: any) {
  return room
}

// 获取当前结果长度
function getCurrentResultLength(): number {
  return liveRoomList.value.length + liveUserList.value.length
}

// 监听关键词变化
watch(() => props.keyword, async (newKeyword, oldKeyword) => {
  const normalizedNew = (newKeyword || '').trim()
  const normalizedOld = (oldKeyword || '').trim()

  if (!normalizedNew) {
    resetAll()
    return
  }

  // 关键词变化时才执行
  if (normalizedNew !== normalizedOld) {
    resetAll()
    await performSearch(false)
  }
})

// 组件挂载时立即执行搜索
onMounted(() => {
  const keyword = props.keyword.trim()
  if (keyword) {
    // 如果有初始页码，先设置页码
    if (props.initialPage && props.initialPage > 1) {
      updatePage(props.initialPage)
    }
    performSearch(false)
  }
})

// 监听筛选条件变化
watch([
  () => props.filters.subCategory,
  () => props.filters.roomOrder,
  () => props.filters.userOrder,
], ([category, roomOrder, userOrder], [previousCategory, previousRoomOrder, previousUserOrder]) => {
  if (!props.keyword.trim())
    return
  if (category === 'all' && category === previousCategory && roomOrder !== previousRoomOrder && userOrder === previousUserOrder) {
    void refreshLiveRoomsOnly()
    return
  }
  resetAll()
  void performSearch(false)
})

watch(requestScope, () => {
  resetAll()
  if (props.keyword.trim())
    void performSearch(false)
})

function getIncomingLiveResults(rawData: any, category: LiveSearchFilters['subCategory']) {
  const result = rawData?.result
  const rooms = category === 'live_user'
    ? []
    : Array.isArray(result?.live_room)
      ? result.live_room
      : category === 'live_room' && Array.isArray(result) ? result : []
  const users = category === 'live_room'
    ? []
    : Array.isArray(result?.live_user)
      ? result.live_user
      : category === 'live_user' && Array.isArray(result) ? result : []
  return { rooms, users }
}

async function runLiveSearch(targetPage: number, isLoadMore: boolean, preserveUsers = false, updateUrl = false): Promise<boolean> {
  const keyword = props.keyword.trim()
  if (!keyword)
    return false
  const category = props.filters.subCategory
  const previousLength = getCurrentResultLength()
  return search({
    searchType: category === 'all' ? 'live' : category,
    keyword,
    page: targetPage,
    pageSize: 30,
    filters: { order: category === 'live_user' ? props.filters.userOrder : props.filters.roomOrder },
  }, async (response, isCurrent) => {
    const rawData = response.data
    if (!rawData)
      return false
    const { rooms, users } = getIncomingLiveResults(rawData, category)
    const previousRooms = liveRoomList.value
    const previousUsers = liveUserList.value
    const mergedRooms = isLoadMore
      ? dedupeByKey([...previousRooms, ...rooms], item => String(item?.roomid ?? item?.id ?? JSON.stringify(item)))
      : rooms
    const mergedUsers = preserveUsers || (isLoadMore && category === 'all')
      ? previousUsers
      : isLoadMore
        ? dedupeByKey([...previousUsers, ...users], item => String(item?.mid ?? JSON.stringify(item)))
        : users
    results.value = { result: { live_room: mergedRooms, live_user: mergedUsers } }
    if (category !== 'live_room' && !preserveUsers)
      await batchQueryUserRelations(mergedUsers.map((user: any) => user.mid).filter(Boolean))
    if (!isCurrent())
      return false

    const incomingLength = category === 'live_user' ? users.length : rooms.length
    if (category === 'all') {
      const roomTotal = Number(rawData.pageinfo?.live_room?.total)
        || Number(rawData.pageinfo?.live_room?.numResults) || rooms.length
      liveRoomTotalResults.value = roomTotal
      if (!preserveUsers) {
        liveUserTotalResults.value = Number(rawData.pageinfo?.live_user?.total)
          || Number(rawData.pageinfo?.live_user?.numResults) || users.length
      }
      extractPagination({
        total: roomTotal,
        numResults: roomTotal,
        pagesize: rawData.pagesize || 30,
        pageinfo: rawData.pageinfo?.live_room,
      }, rooms.length)
    }
    else {
      extractPagination(rawData, incomingLength)
      if (category === 'live_user')
        liveUserTotalResults.value = totalResults.value
      else
        liveRoomTotalResults.value = totalResults.value
    }
    updatePage(targetPage)
    setHasMore(paginationHasMore.value)
    if (paginationMode.value === 'scroll') {
      const newItems = Math.max(getCurrentResultLength() - previousLength, 0)
      setExhausted(incomingLength === 0 || (newItems <= 0 && targetPage >= totalPages.value))
    }
    if (updateUrl)
      emit('updatePage', targetPage)
    return true
  })
}

async function performSearch(loadMore: boolean): Promise<boolean> {
  const isLoadMore = paginationMode.value === 'scroll' && loadMore
  if (isLoadMore && (isLoading.value || exhausted.value))
    return false
  if (!isLoadMore)
    setExhausted(false)
  const page = isLoadMore ? getNextPage(true) : (currentPage.value || getNextPage(false))
  const success = await runLiveSearch(page, isLoadMore)
  if (success && isLoadMore)
    await handleLoadMoreCompletion(haveScrollbar)
  return success
}

function handlePageChange(page: number, updateUrl = true, scrollToTop = true): Promise<boolean> {
  if (paginationMode.value !== 'pagination' || !props.keyword.trim())
    return Promise.resolve(false)
  if (scrollToTop)
    handleBackToTop()
  return runLiveSearch(page, false, false, updateUrl)
}

function refreshCurrentPage() {
  return paginationMode.value === 'pagination'
    ? handlePageChange(currentPage.value, false, false)
    : performSearch(false)
}

async function restorePage(page: number): Promise<boolean> {
  if (page === currentPage.value)
    return true
  if (paginationMode.value === 'pagination')
    return handlePageChange(page, false, false)
  updatePage(page)
  return performSearch(false)
}

function refreshLiveRoomsOnly(): Promise<boolean> {
  resetPagination()
  resetLoadMore()
  return runLiveSearch(1, false, true, true)
}

function resetAll() {
  resetUserRelations()
  resetSearch()
  resetPagination()
  resetLoadMore()
  results.value = null
  liveRoomTotalResults.value = 0
  liveUserTotalResults.value = 0
}

function handleFollowStateChanged(data: { mid: number, isFollowing: boolean }) {
  updateUserRelation(data.mid, data.isFollowing)
}

function handleSwitchToLiveUser() {
  // 切换到主播模式需要由父级筛选器统一实现。
}

// 预加载更多直播间
function handleLoadMore() {
  if (paginationMode.value !== 'scroll')
    return
  if (isLoading.value || exhausted.value)
    return

  requestLoadMore()
}

// 暴露给父组件
defineExpose({
  isLoading,
  error,
  results,
  liveRoomList,
  liveUserList,
  totalResults,
  liveRoomTotalResults,
  liveUserTotalResults,
  hasMore,
  requestLoadMore,
  needsManualLoadMore,
  resumeLoadMore,
  userRelations,
  updateUserRelation,
  currentPage,
  totalPages,
  refreshCurrentPage,
  restorePage,
})
</script>

<template>
  <div class="live-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else class="live-results" space-y-6>
      <!-- 空状态（live_user 或 all 子分类下两个列表都为空） -->
      <Empty v-if="showEmptyState" :description="t('common.no_data')" />

      <template v-else>
        <!-- 主播 (上面) -->
        <div
          v-if="!isInPaginationNonFirstPage
            && (liveUserList.length > 0 || isLoading)
            && (filters.subCategory === 'all' || filters.subCategory === 'live_user')"
        >
          <div flex items-center gap-3 mb-3>
            <h3 text="lg $bew-text-1" font-medium>
              {{ t('search.live.streamers') }}
            </h3>
            <span text="sm $bew-text-3">
              {{ t('search.result_count', { count: formatResultCount(filters.subCategory === 'live_user' ? totalResults : (liveUserTotalResults || liveUserList.length)) }) }}
            </span>
          </div>
          <div grid="~ cols-3 gap-4">
            <UserCardSkeleton
              v-for="index in (isLoading && liveUserList.length === 0 ? 3 : 0)"
              :key="`live-user-initial-skeleton-${index}`"
            />
            <UserCard
              v-for="user in (filters.subCategory === 'all'
                ? liveUserList.slice(0, 6)
                : liveUserList)"
              :key="user.mid || user.uid"
              v-bind="{
                ...convertSearchUser(user),
                isFollowed: userRelations[user.mid || user.uid]?.isFollowing ? 1 : 0,
              }"
              :compact="true"
              @follow-state-changed="(mid: number, isFollowing: boolean) => handleFollowStateChanged({ mid, isFollowing })"
            />
            <UserCardSkeleton
              v-for="index in (isLoading && liveUserList.length > 0 ? 3 : 0)"
              :key="`live-user-more-skeleton-${index}`"
            />
          </div>
          <!-- 查看更多按钮 (仅在全部模式下且主播总数>6时显示) -->
          <div
            v-if="filters.subCategory === 'all' && (liveUserTotalResults || 0) > 6"
            mt-4 flex justify-center
          >
            <button
              type="button"
              class="view-more-btn"
              px-6 py-2 rounded="$bew-radius-half"
              bg="$bew-fill-1 hover:$bew-fill-2"
              text="sm $bew-text-1"
              transition-colors duration-200
              @click="handleSwitchToLiveUser"
            >
              {{ t('search.live.more_streamers', { count: Math.max((liveUserTotalResults || 0) - 6, 0) }) }}
            </button>
          </div>
        </div>

        <!-- 直播间 (下面) - 始终渲染 VideoCardGrid 以支持骨架屏和空状态 -->
        <div v-if="filters.subCategory === 'all' || filters.subCategory === 'live_room'">
          <div v-if="liveRoomList.length > 0" flex items-center gap-3 mb-3>
            <h3 text="lg $bew-text-1" font-medium>
              {{ t('search.live.rooms') }}
            </h3>
            <span text="sm $bew-text-3">
              {{ t('search.result_count', { count: formatResultCount(filters.subCategory === 'live_room' ? totalResults : (liveRoomTotalResults || liveRoomList.length)) }) }}
            </span>
          </div>
          <VideoCardGrid
            :items="transformedLiveRoomList"
            :grid-layout="gridLayout"
            :transform-item="transformLiveRoom"
            :get-item-key="(room: any) => room.id || room.roomid"
            :loading="isLoading"
            :no-more-content="!hasMore"
            :request-failed="!!error"
            :show-watch-later="false"
            :empty-description="t('common.no_data')"
            :show-loading-more-skeleton="true"
            :show-load-more-indicator="false"
            enable-row-padding
            show-preview
            @load-more="handleLoadMore"
          />
        </div>
      </template>

      <!-- 滚动加载模式：主播列表没有更多时显示提示（主播不用 VideoCardGrid） -->
      <template v-if="paginationMode === 'scroll' && filters.subCategory === 'live_user'">
        <Empty
          v-if="!isLoading && liveUserList.length > 0 && !hasMore"
          :description="t('common.no_more_content')"
        />
      </template>
    </div>

    <!-- 翻页模式 -->
    <Pagination
      v-if="paginationMode === 'pagination'"
      :current-page="currentPage"
      :total-pages="totalPages"
      :loading="isLoading"
      :disabled="isLoading"
      @change="handlePageChange"
    />
  </div>
</template>

<style scoped lang="scss">
.live-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

.live-results {
  width: 100%;
}

.view-more-btn {
  cursor: pointer;
  border: none;
  outline: none;

  &:focus-visible {
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: var(--bew-space-0-5);
  }
}

.error-message {
  padding: 2rem;
  text-align: center;
  color: var(--bew-error-color);
}
</style>
