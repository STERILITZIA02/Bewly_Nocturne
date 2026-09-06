import type { Ref } from 'vue'
import { reactive, ref } from 'vue'

import type { FavoriteArticle, FavoriteArticlesResult } from '~/models/article/favorite'
import type { FavoritesResult, Media as FavoriteItem } from '~/models/video/favorite'
import type { FavoritesCategoryResult, List as CategoryItem } from '~/models/video/favoriteCategory'
import type { CollectedFavoriteSeason, CollectedFavoriteSeasonsResult, FavoriteSeasonMedia } from '~/models/video/favoriteSeason'
import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import type api from '~/utils/api'
import { getFavoriteFolderEditedAttr } from '~/utils/favoriteFolder'
import {
  enrichFavoriteSeasonMediaFaces,
  FAVORITE_SEASON_PAGE_SIZE,
  fetchFavoriteSeasonPage,
  mergeFavoriteSeasonPage,
} from '~/utils/favoriteSeason'

import { getFavoriteArticleCover, normalizeSeasonMedia } from './favoriteAdapters'
import type { FavoriteWrite } from './useFavoriteWrites'

export type FavoriteView = 'video' | 'season' | 'article'

interface FavoritesDataDependencies {
  api: typeof api.favorite
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
  const bootstrapFailed = ref(false)
  const failedContentPage = ref<number | null>(null)
  const noMoreContent = ref<boolean>(false)
  const loadedSeasonMedias = ref<FavoriteSeasonMedia[]>([])
  const loadedSeasonComplete = ref<boolean>(false)
  const articleFavoriteCount = ref<number>()
  const articleFavoriteOffset = ref<string>('')

  async function initData() {
    if (!lifetime.capture().isCurrent()) {
      isFullPageLoading.value = false
      return
    }
    const requestVersion = ++contentVersion.value
    favoriteCategories.length = 0
    collectedFavoriteSeasons.length = 0
    selectedCategory.value = undefined
    selectedSeason.value = undefined
    bootstrapFailed.value = false
    failedContentPage.value = null
    noMoreContent.value = false
    isFullPageLoading.value = true

    const results = await Promise.allSettled([
      getFavoriteCategories(requestVersion),
      getCollectedFavoriteSeasons(requestVersion),
    ])
    if (!isRequestCurrent(requestVersion))
      return
    if (results.some(result => result.status === 'rejected')) {
      bootstrapFailed.value = true
      isFullPageLoading.value = false
      return
    }

    if (favoriteCategories.length > 0) {
      selectedCategory.value = favoriteCategories[0]
      loadSelectedContent()
    }
    else {
      isFullPageLoading.value = false
      noMoreContent.value = true
    }
  }

  function retryFavoritesBootstrap() {
    if (!isFullPageLoading.value)
      void initData()
  }

  async function getFavoriteCategories(requestVersion: number) {
    const res: FavoritesCategoryResult = await dependencies.api.getFavoriteCategories({
      up_mid: String(viewAccount),
    })
    if (!isRequestCurrent(requestVersion))
      return
    if (res.code !== 0 || !res.data)
      throw new Error(res.message || t('common.load_failed'))
    favoriteCategories.push(...(res.data.list || []))
  }

  async function getCollectedFavoriteSeasons(requestVersion: number) {
    const res: CollectedFavoriteSeasonsResult = await dependencies.api.getCollectedFavoriteSeasons({
      up_mid: String(viewAccount),
    })
    if (!isRequestCurrent(requestVersion))
      return
    if (res.code !== 0 || !res.data)
      throw new Error(res.message || t('common.load_failed'))
    collectedFavoriteSeasons.push(...(res.data.list || []))
  }

  function resetContentState() {
    contentVersion.value += 1
    currentPageNum.value = 0
    failedContentPage.value = null
    favoriteResources.length = 0
    favoriteArticles.length = 0
    articleFavoriteOffset.value = ''
    if (favoriteView.value === 'article')
      articleFavoriteCount.value = undefined
    loadedSeasonMedias.value = []
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
    if (isLoading.value || noMoreContent.value || failedContentPage.value !== null)
      return false

    return loadActiveContent(currentPageNum.value + 1, contentVersion.value)
  }

  function retryFavoriteContent() {
    if (isLoading.value)
      return
    if (failedContentPage.value !== null)
      return loadActiveContent(failedContentPage.value, contentVersion.value)
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

    try {
      if (categoriesDirty) {
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
        await getFavoriteSeasonResources(selectedSeason.value!.id, pn, requestVersion)
      }
      else {
        const mediaId = searchScope.value === 'all'
          ? favoriteCategories[0]?.id ?? selectedCategory.value!.id
          : selectedCategory.value!.id
        await getFavoriteResources(mediaId, pn, keyword.value, searchScope.value === 'all' ? 1 : 0, requestVersion)
      }
      if (!isRequestCurrent(requestVersion))
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
    favoriteResources.push(...pageItems)
    noMoreContent.value = !res.data.has_more || pageItems.length === 0
  }

  async function getFavoriteSeasonResources(
    seasonId: number,
    pn: number,
    requestVersion = contentVersion.value,
  ) {
    const page = await fetchFavoriteSeasonPage(seasonId, pn, FAVORITE_SEASON_PAGE_SIZE)
    if (!isRequestCurrent(requestVersion))
      return

    if (!page.ok) {
      loadedSeasonComplete.value = false
      throw new Error(t('common.load_failed'))
    }

    const merged = mergeFavoriteSeasonPage({
      pn,
      pageMedias: page.pageMedias,
      mediaCount: page.mediaCount,
      previousMedias: loadedSeasonMedias.value,
      pageSize: FAVORITE_SEASON_PAGE_SIZE,
    })

    const enrichedMedias = await enrichFavoriteSeasonMediaFaces(merged.medias)
    if (!isRequestCurrent(requestVersion))
      return
    const resources = enrichedMedias.map(normalizeSeasonMedia)
    loadedSeasonMedias.value = enrichedMedias

    loadedSeasonComplete.value = !merged.hasMore
    noMoreContent.value = !merged.hasMore
    activatedCategoryCover.value = page.cover || selectedSeason.value?.cover || ''
    favoriteResources.splice(0, favoriteResources.length, ...resources)
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
    categoriesDirty = true
    if (version !== contentVersion.value)
      return
    const keys = new Set(command.resourceKeys)
    if (command.kind !== 'copy') {
      for (let index = favoriteResources.length - 1; index >= 0; index--) {
        if (keys.has(`${favoriteResources[index].id}:${favoriteResources[index].type}`))
          favoriteResources.splice(index, 1)
      }
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
  function removeSeasons(ids: readonly number[]) {
    for (let index = collectedFavoriteSeasons.length - 1; index >= 0; index--) {
      if (ids.includes(collectedFavoriteSeasons[index].id))
        collectedFavoriteSeasons.splice(index, 1)
    }
    if (selectedSeason.value && ids.includes(selectedSeason.value.id)) {
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
    failedContentPage,
    noMoreContent,
    loadedSeasonMedias,
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
      lifetime.dispose()
    },
  }
}
