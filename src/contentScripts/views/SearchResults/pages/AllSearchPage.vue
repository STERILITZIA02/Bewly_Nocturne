<script lang="ts" setup>
import '../components/mediaResults.scss'

import { useResizeObserver } from '@vueuse/core'
import DOMPurify from 'dompurify'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ArticleCard from '~/components/ArticleCard/ArticleCard.vue'
import Button from '~/components/Button.vue'
import UserAvatarLink from '~/components/UserCard/UserAvatarLink.vue'
import AdvertisementCard from '~/components/VideoCard/AdvertisementCard.vue'
import VideoCard from '~/components/VideoCard/VideoCard.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { uiPx } from '~/composables/useUiScale'
import { useUserRelations } from '~/composables/useUserRelations'
import { GRID_GUTTER } from '~/constants/layout'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { toAdvertisementCard, toSearchBrandAdvertisementCards } from '~/utils/advertising'
import { numFormatter } from '~/utils/dataFormatter'
import { getLvIcon } from '~/utils/lvIcons'
import { getUserID } from '~/utils/main'
import { changeUserRelation } from '~/utils/userRelation'

import AllSearchSkeleton from '../components/AllSearchSkeleton.vue'
import Pagination from '../components/Pagination.vue'
import EsportsMatchCard from '../components/renderers/EsportsMatchCard.vue'
import SearchEmptyState from '../components/SearchEmptyState.vue'
import SearchMediaCard from '../components/SearchMediaCard.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { refreshSearchPage, usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { mergeSections } from '../searchSections'
import {
  convertActivityData,
  convertArticleCardData,
  convertLiveRoomData,
  convertUserHighlight,
  convertVideoData,
  convertWebGameData,
  isAdVideo,
  removeUnusedActivityCard,
} from '../searchTransforms'
import type { VideoSearchFilters } from '../types'

const props = defineProps<{
  keyword: string
  filters: VideoSearchFilters
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()
const toast = useToast()
const relationAccount = useTopBarStore()
let relationViewActive = true
onUnmounted(() => {
  relationViewActive = false
})

function convertUserSearchHighlight(user: any) {
  return convertUserHighlight(user, index => t('search.user.sample_title', { index }))
}

const { haveScrollbar, handleBackToTop } = useBewlyApp()

// 分页模式
const paginationMode = computed(() => settings.value.searchResultsPaginationMode)

// 用户关系管理
const {
  userRelations,
  batchQueryUserRelations,
  reset: resetUserRelations,
} = useUserRelations()
const pendingUserFollows = reactive(new Set<string>())

// 搜索请求管理
const {
  isLoading,
  error,
  results,
  requestScope,
  view,
  search,
  reset: resetSearch,
} = useSearchRequest<any>('all', { identity: () => [props.keyword.trim(), props.filters], page: () => props.initialPage })

// 分页管理
const {
  currentPage,
  totalResults,
  totalPages,
  context,
  hasMore: paginationHasMore,
  extractPagination,
  updatePage,
  getNextPage,
  reset: resetPagination,
} = usePagination(view)

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
  view,
})

// 是否在翻页模式的非首页
const isInPaginationNonFirstPage = computed(() => {
  return paginationMode.value === 'pagination' && currentPage.value > 1
})

// 容器宽度和间距
const searchContentRef = ref<HTMLElement | null>(null)
const searchContentWidth = ref(0)
const videoGridGap = computed(() => uiPx(GRID_GUTTER))

useResizeObserver(searchContentRef, (entries) => {
  const entry = entries[0]
  searchContentWidth.value = entry.contentRect.width
})

// 赛事卡片样式计算
const esportsCardStyle = computed(() => {
  const containerWidth = searchContentWidth.value
  const cardMinWidth = uiPx(250)
  const gap = videoGridGap.value
  const maxCards = 5

  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { cardWidth: `${cardMinWidth}px` }
  }

  const rawColumns = Math.floor((containerWidth + gap) / (cardMinWidth + gap))
  const columns = Math.min(Math.max(rawColumns, 1), maxCards)
  const totalGap = gap * Math.max(columns - 1, 0)
  const available = containerWidth - totalGap
  const cardWidth = columns > 0 ? Math.max(available / columns, cardMinWidth) : cardMinWidth

  return { cardWidth: `${cardWidth}px` }
})

// 用户代表作列数
const userSamplesColumns = computed(() => {
  const containerWidth = searchContentWidth.value
  const cardMinWidth = uiPx(180)
  const gap = videoGridGap.value

  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0)
    return 6

  const columns = Math.floor((containerWidth + gap) / (cardMinWidth + gap))
  return Math.max(1, Math.min(columns, 7))
})

function getUserSamplesWithPlaceholders(samples: any[]) {
  const columns = userSamplesColumns.value
  const actualSamples = samples.slice(0, columns)
  const placeholdersCount = Math.max(0, columns - actualSamples.length)
  const placeholders = Array.from({ length: placeholdersCount }).fill(null)
  return [...actualSamples, ...placeholders]
}

// 合并活动和游戏数据
const activityAndGameItems = computed(() => {
  if (settings.value.blockTopSearchPageAds || !results.value?.result)
    return []

  const items: any[] = []
  const sections = results.value.result

  sections.forEach((section: any) => {
    if (section?.result_type === 'activity' && Array.isArray(section.data)) {
      const filtered = section.data.filter((item: any) => removeUnusedActivityCard(item) && (!settings.value.blockAds || !isAdVideo(item)))
      items.push(...filtered.map((item: any) => ({
        ...convertActivityData(item),
        _type: 'activity',
      })))
    }
    else if (section?.result_type === 'web_game' && Array.isArray(section.data)) {
      items.push(...section.data.filter((item: any) => !settings.value.blockAds || !isAdVideo(item)).map((item: any) => ({
        ...convertWebGameData(item),
        _type: 'web_game',
      })))
    }
  })

  return items
})

// 关注操作
async function handleUserFollow(mid: number) {
  const accountId = resolveAuthenticatedAccountId(relationAccount.isLogin, relationAccount.userInfo.mid)
  if (accountId === null) {
    toast.warning(t('common.please_log_in_first'))
    return
  }
  const operationKey = `${accountId}:${mid}`
  if (pendingUserFollows.has(operationKey))
    return
  const following = !userRelations.value[mid]?.isFollowing
  const scope = requestScope.value
  const keyword = props.keyword
  const isCurrent = () => relationViewActive && requestScope.value === scope && props.keyword === keyword
    && String(getUserID()) === String(accountId)

  try {
    pendingUserFollows.add(operationKey)
    const response = await changeUserRelation(accountId, mid, following ? 1 : 2)
    if (!isCurrent())
      return
    if (response.code !== 0)
      toast.error(response.message || t('common.operation_failed'))
  }
  catch (error) {
    if (isCurrent())
      toast.error(error instanceof Error ? error.message : t('common.operation_failed'))
  }
  finally {
    pendingUserFollows.delete(operationKey)
  }
}

function isUserFollowPending(mid: number) {
  return pendingUserFollows.has(`${resolveAuthenticatedAccountId(relationAccount.isLogin, relationAccount.userInfo.mid)}:${mid}`)
}

// 获取当前结果长度
function getCurrentResultLength(): number {
  if (!results.value)
    return 0
  const sections = Array.isArray(results.value?.result) ? results.value.result : []
  return sections.reduce((sum: number, section: any) => {
    if (Array.isArray(section?.data))
      return sum + section.data.length
    return sum
  }, 0)
}

// 提取视频列表（过滤广告）
const videoList = computed(() => {
  if (!results.value?.result)
    return []
  const videoSection = results.value.result.find((s: any) => s?.result_type === 'video')
  if (!videoSection || !Array.isArray(videoSection.data))
    return []
  return settings.value.blockAds ? videoSection.data.filter((v: any) => !isAdVideo(v)) : videoSection.data
})

onMounted(() => {
  if (searchContentRef.value)
    searchContentWidth.value = searchContentRef.value.clientWidth

  const keyword = props.keyword.trim()
  if (view.restored) {
    const users = results.value?.result?.find((section: any) => section.result_type === 'bili_user')?.data ?? []
    void batchQueryUserRelations(users.map((user: any) => user.mid).filter(Boolean))
  }
  if (keyword && !view.restored) {
    if (props.initialPage && props.initialPage > 1)
      updatePage(props.initialPage)
    performSearch(false)
  }
})

watch(requestScope, () => {
  resetAll()
  if (props.keyword.trim())
    void performSearch(false)
})

watch(() => props.keyword, async (newKeyword, oldKeyword) => {
  const normalizedNew = (newKeyword || '').trim()
  const normalizedOld = (oldKeyword || '').trim()

  if (!normalizedNew) {
    resetAll()
    return
  }

  if (normalizedNew !== normalizedOld) {
    resetAll()
    await performSearch(false)
  }
})

watch(() => props.filters, () => {
  if (!props.keyword.trim())
    return
  if (paginationMode.value === 'pagination') {
    void handlePageChange(1, currentPage.value !== 1, false)
    return
  }
  resetAll()
  void performSearch(false)
}, { deep: true })

async function runAllSearch(targetPage: number, isLoadMore: boolean, updateUrl = false): Promise<boolean> {
  const keyword = props.keyword.trim()
  if (!keyword)
    return false
  const previousLength = getCurrentResultLength()
  return search({
    searchType: 'all',
    keyword,
    page: targetPage,
    pageSize: 30,
    context: targetPage > 1 ? context.value : '',
    webRollPage: targetPage,
  }, async (response, isCurrent) => {
    const rawData = response.data
    if (!rawData)
      return false
    const incomingSections = Array.isArray(rawData?.result) ? rawData.result : []

    if (isLoadMore && results.value) {
      results.value = mergeSections(results.value, rawData, {
        appendVideoOnly: paginationMode.value === 'scroll',
      })
    }
    else {
      results.value = rawData
    }

    if (Array.isArray(results.value?.result)) {
      const userSection = results.value.result.find((s: any) => s?.result_type === 'bili_user')
      if (userSection && Array.isArray(userSection.data)) {
        const mids = userSection.data.map((u: any) => u.mid).filter(Boolean)
        await batchQueryUserRelations(mids)
      }
    }

    if (!isCurrent())
      return false

    const fallbackLength = incomingSections.reduce((sum: number, section: any) => {
      if (Array.isArray(section?.data))
        return sum + section.data.length
      return sum
    }, 0)
    extractPagination(rawData, fallbackLength)
    updatePage(targetPage)
    setHasMore(paginationHasMore.value)

    if (paginationMode.value === 'scroll') {
      const finalLength = getCurrentResultLength()
      const newItems = Math.max(finalLength - previousLength, 0)
      const incomingLength = incomingSections.reduce((sum: number, section: any) => {
        if (isLoadMore && section?.result_type !== 'video')
          return sum
        if (Array.isArray(section?.data))
          return sum + section.data.length
        return sum
      }, 0)

      if (incomingLength === 0)
        setExhausted(true)
      else if (newItems <= 0 && targetPage >= totalPages.value)
        setExhausted(true)
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
  const success = await runAllSearch(page, isLoadMore)
  if (success && isLoadMore)
    await handleLoadMoreCompletion(haveScrollbar)
  return success
}

function handlePageChange(page: number, updateUrl = true, scrollToTop = true): Promise<boolean> {
  if (paginationMode.value !== 'pagination' || !props.keyword.trim())
    return Promise.resolve(false)
  if (scrollToTop)
    handleBackToTop()
  return runAllSearch(page, false, updateUrl)
}

function refreshCurrentPage() {
  return refreshSearchPage(paginationMode.value, currentPage.value, (page, updateUrl) => runAllSearch(page, false, updateUrl), resetLoadMore)
}
async function restorePage(page: number): Promise<boolean> {
  if (page === currentPage.value)
    return true
  if (paginationMode.value === 'pagination')
    return handlePageChange(page, false, false)

  updatePage(page)
  return performSearch(false)
}

function resetAll() {
  resetUserRelations()
  resetSearch()
  resetPagination()
  resetLoadMore()
  results.value = null
}

function handleLoadMore() {
  if (paginationMode.value !== 'scroll')
    return
  if (isLoading.value || exhausted.value)
    return

  requestLoadMore()
}

defineExpose({
  isLoading,
  error,
  results,
  totalResults,
  hasMore,
  requestLoadMore,
  needsManualLoadMore,
  resumeLoadMore,
  userRelations,
  reset: resetUserRelations,
  currentPage,
  totalPages,
  refreshCurrentPage,
  restorePage,
})
</script>

<template>
  <div ref="searchContentRef" class="all-search-page">
    <AllSearchSkeleton v-if="isLoading && !results" />

    <!-- Results -->
    <div v-else class="all-results" space-y-6>
      <!-- 活动和游戏 -->
      <div v-if="!isInPaginationNonFirstPage && activityAndGameItems.length > 0">
        <h3 text="lg $bew-text-1" mb-3 mt-6>
          {{ t('search.sections.activities') }}
        </h3>
        <div class="activity-results" grid="~ cols-1 md:cols-2 lg:cols-3 gap-$bew-grid-gutter">
          <a
            v-for="item in activityAndGameItems"
            :key="item.id"
            :href="item.url"
            target="_blank"
            class="activity-card"
          >
            <div class="activity-cover">
              <img v-if="item.cover" :src="item.cover" :alt="item.title">
            </div>
            <div class="activity-info">
              <div class="activity-title">
                {{ item.title }}
              </div>
              <div v-if="item.desc" class="activity-desc">
                {{ item.desc }}
              </div>
              <div v-if="item.badge" class="activity-badge">
                {{ item.badge }}
              </div>
              <div v-if="item.tags || item.platform" class="game-meta" text="xs $bew-text-3" mt-2>
                <span v-if="item.tags">{{ item.tags }}</span>
                <span v-if="item.platform"> · {{ item.platform }}</span>
              </div>
            </div>
          </a>
        </div>
      </div>

      <!-- 各类 section -->
      <template v-for="(section, index) in results?.result" :key="`${section?.result_type ?? 'unknown'}-${index}`">
        <!-- 跳过视频（将在最后渲染） -->
        <template v-if="section?.result_type === 'video'" />

        <!-- Native brand advertising is an independent accepted-result section. -->
        <div
          v-else-if="!isInPaginationNonFirstPage && !settings.blockAds && section?.result_type === 'brand_ad' && Array.isArray(section.data) && section.data.length"
          class="brand-advertisement-results"
          grid="~ cols-1 md:cols-2 lg:cols-3 gap-$bew-grid-gutter"
        >
          <AdvertisementCard
            v-for="advertisement in section.data.flatMap(toSearchBrandAdvertisementCards)"
            :key="advertisement.advertisementKey"
            :video="advertisement"
          />
        </div>

        <!-- 番剧/影视 -->
        <div
          v-else-if="!isInPaginationNonFirstPage && (section?.result_type === 'media_bangumi' || section?.result_type === 'media_ft')
            && Array.isArray(section.data) && section.data.length"
        >
          <h3 text="lg $bew-text-1" mb-3 mt-6>
            {{ section.result_type === 'media_ft' ? t('search.categories.media_ft') : t('search.categories.bangumi') }}
          </h3>
          <!-- 影视 -->
          <div v-if="section.result_type === 'media_ft'" class="bew-grid-adaptive-poster">
            <SearchMediaCard
              v-for="item in section.data.slice(0, 2)"
              :key="item.season_id || item.media_id || item.id || item.title"
              :item="{ ...item, url: item.goto_url || item.url || `https://www.bilibili.com/bangumi/media/md${item.media_id}` }" movie
            />
          </div>
          <!-- 番剧 -->
          <div v-else class="bew-grid-adaptive-poster">
            <SearchMediaCard
              v-for="bangumi in section.data.slice(0, 2)"
              :key="bangumi.season_id || bangumi.media_id || bangumi.id || bangumi.title"
              :item="bangumi"
            />
          </div>
        </div>

        <!-- 跳过活动和游戏 -->
        <template v-else-if="section?.result_type === 'activity' || section?.result_type === 'web_game'" />

        <!-- 赛事 -->
        <div v-else-if="!isInPaginationNonFirstPage && section?.result_type === 'esports' && Array.isArray(section.data) && section.data.length">
          <h3 text="lg $bew-text-1" mb-3 mt-6>
            {{ t('search.sections.schedule') }}
          </h3>
          <div class="esports-grid" flex="~ wrap gap-$bew-grid-gutter" mb-4>
            <template v-for="contestData in section.data" :key="`esports-data-${contestData.contest?.[0]?.ID}`">
              <EsportsMatchCard
                v-for="contest in contestData.contest?.slice(0, 5)"
                :key="`contest-${contest.ID}`"
                :contest="contest"
                :card-width="esportsCardStyle.cardWidth"
              />
            </template>
          </div>
          <a
            :href="`https://www.bilibili.com/v/game/match/schedule?mid=${section.data[0]?.contest?.[0]?.mid || 0}&time=${Date.now()}`"
            target="_blank"
            class="more-esports-button"
          >
            {{ t('search_page.view_all_esports') }}
          </a>
        </div>

        <!-- 用户 -->
        <div v-else-if="!isInPaginationNonFirstPage && section?.result_type === 'bili_user' && Array.isArray(section.data) && section.data.length">
          <h3 text="lg $bew-text-1" mb-3 mt-6>
            {{ t('search.categories.user') }}
          </h3>
          <div class="user-highlight-grid">
            <div
              v-for="user in section.data.map(convertUserSearchHighlight)"
              :key="user.mid"
              class="user-highlight-card"
            >
              <div class="user-highlight-header" flex items-center gap-3>
                <UserAvatarLink :mid="user.mid" :name="user.name" :live-status="user.liveStatus" :roomid="user.roomid">
                  <img :src="user.face" :alt="user.name" class="user-highlight-avatar">
                </UserAvatarLink>
                <div class="user-highlight-info" flex="~ col" gap-1 flex-1>
                  <div
                    class="user-highlight-name" text="base $bew-text-1" flex items-center
                    gap-2
                  >
                    <a :href="user.url" target="_blank">{{ user.name }}</a>
                    <div
                      v-if="user.level !== undefined"
                      class="user-level-badge-icon"
                      v-html="DOMPurify.sanitize(getLvIcon(user.level))"
                    />
                    <div v-if="user.gender === 1" class="gender-icon-badge">
                      <div i-tabler:gender-male />
                    </div>
                    <div v-else-if="user.gender === 2" class="gender-icon-badge">
                      <div i-tabler:gender-female />
                    </div>
                    <span v-if="user.officialVerify" class="user-highlight-verify">
                      {{ user.officialVerify }}
                    </span>
                  </div>
                  <div text="xs $bew-text-3" flex items-center gap-3>
                    <span>{{ t('search.user.fans', { count: numFormatter(user.fans) }) }}</span>
                    <span>{{ t('search.user.videos', { count: user.videos || 0 }) }}</span>
                  </div>
                  <div v-if="user.desc" class="user-highlight-desc" mt-1>
                    {{ user.desc }}
                  </div>
                </div>
                <Button
                  class="user-highlight-follow"
                  :type="userRelations[user.mid]?.isFollowing ? 'secondary' : 'primary'"
                  center
                  :disabled="isUserFollowPending(user.mid)"
                  :aria-busy="isUserFollowPending(user.mid)"
                  @click.stop="handleUserFollow(user.mid)"
                >
                  {{ userRelations[user.mid]?.isFollowing ? t('search.user.following') : t('search.user.follow') }}
                </Button>
              </div>
              <div
                v-if="user.samples && user.samples.length"
                class="user-highlight-samples"
                :style="{ gridTemplateColumns: `repeat(${userSamplesColumns}, minmax(0, 1fr))` }"
                mt-3
              >
                <template v-for="(sample, idx) in getUserSamplesWithPlaceholders(user.samples)" :key="sample?.id || `placeholder-${idx}`">
                  <VideoCard
                    v-if="sample"
                    :video="{
                      id: sample.aid || 0,
                      title: sample.title,
                      cover: sample.cover,
                      author: { name: user.name, mid: user.mid, authorFace: user.face },
                      duration: sample.duration,
                      durationStr: sample.durationStr,
                      view: sample.play,
                      danmaku: 0,
                      publishedTimestamp: 0,
                      aid: sample.aid,
                      bvid: sample.bvid,
                      url: sample.url,
                      capsuleText: sample.badge,
                      threePointV2: [],
                    }"
                    :horizontal="false"
                    :show-preview="true"
                    :hide-author="true"
                  />
                  <div v-else class="user-highlight-sample-placeholder" />
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 专栏 -->
        <div
          v-else-if="!isInPaginationNonFirstPage && section?.result_type === 'article' && Array.isArray(section.data) && section.data.length"
          class="article-results"
          grid="~ cols-1 md:cols-2 gap-$bew-grid-gutter"
        >
          <ArticleCard
            v-for="article in section.data.map(convertArticleCardData)"
            :key="article.id"
            v-bind="article"
            cover-fill
          />
        </div>
      </template>

      <!-- 视频（放在最后，因为有滚动加载） -->
      <div>
        <h3 v-if="videoList.length > 0" text="lg $bew-text-1" mb-3 mt-6>
          {{ t('search.categories.video') }}
        </h3>
        <VideoCardGrid
          :items="videoList"
          :transform-item="(item: any) => item.type === 'live_room' ? convertLiveRoomData(item) : convertVideoData(item)"
          :get-item-key="(item: any) => isAdVideo(item) ? toAdvertisementCard(item).advertisementKey! : item.aid || item.id || item.roomid"
          grid-layout="adaptive"
          :loading="isLoading"
          :no-more-content="!hasMore"
          :request-failed="!!error"
          :show-preview="true"
          :show-watch-later="true"
          :empty-description="t('common.no_data')"
          :show-loading-more-skeleton="true"
          :show-load-more-indicator="false"
          enable-row-padding
          @load-more="handleLoadMore"
        >
          <template #empty>
            <SearchEmptyState :keyword="keyword" category="video" />
          </template>
        </VideoCardGrid>
      </div>
    </div>

    <!-- Pagination -->
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
@use "../../../../styles/truncateFade";
@use "../../../../styles/contentCard";
@use "../../../../styles/hoverState";

.all-search-page {
  width: 100%;
  padding-bottom: var(--bew-space-8);
}

// Result cards share the media result card surface (mediaResults.scss).
.activity-card {
  box-sizing: border-box;
  display: flex;
  gap: var(--bew-space-4);
  padding: var(--bew-space-4);
  background: var(--bew-content-solid);
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-surface-radius);
  text-decoration: none;
  color: inherit;
  @include contentCard.surface($press: false);
}

.activity-cover {
  position: relative;
  width: 120px;
  min-width: 120px;
  aspect-ratio: 4 / 3;
  border-radius: var(--bew-thumb-radius);
  overflow: hidden;
  background: var(--bew-skeleton);
  @include contentCard.media-frame;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    corner-shape: inherit;
  }
}

.activity-info {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.activity-title {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-regular);
  color: var(--bew-text-1);
  line-height: var(--bew-line-height-title);
}

.activity-desc {
  font-size: var(--bew-font-size-body);
  color: var(--bew-text-2);
  line-height: var(--bew-line-height-body);
  @include truncateFade.lines(3);
}

.activity-badge {
  align-self: flex-start;
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  background: var(--bew-pressed-bg);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
}

.user-highlight-grid {
  display: grid;
  gap: var(--bew-grid-gutter);
}

.user-highlight-card {
  box-sizing: border-box;
  background: var(--bew-content-solid);
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-surface-radius);
  padding: var(--bew-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
}

.user-highlight-avatar {
  width: calc(var(--bew-space-12) + var(--bew-space-2));
  height: calc(var(--bew-space-12) + var(--bew-space-2));
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  object-fit: cover;
  cursor: pointer;
}

.user-highlight-verify {
  margin-left: var(--bew-space-2);
  padding: var(--bew-space-0-5) var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  background: var(--bew-pressed-bg);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
}

// The one follow button (Button.vue).
.user-highlight-follow.b-button {
  min-width: calc(var(--bew-space-10) * 2);
  margin-left: auto;
  white-space: nowrap;
}

.user-highlight-desc {
  font-size: var(--bew-font-size-body);
  color: var(--bew-text-2);
  line-height: var(--bew-line-height-body);
}

.user-level-badge-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  :deep(svg) {
    width: 25px;
    height: 16px;
  }
}

.gender-icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--bew-font-size-title);
  flex-shrink: 0;
  // Neutral like the user card's gender mark: the icon already says which.
  color: var(--bew-text-3);
}

.user-highlight-samples {
  display: grid;
  gap: var(--bew-grid-gutter);
}

.user-highlight-sample-placeholder {
  min-height: 1px;
  visibility: hidden;
}

.more-esports-button {
  display: block;
  text-align: center;
  padding: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  color: var(--bew-theme-foreground);
  text-decoration: none;
  border-radius: var(--bew-interactive-radius);
  @include hoverState.transition;

  &:hover {
    background: var(--bew-selected-bg);
  }
}

.article-results {
  display: grid;
}

// Capsules (badges) keep their capsule shape from their own rules.
.activity-card,
.activity-cover,
.user-highlight-card,
.more-esports-button {
  corner-shape: var(--bew-corner-shape);
}
</style>
