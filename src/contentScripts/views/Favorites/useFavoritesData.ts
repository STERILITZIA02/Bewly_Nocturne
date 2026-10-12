import { computed, reactive, ref, watch } from 'vue'

import { LIBRARY_AUTOFILL_PAGE_LIMIT } from '~/constants/library'
import type { FavoriteArticle, FavoriteArticlesResult } from '~/models/article/favorite'
import type { FavoritesResult, Media as FavoriteItem } from '~/models/video/favorite'
import type { FavoritesCategoryResult, List as CategoryItem } from '~/models/video/favoriteCategory'
import type { CollectedFavoriteSeason, CollectedFavoriteSeasonsResult, FavoriteSource } from '~/models/video/favoriteSeason'
import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import type api from '~/utils/api'
import { createFavoriteAvatarLoader } from '~/utils/favoriteAvatar'
import { getFavoriteFolderEditedAttr } from '~/utils/favoriteFolder'
import { getFavoriteResourceKey, getFavoriteSourceKey } from '~/utils/favoriteResource'
import {
  FAVORITE_FOLDER_PAGE_SIZE,
  FAVORITE_SUBSCRIPTIONS_PAGE_SIZE,
  fetchFavoriteSeasonPage,
  mergeFavoriteSeasonPage,
} from '~/utils/favoriteSeason'

import { getFavoriteArticleCover } from './favoriteAdapters'
import { createFavoriteFolderCoverLoader } from './favoriteFolderCovers'
import { matchesFavoriteQuery } from './favoriteSearch'
import type { FavoriteVideoOrder, OtherFavoriteItem, OtherFavoriteKind, OtherFavoriteSearchScope, SubscriptionFilter } from './otherFavorites'
import { matchesSubscriptionType, OTHER_FAVORITE_PAGE_SIZE, parseOtherFavoritePage } from './otherFavorites'
import type { FavoriteWrite } from './useFavoriteWrites'

export type FavoriteView = 'video' | 'season' | 'article'

interface FavoritesDataDependencies {
  api: typeof api.favorite
  user: Pick<typeof api.user, 'getUserCard'>
  getAccountId: () => AccountId
  haveScrollbar: () => Promise<boolean>
  t: (key: string) => string
}

export function useFavoritesData(dependencies: FavoritesDataDependencies) {
  const { t, haveScrollbar } = dependencies
  const lifetime = createAccountLifetime(dependencies.getAccountId)
  let viewAccount = dependencies.getAccountId()
  const contentVersion = ref(0)
  let contentController = new AbortController()
  let categoryController: AbortController | undefined
  let subscriptionController: AbortController | undefined
  let categoriesDirty = false
  let categoriesVersion = 0
  let subscriptionsVersion = 0
  let stalledSubscriptionStart: { page: number, length: number } | undefined
  let stalledMediaStart: { page: number, length: number } | undefined
  let stalledArticleStart: { page: number, length: number } | undefined
  const categoryState = reactive({ loading: false, failed: false, loaded: false })
  const subscriptionState = reactive({ loading: false, failed: false, loaded: false, hasMore: true, page: 0 })
  const resourceIndex = new Map<string, number>()
  const pendingAvatarKeys = new Set<string>()
  const createAvatars = () => createFavoriteAvatarLoader(async (mid, signal) => {
    const response = await dependencies.user.getUserCard({ mid: String(mid) }, { signal })
    const face = response?.data?.card?.face
    return response?.code === 0 && typeof face === 'string' && face ? face : undefined
  })
  let avatars = createAvatars()
  const FAVORITE_ARTICLE_PAGE_SIZE = 20
  const favoriteCategories = reactive<CategoryItem[]>([])
  const collectedFavoriteSeasons = reactive<CollectedFavoriteSeason[]>([])
  const favoriteResources = reactive<FavoriteItem[]>([])
  const favoriteArticles = reactive<FavoriteArticle[]>([])
  const otherFavoriteType = ref<OtherFavoriteKind>('article')
  const otherSearchScope = ref<OtherFavoriteSearchScope>('all')
  const otherFavoriteItems = reactive<OtherFavoriteItem[]>([])
  const otherFavoriteCounts = reactive<Partial<Record<OtherFavoriteKind, number>>>({})
  const otherItemIds = new Set<string>()
  let stalledOtherStart: { page: number, length: number } | undefined
  const videoOrder = ref<FavoriteVideoOrder>('mtime')
  const subscriptionFilter = ref<SubscriptionFilter>('all')
  const folderCoverLoader = createFavoriteFolderCoverLoader(async (id, signal) => {
    const owner = lifetime.capture()
    if (!owner.isCurrent() || !favoriteCategories.some(item => item.id === id))
      throw new Error('inactive-favorite-folder')
    const result: FavoritesResult = await dependencies.api.getFavoriteResources({ media_id: id, pn: 1, ps: 1 }, { signal })
    if (!owner.isCurrent() || result.code !== 0 || !result.data?.info || !favoriteCategories.some(item => item.id === id))
      throw new Error('unavailable-favorite-cover')
    return result.data.info.cover || ''
  })
  const favoriteView = ref<FavoriteView>('video')
  const selectedCategory = ref<CategoryItem>()
  const selectedSeason = ref<CollectedFavoriteSeason>()
  const activatedCategoryCover = ref<string>('')
  const currentPageNum = ref<number>(0)
  const keywords = reactive<Record<FavoriteView, string>>({ video: '', season: '', article: '' })
  const keyword = computed({ get: () => keywords[favoriteView.value], set: (value: string) => keywords[favoriteView.value] = value })
  const searchScope = ref<'current' | 'all'>('current')
  const isLoading = ref<boolean>(false)
  const isFullPageLoading = ref<boolean>(true)
  const bootstrapFailed = computed(() => favoriteView.value === 'video'
    ? categoryState.failed && !favoriteCategories.length
    : favoriteView.value === 'season' && subscriptionState.failed && !collectedFavoriteSeasons.length)
  const failedContentPage = ref<number | null>(null)
  const stalledContentPage = ref<number | null>(null)
  const noMoreContent = ref<boolean>(false)
  const loadedSeasonComplete = ref<boolean>(false)
  const articleFavoriteCount = ref<number>()
  const articleFavoriteOffset = ref<string>('')
  const articleIds = new Set<string>()
  const visibleSubscriptions = computed(() => collectedFavoriteSeasons.filter(item => matchesSubscriptionType(item.type, subscriptionFilter.value) && matchesFavoriteQuery(keyword.value, item.title, item.upper?.name)))
  const selectedSeasonMatches = computed(() => Boolean(selectedSeason.value && matchesFavoriteQuery(keyword.value, selectedSeason.value.title, selectedSeason.value.upper?.name)))
  const visibleResources = computed(() => favoriteView.value !== 'season' || selectedSeasonMatches.value
    ? favoriteResources
    : favoriteResources.filter(item => matchesFavoriteQuery(keyword.value, item.title, item.upper?.name)))
  const visibleArticles = computed(() => favoriteArticles.filter(item => matchesFavoriteQuery(keyword.value, otherSearchScope.value === 'detail' ? '' : item.content, otherSearchScope.value === 'title' ? '' : item.author?.name)))
  const visibleOtherFavorites = computed(() => otherFavoriteItems.filter(item => matchesFavoriteQuery(keyword.value, otherSearchScope.value === 'detail' ? '' : item.title, otherSearchScope.value === 'title' ? '' : item.desc)))
  const pageVisible = ref(typeof document === 'undefined' || !document.hidden)
  const updateVisibility = () => pageVisible.value = !document.hidden
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', updateVisibility)
  // These endpoints have no verified keyword parameter. Continue their owned
  // pagination while searching, retaining raw pages so edits/clear reuse data.
  const stopSearch = watch([
    pageVisible,
    keyword,
    favoriteView,
    subscriptionFilter,
    otherSearchScope,
    isLoading,
    isFullPageLoading,
    noMoreContent,
    failedContentPage,
    stalledContentPage,
    () => subscriptionState.loading,
    () => subscriptionState.hasMore,
    () => subscriptionState.failed,
  ], () => {
    if (!pageVisible.value || favoriteView.value === 'video' || !lifetime.capture().isCurrent())
      return
    if (!keyword.value.trim() && !(favoriteView.value === 'season' && subscriptionFilter.value !== 'all'))
      return
    if (favoriteView.value === 'season' && subscriptionState.loaded && !subscriptionState.loading && subscriptionState.hasMore && !subscriptionState.failed)
      void loadMoreSubscriptions()
    if (keyword.value.trim() && !isLoading.value && !isFullPageLoading.value && (favoriteView.value === 'article' || !selectedSeasonMatches.value))
      void loadNextPage()
  }, { flush: 'post' })

  async function initData() {
    if (!lifetime.capture().isCurrent()) {
      isFullPageLoading.value = false
      return
    }
    resetContentState()
    folderCoverLoader.reset()
    categoriesVersion++
    subscriptionsVersion++
    stalledSubscriptionStart = undefined
    Object.assign(categoryState, { loading: false, failed: false, loaded: false })
    Object.assign(subscriptionState, { loading: false, failed: false, loaded: false, hasMore: true, page: 0 })
    favoriteCategories.length = 0
    collectedFavoriteSeasons.length = 0
    selectedCategory.value = undefined
    selectedSeason.value = undefined
    failedContentPage.value = null
    noMoreContent.value = false
    isFullPageLoading.value = true

    await Promise.all([
      getFavoriteCategories(),
      loadMoreSubscriptions(),
    ])
  }

  function retryFavoritesBootstrap() {
    return favoriteView.value === 'season' ? loadMoreSubscriptions(true) : getFavoriteCategories()
  }

  async function getFavoriteCategories() {
    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return
    const version = ++categoriesVersion
    categoryController?.abort()
    const controller = categoryController = new AbortController()
    categoryState.loading = true
    categoryState.failed = false
    const current = () => owner.isCurrent() && version === categoriesVersion
    try {
      const res: FavoritesCategoryResult = await dependencies.api.getFavoriteCategories({ up_mid: String(owner.accountId) }, { signal: controller.signal })
      if (!current())
        return
      if (res.code !== 0 || !res.data)
        throw res
      const selectedId = selectedCategory.value?.id
      favoriteCategories.splice(0, favoriteCategories.length, ...(res.data.list ?? []))
      if (selectedId)
        selectedCategory.value = favoriteCategories.find(folder => folder.id === selectedId)
      categoryState.loaded = true
      if (favoriteView.value === 'video' && !selectedCategory.value) {
        selectedCategory.value = favoriteCategories[0]
        void loadSelectedContent()
      }
    }
    catch {
      if (current()) {
        categoryState.failed = true
        if (favoriteView.value === 'video' && !selectedCategory.value)
          isFullPageLoading.value = false
      }
    }
    finally {
      if (current())
        categoryState.loading = false
    }
  }

  async function loadMoreSubscriptions(retry = false) {
    if (subscriptionState.loading || (!retry && (subscriptionState.failed || !subscriptionState.hasMore)))
      return
    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return
    const version = ++subscriptionsVersion
    subscriptionController?.abort()
    const controller = subscriptionController = new AbortController()
    const pn = subscriptionState.page + 1
    const pageStartLength = stalledSubscriptionStart?.page === pn ? stalledSubscriptionStart.length : collectedFavoriteSeasons.length
    subscriptionState.loading = true
    subscriptionState.failed = false
    const current = () => owner.isCurrent() && version === subscriptionsVersion
    try {
      const res: CollectedFavoriteSeasonsResult = await dependencies.api.getCollectedFavoriteSeasons({ up_mid: String(owner.accountId), pn, ps: FAVORITE_SUBSCRIPTIONS_PAGE_SIZE }, { signal: controller.signal })
      if (!current())
        return
      if (res.code !== 0 || !res.data)
        throw res
      const existing = new Map(collectedFavoriteSeasons.map(item => [getFavoriteSourceKey(item), item]))
      for (const item of res.data.list ?? []) {
        if (!existing.has(getFavoriteSourceKey(item))) {
          collectedFavoriteSeasons.push(item)
          existing.set(getFavoriteSourceKey(item), item)
        }
      }
      subscriptionState.loaded = true
      const hasMore = res.data.has_more
      if ((hasMore && collectedFavoriteSeasons.length <= pageStartLength) || (!hasMore && res.data.count > collectedFavoriteSeasons.length)) {
        stalledSubscriptionStart = { page: pn, length: pageStartLength }
        throw new Error('subscription-pagination-stalled')
      }
      stalledSubscriptionStart = undefined
      subscriptionState.page = pn
      subscriptionState.hasMore = hasMore
      if (favoriteView.value === 'season' && !selectedSeason.value) {
        selectedSeason.value = collectedFavoriteSeasons.find(item => matchesSubscriptionType(item.type, subscriptionFilter.value))
        void loadSelectedContent()
      }
    }
    catch {
      if (current()) {
        subscriptionState.failed = true
        if (favoriteView.value === 'season' && !selectedSeason.value)
          isFullPageLoading.value = false
      }
    }
    finally {
      if (current())
        subscriptionState.loading = false
    }
  }

  function resetContentState() {
    avatars.cancelPending()
    pendingAvatarKeys.clear()
    contentController.abort()
    contentController = new AbortController()
    stalledMediaStart = undefined
    stalledArticleStart = undefined
    stalledOtherStart = undefined
    otherFavoriteItems.length = 0
    otherItemIds.clear()
    contentVersion.value += 1
    currentPageNum.value = 0
    failedContentPage.value = null
    stalledContentPage.value = null
    favoriteResources.length = 0
    resourceIndex.clear()
    favoriteArticles.length = 0
    articleIds.clear()
    articleFavoriteOffset.value = ''
    if (favoriteView.value === 'article')
      articleFavoriteCount.value = undefined
    loadedSeasonComplete.value = false
    activatedCategoryCover.value = favoriteView.value === 'season' ? selectedSeason.value?.cover || '' : ''
    noMoreContent.value = false
    isLoading.value = false
    isFullPageLoading.value = true
    return contentVersion.value
  }

  function loadSelectedContent() {
    const requestVersion = resetContentState()

    if (
      (favoriteView.value === 'video' && !selectedCategory.value)
      || (favoriteView.value === 'season' && !selectedSeason.value)
    ) {
      isFullPageLoading.value = false
      noMoreContent.value = true
      return
    }

    if (favoriteView.value === 'video' && searchScope.value === 'all' && !keyword.value.trim()) {
      isFullPageLoading.value = false
      return
    }

    return loadActiveContent(1, requestVersion)
  }

  function refreshSelectedContent() {
    if (isLoading.value)
      return
    if ((favoriteView.value === 'video' && (!selectedCategory.value || (searchScope.value === 'all' && !keyword.value.trim()))) || (favoriteView.value === 'season' && !selectedSeason.value))
      return loadSelectedContent()
    avatars.cancelPending()
    pendingAvatarKeys.clear()
    contentController.abort()
    contentController = new AbortController()
    const version = ++contentVersion.value
    stalledMediaStart = undefined
    stalledArticleStart = undefined
    stalledOtherStart = undefined
    return loadActiveContent(1, version, true)
  }

  async function loadNextPage() {
    if (isLoading.value || noMoreContent.value || failedContentPage.value !== null || stalledContentPage.value !== null)
      return false

    return loadActiveContent(currentPageNum.value + 1, contentVersion.value)
  }

  function retryFavoriteContent() {
    if (isLoading.value)
      return
    if (failedContentPage.value !== null)
      return loadActiveContent(failedContentPage.value, contentVersion.value)
    else if (stalledContentPage.value !== null)
      return loadActiveContent(stalledContentPage.value, contentVersion.value)
    else
      return loadSelectedContent()
  }

  async function loadActiveContent(pn: number, requestVersion: number, preserveContent = false, autofillPages = 1): Promise<boolean> {
    if (!isRequestCurrent(requestVersion))
      return false

    if (pn === 1 && !preserveContent && !favoriteResources.length && !favoriteArticles.length && !otherFavoriteItems.length)
      isFullPageLoading.value = true
    isLoading.value = true
    failedContentPage.value = null
    stalledContentPage.value = null

    try {
      if (categoriesDirty && favoriteView.value === 'video') {
        const response = await dependencies.api.getFavoriteCategories({ up_mid: String(viewAccount) }, { signal: contentController.signal })
        if (!isRequestCurrent(requestVersion))
          return false
        if (response.code !== 0)
          throw response
        for (const folder of response.data?.list ?? []) {
          const existing = favoriteCategories.find(item => item.id === folder.id)
          if (existing)
            Object.assign(existing, folder)
        }
        categoriesDirty = false
      }
      if (favoriteView.value === 'article') {
        if (otherFavoriteType.value === 'article')
          await getFavoriteArticles(pn, requestVersion)
        else
          await getOtherFavorites(otherFavoriteType.value, pn, requestVersion)
      }
      else if (favoriteView.value === 'season') {
        await getFavoriteSeasonResources({ id: selectedSeason.value!.id, type: selectedSeason.value!.type }, pn, requestVersion)
      }
      else {
        const mediaId = searchScope.value === 'all'
          ? favoriteCategories[0]?.id ?? selectedCategory.value!.id
          : selectedCategory.value!.id
        await getFavoriteResources(mediaId, pn, keyword.value, searchScope.value === 'all' ? 1 : 0, requestVersion)
      }
      if (!isRequestCurrent(requestVersion))
        return false
      if (stalledContentPage.value !== null)
        return false
      currentPageNum.value = pn
      if (noMoreContent.value)
        return true
      // VideoCardGrid owns its sentinel and measures after layout. A second
      // viewport-fill loop here can fetch the entire folder during page entry.
      if (favoriteView.value !== 'article')
        return true
      const hasScrollbar = await haveScrollbar()
      if (!isRequestCurrent(requestVersion))
        return false
      if (!hasScrollbar && autofillPages < LIBRARY_AUTOFILL_PAGE_LIMIT)
        return await loadActiveContent(pn + 1, requestVersion, false, autofillPages + 1)
      return true
    }
    catch {
      if (isRequestCurrent(requestVersion)) {
        failedContentPage.value = pn
        noMoreContent.value = false
      }
      return false
    }
    finally {
      if (isRequestCurrent(requestVersion)) {
        isLoading.value = false
        isFullPageLoading.value = false
      }
    }
  }

  async function getFavoriteResources(
    media_id: number,
    pn: number,
    keyword = '' as string,
    type = 0 as number,
    requestVersion = contentVersion.value,
  ) {
    const res: FavoritesResult = await dependencies.api.getFavoriteResources({
      media_id,
      pn,
      keyword,
      type,
      order: videoOrder.value,
    }, { signal: contentController.signal })

    if (!isRequestCurrent(requestVersion))
      return

    if (res.code !== 0 || !res.data)
      throw new Error(res.message || t('common.load_failed'))

    const pageItems = Array.isArray(res.data.medias)
      ? res.data.medias.filter((item): item is FavoriteItem => item != null)
      : []
    if (searchScope.value === 'current') {
      activatedCategoryCover.value = res.data.info.cover
      folderCoverLoader.seed(media_id, res.data.info.cover || '')
    }
    applyMediaPage({ sourceType: 11, pn, pageMedias: pageItems, previousMedias: favoriteResources, mediaCount: keyword.trim() || type === 1 ? undefined : res.data.info?.media_count, hasMore: res.data.has_more }, requestVersion)
  }

  function applyMediaPage(input: Parameters<typeof mergeFavoriteSeasonPage>[0], version: number) {
    if (!isRequestCurrent(version))
      return
    const pageStartLength = stalledMediaStart?.page === input.pn ? stalledMediaStart.length : favoriteResources.length
    const merged = mergeFavoriteSeasonPage({ ...input, pageStartLength })
    if (input.pn === 1 && merged.stalled && !input.pageMedias.length && favoriteResources.length) {
      stalledContentPage.value = 1
      return
    }
    stalledMediaStart = merged.stalled ? { page: input.pn, length: pageStartLength } : undefined
    for (const { index, item } of merged.changed)
      favoriteResources[index] = item
    if (input.pn === 1 || merged.replace) {
      favoriteResources.length = merged.medias.length
      resourceIndex.clear()
      favoriteResources.forEach((item, index) => resourceIndex.set(getFavoriteResourceKey(item), index))
    }
    else {
      for (const { index, item } of merged.changed)
        resourceIndex.set(getFavoriteResourceKey(item), index)
    }
    loadedSeasonComplete.value = merged.complete
    noMoreContent.value = merged.complete
    stalledContentPage.value = merged.stalled ? input.pn : null
  }

  // Metadata pagination may scan many offscreen videos. Enrich only the grid's
  // visible/preload window, never every item returned by a search or bulk read.
  function loadResourceAvatars(items: FavoriteItem[]) {
    const version = contentVersion.value
    if (!isRequestCurrent(version))
      return
    for (const item of items) {
      if (item.upper?.face || !item.upper?.mid)
        continue
      const mid = item.upper.mid
      const key = getFavoriteResourceKey(item)
      if (pendingAvatarKeys.has(key))
        continue
      pendingAvatarKeys.add(key)
      void avatars.load(mid).then((face) => {
        if (!face || !isRequestCurrent(version))
          return
        const index = resourceIndex.get(key)
        const current = index === undefined ? undefined : favoriteResources[index]
        if (current?.upper.mid === mid && !current.upper.face)
          favoriteResources[index!] = { ...current, upper: { ...current.upper, face } }
      }).finally(() => {
        if (version === contentVersion.value)
          pendingAvatarKeys.delete(key)
      })
    }
  }

  async function getFavoriteSeasonResources(
    source: FavoriteSource,
    pn: number,
    requestVersion = contentVersion.value,
  ) {
    const page = await fetchFavoriteSeasonPage(source, pn, dependencies.api, undefined, { signal: contentController.signal })
    if (!isRequestCurrent(requestVersion) || !selectedSeason.value || getFavoriteSourceKey(source) !== getFavoriteSourceKey(selectedSeason.value))
      return

    if (!page.ok) {
      loadedSeasonComplete.value = false
      throw new Error(t('common.load_failed'))
    }

    applyMediaPage({
      sourceType: source.type,
      pn,
      pageMedias: page.pageMedias,
      mediaCount: page.mediaCount,
      hasMore: page.hasMore,
      previousMedias: favoriteResources,
    }, requestVersion)
    activatedCategoryCover.value = page.cover || selectedSeason.value?.cover || ''
  }

  async function getFavoriteArticles(
    pn: number,
    requestVersion = contentVersion.value,
  ) {
    const res: FavoriteArticlesResult = await dependencies.api.getFavoriteArticles({
      page: pn,
      page_size: FAVORITE_ARTICLE_PAGE_SIZE,
      offset: pn === 1 ? '' : articleFavoriteOffset.value,
      timezone_offset: new Date().getTimezoneOffset(),
      web_location: '333.1387',
    }, { signal: contentController.signal })

    if (!isRequestCurrent(requestVersion))
      return

    if (res.code !== 0 || !res.data)
      throw new Error(res.message || t('favorites.article_load_failed'))

    const pageArticles = Array.isArray(res.data?.items)
      ? res.data.items.filter((item): item is FavoriteArticle => item != null && Boolean(item.opus_id))
      : []
    if (pn === 1 && res.data.has_more && !pageArticles.length) {
      stalledContentPage.value = 1
      return
    }
    if (pn === 1) {
      favoriteArticles.length = 0
      articleIds.clear()
      articleFavoriteOffset.value = ''
    }
    const previousLength = stalledArticleStart?.page === pn ? stalledArticleStart.length : favoriteArticles.length
    const previousOffset = articleFavoriteOffset.value
    for (const item of pageArticles) {
      if (!articleIds.has(item.opus_id)) {
        articleIds.add(item.opus_id)
        favoriteArticles.push(item)
      }
    }

    const nextOffset = res.data?.offset
    const resolvedOffset = nextOffset != null && nextOffset !== ''
      ? String(nextOffset)
      : (pageArticles.at(-1)?.opus_id ?? '')

    const hasMore = Boolean(res.data?.has_more)
    if (hasMore && (favoriteArticles.length === previousLength || resolvedOffset === previousOffset)) {
      stalledArticleStart = { page: pn, length: previousLength }
      stalledContentPage.value = pn
      noMoreContent.value = false
      return
    }
    stalledArticleStart = undefined
    articleFavoriteOffset.value = resolvedOffset
    // polymer 接口无 total，仅在没有更多时用已加载条数作为总数
    if (!hasMore) {
      articleFavoriteCount.value = favoriteArticles.length
      otherFavoriteCounts.article = favoriteArticles.length
    }

    if (favoriteArticles[0])
      activatedCategoryCover.value = getFavoriteArticleCover(favoriteArticles[0])

    noMoreContent.value = !hasMore
  }

  async function getOtherFavorites(kind: Exclude<OtherFavoriteKind, 'article'>, pn: number, version: number) {
    const response = kind === 'topic'
      ? await dependencies.api.getFavoriteTopics({ page_num: pn, page_size: OTHER_FAVORITE_PAGE_SIZE.topic }, { signal: contentController.signal })
      : await dependencies.api.getFavoriteCourses({ mid: String(viewAccount), pn, ps: OTHER_FAVORITE_PAGE_SIZE.course }, { signal: contentController.signal })
    if (!isRequestCurrent(version))
      return
    const page = parseOtherFavoritePage(kind, response)
    if (pn === 1 && page.total > 0 && !page.items.length) {
      stalledContentPage.value = 1
      return
    }
    if (pn === 1) {
      otherFavoriteItems.length = 0
      otherItemIds.clear()
    }
    const previousLength = stalledOtherStart?.page === pn ? stalledOtherStart.length : otherFavoriteItems.length
    for (const item of page.items) {
      if (!otherItemIds.has(item.id)) {
        otherItemIds.add(item.id)
        otherFavoriteItems.push(item)
      }
    }
    otherFavoriteCounts[kind] = page.total
    noMoreContent.value = otherFavoriteItems.length >= page.total
    if (!noMoreContent.value && otherFavoriteItems.length === previousLength) {
      stalledOtherStart = { page: pn, length: previousLength }
      stalledContentPage.value = pn
      return
    }
    stalledOtherStart = undefined
  }

  function isRequestCurrent(version: number) {
    return lifetime.capture().isCurrent() && viewAccount === dependencies.getAccountId() && version === contentVersion.value
  }
  function resetAccount() {
    categoryController?.abort()
    subscriptionController?.abort()
    lifetime.invalidate()
    folderCoverLoader.reset()
    categoriesVersion++
    subscriptionsVersion++
    stalledSubscriptionStart = undefined
    avatars.dispose()
    avatars = createAvatars()
    Object.assign(categoryState, { loading: false, failed: false, loaded: false })
    Object.assign(subscriptionState, { loading: false, failed: false, loaded: false, hasMore: true, page: 0 })
    viewAccount = dependencies.getAccountId()
    resetContentState()
    favoriteCategories.length = 0
    collectedFavoriteSeasons.length = 0
    selectedCategory.value = undefined
    selectedSeason.value = undefined
    favoriteView.value = 'video'
    otherFavoriteType.value = 'article'
    otherSearchScope.value = 'all'
    videoOrder.value = 'mtime'
    subscriptionFilter.value = 'all'
    for (const kind of ['article', 'topic', 'course'] as const)
      delete otherFavoriteCounts[kind]
    Object.assign(keywords, { video: '', season: '', article: '' })
    searchScope.value = 'current'
    categoriesDirty = false
  }
  function applyResourceWrite(command: Extract<FavoriteWrite, { sourceId: number }>, version: number) {
    stalledMediaStart = undefined
    categoriesDirty = true
    categoriesVersion++
    categoryState.loading = false
    if (version !== contentVersion.value)
      return
    const keys = new Set(command.resourceKeys)
    if (command.kind !== 'copy') {
      for (let index = favoriteResources.length - 1; index >= 0; index--) {
        if (keys.has(getFavoriteResourceKey(favoriteResources[index])))
          favoriteResources.splice(index, 1)
      }
      resourceIndex.clear()
      favoriteResources.forEach((item, index) => resourceIndex.set(getFavoriteResourceKey(item), index))
      const source = favoriteCategories.find(item => item.id === command.sourceId)
      if (source)
        source.media_count = Math.max(0, source.media_count - keys.size)
      // Offset pagination shifts after deletion/move. Re-read the last partial
      // page so the next request cannot skip videos pulled into the gap.
      currentPageNum.value = Math.floor(favoriteResources.length / FAVORITE_FOLDER_PAGE_SIZE)
      noMoreContent.value = false
    }
    if (command.targetId) {
      const target = favoriteCategories.find(item => item.id === command.targetId)
      if (target)
        target.media_count += keys.size
    }
  }
  function applyFolderEdit(folderId: number, title: string, isPublic: boolean) {
    const folder = favoriteCategories.find(item => item.id === folderId)
    if (folder) {
      folder.title = title
      folder.attr = getFavoriteFolderEditedAttr(folder.attr, isPublic)
    }
  }
  function removeFolders(ids: readonly number[]) {
    for (let index = favoriteCategories.length - 1; index >= 0; index--) {
      if (ids.includes(favoriteCategories[index].id))
        favoriteCategories.splice(index, 1)
    }
    if (selectedCategory.value && ids.includes(selectedCategory.value.id)) {
      selectedCategory.value = favoriteCategories[0]
      if (favoriteView.value === 'video')
        loadSelectedContent()
    }
  }
  function removeSeasons(sources: readonly FavoriteSource[]) {
    stalledSubscriptionStart = undefined
    const keys = new Set(sources.map(getFavoriteSourceKey))
    subscriptionsVersion++
    subscriptionState.loading = false
    for (let index = collectedFavoriteSeasons.length - 1; index >= 0; index--) {
      if (keys.has(getFavoriteSourceKey(collectedFavoriteSeasons[index])))
        collectedFavoriteSeasons.splice(index, 1)
    }
    subscriptionState.page = Math.max(0, Math.ceil(collectedFavoriteSeasons.length / FAVORITE_SUBSCRIPTIONS_PAGE_SIZE) - 1)
    subscriptionState.hasMore = true
    if (selectedSeason.value && keys.has(getFavoriteSourceKey(selectedSeason.value))) {
      selectedSeason.value = collectedFavoriteSeasons.find(item => matchesSubscriptionType(item.type, subscriptionFilter.value))
      if (favoriteView.value === 'season')
        loadSelectedContent()
    }
  }
  return {
    favoriteCategories,
    otherFavoriteType,
    otherSearchScope,
    otherFavoriteCounts,
    visibleOtherFavorites,
    videoOrder,
    subscriptionFilter,
    folderCovers: folderCoverLoader.covers,
    setFolderCover: folderCoverLoader.seed,
    loadFolderCover(id: number) {
      const folder = favoriteCategories.find(item => item.id === id)
      if (!folder)
        return
      // Empty folders can have a user-uploaded cover too.
      if (favoriteView.value === 'video' && selectedCategory.value?.id === id && isLoading.value)
        return
      folderCoverLoader.load(id)
    },
    collectedFavoriteSeasons,
    favoriteResources,
    favoriteArticles,
    visibleSubscriptions,
    visibleResources,
    visibleArticles,
    favoriteView,
    selectedCategory,
    selectedSeason,
    activatedCategoryCover,
    currentPageNum,
    keyword,
    searchScope,
    isLoading,
    isFullPageLoading,
    bootstrapFailed,
    categoryState,
    subscriptionState,
    loadMoreSubscriptions,
    failedContentPage,
    stalledContentPage,
    noMoreContent,
    loadedSeasonComplete,
    articleFavoriteCount,
    articleFavoriteOffset,
    initData,
    getFavoriteCategories,
    retryFavoritesBootstrap,
    loadSelectedContent,
    refreshSelectedContent,
    loadNextPage,
    loadResourceAvatars,
    retryFavoriteContent,
    contentVersion,
    capture: lifetime.capture,
    resetAccount,
    applyResourceWrite,
    applyFolderEdit,
    removeFolders,
    removeSeasons,
    dispose() {
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', updateVisibility)
      contentController.abort()
      categoryController?.abort()
      subscriptionController?.abort()
      stopSearch()
      folderCoverLoader.dispose()
      contentVersion.value++
      avatars.dispose()
      pendingAvatarKeys.clear()
      lifetime.dispose()
    },
  }
}
