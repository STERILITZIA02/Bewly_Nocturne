<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ArticleCard from '~/components/ArticleCard/ArticleCard.vue'
import ArticleCardSkeleton from '~/components/ArticleCard/ArticleCardSkeleton.vue'
import Button from '~/components/Button.vue'
import ContextMenu from '~/components/ContextMenu.vue'
import Dialog from '~/components/Dialog.vue'
import Empty from '~/components/Empty.vue'
import IconButton from '~/components/IconButton.vue'
import LibraryBleedStrip from '~/components/LibraryBleedStrip.vue'
import type { LibraryFilterGroup } from '~/components/LibraryFilterMenu.vue'
import LibraryFilterMenu from '~/components/LibraryFilterMenu.vue'
import LibraryHero from '~/components/LibraryHero.vue'
import LibraryHeroCarousel from '~/components/LibraryHeroCarousel.vue'
import LibrarySearchField from '~/components/LibrarySearchField.vue'
import LibrarySidebarHeading from '~/components/LibrarySidebarHeading.vue'
import LibraryWorkspace from '~/components/LibraryWorkspace.vue'
import LoadingRing from '~/components/LoadingRing.vue'
import SettingsSegmentedControl from '~/components/Settings/components/SettingsSegmentedControl.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import Tooltip from '~/components/Tooltip.vue'
import type { FavoriteResource } from '~/components/TopBar/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useCardRemoval } from '~/composables/useCardRemoval'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { usePageViewState } from '~/composables/usePageViewState'
import { LIBRARY_HERO_RENDER_RADIUS } from '~/constants/library'
import { settings } from '~/logic'
import type { Media as FavoriteItem } from '~/models/video/favorite'
import type { List as CategoryItem } from '~/models/video/favoriteCategory'
import type { CollectedFavoriteSeason, FavoriteSource } from '~/models/video/favoriteSeason'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { isFavoriteFolderPrivate } from '~/utils/favoriteFolder'
import { getFavoriteResourceKey, getFavoriteSourceKey, isPlayableFavoriteVideo } from '~/utils/favoriteResource'
import {
  FAVORITE_FOLDER_PAGE_SIZE,
  FAVORITE_SEASON_PAGE_SIZE,
  resolveFavoriteSeasonPlayAllUrl,
} from '~/utils/favoriteSeason'
import { getCSRF, getUserID, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'
import { retiringTransition } from '~/utils/motionPresence'
import { captureVideoFavoriteRemoval } from '~/utils/videoFavoriteSelection'

import { transformFavoriteArticle, transformFavoriteItem } from './favoriteAdapters'
import type { FavoriteFilterQuery } from './favoriteFilter'
import { collectFavoriteUploaders, EMPTY_FAVORITE_FILTER, normalizeFavoriteFilterQuery } from './favoriteFilter'
import FavoriteFolderEditor from './FavoriteFolderEditor.vue'
import FavoriteFolderSocial from './FavoriteFolderSocial.vue'
import FavoriteResourceActions from './FavoriteResourceActions.vue'
import FavoriteSidebarItem from './FavoriteSidebarItem.vue'
import FavoriteSidebarSkeleton from './FavoriteSidebarSkeleton.vue'
import type { FavoriteVideoOrder, OtherFavoriteKind } from './otherFavorites'
import { matchesSubscriptionType } from './otherFavorites'
import { useFavoriteFilterScan } from './useFavoriteFilterScan'
import { useFavoriteFolderManager } from './useFavoriteFolderManager'
import type { FavoriteView } from './useFavoritesData'
import { useFavoritesData } from './useFavoritesData'
import type { FavoriteWrite } from './useFavoriteWrites'
import { useFavoriteWrites } from './useFavoriteWrites'

const { t } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()

type BatchTransferAction = 'copy' | 'move'
type SidebarManageSection = 'folder' | 'season'

const { handlePageRefresh, handleReachBottom, haveScrollbar, openSettingsAt } = useBewlyApp()
const topBarStore = useTopBarStore()
const viewOwner = crypto.randomUUID()
const accountId = computed(() => resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid))
const data = useFavoritesData({ api: api.favorite, getAccountId: () => getUserID() === String(accountId.value) ? accountId.value : null, haveScrollbar, t })
const { favoriteCategories, collectedFavoriteSeasons, favoriteResources, favoriteView, selectedCategory, selectedSeason, keyword, searchScope, isLoading, isFullPageLoading, bootstrapFailed, failedContentPage, stalledContentPage, noMoreContent, loadedSeasonComplete, articleFavoriteCount, initData, retryFavoritesBootstrap, loadSelectedContent, loadNextPage, retryFavoriteContent, contentVersion, categoryState, subscriptionState, loadMoreSubscriptions } = data
const { visibleSubscriptions, visibleResources, visibleArticles, folderCovers, loadFolderCover } = data
const { videoOrder, subscriptionFilter, otherFavoriteType, otherSearchScope, otherFavoriteCounts, visibleOtherFavorites } = data
const writes = useFavoriteWrites({ api: api.favorite, capture: data.capture, getCSRF, onError: () => toast.error(t('common.operation_failed')), onConfirmed: (command) => {
  if ('sourceId' in command)
    applyResourceChange(command)
  else if (command.kind === 'clean')
    applyResourceChange({ kind: 'clean', sourceId: command.folderId, resourceKeys: [] })
  else
    data.invalidateReads('folderId' in command ? [command.folderId] : undefined)
} })
const folders = useFavoriteFolderManager({ api: { getFavoriteFolderInfo: data.reads.getFavoriteFolderInfo, uploadFavoriteCover: api.favorite.uploadFavoriteCover }, data, writes, getCSRF, notify: notifyTopBarFavoritesChanged, error: key => toast.error(t(key)), confirm: key => showConfirmDialog(t(key)) })
const { editor: folderEditor, form: folderForm, info: folderInfo, infoLoading: folderInfoLoading, infoFailed: folderInfoFailed, currentFolderId } = folders
const viewState = usePageViewState('favorites')
const restoredFilter = normalizeFavoriteFilterQuery(viewState.read<FavoriteFilterQuery>('filter', EMPTY_FAVORITE_FILTER))
const filterKeyword = ref('')
const filterScan = useFavoriteFilterScan({
  api: { getFavoriteResources: data.reads.getFavoriteResources, getFavoritePartitions: api.favorite.getFavoritePartitions },
  invalidatePage: data.invalidateResourcePage,
  getAccountId: () => getUserID() === String(accountId.value) ? accountId.value : null,
  getSourceIds: () => searchScope.value === 'all' ? favoriteCategories.map(item => item.id) : selectedCategory.value ? [selectedCategory.value.id] : [],
  getScope: () => searchScope.value,
  getOrder: () => videoOrder.value,
  getNormalQuery: () => filterKeyword.value,
  isActive: () => favoriteView.value === 'video' && categoryState.loaded,
})
viewState.capture('filter', () => filterScan.applied.value)
const filterActive = computed(() => favoriteView.value === 'video' && filterScan.active.value)
const filterStatus = filterScan.status
const managedResources = computed(() => filterActive.value ? filterScan.items.value : favoriteResources)
const filterUploaders = computed(() => collectFavoriteUploaders([...favoriteResources, ...filterScan.items.value]))
// The strip over the content: this folder's uploaders, each a one-tap filter.
const showUploaderStrip = computed(() => favoriteView.value === 'video' && Boolean(currentFolderId.value) && filterUploaders.value.length > 1)
function isStripUploader(mid: number) {
  const { mids } = filterScan.applied.value
  return mids.length === 1 && mids[0] === mid
}
function selectStripUploader(mid?: number) {
  applyFavoriteFilter({ ...filterScan.applied.value, mids: mid === undefined || isStripUploader(mid) ? [] : [mid] })
}
// The hero's cover: the folder's own, else its first item's.
const heroImage = computed(() => folderInfo.value?.cover || visibleResources.value[0]?.cover || '')
const ownFolder = computed(() => Boolean(folderInfo.value && String(folderInfo.value.mid || folderInfo.value.upper.mid) === String(accountId.value)))
const removals = useCardRemoval<FavoriteResource>({
  items: () => (filterActive.value ? filterScan.items.value : visibleResources.value) as FavoriteResource[],
  key: item => filterActive.value ? filterScan.getItemKey(item as unknown as FavoriteItem) : getFavoriteResourceKey(item),
  scope: () => JSON.stringify([accountId.value, contentVersion.value, favoriteView.value, selectedCategory.value?.id, selectedSeason.value?.id, keyword.value, searchScope.value, videoOrder.value, filterScan.applied.value]),
})

const isResolvingSeasonPlayAll = ref<boolean>(false)
const isBatchManaging = ref<boolean>(false)
const isBatchOperating = computed(() => folders.pending.value)
const selectedResourceKeys = ref<string[]>([])
const targetCategory = ref<CategoryItem>()
const batchTransferDialogVisible = ref<boolean>(false)
const batchTransferAction = ref<BatchTransferAction>('copy')
const sidebarManageSection = ref<SidebarManageSection | null>(null)
const selectedFolderIds = ref<number[]>([])
const selectedSeasonKeys = ref<string[]>([])
const isSidebarOperating = computed(() => folders.pending.value)
function notifyTopBarFavoritesChanged(sourceIds?: number[]) {
  void topBarStore.notifyFavoritesChanged({ sourceIds, handledBy: viewOwner }).catch((error) => {
    console.error('通知顶栏收藏状态变化失败:', error)
  })
}

const favoriteViewOptions = computed(() => [
  { label: t('favorites.rail_video'), value: 'video' as const },
  { label: t('favorites.rail_season'), value: 'season' as const },
  { label: t('favorites.rail_article'), value: 'article' as const },
])
const videoOrderOptions = computed(() => [
  { label: t('favorites.order_recent'), value: 'mtime' as const },
  { label: t('favorites.order_views'), value: 'view' as const },
  { label: t('favorites.order_published'), value: 'pubtime' as const },
])
const otherFavoriteOptions = computed(() => [
  { label: t('favorites.topic_folder'), value: 'topic' as const, icon: 'i-tabler:hash' },
  { label: t('favorites.article_folder'), value: 'article' as const, icon: 'i-tabler:article' },
  { label: t('favorites.course_folder'), value: 'course' as const, icon: 'i-tabler:school' },
])
const otherCards = computed(() => otherFavoriteType.value === 'article'
  ? visibleArticles.value.map(transformFavoriteArticle)
  : visibleOtherFavorites.value)

const selectedContentTitle = computed(() => {
  if (favoriteView.value === 'season')
    return selectedSeason.value?.title || t('favorites.season_section_title')
  if (favoriteView.value === 'article')
    return otherFavoriteOptions.value.find(option => option.value === otherFavoriteType.value)!.label
  return selectedCategory.value?.title || t('favorites.video_section_title')
})

const selectedContentCount = computed(() => {
  if (favoriteView.value === 'season')
    return selectedSeason.value?.media_count ?? 0
  if (favoriteView.value === 'article')
    return otherFavoriteType.value === 'article' ? articleFavoriteCount.value : otherFavoriteCounts[otherFavoriteType.value]
  return selectedCategory.value?.media_count ?? 0
})

// The hero's meta line: how many videos (or, for the other favorites, items).
const heroMeta = computed(() => selectedContentCount.value === undefined
  ? undefined
  : t(favoriteView.value === 'article' ? 'library_tools.item_count' : 'library_tools.video_count', { count: selectedContentCount.value }))
const isInitialSidebarLoading = computed(() => favoriteView.value === 'video'
  ? categoryState.loading && !favoriteCategories.length
  : favoriteView.value === 'season' && subscriptionState.loading && !collectedFavoriteSeasons.length)
// While a folder's first page loads, the strip is held by tiles of the same
// size, so the head and grid do not jump when the uploaders arrive.
const uploaderStripPending = computed(() => favoriteView.value === 'video' && !filterUploaders.value.length && !filterActive.value && !keyword.value.trim()
  && (isInitialSidebarLoading.value || (Boolean(currentFolderId.value) && (isLoading.value || isFullPageLoading.value))))
// Until the folder or its first page arrives, the cover band is held.
const heroMediaPending = computed(() => favoriteView.value !== 'article' && !heroImage.value
  && (isInitialSidebarLoading.value || folderInfoLoading.value || ((isLoading.value || isFullPageLoading.value) && !visibleResources.value.length)))
// The hero row (user-specified): the folders, or the collected subscriptions,
// that the rail lists, with the open one as the current card; a peeking card
// or a sideways swipe opens its neighbour the way the rail does, so the rail,
// strip, grid and hero all follow. Other views have one card.
const heroItems = computed(() => {
  // While the folders load, the next card is held too, so the row keeps its shape.
  if (isInitialSidebarLoading.value && favoriteView.value !== 'article')
    return [{ key: 'current', label: selectedContentTitle.value }, { key: 'loading', label: '' }]
  if (favoriteView.value === 'video' && searchScope.value === 'current' && selectedCategory.value)
    return favoriteCategories.map(item => ({ key: `folder:${item.id}`, label: item.title }))
  if (favoriteView.value === 'season' && selectedSeason.value && visibleSubscriptions.value.length)
    return visibleSubscriptions.value.map(item => ({ key: `season:${getFavoriteSourceKey(item)}`, label: item.title }))
  return [{ key: 'current', label: selectedContentTitle.value }]
})
const heroKey = computed(() => {
  if (heroItems.value[0]?.key.startsWith('folder:'))
    return `folder:${selectedCategory.value!.id}`
  if (heroItems.value[0]?.key.startsWith('season:'))
    return `season:${getFavoriteSourceKey(selectedSeason.value!)}`
  return 'current'
})
const heroSwitchDisabled = computed(() => isInitialSidebarLoading.value || isSidebarOperating.value || isBatchManaging.value || sidebarManageSection.value !== null)
function findHeroItem(key: string) {
  if (key.startsWith('folder:'))
    return { folder: favoriteCategories.find(item => `folder:${item.id}` === key) }
  return { season: visibleSubscriptions.value.find(item => `season:${getFavoriteSourceKey(item)}` === key) }
}
// A card: its cover (a folder's own, read like the rail's), title and count.
// The current card adds the folder's details; its cover stays the one it had
// as a neighbour while it is known, so switching does not reload it.
function getHeroCard(key: string, current: boolean) {
  if (key === 'loading')
    return { label: '', mediaPending: true }
  const { folder, season } = key === 'current' ? {} : findHeroItem(key)
  const item = folder ?? season
  if (current) {
    const image = (folder && folderCovers[folder.id]) || season?.cover || heroImage.value
    return { label: selectedContentTitle.value, image, mediaPending: !image && heroMediaPending.value, title: selectedContentTitle.value, meta: heroMeta.value }
  }
  return item
    ? { label: item.title, image: folder ? folderCovers[folder.id] : season!.cover, mediaPending: Boolean(folder && folderCovers[folder.id] === undefined), title: item.title, meta: t('library_tools.video_count', { count: item.media_count }) }
    : { label: '' }
}
// The hero reads covers one card further than it renders, nearest first, so a
// card that comes into the row has its cover already.
watch([heroItems, heroKey], () => {
  const index = heroItems.value.findIndex(item => item.key === heroKey.value)
  for (let distance = 1; distance <= LIBRARY_HERO_RENDER_RADIUS + 1; distance++) {
    for (const neighbor of [heroItems.value[index + distance], heroItems.value[index - distance]]) {
      const folder = neighbor && findHeroItem(neighbor.key).folder
      if (folder)
        loadFolderCover(folder.id, 'hero')
    }
  }
}, { immediate: true })
function selectHeroItem(key: string) {
  if (heroSwitchDisabled.value)
    return
  const { folder, season } = findHeroItem(key)
  if (folder)
    changeCategory(folder)
  else if (season)
    changeSeason(season)
}
const favoriteGridStateKey = computed(() => `${accountId.value}:${favoriteView.value === 'season' && selectedSeason.value
  ? getFavoriteSourceKey(selectedSeason.value)
  : `folder:${selectedCategory.value?.id ?? ''}`}:${contentVersion.value}`)

const canBatchManage = computed(() => {
  return favoriteView.value === 'video'
    && searchScope.value === 'current'
    && Boolean(selectedCategory.value)
})

const selectedFavoriteResources = computed(() => {
  const selectedKeys = new Set(selectedResourceKeys.value)
  return managedResources.value.filter(item => selectedKeys.has(getFavoriteResourceKey(item)))
})

const selectedCount = computed(() => selectedFavoriteResources.value.length)

const isAllCurrentPageSelected = computed(() => {
  return managedResources.value.length > 0
    && managedResources.value.every(item => selectedResourceKeys.value.includes(getFavoriteResourceKey(item)))
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

// The open folder card's action row: Play All, a few icons, and the rest in
// one "more" menu (no stack of full-width buttons).
interface FolderMenuAction { value: string, label: string, icon: string, danger?: boolean, disabled?: boolean, run: () => void }
const folderMenu = shallowRef<{ anchor: { x: number, y: number }, trigger: HTMLElement, actions: FolderMenuAction[] }>()
function openFolderMenu(event: MouseEvent, actions: FolderMenuAction[]) {
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  folderMenu.value = { anchor: { x: rect.right, y: rect.bottom }, trigger, actions }
}
function runFolderMenu(value: string | number) {
  folderMenu.value?.actions.find(action => action.value === value)?.run()
}
function getFolderMenuActions(item: CategoryItem): FolderMenuAction[] {
  const busy = isSidebarOperating.value
  const removable = item.id !== defaultFolderId.value
  return [
    ...(removable ? [{ value: 'pin', label: t('favorites.pin_folder'), icon: 'i-tabler:pin', disabled: busy || favoriteCategories[1]?.id === item.id, run: () => void folders.pin(item.id) }] : []),
    { value: 'edit', label: t('favorites.edit_folder'), icon: 'i-tabler:edit', disabled: busy, run: () => void openSingleEditFolder(item.id) },
    { value: 'clean', label: t('favorites.clean_invalid'), icon: 'i-tabler:trash-x', disabled: busy, run: () => void folders.clean(item.id) },
    ...(removable ? [{ value: 'delete', label: t('common.operation.delete'), icon: 'i-tabler:trash', danger: true, disabled: busy, run: () => void deleteFolders([item.id]) }] : []),
  ]
}
function getSeasonMenuActions(item: CollectedFavoriteSeason): FolderMenuAction[] {
  return [
    { value: 'mode', label: t('settings.collected_season_play_all_mode'), icon: 'i-tabler:adjustments-horizontal', run: () => openSettingsAt({ category: 'playback', page: 'behavior', settingId: 'settings.collected_season_play_all_mode' }) },
    { value: 'unfavorite', label: t('favorites.unfavorite'), icon: 'i-tabler:star-off', danger: true, disabled: isSidebarOperating.value, run: () => void unfavSeasons([{ id: item.id, type: item.type }]) },
  ]
}
const editableFolderIds = computed(() => favoriteCategories.filter(item => item.id !== defaultFolderId.value).map(item => item.id))
const selectedFolderCount = computed(() => selectedFolderIds.value.length)
const selectedSeasonCount = computed(() => selectedSeasonKeys.value.length)
const isManagingFolder = computed(() => sidebarManageSection.value === 'folder')
const isManagingSeason = computed(() => sidebarManageSection.value === 'season')
const canEditSelectedFolder = computed(() => selectedFolderIds.value.length === 1)
const isAllFoldersSelected = computed(() => {
  return editableFolderIds.value.length > 0
    && editableFolderIds.value.every(id => selectedFolderIds.value.includes(id))
})
const isAllSeasonsSelected = computed(() => {
  return visibleSubscriptions.value.length > 0
    && visibleSubscriptions.value.every(item => selectedSeasonKeys.value.includes(getFavoriteSourceKey(item)))
})
// Every view filters from the search field's funnel, as on the other rails:
// videos by search scope and partition (the uploader is the strip over the
// content), subscriptions by type, the other favorites by search field.
const filterGroups = computed<LibraryFilterGroup[]>(() => {
  if (favoriteView.value === 'video') {
    const partitions = filterScan.partitions.value
    const tid = filterScan.applied.value.tids[0]
    return [
      { key: 'scope', title: t('library_tools.search_scope'), value: searchScope.value, options: [
        { value: 'current', label: t('favorites.search_current_folder'), icon: 'i-tabler:folder' },
        { value: 'all', label: t('favorites.search_all_folders'), icon: 'i-tabler:folders' },
      ] },
      { key: 'partition', title: t('favorites.filter_partition'), value: tid === undefined ? 'all' : String(tid), options: [
        { value: 'all', label: t('favorites.filter_partition_all'), icon: 'i-tabler:category', pending: filterScan.partitionsLoading.value && !partitions.length },
        ...partitions.map(option => ({ value: String(option.tid), label: option.name, icon: 'i-tabler:tag' })),
        ...(filterScan.partitionsFailed.value && !filterScan.partitionsLoading.value ? [{ value: 'retry', label: t('favorites.filter_partition_retry'), icon: 'i-tabler:refresh', action: true }] : []),
      ] },
    ]
  }
  if (favoriteView.value === 'season') {
    return [{ key: 'subscription', title: t('favorites.subscription_filter'), value: subscriptionFilter.value, options: [
      { value: 'all', label: t('favorites.subscription_all'), icon: 'i-tabler:list' },
      { value: 'season', label: t('favorites.subscription_seasons'), icon: 'i-tabler:stack-2' },
      { value: 'folder', label: t('favorites.subscription_folders'), icon: 'i-tabler:folder' },
    ] }]
  }
  const article = otherFavoriteType.value === 'article'
  return [{ key: 'field', title: t('library_tools.search_scope'), value: otherSearchScope.value, options: [
    { value: 'all', label: t('favorites.search_all_fields'), icon: 'i-tabler:list-search' },
    { value: 'title', label: t(article ? 'favorites.search_content_only' : 'favorites.search_title_only'), icon: 'i-tabler:heading' },
    { value: 'detail', label: t(article ? 'favorites.search_author_only' : 'favorites.search_description_only'), icon: article ? 'i-tabler:user' : 'i-tabler:align-left' },
  ] }]
})
const railFilterActive = computed(() => favoriteView.value === 'video'
  ? searchScope.value === 'all' || filterScan.applied.value.tids.length > 0
  : favoriteView.value === 'season' ? subscriptionFilter.value !== 'all' : otherSearchScope.value !== 'all')
function selectRailFilter(key: string, value: string) {
  if (key === 'scope') {
    selectSearchScope(value)
  }
  else if (key === 'partition' && value === 'retry') {
    retryPartitions()
  }
  else if (key === 'partition') {
    applyFavoriteFilter({ ...filterScan.applied.value, tids: value === 'all' ? [] : [Number(value)] })
  }
  else if (key === 'subscription' && subscriptionFilter.value !== value) {
    subscriptionFilter.value = value as typeof subscriptionFilter.value
    handleSubscriptionFilterChange()
  }
  else if (key === 'field') {
    otherSearchScope.value = value as typeof otherSearchScope.value
  }
}

onMounted(() => {
  initPageAction()
  void initData()
})

onScopeDispose(() => {
  filterScan.dispose()
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
    void data.refreshSelectedContent()
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
  if (selectedCategory.value?.id !== item.id || searchScope.value !== 'current')
    changeCategory(item)
}

function handleSeasonItemClick(item: CollectedFavoriteSeason) {
  if (isManagingSeason.value) {
    toggleSeasonSelection(item)
    return
  }
  if (!selectedSeason.value || getFavoriteSourceKey(selectedSeason.value) !== getFavoriteSourceKey(item))
    changeSeason(item)
}

function toggleSelectAllFolders() {
  selectedFolderIds.value = isAllFoldersSelected.value ? [] : [...editableFolderIds.value]
}

function toggleSelectAllSeasons() {
  selectedSeasonKeys.value = isAllSeasonsSelected.value ? [] : visibleSubscriptions.value.map(getFavoriteSourceKey)
}

function openEditFolderDialog() {
  if (!canEditSelectedFolder.value || isSidebarOperating.value)
    return

  openSingleEditFolder(selectedFolderIds.value[0])
}

function openSingleEditFolder(folderId: number) {
  if (favoriteCategories.some(item => item.id === folderId))
    void folders.openEditor(folderId)
}

async function shareFolder() {
  const info = folderInfo.value
  if (!info)
    return
  try {
    await navigator.clipboard.writeText(`https://www.bilibili.com/list/ml${info.id}`)
    toast.success(t('favorites.folder_link_copied'))
  }
  catch {
    toast.error(t('common.operation_failed'))
  }
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
    : managedResources.value.map(item => getFavoriteResourceKey(item))
}

function toggleBatchManage() {
  if (isBatchManaging.value) {
    closeBatchManage()
    return
  }
  if (!canBatchManage.value)
    return

  exitSidebarManage()
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

function handleFavoriteViewChange(view: FavoriteView) {
  if (favoriteView.value === view)
    return
  closeBatchManage()
  exitSidebarManage()
  favoriteView.value = view
  searchScope.value = 'current'

  if (view === 'video' && !selectedCategory.value)
    selectedCategory.value = favoriteCategories[0]
  else if (view === 'season' && !selectedSeason.value)
    selectedSeason.value = collectedFavoriteSeasons.find(item => matchesSubscriptionType(item.type, subscriptionFilter.value))

  loadSelectedContent()
}

function selectRailFavoriteView(value: string) {
  const option = favoriteViewOptions.value.find(option => option.value === value)
  if (option)
    handleFavoriteViewChange(option.value)
}

function changeCategory(categoryItem: CategoryItem) {
  closeBatchManage()
  exitSidebarManage()
  favoriteView.value = 'video'
  searchScope.value = 'current'
  selectedCategory.value = categoryItem
  loadSelectedContent()
}

function changeSeason(seasonItem: CollectedFavoriteSeason) {
  closeBatchManage()
  exitSidebarManage()
  favoriteView.value = 'season'
  searchScope.value = 'current'
  selectedSeason.value = seasonItem
  loadSelectedContent()
}

function handleSearch() {
  closeBatchManage()
  exitSidebarManage()
  if (favoriteView.value === 'video') {
    filterKeyword.value = keyword.value.trim()
    loadSelectedContent()
    if (filterActive.value)
      filterScan.refresh()
  }
  else {
    if (failedContentPage.value !== null || stalledContentPage.value !== null)
      void retryFavoriteContent()
    if (favoriteView.value === 'season' && subscriptionState.failed)
      void loadMoreSubscriptions(true)
  }
}

function selectSearchScope(scope: string) {
  if (scope !== 'current' && scope !== 'all')
    return
  searchScope.value = scope
  handleSearch()
}

function handleVideoOrderChange(order: FavoriteVideoOrder) {
  if (videoOrder.value === order)
    return
  videoOrder.value = order
  closeBatchManage()
  void loadSelectedContent()
}

function handleSubscriptionFilterChange() {
  exitSidebarManage()
  if (!selectedSeason.value || !matchesSubscriptionType(selectedSeason.value.type, subscriptionFilter.value)) {
    selectedSeason.value = collectedFavoriteSeasons.find(item => matchesSubscriptionType(item.type, subscriptionFilter.value))
    void loadSelectedContent()
  }
}

function selectOtherFavorite(kind: OtherFavoriteKind) {
  if (otherFavoriteType.value === kind)
    return
  otherFavoriteType.value = kind
  otherSearchScope.value = 'all'
  void loadSelectedContent()
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
  const sourceId = filterActive.value
    ? filterScan.getSourceId(resource as unknown as FavoriteItem) ?? (searchScope.value === 'current' ? selectedCategory.value?.id : undefined)
    : searchScope.value === 'current' ? selectedCategory.value?.id : undefined
  if (!sourceId)
    return
  if (resource.type !== 2 || !favoriteCategories.some(folder => folder.id === sourceId)) {
    await runResourceWrite({ kind: 'delete', sourceId, resourceKeys: [getFavoriteResourceKey(resource)] }, true)
    return
  }
  const owner = data.capture()
  const version = contentVersion.value
  removals.begin(resource, { restorable: isPlayableFavoriteVideo(resource), ...captureVideoFavoriteRemoval({ aid: resource.id }, sourceId, {
    account: () => getUserID() === String(accountId.value) ? accountId.value : null,
    csrf: getCSRF,
    resolveAid: async () => resource.id,
    read: (rid, account, signal) => api.favorite.getFavoriteCategories({ up_mid: String(account), rid, type: 2 }, { signal }),
    write: command => api.favorite.updateVideoFavorites(command),
    changed: () => topBarStore.notifyFavoritesChanged({ sourceIds: [sourceId], handledBy: viewOwner }),
  }, owner.isCurrent, async (added) => {
    if (!owner.isCurrent())
      return
    const command = { kind: added ? 'restore' as const : 'delete' as const, sourceId, resourceKeys: [getFavoriteResourceKey(resource)] }
    const reconciliation = applyResourceChange(command)
    if (added)
      await reconciliation
    if (version === contentVersion.value) {
      selectedResourceKeys.value = selectedResourceKeys.value.filter(key => !command.resourceKeys.includes(key))
    }
  }) })
}

function applyResourceChange(command: Parameters<typeof data.applyResourceWrite>[0]) {
  const reread = data.applyResourceWrite(command)
  const scan = filterScan.applyResourceWrite(command)
  if (currentFolderId.value && (currentFolderId.value === command.targetId || (command.kind !== 'copy' && currentFolderId.value === command.sourceId)))
    void folders.refreshInfo()
  if (reread && !filterActive.value)
    return data.loadNextPage()
  void data.getFavoriteCategories()
  return scan
}

function getFavoriteMenuGroups(resource: FavoriteResource) {
  return [[{ key: 'favorite:remove', name: t('favorites.unfavorite'), icon: 'i-tabler:star-off', color: 'text-$bew-error-color', run: () => void handleUnfavorite(resource) }]]
}

function applyFavoriteFilter(query: FavoriteFilterQuery) {
  closeBatchManage()
  exitSidebarManage()
  filterKeyword.value = keyword.value.trim()
  filterScan.apply(normalizeFavoriteFilterQuery(query))
}

// Partitions are read (from the per-folder cache once read) when the funnel
// menu opens on the video view, then follow the scope while it is in use.
function requestPartitions() {
  if (favoriteView.value !== 'video')
    return
  void filterScan.loadPartitions()
}
function retryPartitions() {
  void filterScan.retryPartitions()
}

// A filter scan reads further pages as the grid asks for more; retrying a
// failed or stalled scan continues from where it stopped.
function handleFavoriteGridLoadMore() {
  if (filterActive.value)
    filterScan.continueScan()
  else
    void loadNextPage()
}

function handleFavoriteGridRefresh() {
  if (filterActive.value)
    filterScan.continueScan()
  else
    void retryFavoriteContent()
}

watch([favoriteView, searchScope, () => selectedCategory.value?.id, videoOrder, () => categoryState.loaded, () => searchScope.value === 'all' ? favoriteCategories.map(item => item.id).join(',') : ''], () => {
  if (filterScan.active.value)
    filterScan.refresh()
})
let filterRestorePending = restoredFilter.mids.length + restoredFilter.tids.length > 0
watch(() => categoryState.loaded, (loaded) => {
  if (!loaded || !filterRestorePending)
    return
  filterRestorePending = false
  filterScan.apply(restoredFilter)
}, { immediate: true })

watch(keyword, () => {
  if (favoriteView.value !== 'video') {
    exitSidebarManage()
  }
})
watch(accountId, () => {
  filterRestorePending = false
  filterScan.apply(EMPTY_FAVORITE_FILTER)
  filterKeyword.value = ''
  data.resetAccount()
  writes.reset()
  closeBatchManage()
  exitSidebarManage()
  folders.reset()
  isResolvingSeasonPlayAll.value = false
  void initData()
}, { flush: 'sync' })
watch(() => topBarStore.favoriteStateVersion, () => {
  const change = topBarStore.favoriteStateChange
  if (!change || change.accountId !== accountId.value || change.handledBy === viewOwner)
    return
  const reread = data.invalidateResourceSources(change.sourceIds)
  filterScan.invalidateSources(change.sourceIds)
  if (currentFolderId.value && (!change.sourceIds || change.sourceIds.includes(currentFolderId.value)))
    void folders.refreshInfo()
  if (reread && !filterActive.value)
    void data.loadNextPage()
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
  if (version === contentVersion.value && selection === selectedResourceKeys.value) {
    selectedResourceKeys.value = selection.filter(key => !command.resourceKeys.includes(key))
    if (command.targetId === targetCategory.value?.id) {
      if (command.kind === 'move')
        closeBatchManage()
      else if (command.kind === 'copy')
        closeBatchTransferDialog()
    }
  }
  notifyTopBarFavoritesChanged([command.sourceId, ...command.targetId ? [command.targetId] : []])
}
</script>

<template>
  <LibraryWorkspace v-if="getCSRF()" :label="t('topbar.favorites')">
    <main class="favorites-old-main">
      <section v-if="showUploaderStrip || uploaderStripPending" class="favorite-uploader-strip" :aria-label="t('library_tools.uploaders')" :aria-busy="!showUploaderStrip">
        <!-- The uploaders of a new folder fade in over its skeletons. -->
        <Transition name="page-fade" mode="out-in" v-bind="retiringTransition">
          <LibraryBleedStrip v-if="!showUploaderStrip" key="pending" :label="t('library_tools.uploaders')">
            <span v-for="index in 10" :key="index" class="favorite-uploader-strip__item favorite-uploader-strip__item--skeleton" data-bew-skeleton-group aria-hidden="true">
              <SkeletonBlock width="var(--favorite-uploader-tile)" height="var(--favorite-uploader-tile)" radius="media" />
              <SkeletonBlock width="var(--bew-space-12)" height="var(--bew-line-height-control)" />
            </span>
          </LibraryBleedStrip>
          <LibraryBleedStrip v-else :key="`uploaders:${currentFolderId}`" :label="t('library_tools.uploaders')">
            <button
              type="button" class="favorite-uploader-strip__item" :aria-pressed="!filterScan.applied.value.mids.length"
              :disabled="isBatchOperating" @click="selectStripUploader()"
            >
              <span class="favorite-uploader-strip__avatar favorite-uploader-strip__avatar--all" aria-hidden="true"><i i-tabler:users /></span>
              <span class="favorite-uploader-strip__name">{{ t('library_tools.all_uploaders') }}</span>
            </button>
            <button
              v-for="uploader in filterUploaders" :key="uploader.mid" type="button" class="favorite-uploader-strip__item"
              :aria-pressed="isStripUploader(uploader.mid)" :title="uploader.name" :disabled="isBatchOperating" @click="selectStripUploader(uploader.mid)"
            >
              <span class="favorite-uploader-strip__avatar" aria-hidden="true">
                <img v-if="uploader.face" :src="removeHttpFromUrl(`${uploader.face}@160w_160h_1c.webp`)" alt="" loading="lazy" decoding="async">
              </span>
              <span class="favorite-uploader-strip__name">{{ uploader.name }}</span>
            </button>
          </LibraryBleedStrip>
        </Transition>
      </section>
      <LibraryHeroCarousel
        :items="heroItems" :current="heroKey" :label="selectedContentTitle" :disabled="heroSwitchDisabled" :scope="`${accountId}:${favoriteView}`"
        class="favorites-hero"
        :style="showUploaderStrip || uploaderStripPending ? { '--library-hero-pin': 'calc(var(--bew-library-uploader-tile-size) + var(--bew-space-2) + var(--bew-line-height-control) + var(--bew-space-6))' } : undefined"
        @select="selectHeroItem"
      >
        <!-- One card per slide, kept across a switch: only its actions change. -->
        <template #default="{ item, current }">
          <LibraryHero v-bind="getHeroCard(item.key, current)">
            <template v-if="current && isInitialSidebarLoading" #title>
              <SkeletonBlock width="12em" height="1lh" />
            </template>
            <template v-if="current && currentFolderId" #actions>
              <FavoriteFolderSocial
                :info="folderInfo" :own="ownFolder" :pending="isSidebarOperating" :loading="folderInfoLoading"
                :failed="folderInfoFailed"
                @like="folders.interact('like')" @subscribe="folders.interact('subscribe')" @share="shareFolder" @retry="folders.refreshInfo"
              />
            </template>
          </LibraryHero>
        </template>
      </LibraryHeroCarousel>

      <Empty
        v-if="bootstrapFailed" text-only fill :description="t('common.load_failed')" :action-label="t('common.operation.refresh')"
        @action="retryFavoritesBootstrap"
      />

      <template v-else-if="favoriteView === 'article'">
        <div v-if="otherCards.length > 0" class="article-favorites-content">
          <div class="article-favorites-grid">
            <ArticleCard
              v-for="item in otherCards"
              :key="`${otherFavoriteType}:${item.id}`"
              v-bind="item"
            />
          </div>
          <div v-if="isLoading" class="article-favorites-grid" aria-hidden="true">
            <ArticleCardSkeleton v-for="index in 2" :key="`favorite-article-more-${index}`" />
          </div>
        </div>
        <div v-else-if="isLoading || isFullPageLoading" class="article-favorites-grid" aria-hidden="true">
          <ArticleCardSkeleton v-for="index in 6" :key="`favorite-article-initial-${index}`" />
        </div>
        <Empty v-else-if="failedContentPage === null && stalledContentPage === null" text-only fill role="status" :description="t(keyword.trim() ? 'library_tools.no_matches' : otherFavoriteType === 'course' ? 'favorites.course_empty' : 'common.no_data')" />
        <Empty
          v-if="(failedContentPage !== null || stalledContentPage !== null) && !isLoading" text-only :fill="!otherCards.length" :description="t('common.load_failed')" role="alert"
          :action-label="t('common.operation.refresh')" @action="retryFavoriteContent"
        />
      </template>

      <template v-else>
        <Empty
          v-if="!filterActive && favoriteView === 'video' && searchScope === 'all' && !keyword.trim() && favoriteResources.length === 0 && !isLoading"
          text-only fill
          :description="t('favorites.global_search_hint')"
        />

        <!-- A new folder's grid fades in once the old one has faded out. -->
        <Transition name="page-fade" mode="out-in" v-bind="retiringTransition">
          <Empty
            v-if="!filterActive && favoriteView === 'season' && keyword.trim() && !visibleResources.length && noMoreContent && !isLoading && failedContentPage === null && stalledContentPage === null" text-only fill :description="t('library_tools.no_matches')" role="status"
          />
          <VideoCardGrid
            v-else
            :key="favoriteGridStateKey"
            text-only-states
            :state-key="favoriteGridStateKey"
            :items="removals.displayItems.value"
            :transform-item="transformFavoriteItem"
            :get-item-key="filterActive ? filterScan.getItemKey : getFavoriteResourceKey"
            grid-layout="adaptive"
            layout-motion
            :initial-skeleton-count="favoriteView === 'season' && selectedSeason?.type === 21 ? FAVORITE_SEASON_PAGE_SIZE : FAVORITE_FOLDER_PAGE_SIZE"
            disable-content-visibility
            :indeterminate="filterActive"
            :loading="filterActive ? filterStatus === 'scanning' : isLoading || isFullPageLoading"
            :no-more-content="filterActive ? filterStatus === 'complete' : noMoreContent"
            :request-failed="filterActive ? filterStatus === 'failed' || filterStatus === 'stalled' : failedContentPage !== null || stalledContentPage !== null"
            :empty-description="$t(keyword.trim() || filterActive ? 'library_tools.no_matches' : 'common.no_data')"
            :context-menu="favoriteView === 'video' && (searchScope === 'current' || filterActive) && !isBatchManaging"
            :get-menu-extra-groups="getFavoriteMenuGroups"
            :get-removal="removals.get"
            :hide-author="favoriteView === 'season' && selectedSeason?.type === 21"
            :card-click-handler="isBatchManaging ? handleFavoriteCardClick : undefined"
            :cover-top-left-always-visible="isBatchManaging"
            enable-row-padding
            @refresh="handleFavoriteGridRefresh"
            @load-more="handleFavoriteGridLoadMore"
          >
            <template v-if="favoriteView === 'video' && isBatchManaging" #coverTopLeft="{ item }">
              <button
                class="favorite-card-action"
                :class="{ selected: isSelectedFavoriteResource(item) }"
                :aria-label="t('favorites.batch_select_item')"
                :aria-pressed="isSelectedFavoriteResource(item)"
                @click.prevent.stop="toggleFavoriteResourceSelection(item)"
              >
                <Tooltip :content="$t('favorites.batch_select_item')" placement="bottom-left" type="dark">
                  <div :class="isSelectedFavoriteResource(item) ? 'i-tabler:checkbox' : 'i-tabler:square'" />
                </Tooltip>
              </button>
            </template>
          </VideoCardGrid>
        </Transition>
      </template>

      <FavoriteFolderEditor
        v-if="folderEditor.visible" :value="folderForm" :creating="!folderEditor.id" :loading="folderEditor.loading" :failed="folderEditor.failed"
        :pending="isSidebarOperating" :closing="folderEditor.closing"
        @close="folders.closeEditor" @retry="folders.openEditor(folderEditor.id)" @save="folders.save"
      />

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
      <ContextMenu
        v-if="folderMenu" :options="folderMenu.actions" :anchor="folderMenu.anchor" :trigger="folderMenu.trigger"
        @select="runFolderMenu" @close="folderMenu = undefined"
      />
    </main>

    <template #sidebar="{ contentId }">
      <div class="favorites-sidebar-content library-rail-content">
        <LibrarySidebarHeading
          hide-title
          :title="t('topbar.favorites')" :model-value="favoriteView" :options="favoriteViewOptions" :content-id="contentId"
          @update:model-value="selectRailFavoriteView"
        />
        <div class="library-rail-tools library-rail-tools--ruled favorite-rail-tools">
          <LibrarySearchField
            v-model="keyword" :filter-active="railFilterActive" :label="favoriteView === 'video' ? (searchScope === 'all' ? t('favorites.global_search_placeholder') : t('favorites.search_placeholder')) : t(`favorites.search_${favoriteView}`)" :submit-disabled="favoriteView === 'video' && searchScope === 'all' && !keyword.trim()" :aria-busy="isLoading"
            @submit="handleSearch"
            @clear="handleSearch"
          >
            <template #filter>
              <LibraryFilterMenu
                :label="t('library_tools.filters')" :groups="filterGroups" :disabled="isBatchOperating || isInitialSidebarLoading"
                @open="requestPartitions" @select="selectRailFilter"
              />
            </template>
          </LibrarySearchField>
          <div v-if="favoriteView === 'video'" class="favorite-rail-toolbar">
            <!-- Same sliding control as the History / Watch Later layout switchers. -->
            <SettingsSegmentedControl
              :model-value="videoOrder" class="library-rail-segments bew-segment-control--secondary favorite-video-order"
              :options="videoOrderOptions" :label="t('favorites.video_order')" @change="handleVideoOrderChange"
            />
            <Tooltip :content="t(isManagingFolder ? 'favorites.sidebar_manage_exit' : 'favorites.manage_folders')" placement="top">
              <IconButton
                class="favorite-folder-manager" :label="t(isManagingFolder ? 'favorites.sidebar_manage_exit' : 'favorites.manage_folders')"
                :aria-pressed="isManagingFolder" :disabled="isInitialSidebarLoading || isSidebarOperating" @click="toggleSidebarManage('folder')"
              >
                <span :class="isManagingFolder ? 'i-tabler:x' : 'i-tabler:adjustments-horizontal'" />
              </IconButton>
            </Tooltip>
          </div>
          <div v-if="isManagingFolder" class="sidebar-manage-bar">
            <button class="sidebar-manage-select" :aria-pressed="isAllFoldersSelected" :disabled="isSidebarOperating" @click="toggleSelectAllFolders">
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
        </div>
        <nav class="favorites-old-nav" :aria-label="selectedContentTitle">
          <FavoriteSidebarSkeleton v-if="isInitialSidebarLoading" />
          <ul v-else-if="favoriteView === 'video' && categoryState.loaded" class="category-list">
            <FavoriteSidebarItem
              v-for="item in favoriteCategories" :key="`video:${item.id}`"
              :title="item.title" :count="item.media_count" :cover="folderCovers[item.id]"
              :expanded="!isManagingFolder && selectedCategory?.id === item.id"
              :selected="isManagingFolder && selectedFolderIds.includes(item.id)" :managing="isManagingFolder"
              :disabled="isSidebarOperating" :locked="isManagingFolder && item.id === defaultFolderId"
              :icon="isManagingFolder ? (item.id === defaultFolderId ? 'i-tabler:lock' : selectedFolderIds.includes(item.id) ? 'i-tabler:checkbox' : 'i-tabler:square') : isFavoriteFolderPrivate(item) ? 'i-tabler:lock' : 'i-tabler:world'"
              :icon-label="t(isFavoriteFolderPrivate(item) ? 'favorites.folder_private' : 'favorites.folder_public')"
              @select="handleCategoryItemClick(item)" @visible="loadFolderCover(item.id)"
            >
              <button v-if="!isManagingFolder && !isBatchManaging" type="button" class="favorite-folder-action" :disabled="isSidebarOperating || searchScope === 'all'" @click="handlePlayAll">
                <span i-tabler:player-play-filled />{{ t('common.play_all') }}
              </button>
              <FavoriteResourceActions
                v-if="!isManagingFolder && canBatchManage"
                :managing="isBatchManaging" :pending="isBatchOperating" :total="managedResources.length"
                :selected-count="selectedCount" :all-selected="isAllCurrentPageSelected" :can-transfer="targetCategoryOptions.length > 0"
                @toggle="toggleBatchManage" @select-all="toggleSelectAllCurrentPage"
                @copy="openBatchTransferDialog('copy')" @move="openBatchTransferDialog('move')" @remove="handleBatchDelete"
              />
              <Tooltip v-if="!isManagingFolder && !isBatchManaging" :content="t('favorites.folder_more')" placement="top">
                <IconButton
                  class="bew-icon-button--control favorite-folder-icon-action" shape="smooth-rect" :label="t('favorites.folder_more')" aria-haspopup="menu"
                  :disabled="isSidebarOperating" @click="openFolderMenu($event, getFolderMenuActions(item))"
                >
                  <i i-tabler:dots />
                </IconButton>
              </Tooltip>
            </FavoriteSidebarItem>
            <li v-if="!isManagingFolder" class="favorite-create-item">
              <button type="button" class="favorite-create-button" :disabled="isSidebarOperating" :aria-label="t('favorites.create_folder')" @click="folders.openEditor()">
                <span i-tabler:plus aria-hidden="true" />
              </button>
            </li>
          </ul>

          <ul v-else-if="favoriteView === 'season' && visibleSubscriptions.length" class="category-list" @scroll.passive="handleSubscriptionDirectoryScroll">
            <FavoriteSidebarItem
              v-for="item in visibleSubscriptions" :key="getFavoriteSourceKey(item)"
              :title="item.title" :count="item.media_count" :cover="item.cover"
              :expanded="Boolean(selectedSeason && getFavoriteSourceKey(selectedSeason) === getFavoriteSourceKey(item))"
              :selected="isManagingSeason && selectedSeasonKeys.includes(getFavoriteSourceKey(item))" :managing="isManagingSeason"
              :disabled="isSidebarOperating"
              :icon="isManagingSeason ? (selectedSeasonKeys.includes(getFavoriteSourceKey(item)) ? 'i-tabler:checkbox' : 'i-tabler:square') : 'i-tabler:stack-2'"
              @select="handleSeasonItemClick(item)"
            >
              <button v-if="!isManagingSeason" type="button" class="favorite-folder-action" :disabled="isSidebarOperating || isResolvingSeasonPlayAll" @click="handlePlayAll">
                <LoadingRing :loading="isResolvingSeasonPlayAll">
                  <span i-tabler:player-play-filled />
                </LoadingRing>{{ t('common.play_all') }}
              </button>
              <Tooltip :content="t(isManagingSeason ? 'favorites.sidebar_manage_exit' : 'favorites.sidebar_manage')" placement="top">
                <IconButton
                  class="bew-icon-button--control favorite-folder-icon-action" shape="smooth-rect" :label="t(isManagingSeason ? 'favorites.sidebar_manage_exit' : 'favorites.sidebar_manage')"
                  :aria-pressed="isManagingSeason" :disabled="isSidebarOperating" @click="toggleCurrentSidebarManage"
                >
                  <i :class="isManagingSeason ? 'i-tabler:x' : 'i-tabler:list-check'" />
                </IconButton>
              </Tooltip>
              <Tooltip v-if="!isManagingSeason" :content="t('favorites.folder_more')" placement="top">
                <IconButton
                  class="bew-icon-button--control favorite-folder-icon-action" shape="smooth-rect" :label="t('favorites.folder_more')" aria-haspopup="menu"
                  @click="openFolderMenu($event, getSeasonMenuActions(item))"
                >
                  <i i-tabler:dots />
                </IconButton>
              </Tooltip>
              <div v-if="isManagingSeason" class="sidebar-manage-bar">
                <button class="sidebar-manage-select" :aria-pressed="isAllSeasonsSelected" :disabled="isSidebarOperating" @click="toggleSelectAllSeasons">
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
            </FavoriteSidebarItem>
          </ul>

          <div v-else-if="favoriteView === 'article'" class="other-favorite-folders">
            <button
              v-for="option in otherFavoriteOptions" :key="option.value" type="button" class="article-nav-item"
              :class="{ active: otherFavoriteType === option.value }" :aria-current="otherFavoriteType === option.value ? 'true' : undefined"
              @click="selectOtherFavorite(option.value)"
            >
              <span class="category-icon" :class="option.icon" />
              <span class="category-title">{{ option.label }}</span>
              <span class="category-count">{{ otherFavoriteCounts[option.value] ?? '—' }}</span>
            </button>
          </div>
          <Empty v-if="favoriteView === 'season' && !visibleSubscriptions.length && !subscriptionState.loading && !subscriptionState.hasMore && !subscriptionState.failed" text-only fill :description="t('library_tools.no_matches')" role="status" />
          <Empty
            v-if="favoriteView === 'season' && !visibleSubscriptions.length && subscriptionState.failed" text-only fill :description="t('common.load_failed')" :action-label="t('common.operation.refresh')"
            @action="loadMoreSubscriptions(true)"
          />
          <div v-if="favoriteView === 'season' && (subscriptionState.hasMore || subscriptionState.failed) && (visibleSubscriptions.length || !subscriptionState.failed)" class="favorites-directory-more">
            <span v-if="subscriptionState.failed" role="status">{{ t('common.load_failed') }}</span>
            <Button type="tertiary" class="bew-cover-sidebar__action" :disabled="subscriptionState.loading" @click="loadMoreSubscriptions(subscriptionState.failed)">
              <template #left>
                <LoadingRing :loading="subscriptionState.loading" />
              </template>
              {{ t(subscriptionState.failed ? 'common.operation.refresh' : 'common.load_more') }}
            </Button>
          </div>
        </nav>
      </div>
    </template>
  </LibraryWorkspace>
  <Empty
    v-else text-only class="library-workspace-login" :description="t('common.please_log_in_first')" :action-label="t('common.login')"
    @action="jumpToLoginPage"
  />
</template>

<style lang="scss" scoped>
@use "../../../styles/truncateFade";
@use "../../../styles/breakpoints";
@use "../../../styles/sidebarSurface";
@use "./favoritesLayout";

.favorites-sidebar-content {
  height: 100%;
  min-height: 0;
}

.favorite-rail-tools {
  grid-template-columns: minmax(0, 1fr);
}
.favorite-create-item {
  flex: none;
  list-style: none;
}
.favorite-create-button {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: calc(var(--bew-space-12) + var(--bew-space-4));
  border: 0;
  border-radius: var(--bew-surface-radius);
  color: var(--bew-sidebar-text);
  background: var(--bew-sidebar-control);
  cursor: pointer;
  transition:
    background-color var(--bew-duration-normal),
    color var(--bew-duration-normal);
  span {
    font-size: var(--bew-icon-size-xl);
  }
  &:hover {
    background: var(--bew-sidebar-control-hover);
    color: var(--bew-text-1);
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
@media (prefers-reduced-motion: reduce) {
  .favorite-create-button {
    transition: none;
  }
}
.favorite-rail-toolbar {
  display: flex;
  align-items: center;
  gap: var(--bew-control-gap);
  min-width: 0;
}
.favorite-video-order {
  --bew-control-item-padding-x: var(--bew-space-1);
  flex: 1;
  min-width: 0;
}
// Matches the History sort button beside its layout switcher.
.favorite-folder-manager {
  flex: none;
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  color: var(--bew-sidebar-secondary);
  span {
    width: var(--bew-control-icon-size);
    height: var(--bew-control-icon-size);
  }
  &:is(:hover, :focus-visible):not(:disabled),
  &[aria-pressed="true"] {
    color: var(--bew-sidebar-text);
    background: var(--bew-sidebar-selected-bg);
  }
}

.other-favorite-folders {
  display: grid;
  gap: var(--bew-space-1);
}

.sidebar-manage-action {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  padding: 0;
  color: var(--bew-sidebar-text);
  border: 0;
  border-radius: var(--bew-surface-radius);
  background: var(--bew-sidebar-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.sidebar-manage-action:hover:not(:disabled) {
  color: var(--bew-sidebar-text);
  background: var(--bew-sidebar-control-hover);
}

.sidebar-manage-action.danger:hover:not(:disabled) {
  color: var(--bew-error-color);
  background: var(--bew-sidebar-control-hover);
}

.sidebar-manage-action span,
.sidebar-manage-select span {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}

.sidebar-manage-action:disabled,
.sidebar-manage-select:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.sidebar-manage-bar {
  padding: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-content-alt-solid);
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
  min-height: var(--bew-control-item-height);
  padding: 0;
  overflow: hidden;
  color: var(--bew-sidebar-secondary);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.sidebar-manage-select:hover:not(:disabled) {
  color: var(--bew-sidebar-text);
}

.sidebar-selected-count {
  color: var(--bew-sidebar-muted);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.favorites-sidebar-content .favorites-old-nav {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  // The rail's section gap moves inside the nav, so a list can take it into
  // its scroll (below) and rows scroll right up to the tools' hairline.
  margin-top: calc(-1 * var(--bew-sidebar-section-gap));
  padding-top: var(--bew-sidebar-section-gap);
  // Clips only vertically, so the folder list can reach the rail edges.
  overflow: visible clip;
}

.category-list {
  @include sidebarSurface.vertical-scroll;
  // A rail never fades, and it draws no edge lines: the tools' hairline above
  // closes its top (one line, user-specified) and its bottom is the screen
  // edge. Edge to edge like the rail's separators, its rows padded back in.
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-1);
  min-height: 0;
  // Starts at the hairline; the gap above the first row scrolls with it.
  margin: calc(-1 * var(--bew-sidebar-section-gap)) calc(-1 * var(--bew-sidebar-inline-padding)) 0;
  padding: var(--bew-sidebar-section-gap) var(--bew-sidebar-inline-padding) 0;
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

.article-nav-item {
  display: grid;
  grid-template-columns: var(--bew-icon-size-lg) minmax(0, 1fr) auto;
  gap: var(--bew-space-2);
  align-items: center;
  width: 100%;
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2);
  color: var(--bew-sidebar-secondary);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  text-align: left;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
}

.article-nav-item {
  color: var(--bew-sidebar-text);
  background: transparent;
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
  &:hover {
    background: var(--bew-sidebar-control);
  }
  &.active {
    color: var(--bew-text-1);
    background: var(--bew-selected-bg);
    .category-count {
      color: inherit;
    }
  }
}

.category-icon {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}

.category-title {
  @include truncateFade.line;
}

.category-count {
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  color: var(--bew-sidebar-muted);
}

.article-favorites-content,
.article-favorites-grid {
  width: 100%;
}

.article-favorites-content,
.favorites-old-main > :deep(.video-card-grid-root) {
  // Positioned and later: it slides up over the pinned hero.
  position: relative;
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
  color: var(--bew-text-1);
  background: var(--bew-selected-bg);
}

.favorite-card-action.selected {
  color: var(--bew-text-1);
  background: var(--bew-selected-bg);
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
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  text-align: left;
  border: var(--bew-hairline) solid transparent;
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
  border-color: var(--bew-selected-bg);
  background: var(--bew-theme-surface);
}

.batch-target-folder-icon,
.batch-target-folder-check {
  width: 18px;
  height: 18px;
}

.batch-target-folder-title {
  @include truncateFade.line;
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
    border-radius: var(--bew-pill-radius);
    corner-shape: var(--bew-corner-shape-capsule);
  }

  &::-webkit-scrollbar-corner {
    background: transparent;
  }
}

@media (max-width: breakpoints.$grid-sm) {
  .article-favorites-grid {
    grid-template-columns: 1fr;
  }
}
</style>
