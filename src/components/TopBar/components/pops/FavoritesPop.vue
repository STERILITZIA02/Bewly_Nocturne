<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getUserID, removeHttpFromUrl, scrollToTop } from '~/utils/main'

import type { FavoriteCategory, FavoriteResource } from '../../types'

const favoriteCategories = reactive<Array<FavoriteCategory>>([])
const favoriteResources = reactive<Array<FavoriteResource>>([])

const activatedMediaId = ref<number>(0)
const activatedFavoriteTitle = ref<string>()
const currentPageNum = ref<number>(1)

const isLoading = ref<boolean>(false)
// when noMoreContent is true, the user can't scroll down to load more content
const noMoreContent = ref<boolean>(false)
const favoriteVideosWrap = ref<HTMLElement>() as Ref<HTMLElement>
const topBarStore = useTopBarStore()
const { t } = useI18n()
const toast = useToast()
const { favoriteStateVersion } = storeToRefs(topBarStore)
let favoriteDataRequestVersion = 0
let favoriteResourcesRequestVersion = 0

const viewAllUrl = computed((): string => {
  return `//space.bilibili.com/${getUserID()}/favlist?fid=${
    activatedMediaId.value
  }&ftype=create`
})

const playAllUrl = computed((): string => {
  return `https://www.bilibili.com/list/ml${activatedMediaId.value}`
})

watch(activatedMediaId, (newId, oldId) => {
  if (newId === oldId)
    return

  favoriteResources.length = 0
  if (favoriteVideosWrap.value)
    scrollToTop(favoriteVideosWrap.value)

  currentPageNum.value = 1
  noMoreContent.value = false
  void getFavoriteResources(true)
})

watch(favoriteStateVersion, () => {
  void refreshFavoriteData()
})

onMounted(() => {
  initData()
})

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (isLoading.value || noMoreContent.value || favoriteResources.length === 0)
    return

  if (activatedMediaId.value) {
    void getFavoriteResources()
  }
}

useOptimizedScroll(
  favoriteVideosWrap,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

async function initData() {
  await refreshFavoriteData()
}

async function refreshFavoriteData() {
  const requestVersion = ++favoriteDataRequestVersion
  favoriteResourcesRequestVersion++
  const previousMediaId = activatedMediaId.value
  const loaded = await getFavoriteCategories(requestVersion)
  if (requestVersion !== favoriteDataRequestVersion)
    return
  if (!loaded) {
    isLoading.value = false
    return
  }

  const category = favoriteCategories.find(item => item.id === previousMediaId) || favoriteCategories[0]
  if (!category) {
    activatedMediaId.value = 0
    activatedFavoriteTitle.value = undefined
    favoriteResources.length = 0
    favoriteResourcesRequestVersion++
    isLoading.value = false
    return
  }

  if (activatedMediaId.value === category.id) {
    activatedFavoriteTitle.value = category.title
    refreshFavoriteResources()
  }
  else {
    changeCategory(category)
  }
}

async function getFavoriteCategories(requestVersion?: number): Promise<boolean> {
  try {
    const res = await api.favorite.getFavoriteCategories({
      up_mid: getUserID(),
    })
    if (requestVersion !== undefined && requestVersion !== favoriteDataRequestVersion)
      return false

    if (res.code !== 0) {
      toast.error(t('common.load_failed'))
      return false
    }

    favoriteCategories.length = 0
    favoriteCategories.push(...res.data.list)
    noMoreContent.value = false
    return true
  }
  catch (error) {
    console.error('Failed to load favorite categories:', error)
    if (requestVersion === undefined || requestVersion === favoriteDataRequestVersion)
      toast.error(t('common.load_failed'))
    return false
  }
}

/**
 * Get favorite video resources
 */
async function getFavoriteResources(force = false) {
  if (isLoading.value && !force)
    return

  const requestVersion = ++favoriteResourcesRequestVersion
  const mediaId = activatedMediaId.value
  const pageNum = currentPageNum.value
  isLoading.value = true

  try {
    const res = await api.favorite.getFavoriteResources({
      media_id: mediaId,
      pn: pageNum,
      keyword: '',
    })

    if (requestVersion !== favoriteResourcesRequestVersion || mediaId !== activatedMediaId.value)
      return

    const { code, data } = res
    if (code === 0) {
      // 检查是否还有更多内容
      if (data && 'has_more' in data && !data.has_more) {
        noMoreContent.value = true
      }
      else {
        noMoreContent.value = false
      }

      // 添加数据到列表
      if (data && 'medias' in data && Array.isArray(data.medias) && data.medias.length > 0) {
        const existingIds = new Set(favoriteResources.map(item => `${item.type}:${item.id}`))
        const newResources = data.medias.filter((item: FavoriteResource | null) => {
          if (!item)
            return false
          const key = `${item.type}:${item.id}`
          if (existingIds.has(key))
            return false
          existingIds.add(key)
          return true
        })
        favoriteResources.push(...newResources)
      }
      else if (!data || !data.medias || data.medias.length === 0) {
        // 如果没有数据返回，也标记为没有更多内容
        noMoreContent.value = true
      }
      currentPageNum.value = pageNum + 1
    }
    else {
      toast.error(t('common.load_failed'))
    }
  }
  catch (error) {
    console.error('Failed to load favorite resources:', error)
    if (requestVersion === favoriteResourcesRequestVersion)
      toast.error(t('common.load_failed'))
  }
  finally {
    if (requestVersion === favoriteResourcesRequestVersion)
      isLoading.value = false
  }
}

function refreshFavoriteResources() {
  favoriteResources.length = 0
  currentPageNum.value = 1
  noMoreContent.value = false
  void getFavoriteResources(true)
}

function changeCategory(categoryItem: FavoriteCategory) {
  activatedMediaId.value = categoryItem.id
  activatedFavoriteTitle.value = categoryItem.title
}

function isMusic(item: FavoriteResource) {
  return item.link.includes('bilibili://music')
}

defineExpose({
  refreshFavoriteData,
  refreshFavoriteResources,
})
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
    h="[calc(100vh-100px)]" max-h-500px important-overflow-y-overlay
    bg="$bew-elevated"
    w="450px"
    rounded="$bew-radius"
    pos="relative"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-surface-border-color"
    class="favorites-pop"
  >
    <!-- top bar -->
    <header
      flex="~" items-center justify-between
      p="x-6"
      pos="sticky top-0 left-0"
      w="full"
      h-50px
      z="2"
    >
      <h3 cursor="pointer" font-600 @click="scrollToTop(favoriteVideosWrap)">
        {{ activatedFavoriteTitle }}
      </h3>

      <div flex="~ gap-4">
        <ALink
          :href="playAllUrl"
          type="topBar"
          flex="~" items="center"
        >
          <span text="sm">{{ $t('common.play_all') }}</span>
        </ALink>
        <ALink
          :href="viewAllUrl"
          type="topBar"
          flex="~" items="center"
        >
          <span text="sm">{{ $t('common.view_all') }}</span>
        </ALink>
      </div>
    </header>

    <main flex="~" h="[calc(100%-50px)]" rounded="$bew-radius">
      <aside
        pos="sticky top-50px left-0"
        w="140px" h-full overflow="y-auto"
        flex="shrink-0" bg="$bew-fill-1"
      >
        <ul grid="~ cols-1">
          <li
            v-for="item in favoriteCategories"
            :key="item.id"
            :class="activatedMediaId === item.id ? 'activated-category' : ''"
            p="y-2 x-6"
            cursor="pointer"
            transition="background-color duration-200, color duration-200, opacity duration-200"
            @click="changeCategory(item)"
          >
            {{ item.title }}
          </li>
        </ul>
      </aside>

      <!-- Favorite videos wrapper -->
      <div
        ref="favoriteVideosWrap"
        flex="~ col gap-2 1"
        overflow="y-auto"
        p="x-4"
        pos="relative"
        h-full
      >
        <!-- loading -->
        <Loading
          v-if="isLoading && favoriteResources.length === 0"
          pos="absolute left-0"
          bg="$bew-content"
          z="1"
          w="full"
          h="full"
          flex="~"
          items="center"
          rounded="$bew-radius"
        />

        <!-- empty -->
        <Empty
          v-if="!isLoading && favoriteResources.length === 0"
          w="full" h="full"
          rounded="$bew-radius-half"
        />

        <!-- favorites -->
        <TransitionGroup name="list">
          <article
            v-for="item in favoriteResources"
            :key="`${item.type}:${item.id}`"
            hover:bg="$bew-fill-2"
            rounded="$bew-radius"
            m="last:b-4" p="2"
            class="group popover-card"
            transition="background-color duration-200, color duration-200, opacity duration-200"
          >
            <ALink
              class="popover-card__primary"
              :href="isMusic(item) ? `https://www.bilibili.com/audio/au${item.id}` : `//www.bilibili.com/video/${item.bvid}`"
              :aria-label="item.title"
              type="topBar"
            />
            <section class="popover-card__content" flex="~ gap-4" items-start>
              <div
                class="popover-card__media aspect-video"
                bg="$bew-skeleton"
                w="120px"
                flex="shrink-0"
              >
                <div pos="relative" w-full h-full>
                  <img
                    w-full h-full
                    :src="`${removeHttpFromUrl(item.cover)}@256w_144h_1c`"
                    :alt="item.title"
                    object-cover
                  >
                  <div
                    pos="absolute bottom-0 right-0"
                    bg="black opacity-60"
                    m="1"
                    p="x-2 y-1"
                    text="white xs"
                    rounded-full
                  >
                    {{ calcCurrentTime(item.duration) }}
                  </div>
                </div>
              </div>

              <!-- Description -->
              <div>
                <h3
                  class="keep-two-lines"
                >
                  {{ item.title }}
                </h3>
                <div
                  text="$bew-text-2 sm"
                  m="t-2"
                  flex="~"
                  items-center
                >
                  <ALink
                    :href="`https://space.bilibili.com/${item.upper.mid}`"
                    type="topBar"
                    class="popover-card__interactive"
                  >
                    {{ item.upper.name }}
                  </ALink>
                </div>
              </div>
            </section>
          </article>
        </TransitionGroup>

        <!-- loading -->
        <Transition name="fade">
          <Loading v-if="isLoading && favoriteResources.length !== 0" m="b-4" />
        </Transition>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/popoverCards";

.activated-category {
  --uno: "bg-$bew-theme-color text-$bew-on-theme-color";
}
</style>
