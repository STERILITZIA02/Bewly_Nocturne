<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ArticleCard from '~/components/ArticleCard/ArticleCard.vue'
import ArticleCardSkeleton from '~/components/ArticleCard/ArticleCardSkeleton.vue'
import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import SettingsSegmentedControl from '~/components/Settings/components/SettingsSegmentedControl.vue'
import type { FavoriteResource } from '~/components/TopBar/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { settings } from '~/logic'
import type { Media as FavoriteItem } from '~/models/video/favorite'
import type { List as CategoryItem } from '~/models/video/favoriteCategory'
import type { CollectedFavoriteSeason, FavoriteSource } from '~/models/video/favoriteSeason'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getFavoriteFolderPrivacy, isFavoriteFolderPrivate } from '~/utils/favoriteFolder'
import { getFavoriteResourceKey, getFavoriteSourceKey } from '~/utils/favoriteResource'
import {
  FAVORITE_FOLDER_PAGE_SIZE,
  FAVORITE_SEASON_PAGE_SIZE,
  resolveFavoriteSeasonPlayAllUrl,
} from '~/utils/favoriteSeason'
import { getCSRF, getUserID, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'

import { getFavoriteArticleCover, transformFavoriteArticle, transformFavoriteItem } from './favoriteAdapters'
import type { FavoriteView } from './useFavoritesData'
import { useFavoritesData } from './useFavoritesData'
import type { FavoriteWrite } from './useFavoriteWrites'
import { useFavoriteWrites } from './useFavoriteWrites'

const { t } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()

type BatchTransferAction = 'copy' | 'move'
type SidebarManageSection = 'folder' | 'season'

const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const topBarStore = useTopBarStore()
const accountId = computed(() => resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid))
const data = useFavoritesData({ api: api.favorite, user: api.user, getAccountId: () => getUserID() === String(accountId.value) ? accountId.value : null, haveScrollbar, t })
const { favoriteCategories, collectedFavoriteSeasons, favoriteResources, favoriteArticles, favoriteView, selectedCategory, selectedSeason, activatedCategoryCover, keyword, searchScope, isLoading, isFullPageLoading, bootstrapFailed, failedContentPage, stalledContentPage, noMoreContent, loadedSeasonComplete, articleFavoriteCount, initData, retryFavoritesBootstrap, loadSelectedContent, loadNextPage, retryFavoriteContent, contentVersion, categoryState, subscriptionState, loadMoreSubscriptions } = data
const writes = useFavoriteWrites({ api: api.favorite, capture: data.capture, getCSRF, onError: () => toast.error(t('common.operation_failed')) })

const isResolvingSeasonPlayAll = ref<boolean>(false)
const isBatchManaging = ref<boolean>(false)
const isBatchOperating = computed(() => writes.pending.value)
const selectedResourceKeys = ref<string[]>([])
const targetCategory = ref<CategoryItem>()
const batchTransferDialogVisible = ref<boolean>(false)
const batchTransferAction = ref<BatchTransferAction>('copy')
const sidebarManageSection = ref<SidebarManageSection | null>(null)
const selectedFolderIds = ref<number[]>([])
const selectedSeasonKeys = ref<string[]>([])
const isSidebarOperating = computed(() => writes.pending.value)
const editFolderDialogVisible = ref<boolean>(false)
const editFolderId = ref<number>()
const editFolderTitle = ref<string>('')
const editFolderPublic = ref(true)
type ItemMenuTarget = { type: 'folder', id: number } | { type: 'season', source: FavoriteSource }
const itemMenuTarget = ref<ItemMenuTarget | null>(null)
const itemMenuAnchor = ref({ x: 0, y: 0 })
const itemMenuTrigger = shallowRef<HTMLElement | null>(null)

function notifyTopBarFavoritesChanged() {
  void topBarStore.notifyFavoritesChanged().catch((error) => {
    console.error('通知顶栏收藏状态变化失败:', error)
  })
}

const favoriteViewOptions = computed(() => [
  { label: t('favorites.video_section_title'), value: 'video' as const },
  { label: t('favorites.season_section_title'), value: 'season' as const },
  { label: t('favorites.article_section_title'), value: 'article' as const },
])

const selectedContentTitle = computed(() => {
  if (favoriteView.value === 'season')
    return selectedSeason.value?.title || t('favorites.season_section_title')
  if (favoriteView.value === 'article')
    return t('favorites.article_section_title')
  return selectedCategory.value?.title || t('favorites.video_section_title')
})

const selectedContentCount = computed(() => {
  if (favoriteView.value === 'season')
    return selectedSeason.value?.media_count ?? 0
  if (favoriteView.value === 'article')
    return articleFavoriteCount.value ?? favoriteArticles.length
  return selectedCategory.value?.media_count ?? 0
})

const isInitialSidebarLoading = computed(() => favoriteView.value === 'video'
  ? categoryState.loading && !favoriteCategories.length
  : favoriteView.value === 'season' && subscriptionState.loading && !collectedFavoriteSeasons.length)
const favoriteGridStateKey = computed(() => `${accountId.value}:${favoriteView.value === 'season' && selectedSeason.value
  ? getFavoriteSourceKey(selectedSeason.value)
  : `folder:${selectedCategory.value?.id ?? ''}`}:${contentVersion.value}`)

const selectedContentCover = computed(() => {
  if (activatedCategoryCover.value)
    return activatedCategoryCover.value
  if (favoriteView.value === 'season')
    return selectedSeason.value?.cover || ''
  if (favoriteView.value === 'article' && favoriteArticles[0])
    return getFavoriteArticleCover(favoriteArticles[0])
  return ''
})

const canBatchManage = computed(() => {
  return favoriteView.value === 'video'
    && searchScope.value === 'current'
    && Boolean(selectedCategory.value)
})

const selectedFavoriteResources = computed(() => {
  const selectedKeys = new Set(selectedResourceKeys.value)
  return favoriteResources.filter(item => selectedKeys.has(getFavoriteResourceKey(item)))
})

const selectedCount = computed(() => selectedFavoriteResources.value.length)

const isAllCurrentPageSelected = computed(() => {
  return favoriteResources.length > 0
    && favoriteResources.every(item => selectedResourceKeys.value.includes(getFavoriteResourceKey(item)))
})

const targetCategoryOptions = computed(() => {
  return favoriteCategories
    .filter(item => item.id !== selectedCategory.value?.id)
    .map(item => ({ label: item.title, value: item }))
})

const batchTransferDialogTitle = computed(() => {
  return batchTransferAction.value === 'copy'
    ? t('favorites.batch_copy_dialog_title')
    : t('favorites.batch_move_dialog_title')
})

const batchTransferDialogDesc = computed(() => {
  return batchTransferAction.value === 'copy'
    ? t('favorites.batch_copy_dialog_desc', { count: selectedCount.value })
    : t('favorites.batch_move_dialog_desc', { count: selectedCount.value })
})

const defaultFolderId = computed(() => favoriteCategories[0]?.id)
const editableFolderIds = computed(() => favoriteCategories.filter(item => item.id !== defaultFolderId.value).map(item => item.id))
const selectedFolderCount = computed(() => selectedFolderIds.value.length)
const selectedSeasonCount = computed(() => selectedSeasonKeys.value.length)
const isManagingFolder = computed(() => sidebarManageSection.value === 'folder')
const isManagingSeason = computed(() => sidebarManageSection.value === 'season')
const canEditSelectedFolder = computed(() => selectedFolderIds.value.length === 1)
const editFolderVisibility = computed<'public' | 'private'>({
  get: () => editFolderPublic.value ? 'public' : 'private',
  set: value => editFolderPublic.value = value === 'public',
})
const editFolderVisibilityOptions = computed(() => [
  { label: t('favorites.folder_public'), value: 'public' as const },
  { label: t('favorites.folder_private'), value: 'private' as const },
])
const isAllFoldersSelected = computed(() => {
  return editableFolderIds.value.length > 0
    && editableFolderIds.value.every(id => selectedFolderIds.value.includes(id))
})
const isAllSeasonsSelected = computed(() => {
  return collectedFavoriteSeasons.length > 0
    && collectedFavoriteSeasons.every(item => selectedSeasonKeys.value.includes(getFavoriteSourceKey(item)))
})
const itemMenuOptions = computed((): ContextMenuOption[] => {
  if (!itemMenuTarget.value)
    return []

  if (itemMenuTarget.value.type === 'folder') {
    return [
      { value: 'edit', label: t('favorites.edit_folder'), icon: 'i-tabler:edit' },
      { value: 'delete', label: t('common.operation.delete'), icon: 'i-tabler:trash', danger: true },
    ]
  }

  return [{ value: 'unfav', label: t('favorites.unfavorite'), icon: 'i-tabler:star-off', danger: true }]
})

// 搜索范围选项
const searchScopeOptions = computed(() => [
  {
    label: t('favorites.search_current_folder'),
    value: 'current' as const,
  },
  {
    label: t('favorites.search_all_folders'),
    value: 'all' as const,
  },
])

onMounted(() => {
  initPageAction()
  void initData()
})

onScopeDispose(() => {
  data.dispose()
  writes.reset()
  if (handleReachBottom.value === handleFavoriteReachBottom)
    handleReachBottom.value = undefined
  if (handlePageRefresh.value === handleFavoritePageRefresh)
    handlePageRefresh.value = undefined
})

async function handleFavoriteReachBottom() {
  // 视频/合集列表由 VideoCardGrid 自己监听 sentinel；全局哨兵只负责图文收藏。
  if (favoriteView.value !== 'article')
    return false
  if (isLoading.value || noMoreContent.value || failedContentPage.value !== null)
    return false
  return loadNextPage()
}

function handleFavoritePageRefresh() {
  if (!isLoading.value)
    loadSelectedContent()
}

function initPageAction() {
  handleReachBottom.value = handleFavoriteReachBottom
  handlePageRefresh.value = handleFavoritePageRefresh
}

function resetBatchSelection() {
  selectedResourceKeys.value = []
}

function closeBatchTransferDialog() {
  batchTransferDialogVisible.value = false
}

function closeBatchManage() {
  isBatchManaging.value = false
  resetBatchSelection()
  closeBatchTransferDialog()
}

function exitSidebarManage() {
  sidebarManageSection.value = null
  selectedFolderIds.value = []
  selectedSeasonKeys.value = []
}

function toggleSidebarManage(section: SidebarManageSection) {
  closeItemMenu()
  if (sidebarManageSection.value === section) {
    exitSidebarManage()
    return
  }

  closeBatchManage()
  exitSidebarManage()
  sidebarManageSection.value = section
}

function toggleCurrentSidebarManage() {
  if (favoriteView.value === 'video')
    toggleSidebarManage('folder')
  else if (favoriteView.value === 'season')
    toggleSidebarManage('season')
}

function toggleFolderSelection(item: CategoryItem) {
  if (item.id === defaultFolderId.value)
    return

  if (selectedFolderIds.value.includes(item.id))
    selectedFolderIds.value = selectedFolderIds.value.filter(id => id !== item.id)
  else
    selectedFolderIds.value = [...selectedFolderIds.value, item.id]
}

function toggleSeasonSelection(item: CollectedFavoriteSeason) {
  const key = getFavoriteSourceKey(item)
  if (selectedSeasonKeys.value.includes(key))
    selectedSeasonKeys.value = selectedSeasonKeys.value.filter(selected => selected !== key)
  else
    selectedSeasonKeys.value = [...selectedSeasonKeys.value, key]
}

function handleCategoryItemClick(item: CategoryItem) {
  if (isManagingFolder.value) {
    toggleFolderSelection(item)
    return
  }
  changeCategory(item)
}

function handleSeasonItemClick(item: CollectedFavoriteSeason) {
  if (isManagingSeason.value) {
    toggleSeasonSelection(item)
    return
  }
  changeSeason(item)
}

function toggleSelectAllFolders() {
  selectedFolderIds.value = isAllFoldersSelected.value ? [] : [...editableFolderIds.value]
}

function toggleSelectAllSeasons() {
  selectedSeasonKeys.value = isAllSeasonsSelected.value ? [] : collectedFavoriteSeasons.map(getFavoriteSourceKey)
}

function openEditFolderDialog() {
  if (!canEditSelectedFolder.value || isSidebarOperating.value)
    return

  openSingleEditFolder(selectedFolderIds.value[0])
}

function openSingleEditFolder(folderId: number) {
  if (folderId === defaultFolderId.value)
    return
  const folder = favoriteCategories.find(item => item.id === folderId)
  if (!folder)
    return

  editFolderId.value = folder.id
  editFolderTitle.value = folder.title
  editFolderPublic.value = !isFavoriteFolderPrivate(folder)
  editFolderDialogVisible.value = true
}

function openItemMenu(target: ItemMenuTarget, event: MouseEvent) {
  itemMenuTrigger.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  itemMenuTarget.value = target
  const rect = itemMenuTrigger.value?.getBoundingClientRect()
  itemMenuAnchor.value = event.detail === 0 && rect
    ? { x: rect.right, y: rect.bottom }
    : { x: event.clientX, y: event.clientY }
}

function closeItemMenu() {
  itemMenuTarget.value = null
}

function closeEditFolderDialog() {
  editFolderDialogVisible.value = false
}

async function handleEditFolderConfirm() {
  if (writes.pending.value)
    return
  const title = editFolderTitle.value.trim()
  if (!title) {
    toast.warning(t('favorites.edit_folder_title_empty'))
    return
  }
  const folderId = editFolderId.value
  if (!folderId || folderId === defaultFolderId.value)
    return
  const isPublic = editFolderPublic.value
  const transaction = writes.prepare({ kind: 'edit', folderId, title, privacy: getFavoriteFolderPrivacy(isPublic) })
  const result = await writes.execute(transaction)
  if (!result)
    return
  data.applyFolderEdit(folderId, title, isPublic)
  if (editFolderId.value === folderId && editFolderTitle.value.trim() === title && editFolderPublic.value === isPublic)
    closeEditFolderDialog()
  notifyTopBarFavoritesChanged()
}

async function deleteFolders(ids: number[]) {
  const transaction = writes.prepare({ kind: 'folders', ids: [...ids] })
  if (!await showConfirmDialog(t('favorites.delete_folders_confirm', { count: ids.length })))
    return false
  const result = await writes.execute(transaction)
  if (!result || result.kind !== 'folders')
    return false
  data.removeFolders(result.succeeded)
  selectedFolderIds.value = selectedFolderIds.value.filter(id => !result.succeeded.includes(id))
  notifyTopBarFavoritesChanged()
  return true
}

async function unfavSeasons(sources: FavoriteSource[]) {
  const transaction = writes.prepare({ kind: 'seasons', sources })
  if (!await showConfirmDialog(t('favorites.unfav_seasons_confirm', { count: sources.length })))
    return
  const result = await writes.execute(transaction)
  if (!result || result.kind !== 'seasons')
    return
  data.removeSeasons(result.succeeded)
  const succeeded = new Set(result.succeeded.map(getFavoriteSourceKey))
  selectedSeasonKeys.value = selectedSeasonKeys.value.filter(key => !succeeded.has(key))
  if (result.succeeded.length)
    notifyTopBarFavoritesChanged()
}

async function handleBatchDeleteFolders() {
  if (!selectedFolderCount.value || writes.pending.value)
    return
  await deleteFolders([...selectedFolderIds.value])
}

async function handleBatchUnfavSeasons() {
  if (!selectedSeasonCount.value || writes.pending.value)
    return
  await unfavSeasons(collectedFavoriteSeasons.filter(item => selectedSeasonKeys.value.includes(getFavoriteSourceKey(item)))
    .map(({ id, type }) => ({ id, type })))
}

async function handleItemMenuSelect(value: string | number) {
  const target = itemMenuTarget.value
  if (!target || writes.pending.value)
    return
  closeItemMenu()
  if (target.type === 'folder') {
    if (value === 'edit')
      openSingleEditFolder(target.id)
    else
      await deleteFolders([target.id])
  }
  else {
    await unfavSeasons([target.source])
  }
}

function isSelectedFavoriteResource(item: FavoriteResource | FavoriteItem) {
  return selectedResourceKeys.value.includes(getFavoriteResourceKey(item))
}

function toggleFavoriteResourceSelection(item: FavoriteResource | FavoriteItem) {
  const key = getFavoriteResourceKey(item)
  if (selectedResourceKeys.value.includes(key))
    selectedResourceKeys.value = selectedResourceKeys.value.filter(itemKey => itemKey !== key)
  else
    selectedResourceKeys.value = [...selectedResourceKeys.value, key]
}

function handleFavoriteCardClick(item: FavoriteItem, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  toggleFavoriteResourceSelection(item)
}

function toggleSelectAllCurrentPage() {
  selectedResourceKeys.value = isAllCurrentPageSelected.value
    ? []
    : favoriteResources.map(item => getFavoriteResourceKey(item))
}

function toggleBatchManage() {
  if (isBatchManaging.value) {
    closeBatchManage()
    return
  }
  if (!canBatchManage.value)
    return

  exitSidebarManage()
  closeItemMenu()
  isBatchManaging.value = true
}

function openBatchTransferDialog(action: BatchTransferAction) {
  if (selectedCount.value === 0 || targetCategoryOptions.value.length === 0 || isBatchOperating.value)
    return

  batchTransferAction.value = action
  if (!targetCategory.value || targetCategory.value.id === selectedCategory.value?.id)
    targetCategory.value = targetCategoryOptions.value[0]?.value
  batchTransferDialogVisible.value = true
}

function selectTargetCategory(category: CategoryItem) {
  targetCategory.value = category
}

async function handleBatchDelete() {
  if (!selectedCategory.value || !selectedCount.value)
    return
  await runResourceWrite({ kind: 'delete', sourceId: selectedCategory.value.id, resourceKeys: selectedFavoriteResources.value.map(getFavoriteResourceKey) }, true)
}

async function handleBatchMove() {
  if (!selectedCategory.value || !targetCategory.value || !selectedCount.value)
    return
  await runResourceWrite({ kind: 'move', sourceId: selectedCategory.value.id, targetId: targetCategory.value.id, resourceKeys: selectedFavoriteResources.value.map(getFavoriteResourceKey) })
}

async function handleBatchCopy() {
  if (!selectedCategory.value || !targetCategory.value || !selectedCount.value)
    return
  await runResourceWrite({ kind: 'copy', sourceId: selectedCategory.value.id, targetId: targetCategory.value.id, resourceKeys: selectedFavoriteResources.value.map(getFavoriteResourceKey) })
}

async function handleBatchTransferConfirm() {
  if (batchTransferAction.value === 'copy')
    await handleBatchCopy()
  else
    await handleBatchMove()
}

/**
 * 获取收藏夹视频
 * @param media_id 收藏夹 ID
 * @param pn 页码
 * @param keyword 搜索关键词
 * @param type 搜索类型：0-特定收藏夹，1-全部收藏夹
 */

function handleFavoriteViewChange(view: FavoriteView) {
  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  favoriteView.value = view
  searchScope.value = 'current'

  if (view === 'video' && !selectedCategory.value)
    selectedCategory.value = favoriteCategories[0]
  else if (view === 'season' && !selectedSeason.value)
    selectedSeason.value = collectedFavoriteSeasons[0]

  loadSelectedContent()
}

function changeCategory(categoryItem: CategoryItem) {
  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  favoriteView.value = 'video'
  searchScope.value = 'current'
  selectedCategory.value = categoryItem
  loadSelectedContent()
}

function changeSeason(seasonItem: CollectedFavoriteSeason) {
  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  favoriteView.value = 'season'
  searchScope.value = 'current'
  selectedSeason.value = seasonItem
  loadSelectedContent()
}

function handleSearch() {
  if (favoriteView.value !== 'video')
    return

  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  loadSelectedContent()
}

function handleSearchScopeChange() {
  handleSearch()
}

async function handlePlayAll() {
  if (favoriteView.value === 'article' || searchScope.value === 'all' || isResolvingSeasonPlayAll.value)
    return

  if (favoriteView.value === 'season') {
    if (!selectedSeason.value)
      return

    const owner = data.capture()
    const version = contentVersion.value
    const source = { id: selectedSeason.value.id, type: selectedSeason.value.type }
    const isCurrent = () => owner.isCurrent() && version === contentVersion.value
      && !!selectedSeason.value && getFavoriteSourceKey(selectedSeason.value) === getFavoriteSourceKey(source)
    if (!isCurrent())
      return
    isResolvingSeasonPlayAll.value = true
    try {
      const result = await resolveFavoriteSeasonPlayAllUrl({
        source,
        spaceMid: owner.accountId!,
        link: selectedSeason.value.link,
        bvid: selectedSeason.value.bvid,
        mode: settings.value.collectedSeasonPlayAllMode,
        preloaded: {
          sourceKey: getFavoriteSourceKey(source),
          medias: favoriteResources,
          complete: loadedSeasonComplete.value,
        },
      }, { api, isCurrent })
      if (!isCurrent())
        return
      if (result.usedFallback && result.reason !== 'beginning')
        toast.warning(t('favorites.season_play_all_fallback'))
      openLinkToNewTab(result.url)
    }
    finally {
      if (isCurrent())
        isResolvingSeasonPlayAll.value = false
    }
    return
  }

  if (selectedCategory.value)
    openLinkToNewTab(`https://www.bilibili.com/list/ml${selectedCategory.value.id}`)
}

function handleSubscriptionDirectoryScroll(event: Event) {
  const element = event.currentTarget
  if (favoriteView.value === 'season' && element instanceof HTMLElement
    && element.scrollHeight - element.clientHeight - element.scrollTop < 160) {
    void loadMoreSubscriptions()
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

async function handleUnfavorite(resource: FavoriteResource) {
  if (!selectedCategory.value)
    return
  await runResourceWrite({ kind: 'delete', sourceId: selectedCategory.value.id, resourceKeys: [getFavoriteResourceKey(resource)] }, true)
}

watch(accountId, () => {
  data.resetAccount()
  writes.reset()
  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  closeEditFolderDialog()
  isResolvingSeasonPlayAll.value = false
  void initData()
}, { flush: 'sync' })
watch(contentVersion, () => {
  resetBatchSelection()
  isResolvingSeasonPlayAll.value = false
}, { flush: 'sync' })

async function runResourceWrite(command: Extract<FavoriteWrite, { sourceId: number }>, confirm = false) {
  if (writes.pending.value)
    return
  const version = contentVersion.value
  const selection = selectedResourceKeys.value
  const transaction = writes.prepare(command)
  if (confirm && !await showConfirmDialog(t('favorites.batch_unfavorite_confirm', { count: command.resourceKeys.length })))
    return
  const result = await writes.execute(transaction)
  if (!result)
    return
  data.applyResourceWrite(command, version)
  if (version === contentVersion.value && selection === selectedResourceKeys.value) {
    selectedResourceKeys.value = selection.filter(key => !command.resourceKeys.includes(key))
    if (command.targetId === targetCategory.value?.id) {
      if (command.kind === 'move')
        closeBatchManage()
      else if (command.kind === 'copy')
        closeBatchTransferDialog()
    }
  }
  notifyTopBarFavoritesChanged()
}
</script>

<template>
  <div v-if="getCSRF()" class="favorites-old-page">
    <main class="favorites-old-main">
      <h3 class="bew-page-heading favorites-main-heading">
        <SkeletonBlock v-if="isInitialSidebarLoading" width="12em" height="1lh" />
        <template v-else>
          {{ selectedContentTitle }} ({{ selectedContentCount }})
        </template>
      </h3>

      <div
        v-if="favoriteView === 'video'"
        class="favorites-toolbar"
      >
        <div class="toolbar-search-group">
          <Select v-model="searchScope" class="search-scope-select" :options="searchScopeOptions" @change="handleSearchScopeChange" />
          <Input
            v-model="keyword"
            class="favorites-search-input"
            :placeholder="searchScope === 'all' ? t('favorites.global_search_placeholder') : t('favorites.search_placeholder')"
            @enter="handleSearch"
          />
          <Button
            type="primary"
            :disabled="searchScope === 'all' && !keyword.trim()"
            @click="handleSearch"
          >
            <template #left>
              <div i-tabler:search />
            </template>
          </Button>
        </div>

        <div v-if="canBatchManage" class="toolbar-action-group">
          <Button
            v-if="canBatchManage"
            :type="isBatchManaging ? 'tertiary' : 'secondary'"
            :disabled="isBatchOperating"
            @click="toggleBatchManage"
          >
            <template #left>
              <div :class="isBatchManaging ? 'i-tabler:x' : 'i-tabler:list-check'" />
            </template>
            {{ isBatchManaging ? t('common.operation.cancel') : t('favorites.batch_manage') }}
          </Button>

          <template v-if="isBatchManaging">
            <Button
              type="secondary"
              :disabled="favoriteResources.length === 0 || isBatchOperating"
              @click="toggleSelectAllCurrentPage"
            >
              <template #left>
                <div :class="isAllCurrentPageSelected ? 'i-tabler:checkbox' : 'i-tabler:square'" />
              </template>
              {{ isAllCurrentPageSelected ? t('favorites.batch_unselect_all') : t('favorites.batch_select_all') }}
            </Button>
            <span class="batch-selected-count">
              {{ t('favorites.batch_selected_count', { count: selectedCount }) }}
            </span>
            <Button
              type="secondary"
              :disabled="selectedCount === 0 || targetCategoryOptions.length === 0 || isBatchOperating"
              @click="openBatchTransferDialog('copy')"
            >
              <template #left>
                <div i-tabler:copy />
              </template>
              {{ t('favorites.batch_copy') }}
            </Button>
            <Button
              type="secondary"
              :disabled="selectedCount === 0 || targetCategoryOptions.length === 0 || isBatchOperating"
              @click="openBatchTransferDialog('move')"
            >
              <template #left>
                <div i-tabler:folder-symlink />
              </template>
              {{ t('favorites.batch_move') }}
            </Button>
            <Button
              type="error"
              :disabled="selectedCount === 0 || isBatchOperating"
              @click="handleBatchDelete"
            >
              <template #left>
                <div i-tabler:trash />
              </template>
              {{ t('favorites.batch_unfavorite') }}
            </Button>
          </template>
        </div>
      </div>

      <Empty v-if="bootstrapFailed" :description="t('common.load_failed')">
        <Button type="primary" @click="retryFavoritesBootstrap">
          {{ t('common.operation.refresh') }}
        </Button>
      </Empty>

      <template v-else-if="favoriteView === 'article'">
        <div v-if="favoriteArticles.length > 0" class="article-favorites-content">
          <div class="article-favorites-grid">
            <ArticleCard
              v-for="article in favoriteArticles"
              :key="article.opus_id"
              v-bind="transformFavoriteArticle(article)"
            />
          </div>
          <div v-if="isLoading" class="article-favorites-grid" aria-hidden="true">
            <ArticleCardSkeleton v-for="index in 2" :key="`favorite-article-more-${index}`" />
          </div>
          <Empty v-else-if="noMoreContent" :description="t('common.no_more_content')" />
        </div>
        <div v-else-if="isLoading || isFullPageLoading" class="article-favorites-grid" aria-hidden="true">
          <ArticleCardSkeleton v-for="index in 6" :key="`favorite-article-initial-${index}`" />
        </div>
        <Empty v-else-if="failedContentPage === null" :description="t('common.no_data')" />
        <Empty v-if="failedContentPage !== null && !isLoading" :description="t('common.load_failed')" role="alert">
          <Button type="primary" @click="retryFavoriteContent">
            {{ t('common.operation.refresh') }}
          </Button>
        </Empty>
      </template>

      <template v-else>
        <Empty
          v-if="favoriteView === 'video' && searchScope === 'all' && !keyword.trim() && favoriteResources.length === 0 && !isLoading"
          :description="t('favorites.global_search_hint')"
        />

        <VideoCardGrid
          v-else
          :key="favoriteGridStateKey"
          :state-key="favoriteGridStateKey"
          :items="favoriteResources"
          :transform-item="transformFavoriteItem"
          :get-item-key="getFavoriteResourceKey"
          grid-layout="adaptive"
          :initial-skeleton-count="favoriteView === 'season' && selectedSeason?.type === 21 ? FAVORITE_SEASON_PAGE_SIZE : FAVORITE_FOLDER_PAGE_SIZE"
          disable-content-visibility
          :loading="isLoading || isFullPageLoading"
          :no-more-content="noMoreContent"
          :request-failed="failedContentPage !== null || stalledContentPage !== null"
          :empty-description="$t('common.no_more_content')"
          :more-btn="favoriteView === 'video' && !isBatchManaging"
          :hide-author="favoriteView === 'season' && selectedSeason?.type === 21"
          :card-click-handler="isBatchManaging ? handleFavoriteCardClick : undefined"
          :cover-top-left-always-visible="isBatchManaging"
          enable-row-padding
          @refresh="retryFavoriteContent"
          @load-more="loadNextPage"
        >
          <template v-if="favoriteView === 'video'" #coverTopLeft="{ item }">
            <button
              v-if="isBatchManaging"
              class="favorite-card-action"
              :class="{ selected: isSelectedFavoriteResource(item) }"
              @click.prevent.stop="toggleFavoriteResourceSelection(item)"
            >
              <Tooltip :content="$t('favorites.batch_select_item')" placement="bottom-left" type="dark">
                <div :class="isSelectedFavoriteResource(item) ? 'i-tabler:checkbox' : 'i-tabler:square'" />
              </Tooltip>
            </button>
            <button v-else class="favorite-card-action danger" @click.prevent.stop="handleUnfavorite(item)">
              <Tooltip :content="$t('favorites.unfavorite')" placement="bottom-left" type="dark">
                <div i-ic-baseline-clear />
              </Tooltip>
            </button>
          </template>
        </VideoCardGrid>
      </template>

      <Dialog
        v-if="editFolderDialogVisible"
        :title="t('favorites.edit_folder_dialog_title')"
        width="var(--bew-layout-dialog-width)"
        append-to-bewly-body
        :loading="isSidebarOperating"
        @close="closeEditFolderDialog"
        @confirm="handleEditFolderConfirm"
      >
        <div class="edit-folder-dialog">
          <Input
            v-model="editFolderTitle"
            :placeholder="t('favorites.edit_folder_title_placeholder')"
            @enter="handleEditFolderConfirm"
          />
          <section class="edit-folder-visibility">
            <div class="edit-folder-visibility__copy">
              <strong>{{ t('favorites.folder_visibility') }}</strong>
              <p>{{ t(editFolderPublic ? 'favorites.folder_public_desc' : 'favorites.folder_private_desc') }}</p>
            </div>
            <SettingsSegmentedControl
              v-model="editFolderVisibility"
              :options="editFolderVisibilityOptions"
              :label="t('favorites.folder_visibility')"
            />
          </section>
        </div>
      </Dialog>

      <Dialog
        v-if="batchTransferDialogVisible"
        :title="batchTransferDialogTitle"
        :desc="batchTransferDialogDesc"
        width="var(--bew-layout-dialog-width)"
        content-max-height="420px"
        append-to-bewly-body
        :loading="isBatchOperating"
        @close="closeBatchTransferDialog"
        @confirm="handleBatchTransferConfirm"
      >
        <div class="batch-transfer-dialog">
          <button
            v-for="option in targetCategoryOptions"
            :key="option.value.id"
            class="batch-target-folder"
            :class="{ active: targetCategory?.id === option.value.id }"
            @click="selectTargetCategory(option.value)"
          >
            <span class="batch-target-folder-icon" i-tabler:folder />
            <span class="batch-target-folder-title">{{ option.label }}</span>
            <span class="batch-target-folder-count">{{ option.value.media_count }}</span>
            <span v-if="targetCategory?.id === option.value.id" class="batch-target-folder-check" i-tabler:check />
          </button>
        </div>
      </Dialog>
    </main>

    <aside class="favorites-old-sidebar">
      <CoverSidebarSurface class="favorites-sidebar-panel" :cover="selectedContentCover ? removeHttpFromUrl(`${selectedContentCover}@480w_270h_1c`) : ''">
        <div class="favorites-sidebar-content">
          <picture class="favorites-sidebar-cover">
            <SkeletonBlock v-if="isInitialSidebarLoading" width="100%" height="100%" radius="media" />
            <img
              v-else-if="selectedContentCover"
              :src="removeHttpFromUrl(`${selectedContentCover}@480w_270h_1c`)"
              :alt="selectedContentTitle"
            >
            <span v-else :class="favoriteView === 'article' ? 'i-tabler:article' : 'i-tabler:folder-star'" />
          </picture>

          <div class="favorites-sidebar-title">
            <h3 class="bew-page-heading">
              <SkeletonBlock v-if="isInitialSidebarLoading" width="75%" height="1lh" />
              <template v-else>
                {{ selectedContentTitle }}
              </template>
            </h3>
            <p>
              <SkeletonBlock v-if="isInitialSidebarLoading" width="35%" height="1lh" />
              <template v-else>
                {{ favoriteView === 'article'
                  ? t('favorites.article_count', { count: selectedContentCount })
                  : t('favorites.video_count', { count: selectedContentCount }) }}
              </template>
            </p>
          </div>

          <div class="sidebar-mode-row">
            <Select
              v-model="favoriteView"
              class="favorite-view-select"
              :options="favoriteViewOptions"
              :loading="isInitialSidebarLoading"
              @change="handleFavoriteViewChange"
            />
            <Tooltip v-if="favoriteView !== 'article'" :content="t('favorites.sidebar_manage')" placement="left" type="dark">
              <button
                class="sidebar-manage-toggle"
                :class="{ active: sidebarManageSection !== null }"
                :aria-label="t('favorites.sidebar_manage')"
                :disabled="isInitialSidebarLoading"
                @click="toggleCurrentSidebarManage"
              >
                <span :class="sidebarManageSection ? 'i-tabler:x' : 'i-tabler:adjustments-horizontal'" />
              </button>
            </Tooltip>
          </div>

          <div v-if="isManagingFolder" class="sidebar-manage-bar">
            <button class="sidebar-manage-select" @click="toggleSelectAllFolders">
              <span :class="isAllFoldersSelected ? 'i-tabler:checkbox' : 'i-tabler:square'" />
              {{ isAllFoldersSelected ? t('favorites.unselect_all') : t('favorites.select_all') }}
            </button>
            <span class="sidebar-selected-count">{{ selectedFolderCount }}</span>
            <Tooltip :content="t('favorites.edit_folder')" placement="left" type="dark">
              <button
                class="sidebar-manage-action"
                :disabled="!canEditSelectedFolder || isSidebarOperating"
                :aria-label="t('favorites.edit_folder')"
                @click="openEditFolderDialog"
              >
                <span i-tabler:edit />
              </button>
            </Tooltip>
            <Tooltip :content="t('common.operation.delete')" placement="left" type="dark">
              <button
                class="sidebar-manage-action danger"
                :disabled="selectedFolderCount === 0 || isSidebarOperating"
                :aria-label="t('common.operation.delete')"
                @click="handleBatchDeleteFolders"
              >
                <span i-tabler:trash />
              </button>
            </Tooltip>
          </div>

          <div v-else-if="isManagingSeason" class="sidebar-manage-bar">
            <button class="sidebar-manage-select" @click="toggleSelectAllSeasons">
              <span :class="isAllSeasonsSelected ? 'i-tabler:checkbox' : 'i-tabler:square'" />
              {{ isAllSeasonsSelected ? t('favorites.unselect_all') : t('favorites.select_all') }}
            </button>
            <span class="sidebar-selected-count">{{ selectedSeasonCount }}</span>
            <Tooltip :content="t('favorites.unfavorite')" placement="left" type="dark">
              <button
                class="sidebar-manage-action danger"
                :disabled="selectedSeasonCount === 0 || isSidebarOperating"
                :aria-label="t('favorites.unfavorite')"
                @click="handleBatchUnfavSeasons"
              >
                <span i-tabler:star-off />
              </button>
            </Tooltip>
          </div>

          <Button
            v-else-if="favoriteView !== 'article'"
            class="favorites-play-all bew-cover-sidebar__action"
            block
            size="medium"
            strong
            :disabled="isInitialSidebarLoading || searchScope === 'all' || isResolvingSeasonPlayAll"
            @click="handlePlayAll"
          >
            <template #left>
              <SkeletonBlock v-if="isResolvingSeasonPlayAll" width="1em" height="1em" />
              <div v-else i-tabler:player-play />
            </template>
            {{ t('common.play_all') }}
          </Button>

          <nav class="favorites-old-nav" :aria-label="selectedContentTitle">
            <ul v-if="isInitialSidebarLoading" class="category-list" aria-hidden="true">
              <li v-for="index in 5" :key="index" class="category-item">
                <div class="category-nav-item">
                  <SkeletonBlock class="category-icon" width="1em" height="1em" />
                  <SkeletonBlock class="category-title" width="65%" height="var(--bew-line-height-control)" />
                </div>
              </li>
            </ul>
            <ul v-else-if="favoriteView === 'video'" class="category-list">
              <li
                v-for="item in favoriteCategories"
                :key="`video:${item.id}`"
                class="category-item"
                :class="{
                  'row-active': !isManagingFolder && selectedCategory?.id === item.id,
                  'row-selected': isManagingFolder && selectedFolderIds.includes(item.id),
                  'row-disabled': isSidebarOperating,
                }"
              >
                <button
                  class="category-nav-item"
                  :class="{
                    active: !isManagingFolder && selectedCategory?.id === item.id,
                    selected: isManagingFolder && selectedFolderIds.includes(item.id),
                    locked: isManagingFolder && item.id === defaultFolderId,
                  }"
                  :disabled="isSidebarOperating"
                  @click="handleCategoryItemClick(item)"
                >
                  <span
                    v-if="isManagingFolder"
                    class="category-icon"
                    :class="item.id === defaultFolderId
                      ? 'i-tabler:lock'
                      : (selectedFolderIds.includes(item.id) ? 'i-tabler:checkbox' : 'i-tabler:square')"
                  />
                  <span
                    v-else
                    class="category-icon"
                    :class="isFavoriteFolderPrivate(item) ? 'i-tabler:lock' : 'i-tabler:world'"
                    :title="t(isFavoriteFolderPrivate(item) ? 'favorites.folder_private' : 'favorites.folder_public')"
                  />
                  <span class="category-title">{{ item.title }}</span>
                  <span class="category-count">{{ item.media_count }}</span>
                </button>
                <button
                  v-if="!isManagingFolder && item.id !== defaultFolderId"
                  class="item-more-btn"
                  :disabled="isSidebarOperating"
                  :aria-label="t('favorites.sidebar_manage')"
                  aria-haspopup="menu"
                  :aria-expanded="itemMenuTarget?.type === 'folder' && itemMenuTarget.id === item.id"
                  @click.prevent.stop="openItemMenu({ type: 'folder', id: item.id }, $event)"
                >
                  <span i-mingcute:more-2-line />
                </button>
                <span
                  v-else-if="!isManagingFolder"
                  class="item-more-placeholder"
                  aria-hidden="true"
                />
              </li>
            </ul>

            <ul v-else-if="favoriteView === 'season'" class="category-list" @scroll.passive="handleSubscriptionDirectoryScroll">
              <li
                v-for="item in collectedFavoriteSeasons"
                :key="getFavoriteSourceKey(item)"
                class="category-item"
                :class="{
                  'row-active': !isManagingSeason && selectedSeason && getFavoriteSourceKey(selectedSeason) === getFavoriteSourceKey(item),
                  'row-selected': isManagingSeason && selectedSeasonKeys.includes(getFavoriteSourceKey(item)),
                  'row-disabled': isSidebarOperating,
                }"
              >
                <button
                  class="category-nav-item"
                  :class="{
                    active: !isManagingSeason && selectedSeason && getFavoriteSourceKey(selectedSeason) === getFavoriteSourceKey(item),
                    selected: isManagingSeason && selectedSeasonKeys.includes(getFavoriteSourceKey(item)),
                  }"
                  :disabled="isSidebarOperating"
                  @click="handleSeasonItemClick(item)"
                >
                  <span
                    v-if="isManagingSeason"
                    class="category-icon"
                    :class="selectedSeasonKeys.includes(getFavoriteSourceKey(item)) ? 'i-tabler:checkbox' : 'i-tabler:square'"
                  />
                  <span v-else class="category-icon" i-tabler:stack-2 />
                  <span class="category-title">{{ item.title }}</span>
                  <span class="category-count">{{ item.media_count }}</span>
                </button>
                <button
                  v-if="!isManagingSeason"
                  class="item-more-btn"
                  :disabled="isSidebarOperating"
                  :aria-label="t('favorites.sidebar_manage')"
                  aria-haspopup="menu"
                  :aria-expanded="itemMenuTarget?.type === 'season' && getFavoriteSourceKey(itemMenuTarget.source) === getFavoriteSourceKey(item)"
                  @click.prevent.stop="openItemMenu({ type: 'season', source: { id: item.id, type: item.type } }, $event)"
                >
                  <span i-mingcute:more-2-line />
                </button>
              </li>
            </ul>

            <div v-else class="article-nav-item">
              <span class="category-icon" i-tabler:article />
              <span class="category-title">{{ t('favorites.article_section_title') }}</span>
              <span class="category-count">{{ selectedContentCount }}</span>
            </div>
            <div v-if="favoriteView === 'season' && (subscriptionState.hasMore || subscriptionState.failed)" class="favorites-directory-more">
              <span v-if="subscriptionState.failed" role="status">{{ t('common.load_failed') }}</span>
              <Button type="tertiary" class="bew-cover-sidebar__action" :disabled="subscriptionState.loading" @click="loadMoreSubscriptions(subscriptionState.failed)">
                <SkeletonBlock v-if="subscriptionState.loading" width="4em" height="1em" />
                <template v-else>
                  {{ t(subscriptionState.failed ? 'common.operation.refresh' : 'common.load_more') }}
                </template>
              </Button>
            </div>
          </nav>

          <ContextMenu
            v-if="itemMenuTarget"
            :options="itemMenuOptions"
            :anchor="itemMenuAnchor"
            :trigger="itemMenuTrigger"
            @select="handleItemMenuSelect"
            @close="closeItemMenu"
          />
        </div>
      </CoverSidebarSurface>
    </aside>
  </div>
  <Empty v-else mt-6 :description="t('common.please_log_in_first')">
    <Button type="primary" @click="jumpToLoginPage()">
      {{ $t('common.login') }}
    </Button>
  </Empty>
</template>

<style lang="scss" scoped>
@use "../../../styles/breakpoints";
@use "./favoritesLayout";

.favorites-sidebar-content {
  position: absolute;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  padding: var(--bew-space-6);
  overflow: auto;
  overscroll-behavior: contain;
  inset: 0;
}

.favorites-sidebar-cover {
  display: none;
  place-items: center;
  flex: 0 0 auto;
  width: 100%;
  overflow: hidden;
  color: var(--bew-sidebar-muted);
  background: var(--bew-skeleton);
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-sidebar-media-shadow);
  aspect-ratio: 16 / 9;
}

.favorites-sidebar-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  corner-shape: inherit;
}

.favorites-sidebar-cover span {
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
}

.favorites-sidebar-title h3,
.favorites-sidebar-title p {
  margin: 0;
  color: var(--bew-sidebar-text);
  text-shadow: var(--bew-sidebar-text-shadow);
}

.favorites-play-all {
  --b-button-height: var(--bew-control-height);

  height: var(--bew-control-height);
  min-height: var(--bew-control-height);
  flex-shrink: 0;
  padding-block: 0;
  box-sizing: border-box;
}

.favorites-sidebar-title p {
  margin-top: var(--bew-space-1);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  opacity: 0.76;
}

.favorite-view-select {
  flex: 1 1 auto;
  min-width: 0;
}

.favorite-view-select :deep(.select-trigger) {
  box-sizing: border-box;
  height: var(--bew-control-height);
  padding: 0 0 0 var(--bew-space-3);
  overflow: hidden;
  color: var(--bew-sidebar-text);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  background: var(--bew-sidebar-control);
  border: 1px solid var(--bew-sidebar-border);
  text-shadow: var(--bew-sidebar-text-shadow);
}

.favorite-view-select :deep(.select-trigger:hover) {
  background: var(--bew-sidebar-control-hover);
}

.favorite-view-select :deep(.select-arrow-slot) {
  align-self: stretch;
  width: var(--bew-control-height);
  margin-left: var(--bew-space-2);
}

.favorite-view-select :deep(.select-arrow) {
  border-color: var(--bew-sidebar-text);
}

.sidebar-mode-row {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  align-items: center;
}

.sidebar-manage-toggle,
.sidebar-manage-action {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  padding: 0;
  color: var(--bew-sidebar-text);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-sidebar-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.sidebar-manage-toggle {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
}

.sidebar-manage-toggle:hover,
.sidebar-manage-toggle.active,
.sidebar-manage-action:hover:not(:disabled) {
  color: var(--bew-sidebar-text);
  background: var(--bew-sidebar-control-hover);
}

.sidebar-manage-action.danger:hover:not(:disabled) {
  color: var(--bew-error-color);
  background: var(--bew-sidebar-control-hover);
}

.sidebar-manage-toggle span,
.sidebar-manage-action span,
.sidebar-manage-select span {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}

.sidebar-manage-action:disabled {
  cursor: default;
  opacity: 0.4;
}

.sidebar-manage-bar {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-1);
  align-items: center;
  min-height: var(--bew-control-height);
}

.sidebar-manage-select {
  display: flex;
  flex: 1 1 auto;
  gap: var(--bew-space-1);
  align-items: center;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  color: var(--bew-sidebar-secondary);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.sidebar-manage-select:hover {
  color: var(--bew-sidebar-text);
}

.sidebar-selected-count {
  color: var(--bew-sidebar-muted);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.favorites-old-nav {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.category-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-1);
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.favorites-directory-more {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  padding-top: var(--bew-space-2);
  color: var(--bew-sidebar-secondary);
  font-size: var(--bew-font-size-control);
}

.sidebar-manage-toggle,
.sidebar-manage-action,
.category-item,
.item-more-btn,
.category-nav-item,
.article-nav-item,
.favorite-card-action,
.batch-target-folder {
  corner-shape: var(--bew-corner-shape);
}

.category-item {
  display: flex;
  align-items: center;
  width: 100%;
  border-radius: var(--bew-interactive-radius);
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.category-item .category-nav-item {
  flex: 1 1 auto;
  min-width: 0;
}

.category-item:hover:not(.row-disabled):not(.row-active) {
  background: var(--bew-sidebar-control);
}

.category-item.row-active {
  background: var(--bew-sidebar-selected);
}

.category-item.row-selected {
  background: var(--bew-theme-color);
}

.item-more-btn,
.item-more-placeholder {
  flex: 0 0 auto;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  margin-right: var(--bew-space-1);
}

.item-more-btn {
  display: grid;
  place-items: center;
  padding: 0;
  overflow: hidden;
  color: var(--bew-sidebar-muted);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.item-more-btn:hover {
  color: var(--bew-sidebar-text);
  background: var(--bew-sidebar-control);
}

.item-more-btn span {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}

.category-nav-item,
.article-nav-item {
  display: grid;
  grid-template-columns: var(--bew-icon-size-lg) minmax(0, 1fr) auto;
  gap: var(--bew-space-2);
  align-items: center;
  width: 100%;
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-sidebar-secondary);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-align: left;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
}

.category-nav-item {
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.category-item:hover .category-nav-item:not(:disabled):not(.active):not(.selected) {
  color: var(--bew-sidebar-text);
  background: transparent;
}

.category-nav-item.active {
  color: var(--bew-sidebar-text);
  background: transparent;
}

.category-nav-item.selected {
  color: var(--bew-on-theme-color);
  background: transparent;
}

.article-nav-item {
  color: var(--bew-sidebar-text);
  background: var(--bew-sidebar-selected);
}

.category-nav-item.locked {
  cursor: default;
  opacity: 0.5;
}

.category-nav-item:disabled {
  cursor: default;
  opacity: 0.56;
}

.category-icon {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}

.category-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-count {
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  opacity: 0.72;
}

.favorites-toolbar {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  width: 100%;
  max-width: 100%;
  margin: var(--bew-space-3) 0;
  padding: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.toolbar-search-group,
.toolbar-action-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  align-items: center;
}

.toolbar-search-group {
  flex: 1 1 auto;
  min-width: 0;
}

.toolbar-action-group {
  flex: 0 0 auto;
}

.batch-selected-count {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
}

.search-scope-select {
  flex: 0 0 120px;
}

.favorites-search-input {
  width: min(250px, 100%);
}

.article-favorites-content,
.article-favorites-grid {
  width: 100%;
}

.article-favorites-content,
.favorites-old-main > :deep(.video-card-grid-root) {
  margin-top: var(--bew-space-3);
}

.article-favorites-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-4);
}

.content-loading {
  display: grid;
  place-items: center;
  min-height: 64px;
  padding: var(--bew-space-4);
}

.content-loading--initial {
  min-height: 240px;
}

.favorite-card-action {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 30px;
  margin: var(--bew-space-1);
  padding: 0 var(--bew-space-2);
  color: #fff;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: rgba(0, 0, 0, 0.62);
  cursor: pointer;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.favorite-card-action:hover {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}

.favorite-card-action.selected {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}

.favorite-card-action.danger:hover {
  color: #fff;
  background: var(--bew-error-color);
}

.edit-folder-dialog {
  display: grid;
  gap: var(--bew-space-4);
}

.edit-folder-visibility {
  display: grid;
  gap: var(--bew-space-3);
}

.edit-folder-visibility__copy strong,
.edit-folder-visibility__copy p {
  margin: 0;
}

.edit-folder-visibility__copy strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.edit-folder-visibility__copy p {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.batch-transfer-dialog {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--bew-space-2);
  padding: var(--bew-space-0-5) 0 var(--bew-space-2);
}

.batch-target-folder {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto 20px;
  gap: var(--bew-space-3);
  align-items: center;
  width: 100%;
  min-height: 46px;
  padding: 0 var(--bew-space-4);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-body);
  text-align: left;
  border: 1px solid transparent;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    border-color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.batch-target-folder:hover {
  background: var(--bew-fill-2);
}

.batch-target-folder.active {
  color: var(--bew-on-theme-surface);
  border-color: var(--bew-theme-color);
  background: var(--bew-theme-surface);
}

.batch-target-folder-icon,
.batch-target-folder-check {
  width: 18px;
  height: 18px;
}

.batch-target-folder-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-target-folder-count {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.category-list {
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.35);
    border-radius: var(--bew-radius-full);
  }

  &::-webkit-scrollbar-corner {
    background: transparent;
  }
}

@media (min-width: breakpoints.$grid-md) {
  .favorites-sidebar-cover {
    display: grid;
  }
}

@media (max-width: breakpoints.$mobile-max) {
  .favorites-toolbar {
    flex-wrap: wrap;
    width: 100%;
  }

  .favorites-search-input {
    flex: 1 1 200px;
  }
}

@media (max-width: breakpoints.$grid-sm) {
  .article-favorites-grid {
    grid-template-columns: 1fr;
  }
}
</style>
