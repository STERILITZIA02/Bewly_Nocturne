import type { Ref } from 'vue'
import { computed, reactive, ref } from 'vue'

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
  FAVORITE_SUBSCRIPTIONS_PAGE_SIZE,
  fetchFavoriteSeasonPage,
  mergeFavoriteSeasonPage,
} from '~/utils/favoriteSeason'

import { getFavoriteArticleCover } from './favoriteAdapters'
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
  let categoriesDirty = false
  let categoriesVersion = 0
  let subscriptionsVersion = 0
  let stalledSubscriptionStart: { page: number, length: number } | undefined
  let stalledMediaStart: { page: number, length: number } | undefined
  const categoryState = reactive({ loading: false, failed: false, loaded: false })
  const subscriptionState = reactive({ loading: false, failed: false, loaded: false, hasMore: true, page: 0 })
  const resourceIndex = new Map<string, number>()
  const createAvatars = () => createFavoriteAvatarLoader(async (mid) => {
    const response = await dependencies.user.getUserCard({ mid: String(mid) })
    const face = response?.data?.card?.face
    return response?.code === 0 && typeof face === 'string' && face ? face : undefined
  })
  let avatars = createAvatars()
  const FAVORITE_ARTICLE_PAGE_SIZE = 20
  const favoriteCategories = reactive<CategoryItem[]>([])
  const collectedFavoriteSeasons = reactive<CollectedFavoriteSeason[]>([])
  const favoriteResources = reactive<FavoriteItem[]>([])
  const favoriteArticles = reactive<FavoriteArticle[]>([])
  const favoriteView = ref<FavoriteView>('video')
  const selectedCategory = ref<CategoryItem>()
  const selectedSeason = ref<CollectedFavoriteSeason>()
  const activatedCategoryCover = ref<string>('')
  const currentPageNum = ref<number>(0)
  const keyword: Ref<string> = ref<string>('')
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

  async function initData() {
    if (!lifetime.capture().isCurrent()) {
      isFullPageLoading.value = false
      return
    }
    resetContentState()
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
    categoryState.loading = true
    categoryState.failed = false
    const current = () => owner.isCurrent() && version === categoriesVersion
    try {
      const res: FavoritesCategoryResult = await dependencies.api.getFavoriteCategories({ up_mid: String(owner.accountId) })
      if (!current())
        return
      if (res.code !== 0 || !res.data)
        throw res
      favoriteCategories.splice(0, favoriteCategories.length, ...(res.data.list ?? []))
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
    const pn = subscriptionState.page + 1
    const pageStartLength = stalledSubscriptionStart?.page === pn ? stalledSubscriptionStart.length : collectedFavoriteSeasons.length
    subscriptionState.loading = true
    subscriptionState.failed = false
    const current = () => owner.isCurrent() && version === subscriptionsVersion
    try {
      const res: CollectedFavoriteSeasonsResult = await dependencies.api.getCollectedFavoriteSeasons({ up_mid: String(owner.accountId), pn, ps: FAVORITE_SUBSCRIPTIONS_PAGE_SIZE })
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
        selectedSeason.value = collectedFavoriteSeasons[0]
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
    stalledMediaStart = undefined
    contentVersion.value += 1
    currentPageNum.value = 0
    failedContentPage.value = null
    stalledContentPage.value = null
    favoriteResources.length = 0
    resourceIndex.clear()
    favoriteArticles.length = 0
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

  async function loadActiveContent(pn: number, requestVersion: number): Promise<boolean> {
    if (!isRequestCurrent(requestVersion))
      return false

    if (pn === 1)
      isFullPageLoading.value = true
    isLoading.value = true
    failedContentPage.value = null
    stalledContentPage.value = null

    try {
      if (categoriesDirty && favoriteView.value === 'video') {
        const response = await dependencies.api.getFavoriteCategories({ up_mid: String(viewAccount) })
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
        await getFavoriteArticles(pn, requestVersion)
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
      const hasScrollbar = await haveScrollbar()
      if (!isRequestCurrent(requestVersion))
        return false
      if (!hasScrollbar)
        return await loadActiveContent(pn + 1, requestVersion)
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
    })

    if (!isRequestCurrent(requestVersion))
      return

    if (res.code !== 0 || !res.data)
      throw new Error(res.message || t('common.load_failed'))

    const pageItems = Array.isArray(res.data.medias)
      ? res.data.medias.filter((item): item is FavoriteItem => item != null)
      : []
    if (searchScope.value === 'current')
      activatedCategoryCover.value = res.data.info.cover
    applyMediaPage({ sourceType: 11, pn, pageMedias: pageItems, previousMedias: favoriteResources, mediaCount: keyword.trim() || type === 1 ? undefined : res.data.info?.media_count, hasMore: res.data.has_more }, requestVersion)
  }

  function applyMediaPage(input: Parameters<typeof mergeFavoriteSeasonPage>[0], version: number) {
    const pageStartLength = stalledMediaStart?.page === input.pn ? stalledMediaStart.length : favoriteResources.length
    const merged = mergeFavoriteSeasonPage({ ...input, pageStartLength })
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
    // Text and cards are committed before optional public-avatar enrichment.
    for (const { item } of merged.changed) {
      if (item.upper?.face || !item.upper?.mid)
        continue
      const mid = item.upper.mid
      const key = getFavoriteResourceKey(item)
      void avatars.load(mid).then((face) => {
        if (!face || !isRequestCurrent(version))
          return
        const index = resourceIndex.get(key)
        const current = index === undefined ? undefined : favoriteResources[index]
        if (current?.upper.mid === mid && !current.upper.face)
          favoriteResources[index!] = { ...current, upper: { ...current.upper, face } }
      })
    }
  }

  async function getFavoriteSeasonResources(
    source: FavoriteSource,
    pn: number,
    requestVersion = contentVersion.value,
  ) {
    const page = await fetchFavoriteSeasonPage(source, pn, dependencies.api)
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
    })

    if (!isRequestCurrent(requestVersion))
      return

    if (res.code !== 0 || !res.data)
      throw new Error(res.message || t('favorites.article_load_failed'))

    const pageArticles = Array.isArray(res.data?.items)
      ? res.data.items.filter((item): item is FavoriteArticle => item != null && Boolean(item.opus_id))
      : []
    favoriteArticles.push(...pageArticles)

    const nextOffset = res.data?.offset
    articleFavoriteOffset.value = nextOffset != null && nextOffset !== ''
      ? String(nextOffset)
      : (pageArticles.at(-1)?.opus_id ?? '')

    const hasMore = Boolean(res.data?.has_more) && pageArticles.length > 0
    // polymer 接口无 total，仅在没有更多时用已加载条数作为总数
    if (!hasMore)
      articleFavoriteCount.value = favoriteArticles.length

    if (favoriteArticles[0])
      activatedCategoryCover.value = getFavoriteArticleCover(favoriteArticles[0])

    noMoreContent.value = !hasMore
  }

  function isRequestCurrent(version: number) {
    return lifetime.capture().isCurrent() && viewAccount === dependencies.getAccountId() && version === contentVersion.value
  }
  function resetAccount() {
    lifetime.invalidate()
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
    keyword.value = ''
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
      selectedSeason.value = collectedFavoriteSeasons[0]
      if (favoriteView.value === 'season')
        loadSelectedContent()
    }
  }
  return {
    favoriteCategories,
    collectedFavoriteSeasons,
    favoriteResources,
    favoriteArticles,
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
    retryFavoritesBootstrap,
    loadSelectedContent,
    loadNextPage,
    retryFavoriteContent,
    contentVersion,
    capture: lifetime.capture,
    resetAccount,
    applyResourceWrite,
    applyFolderEdit,
    removeFolders,
    removeSeasons,
    dispose() {
      contentVersion.value++
      avatars.dispose()
      lifetime.dispose()
    },
  }
}
