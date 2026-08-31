<script setup lang="ts">
import { useBewlyApp } from '~/composables/useAppProvider'
import type { List as PopularAnimeItem, PopularAnimeResult } from '~/models/anime/popular'
import type { ItemSubItem as RecommendationItem, RecommendationResult } from '~/models/anime/recommendation'
import type { List as WatchListItem, WatchListResult } from '~/models/anime/watchList'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { numFormatter } from '~/utils/dataFormatter'
import { getUserID, openLinkToNewTab } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'

import AnimeTimeTable from './components/AnimeTimeTable.vue'

const animeWatchList = reactive<WatchListItem[]>([])
const recommendAnimeList = reactive<RecommendationItem[]>([])
const popularAnimeList = reactive<PopularAnimeItem[]>([])
const cursor = ref<number>(0)
const isLoadingAnimeWatchList = ref<boolean>()
const isLoadingPopularAnime = ref<boolean>()
const isLoadingRecommendAnime = ref<boolean>()
const recommendRequestFailed = ref(false)
const activatedSeasonId = ref<number>()
const noMoreContent = ref<boolean>()
const animeTimeTableRef = ref()
const { handleReachBottom, handlePageRefresh } = useBewlyApp()
const topBarStore = useTopBarStore()
let requestGeneration = 0
let animeMounted = false

const isLoading = computed(() => {
  return isLoadingAnimeWatchList.value || isLoadingPopularAnime.value || isLoadingRecommendAnime.value
})

onMounted(() => {
  animeMounted = true
  reloadAnimePage()
  initPageAction()
})

onScopeDispose(() => {
  animeMounted = false
  requestGeneration++
  if (handleReachBottom.value === handleAnimeReachBottom)
    handleReachBottom.value = undefined
  if (handlePageRefresh.value === handleAnimePageRefresh)
    handlePageRefresh.value = undefined
})

watch(() => topBarStore.userInfo.mid, () => {
  if (animeMounted)
    reloadAnimePage()
})

function getAnimeAccountId() {
  return String(topBarStore.userInfo.mid || getUserID() || 0)
}

function isAnimeRequestCurrent(generation: number, requestAccountId: string) {
  return animeMounted
    && generation === requestGeneration
    && requestAccountId === getAnimeAccountId()
}

function reloadAnimePage() {
  const generation = ++requestGeneration
  const requestAccountId = getAnimeAccountId()
  animeWatchList.length = 0
  recommendAnimeList.length = 0
  popularAnimeList.length = 0
  cursor.value = 0
  noMoreContent.value = false
  recommendRequestFailed.value = false
  isLoadingAnimeWatchList.value = false
  isLoadingPopularAnime.value = false
  isLoadingRecommendAnime.value = false
  void getAnimeWatchList(generation, requestAccountId)
  void getPopularAnimeList(generation, requestAccountId)
  void getRecommendAnimeList(generation, requestAccountId)
  animeTimeTableRef.value?.refreshAnimeTimeTable()
}

async function handleAnimeReachBottom() {
  if (isLoadingRecommendAnime.value || noMoreContent.value || recommendRequestFailed.value)
    return false
  return getRecommendAnimeList()
}

function handleAnimePageRefresh() {
  if (isLoading.value)
    return
  reloadAnimePage()
}

function initPageAction() {
  handleReachBottom.value = handleAnimeReachBottom
  handlePageRefresh.value = handleAnimePageRefresh
}

async function getAnimeWatchList(generation = requestGeneration, requestAccountId = getAnimeAccountId()) {
  isLoadingAnimeWatchList.value = true
  try {
    const response: WatchListResult = await api.anime.getAnimeWatchList({
      vmid: requestAccountId,
      pn: 1,
      follow_status: 2,
      ps: 30,
    })
    if (!isAnimeRequestCurrent(generation, requestAccountId))
      return
    const list = Array.isArray(response.data?.list) ? response.data.list : []
    animeWatchList.splice(0, animeWatchList.length, ...(response.code === 0 ? list : []))
  }
  catch {
    if (isAnimeRequestCurrent(generation, requestAccountId))
      animeWatchList.length = 0
  }
  finally {
    if (isAnimeRequestCurrent(generation, requestAccountId))
      isLoadingAnimeWatchList.value = false
  }
}

async function getRecommendAnimeList(
  generation = requestGeneration,
  requestAccountId = getAnimeAccountId(),
): Promise<boolean> {
  if (isLoadingRecommendAnime.value)
    return false
  recommendRequestFailed.value = false
  isLoadingRecommendAnime.value = true
  try {
    const response: RecommendationResult = await api.anime.getRecommendAnimeList({
      coursor: cursor.value,
    })
    if (!isAnimeRequestCurrent(generation, requestAccountId))
      return false
    if (response.code !== 0) {
      recommendRequestFailed.value = true
      return true
    }

    const items = Array.isArray(response.data?.items) ? response.data.items : []
    const subItems = Array.isArray(items[0]?.sub_items) ? items[0].sub_items : []
    recommendAnimeList.push(...subItems)
    cursor.value = response.data.coursor
    noMoreContent.value = !response.data.has_next || subItems.length === 0
    return true
  }
  catch (error) {
    if (isAnimeRequestCurrent(generation, requestAccountId)) {
      recommendRequestFailed.value = true
      reportRuntimeFailure('Failed to load anime recommendations', error)
    }
    return true
  }
  finally {
    if (isAnimeRequestCurrent(generation, requestAccountId))
      isLoadingRecommendAnime.value = false
  }
}

async function getPopularAnimeList(generation = requestGeneration, requestAccountId = getAnimeAccountId()) {
  isLoadingPopularAnime.value = true
  try {
    const response: PopularAnimeResult = await api.anime.getPopularAnimeList()
    if (!isAnimeRequestCurrent(generation, requestAccountId))
      return
    const list = Array.isArray(response.result?.list) ? response.result.list : []
    popularAnimeList.splice(0, popularAnimeList.length, ...(response.code === 0 ? list : []))
  }
  finally {
    if (isAnimeRequestCurrent(generation, requestAccountId))
      isLoadingPopularAnime.value = false
  }
}
</script>

<template>
  <div>
    <div>
      <!-- Your Watchlist -->
      <section v-if="getUserID()" class="anime-section">
        <div flex justify-between items-center mb-6>
          <h3 class="bew-page-heading" text="$bew-text-1">
            {{ $t('anime.your_watch_list') }}
          </h3>
          <Button
            size="large"
            style="
              --b-button-shadow: var(--bew-shadow-1);
            "
            @click="openLinkToNewTab(`https://space.bilibili.com/${getUserID() ?? 0}/bangumi`)"
          >
            {{ $t('common.view_all') }}
          </Button>
        </div>

        <HorizontalScrollView w="[calc(100%+1.5rem)]">
          <div w-full flex>
            <BangumiCardSkeleton
              v-for="item in 6"
              v-show="isLoadingAnimeWatchList" :key="item"
              w="2xl:[calc(100%/6-1.5rem)] xl:[calc(100%/5-1.5rem)] lg:[calc(100%/4-1.5rem)] md:[calc(100%/3-1.5rem)] sm:[calc(100%/2-1.5rem)] [calc(100%-1.5rem)]"
              last:w="2xl:1/6 xl:1/5 lg:1/4 md:1/3 sm:1/2 full"
              shrink-0
              mr-6 important-mb-0
              last:pr-6
            />
            <BangumiCard
              v-for="item in animeWatchList"
              v-show="!item.title.includes('MADEBYBILIBILI') || !item.title.includes('号作品')"
              :key="item.short_url"
              :bangumi="{
                url: item.url,
                cover: item.cover,
                coverHover: item?.horizontal_cover_16_9,
                title: item.title,
                desc: item.progress !== '' ? item.progress : $t('anime.havent_seen'),
                evaluate: item.evaluate,
                tags: item.styles,
                capsuleText: item.is_finish && item.total_count
                  ? $t('anime.total_episodes', { ep: item.total_count })
                  : (!item.is_finish && item.formal_ep_count
                    ? $t('anime.update_to_n_episodes', {
                      ep: item.formal_ep_count,
                    })
                    : ''),
                badge: {
                  text: item.badge_info.text || '',
                  bgColor: item.badge_info.bg_color || '',
                  bgColorDark: item.badge_info.bg_color_night || '',
                },
              }"
              w="2xl:[calc(100%/6-1.5rem)] xl:[calc(100%/5-1.5rem)] lg:[calc(100%/4-1.5rem)] md:[calc(100%/3-1.5rem)] sm:[calc(100%/2-1.5rem)] [calc(100%-1.5rem)]"
              last:w="2xl:1/6 xl:1/5 lg:1/4 md:1/3 sm:1/2 full"
              shrink-0
              mr-6 important-mb-0
              last:pr-6
            />
          </div>
        </HorizontalScrollView>
      </section>

      <!-- Popular Anime -->
      <section class="anime-section">
        <div flex justify-between items-center mb-6>
          <h3 class="bew-page-heading" text="$bew-text-1">
            {{ $t('anime.popular_anime') }}
          </h3>
          <Button
            size="large"
            style="
              --b-button-shadow: var(--bew-shadow-1);
            "
            @click="openLinkToNewTab(`https://www.bilibili.com/v/popular/rank/bangumi`)"
          >
            {{ $t('common.view_all') }}
          </Button>
        </div>

        <HorizontalScrollView w="[calc(100%+1.5rem)]">
          <div w-full flex>
            <BangumiCardSkeleton
              v-for="item in 6"
              v-show="isLoadingPopularAnime" :key="item"
              w="2xl:[calc(100%/6-1.5rem)] xl:[calc(100%/5-1.5rem)] lg:[calc(100%/4-1.5rem)] md:[calc(100%/3-1.5rem)] sm:[calc(100%/2-1.5rem)] [calc(100%-1.5rem)]"
              last:w="2xl:1/6 xl:1/5 lg:1/4 md:1/3 sm:1/2 full"
              shrink-0
              mr-6 important-mb-0
              last:pr-6
            />
            <BangumiCard
              v-for="item in popularAnimeList"
              :key="item.url"
              w="2xl:[calc(100%/6-1.5rem)] xl:[calc(100%/5-1.5rem)] lg:[calc(100%/4-1.5rem)] md:[calc(100%/3-1.5rem)] sm:[calc(100%/2-1.5rem)] [calc(100%-1.5rem)]"
              last:w="2xl:1/6 xl:1/5 lg:1/4 md:1/3 sm:1/2 full"
              shrink-0
              mr-6 important-mb-0
              last:pr-6
              :bangumi="{
                url: item.url,
                cover: item.cover,
                title: item.title,
                desc: $t('anime.follow', { num: numFormatter(item.stat.series_follow) }),
                capsuleText: item.rating.replace('分', ''),
                rank: item.rank,
                badge: {
                  text: item.badge_info.text || '',
                  bgColor: item.badge_info.bg_color || '',
                  bgColorDark: item.badge_info.bg_color_night || '',
                },
              }"
            />
          </div>
        </HorizontalScrollView>
      </section>

      <!-- Anime Timetable -->
      <section class="anime-section">
        <div flex justify-between items-end>
          <h3 class="bew-page-heading" text="$bew-text-1">
            {{ $t('anime.anime_timetable.title') }}
          </h3>
        </div>

        <AnimeTimeTable ref="animeTimeTableRef" w="[calc(100%+1.5rem)]" />
      </section>

      <!-- Recommended for you -->
      <section class="anime-section">
        <h3 class="bew-page-heading" text="$bew-text-1" mb-6>
          {{ $t('anime.recommended_for_you') }}
        </h3>
        <div grid="~ 2xl:cols-6 xl:cols-5 lg:cols-4 md:cols-3 sm:cols-2 cols-1 gap-6">
          <BangumiCard
            v-for="item in recommendAnimeList"
            :key="item.episode_id"
            :bangumi="{
              url: item.link ?? '',
              cover: item.cover,
              coverHover: item?.hover?.img,
              tags: item?.hover?.text,
              title: item.title,
              desc: item.sub_title,
              evaluate: item.evaluate,
              capsuleText: item.rating,
            }"
            @mouseenter="activatedSeasonId = item.season_id"
            @mouseleave="activatedSeasonId = 0"
          />

          <BangumiCardSkeleton
            v-for="item in 30"
            v-show="isLoadingRecommendAnime"
            :key="item"
            important-mb-0
          />
        </div>
        <Empty v-if="recommendRequestFailed" :description="$t('common.load_failed')">
          <Button type="tertiary" @click="getRecommendAnimeList">
            {{ $t('common.operation.refresh') }}
          </Button>
        </Empty>
      </section>
    </div>

    <!-- no more content -->
    <Empty v-if="noMoreContent" class="pb-4" :description="$t('common.no_more_content')" />
  </div>
</template>

<style lang="scss" scoped>
.anime-section {
  --uno: "mb-8 mt-14 first:mt-0";
}
</style>
