<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { removeHttpFromUrl, scrollToTop } from '~/utils/main'

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
const currentAccountId = computed(() => resolveAuthenticatedAccountId(
  topBarStore.isLogin,
  topBarStore.userInfo.mid,
))

const viewAllUrl = computed((): string => {
  return `//space.bilibili.com/${currentAccountId.value ?? 0}/favlist?fid=${
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
  if (newId)
    void getFavoriteResources(true)
})

watch(favoriteStateVersion, () => {
  if (currentAccountId.value !== null)
    void refreshFavoriteData()
})

watch(currentAccountId, (accountId) => {
  resetFavoriteState()
  if (accountId !== null)
    void refreshFavoriteData()
}, { immediate: true })

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

function resetFavoriteState() {
  favoriteDataRequestVersion++
  favoriteResourcesRequestVersion++
  favoriteCategories.length = 0
  favoriteResources.length = 0
  activatedMediaId.value = 0
  activatedFavoriteTitle.value = undefined
  currentPageNum.value = 1
  noMoreContent.value = false
  isLoading.value = false
}

async function refreshFavoriteData() {
  const requestVersion = ++favoriteDataRequestVersion
  const requestAccountId = currentAccountId.value
  favoriteResourcesRequestVersion++
  if (requestAccountId === null)
    return

  const previousMediaId = activatedMediaId.value
  const loaded = await getFavoriteCategories(requestVersion, requestAccountId)
  if (requestVersion !== favoriteDataRequestVersion || requestAccountId !== currentAccountId.value)
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

async function getFavoriteCategories(requestVersion: number, requestAccountId: number): Promise<boolean> {
  try {
    const res = await api.favorite.getFavoriteCategories({
      up_mid: String(requestAccountId),
    })
    if (requestVersion !== favoriteDataRequestVersion || requestAccountId !== currentAccountId.value)
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
    if (requestVersion === favoriteDataRequestVersion && requestAccountId === currentAccountId.value)
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
  const requestAccountId = currentAccountId.value
  if (requestAccountId === null)
    return
  const mediaId = activatedMediaId.value
  const pageNum = currentPageNum.value
  isLoading.value = true

  try {
    const res = await api.favorite.getFavoriteResources({
      media_id: mediaId,
      pn: pageNum,
      keyword: '',
    })

    if (
      requestVersion !== favoriteResourcesRequestVersion
      || requestAccountId !== currentAccountId.value
      || mediaId !== activatedMediaId.value
    ) {
      return
    }

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
    if (requestVersion === favoriteResourcesRequestVersion && requestAccountId === currentAccountId.value)
      toast.error(t('common.load_failed'))
  }
  finally {
    if (requestVersion === favoriteResourcesRequestVersion && requestAccountId === currentAccountId.value)
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
    class="favorites-pop bew-popover bew-popover-surface"
  >
    <header class="bew-popover__header">
      <h3 class="bew-popover__title" cursor="pointer" @click="scrollToTop(favoriteVideosWrap)">
        {{ activatedFavoriteTitle }}
      </h3>

      <div class="bew-popover__actions">
        <ALink
          :href="playAllUrl"
          type="topBar"
          class="bew-popover__action"
        >
          {{ $t('common.play_all') }}
        </ALink>
        <ALink
          :href="viewAllUrl"
          type="topBar"
          class="bew-popover__action"
        >
          {{ $t('common.view_all') }}
        </ALink>
      </div>
    </header>

    <main class="bew-popover__split-body">
      <aside
        class="bew-popover__sidebar favorites-pop__sidebar"
      >
        <ul grid="~ cols-1">
          <li
            v-for="item in favoriteCategories"
            :key="item.id"
            :class="activatedMediaId === item.id ? 'activated-category' : ''"
            class="favorites-pop__category"
            @click="changeCategory(item)"
          >
            {{ item.title }}
          </li>
        </ul>
      </aside>

      <!-- Favorite videos wrapper -->
      <div
        ref="favoriteVideosWrap"
        class="bew-popover__scroll bew-popover__list favorites-pop__content"
      >
        <Loading
          v-if="isLoading && favoriteResources.length === 0"
          class="bew-popover__state"
        />

        <Empty
          v-if="!isLoading && favoriteResources.length === 0"
          class="bew-popover__state"
        />

        <!-- favorites -->
        <TransitionGroup name="list">
          <article
            v-for="item in favoriteResources"
            :key="`${item.type}:${item.id}`"
            class="group popover-card"
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
              <div class="popover-card__copy">
                <h3
                  class="keep-two-lines popover-card__title"
                >
                  {{ item.title }}
                </h3>
                <div
                  class="popover-card__meta"
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

.favorites-pop {
  width: 450px;
  height: min(500px, var(--bew-popover-max-height));
}

.favorites-pop__sidebar {
  width: 140px;
  padding: var(--bew-space-2);
  background: var(--bew-fill-1);
}

.favorites-pop__category {
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2) var(--bew-space-3);
  overflow: hidden;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  cursor: pointer;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.favorites-pop__category:hover {
  background: var(--bew-fill-1);
}

.activated-category {
  color: var(--bew-theme-foreground);
  background: var(--bew-fill-2);
}

.favorites-pop__content {
  position: relative;
  padding-top: var(--bew-space-1);
}

.favorites-pop .popover-card__media {
  flex: 0 0 120px;
  width: 120px;
}

@media (max-width: 480px) {
  .favorites-pop__sidebar {
    width: 112px;
  }

  .favorites-pop .popover-card__content {
    gap: var(--bew-space-3);
  }

  .favorites-pop .popover-card__media {
    flex-basis: 96px;
    width: 96px;
  }
}
</style>
