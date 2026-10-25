import { watch } from 'vue'
import browser from 'webextension-polyfill'

import { useSettingsStorage } from '~/composables/useSettingsStorage'
import { useStorageLocal } from '~/composables/useStorageLocal'
import { COMMENT_REPLY_BATCH_DEFAULT, COMMENT_REPLY_CONTAINER_HEIGHT, normalizeCommentReplyBatch, normalizeCommentReplyContainerHeight } from '~/constants/commentReading'
import type { DockCollapseMode, DockPosition } from '~/constants/dock'
import { normalizeDockPosition } from '~/constants/dock'
import { DEFAULT_SEARCH_BAR_CHARACTER } from '~/constants/imgs'
import { removeRetiredSettings, RETIRED_LOCAL_STORAGE_KEYS } from '~/constants/retiredSettings'
import type { HomeSubPage } from '~/contentScripts/views/Home/types'
import type { AppPage } from '~/enums/appEnums'
import {
  MOBILE_LIST_LAYOUT_BREAKPOINT,
  normalizeListLayoutBreakpoint,
} from '~/utils/gridLayout'
import { LOCAL_LOUDNESS_DEFAULTS, normalizeLocalLoudnessValue } from '~/utils/localLoudnessProtocol'
import type { PageMode } from '~/utils/pageMode'
import { DEFAULT_THEME_COLOR, normalizeThemeColor } from '~/utils/themeColor'
import { normalizeVideoCardCoverRatio } from '~/utils/videoCardLayout'
import { DEFAULT_SCREENSHOT_SHORTCUT, isValidScreenshotShortcut } from '~/utils/videoScreenshotShortcut'

export { appAuthTokens } from './appAuthStorage'

export interface NoCookieForYouRecommendationState {
  showlistGroups: string[]
  nextFreshIdx: number
}

export const noCookieForYouRecommendationState = useStorageLocal<NoCookieForYouRecommendationState>(
  'noCookieForYouRecommendationState',
  { showlistGroups: [], nextFreshIdx: 1 },
  { mergeDefaults: true, writeDefaults: false },
)

export const FROSTED_GLASS_BLUR_MIN_PX = 1
export const FROSTED_GLASS_BLUR_MAX_PX = 20

export type DrawerEscapeBehavior = 'immediate' | 'secondPress'

export type VideoCardFontSizeSetting = 'xs' | 'sm' | 'base' | 'lg'
export type WatchLaterLayoutMode = 'list' | 'grid'
export type TopBarLogoStyle = 'icon' | 'brand'
export type AutoPlayMode = 'default' | 'autoPlay' | 'autoPlayWithRecommend' | 'pauseAtEnd' | 'loop'
export type RandomPlayOrder = 'sequential' | 'reverse' | 'random'
export type DefaultCustomPlayOrder = RandomPlayOrder
export type CustomPlayOrderContext = 'multipart' | 'collection' | 'watchLater' | 'playlist'
export type CustomPlayOrderOverride = DefaultCustomPlayOrder | 'inherit'
export type CustomPlayOrderOverrides = Record<CustomPlayOrderContext, CustomPlayOrderOverride>
/** 订阅合集「播放全部」起播策略 */
export type CollectedSeasonPlayAllMode = 'beginning' | 'latest' | 'lastWatched'
export type DefaultVideoPlayerMode = 'default' | 'webFullscreen' | 'widescreen' | 'bewlyWidescreen'
export type BewlyWidescreenSidebarPosition = 'left' | 'right'
export type PlayerDefaultState = 'system' | 'remember' | 'on' | 'off'
export type VideoPlayerScrollMode = 'sendingBar' | 'playerCenter'
export type VideoAspectRatio = '0:0' | '4:3' | '16:9'
export type VideoPlayerModeOverride = DefaultVideoPlayerMode | 'inherit'
export type VideoPlayerModeContext = 'multipart' | 'collection' | 'bangumi' | 'watchLater' | 'playlist' | 'momentsDialog'
export type VideoPlayerModeOverrides = Record<VideoPlayerModeContext, VideoPlayerModeOverride>
export type RecommendationMode = 'web' | 'app' | 'webNoCookie'
export type RecommendationModeOption = 'web' | 'webNoCookie' | 'appSingle' | 'appDouble'
export interface RecommendationModeSwitcherOption { mode: RecommendationModeOption, visible: boolean }
const RECOMMENDATION_MODES: RecommendationModeOption[] = ['web', 'webNoCookie', 'appSingle', 'appDouble']

function normalizeRecommendationSwitcherOptions(value: unknown): RecommendationModeSwitcherOption[] {
  if (!Array.isArray(value))
    return RECOMMENDATION_MODES.map(mode => ({ mode, visible: true }))
  const result: RecommendationModeSwitcherOption[] = []
  const seen = new Set<RecommendationModeOption>()
  for (const entry of value) {
    const mode = typeof entry === 'string' ? entry : entry?.mode
    if (!RECOMMENDATION_MODES.includes(mode) || seen.has(mode))
      continue
    seen.add(mode)
    result.push({ mode, visible: typeof entry === 'string' || entry.visible === true })
  }
  for (const mode of RECOMMENDATION_MODES) {
    if (!seen.has(mode))
      result.push({ mode, visible: false })
  }
  return result
}
export type AppRecommendationColumn = 1 | 2
/**
 * 评论回复树展示模式：
 * - lineCollapseMain：线条，收起时折叠父节点本体
 * - lineKeepMain：线条，收起时保留父节点正文，仅隐藏子回复
 * - indentOnly：仅缩进，无收起
 */
export type CommentReplyTreeMode = 'lineCollapseMain' | 'lineKeepMain' | 'indentOnly'
export type CommentReplyPaginationMode = 'loadMore' | 'pagination'
export type PrivateMessageDensity = 'comfortable' | 'compact'
export type PrivateMessageMobileOpenMode = 'list' | 'last-conversation'

export interface LastPrivateConversationRoute {
  mid: string
  talkerId: string
  sessionType: number
}

// 本地存储配置接口（不同步到云端的配置）
export interface LocalSettings {
  lastPrivateConversationRoute: LastPrivateConversationRoute | null
}

/**
 * 网格列数配置
 * 固定的媒体断点，只允许配置每个断点的列数
 */
export const videoCardContextMenuKeys = [
  'watchLater',
  'favorite',
  'notInterested',
  'notInterestedUploader',
  'openInNewTab',
  'openInBackground',
  'openInNewWindow',
  'openInCurrentTab',
  'copyVideoLink',
  'copyOriginalLink',
  'copyBVNumber',
  'copyAVNumber',
  'viewOriginalCover',
  'followUser',
  'blockUser',
] as const

export type VideoCardContextMenuKey = typeof videoCardContextMenuKeys[number]

export interface Settings {
  touchScreenOptimization: boolean
  openTopBarItemsInBewly: boolean
  enableGridLayoutSwitcher: boolean
  enableHorizontalScrolling: boolean
  showIPLocation: boolean // 添加显示IP归属地设置项
  showSex: boolean // 添加显示性别设置项
  showCommentHostTag: boolean // 显示评论回复详情页楼主标识
  enableCommentReplyTreeDisplay: boolean // 启用评论回复树展示
  commentReplyTreeMode: CommentReplyTreeMode // 评论回复树展示模式
  commentReplyPaginationMode: CommentReplyPaginationMode // 评论回复分页模式
  commentReplyBatchPages: number
  enableCommentReplyTreeContainer: boolean
  commentReplyTreeContainerHeight: number
  adjustCommentImageHeight: boolean // 调整评论区图片高度以匹配实际比例
  hideCommentImageScrollbar: boolean // 评论区图片预览时隐藏页面滚动条
  enlargeFavoriteDialog: boolean // 视频页收藏夹放大样式增强
  externalWatchLaterButton: boolean // 稍后再看按钮外置

  // Grid 相关设置
  autoSwitchListLayout: boolean
  /** Automatic two-column -> one-column switch threshold in CSS pixels. */
  autoSwitchListLayoutBreakpoint: number
  videoCardCoverRatioOneColumn: number
  videoCardCoverRatioTwoColumns: number
  watchLaterLayoutMode: WatchLaterLayoutMode

  language: string
  customizeFont: 'default' | 'recommend' | 'custom'
  fontFamily: string
  textAutospaceMode: 'default' | 'on' | 'off'
  overrideDanmakuFont: boolean
  removeTheIndentFromChinesePunctuation: boolean

  disableFrostedGlass: boolean
  frostedGlassBlurIntensity: number
  disableShadow: boolean

  enableVideoPreview: boolean
  resumeFromPreviewPosition: boolean

  // Link Opening Behavior
  videoCardLinkOpenMode: 'drawer' | 'newTab' | 'currentTab' | 'background'
  topBarLinkOpenMode: 'currentTab' | 'currentTabIfNotHomepage' | 'currentTabIfHomepage' | 'newTab' | 'background'
  searchBarLinkOpenMode: 'currentTab' | 'currentTabIfNotHomepage' | 'currentTabIfHomepage' | 'newTab' | 'background'
  drawerEscapeBehavior: DrawerEscapeBehavior

  blockAds: boolean
  blockTopSearchPageAds: boolean
  cleanUrlArgument: boolean // 清理URL追踪参数

  // Clean Share Link
  enableCleanShareLink: boolean
  cleanShareLinkIncludeTitle: boolean
  cleanShareLinkRemoveTrackingParams: boolean

  enableVideoCtrlBarOnVideoCard: boolean
  enableVideoPreviewSwipeSeek: boolean
  hoverVideoCardDelayed: boolean
  onlyCoverVideoPreview: boolean
  showVideoCardAuthorName: boolean
  showVideoCardPublishTime: boolean
  showVideoWatchedBadge: boolean
  /** Card menu items folded under “高级选项” at the bottom; every other item shows directly. */
  videoCardContextMenuAdvanced: VideoCardContextMenuKey[]

  // Desktop & Dock
  showBewlyOrBiliPageSwitcher: boolean
  topBarLogoStyle: TopBarLogoStyle
  topBarComponentsConfig: { key: string, visible: boolean, badgeType: 'number' | 'dot' | 'none' }[]
  topBarPinnedChannels: string[]
  showLikeNotificationReminder: boolean
  showReplyNotificationReminder: boolean
  showAtNotificationReminder: boolean
  showSystemNotificationReminder: boolean
  showFollowedPrivateMessageUnreadCount: boolean
  showUnfollowedPrivateMessageUnreadCount: boolean
  autoMarkPrivateMessagesRead: boolean
  followNewPrivateMessages: boolean
  autoLoadPrivateMessageImages: boolean
  showOfficialPrivateAssistants: boolean
  privateMessageDensity: PrivateMessageDensity
  maxPrivateMessagesPerConversation: 100 | 200 | 500
  maxCachedPrivateConversations: 5 | 10 | 20
  privateMessageMobileOpenMode: PrivateMessageMobileOpenMode
  hideTopBarUserPanelLv6LastLoginLocation: boolean
  showBCoinReceiveReminder: boolean
  autoReceiveBCoinCoupon: boolean
  autoReceiveVipExp: boolean
  filterArticlesInMoments: boolean
  originalMomentsShowUserCard: boolean
  originalMomentsUseBewlyFilters: boolean
  historyLayout: 'list' | 'grid'
  originalMomentsShowLiveList: boolean
  originalMomentsShowCommunityCenter: boolean
  originalMomentsShowHotSearch: boolean
  originalMomentsShowUpList: boolean
  momentsSidebarShowUserCard: boolean
  momentsSidebarShowPublish: boolean
  momentsSidebarShowLive: boolean
  momentsShowUpList: boolean
  momentsEnableLivePreview: boolean
  momentsEnableVideoPreview: boolean
  momentsEnableVideoControls: boolean
  momentsEnableVideoPreviewSwipeSeek: boolean
  momentsVideoPreviewDelayed: boolean
  momentsOnlyCoverVideoPreview: boolean
  /** Bewly 动态页期望列数；窄屏会自动降列 */
  momentsGridColumns: '1' | '2' | '3'
  momentsStartFromLastSeen: boolean
  momentsEnableKeywordFilter: boolean
  momentsBlockedKeywords: string
  momentsFilterUpRecommendation: boolean
  momentsHideChargeExclusive: boolean
  momentsHideVideoReservation: boolean
  momentsHideLiveReservation: boolean
  momentsHideLiveDynamics: boolean
  /** 过滤普通视频动态（不含合集视频、番剧） */
  momentsHideVideoDynamics: boolean
  /** 过滤图文动态 */
  momentsHideDrawDynamics: boolean
  /** 过滤合集视频动态 */
  momentsHideUgcSeasonDynamics: boolean
  /** 过滤转发动态 */
  momentsHideForwardDynamics: boolean
  /** 过滤番剧/追番追剧动态 */
  momentsHidePgcDynamics: boolean
  /** 过滤专栏动态 */
  momentsHideArticleDynamics: boolean
  momentsCardOpenMode: 'dialog' | 'newTab' | 'background'

  alwaysUseDock: boolean
  dockCollapseMode: DockCollapseMode
  dockPosition: DockPosition
  dockItemsConfig: { page: AppPage, visible: boolean, openInNewTab: boolean, useOriginalBiliPage: boolean }[]
  pageMode: PageMode
  disableLightDarkModeSwitcherOnDock: boolean
  backToTopAndRefreshButtonsAreSeparated: boolean
  showDockBackToTop: boolean
  enableUndoRefreshButton: boolean // 添加撤销刷新按钮配置项

  sidebarPosition: 'left' | 'right'
  autoHideSidebar: boolean

  theme: 'light' | 'dark' | 'auto' | 'scheduled'
  themeScheduleStart: string
  themeScheduleEnd: string
  videoPageDarkMode: boolean
  /** Hex accent, or `NEUTRAL_THEME_COLOR` for black (light) / white (dark). */
  themeColor: string
  darkModeBaseColor: string // 深色模式基准颜色
  enableDarkModeTint: boolean
  enableOledDarkMode: boolean
  useLinearGradientThemeColorBackground: boolean

  searchPageLogoColor: 'white' | 'themeColor'
  searchPageShowLogo: boolean
  searchPageSearchBarFocusCharacter: string

  // 热搜功能设置（统一在搜索框聚焦时显示）
  showHotSearchInTopBar: boolean

  // 搜索推荐功能设置
  showSearchRecommendation: boolean

  // 搜索历史功能设置
  enableSearchHistory: boolean

  // 搜索结果页设置
  usePluginSearchResultsPage: boolean
  depersonalizeSearchResults: boolean
  showSearchIdentitySwitcher: boolean
  searchResultsPaginationMode: 'scroll' | 'pagination' // 搜索结果分页模式：滚动加载或翻页

  recommendationMode: RecommendationMode
  appRecommendationColumn: AppRecommendationColumn
  recommendationModeSwitcherOptions: RecommendationModeSwitcherOption[]
  showRecommendationModeSwitcher: boolean
  showImmersiveModeEntry: boolean
  immersiveWheelSwitch: boolean
  immersiveKeyboardSwitch: boolean
  immersiveAutoPlay: boolean
  immersiveAutoNext: boolean
  immersivePreloadNext: boolean
  autoSwitchRecommendationMode: boolean

  // filter setting
  disableFilterForFollowedUser: boolean
  filterOutVerticalVideos: boolean
  enableFilterByViewCount: boolean
  filterByViewCount: number
  enableFilterByLikeCount: boolean
  filterByLikeCount: number
  enableFilterByDuration: boolean
  filterByDuration: number
  enableFilterByTitle: boolean
  filterByTitle: { keyword: string, remark: string }[]
  enableFilterByUser: boolean
  filterByUser: { keyword: string, remark: string }[]
  enableFilterByPublishTime: boolean
  filterByPublishTime: number // 单位：天

  followingTabShowLivestreamingVideos: boolean
  followingFilterChargingVideos: boolean // 过滤充电专属视频
  followingFilterDynamicVideos: boolean // 过滤动态视频
  followingUploaderSort: 'updated' | 'group'
  collectedSeasonPlayAllMode: CollectedSeasonPlayAllMode // 订阅合集「播放全部」起播：开头 / 最新 / 上次观看
  enableFollowingInactiveBlacklist: boolean // 启用不活跃名单
  followingInactiveDays: number // UP主超过N天未更新则移至不活跃名单

  homePageTabVisibilityList: { page: HomeSubPage, visible: boolean }[]
  fixedHomeTabsOnHomePage: boolean
  enableVersionReminder: boolean
  lastAcknowledgedVersion: string
  // Video card title font size token
  videoCardTitleFontSize: VideoCardFontSizeSetting
  // Video card author (UP) font size token
  videoCardAuthorFontSize: VideoCardFontSizeSetting
  useSearchPageModeOnHomePage: boolean
  preserveForYouState: boolean
  rememberNoCookieRecommendationState: boolean

  adaptToOtherPageStyles: boolean
  useOriginalBilibiliTopBar: boolean
  preventMobileRedirect: boolean

  // Video Player
  defaultVideoPlayerMode: DefaultVideoPlayerMode
  bewlyWidescreenSidebarPosition: BewlyWidescreenSidebarPosition
  showWidescreenIdleProgress: boolean
  defaultDanmakuState: PlayerDefaultState
  defaultCaptionState: PlayerDefaultState
  lastDanmakuState: boolean
  lastCaptionState: boolean
  enableVideoPlayerModeOverrides: boolean // 启用按场景覆盖播放器显示模式
  videoPlayerModeOverrides: VideoPlayerModeOverrides // 不同播放场景的显示模式覆盖
  autoExitFullscreenOnEnd: boolean // 全屏播放完毕后自动退出
  showVerticalVideoZoomButton: boolean // 显示竖屏视频放大按钮
  showVideoScreenshotButton: boolean // 显示播放器截图按钮
  videoScreenshotShortcut: string
  localLoudnessEnabled: boolean
  localLoudnessTarget: number
  localLoudnessStrength: number

  // 自动连播总开关
  useBilibiliDefaultAutoPlay: boolean // 使用B站默认自动播放行为（总开关）
  autoRemoveWatchLaterOnEnd: boolean

  // 分类型自动连播设置
  autoPlayMultipart: AutoPlayMode // 分P视频自动播放模式
  autoPlayCollection: AutoPlayMode // 合集视频自动播放模式
  autoPlayRecommend: AutoPlayMode // 单视频推荐自动播放模式
  autoPlayWatchLater: AutoPlayMode // 稍后再看自动播放模式
  autoPlayPlaylist: AutoPlayMode // 收藏列表自动播放模式

  videoPlayerScroll: boolean // 添加视频播放器滚动设置
  videoPlayerScrollMode: VideoPlayerScrollMode

  // 倍速记忆设置
  rememberPlaybackRate: boolean // 启用倍速记忆功能
  savedPlaybackRate: number // 记住的倍速值 (0.25-5)

  // 视频比例记忆设置
  rememberVideoAspectRatio: boolean // 启用视频比例记忆功能
  savedVideoAspectRatio: VideoAspectRatio | null // 记住的视频比例；首次启用时沿用播放器当前值
  rememberVideoQuality: boolean
  savedVideoQuality: number | null

  // 自定义播放设置
  enableRandomPlay: boolean // 启用视频合集自定义播放功能
  defaultCustomPlayOrder: DefaultCustomPlayOrder // 播放器自定义播放控件的默认选中顺序
  enableCustomPlayOrderOverrides: boolean // 启用按视频类型覆盖自定义播放默认值
  customPlayOrderOverrides: CustomPlayOrderOverrides // 不同视频类型的自定义播放默认值覆盖
  randomPlayMode: 'manual' | 'auto' // 随机播放模式：手动切换或自动启用
  minVideosForRandom: number // 启用随机播放的最小视频数量
}

// 本地存储配置默认值
export const originalLocalSettings: LocalSettings = {
  lastPrivateConversationRoute: null,
}

export const originalSettings: Settings = {
  touchScreenOptimization: false,
  openTopBarItemsInBewly: true,
  enableGridLayoutSwitcher: true,
  enableHorizontalScrolling: false,
  showIPLocation: true, // 默认启用IP归属地显示
  showSex: true, // 默认启用性别显示
  showCommentHostTag: true, // 默认启用楼主标识显示
  enableCommentReplyTreeDisplay: true, // 默认启用评论回复树展示
  commentReplyTreeMode: 'lineKeepMain', // 默认：线条树状，收起时保留父节点正文
  commentReplyPaginationMode: 'loadMore', // 默认：逐页加载并合并回复
  commentReplyBatchPages: COMMENT_REPLY_BATCH_DEFAULT,
  enableCommentReplyTreeContainer: false,
  commentReplyTreeContainerHeight: COMMENT_REPLY_CONTAINER_HEIGHT.default,
  adjustCommentImageHeight: true, // 默认启用评论图片高度调整
  hideCommentImageScrollbar: false, // 默认不隐藏评论图片预览时的页面滚动条
  enlargeFavoriteDialog: false, // 默认关闭收藏夹放大样式
  externalWatchLaterButton: true, // 默认开启稍后再看按钮外置

  // Grid 相关默认设置
  autoSwitchListLayout: true,
  autoSwitchListLayoutBreakpoint: MOBILE_LIST_LAYOUT_BREAKPOINT,
  // Preserve the former equal split and 400px maximum at default values.
  videoCardCoverRatioOneColumn: 50,
  videoCardCoverRatioTwoColumns: 50,
  watchLaterLayoutMode: 'list',

  language: '',
  customizeFont: 'default',
  fontFamily: '',
  textAutospaceMode: 'default',
  overrideDanmakuFont: true,
  removeTheIndentFromChinesePunctuation: false,

  disableFrostedGlass: false,
  frostedGlassBlurIntensity: 20,
  disableShadow: false,

  // Link Opening Behavior
  videoCardLinkOpenMode: 'newTab',
  topBarLinkOpenMode: 'currentTabIfNotHomepage',
  searchBarLinkOpenMode: 'currentTabIfNotHomepage',
  drawerEscapeBehavior: 'secondPress',

  blockAds: false,
  blockTopSearchPageAds: false,
  cleanUrlArgument: true, // 默认开启清理URL追踪参数

  // Clean Share Link
  enableCleanShareLink: false,
  cleanShareLinkIncludeTitle: false,
  cleanShareLinkRemoveTrackingParams: true,

  enableVideoPreview: true,
  resumeFromPreviewPosition: true,
  enableVideoCtrlBarOnVideoCard: false,
  enableVideoPreviewSwipeSeek: false,
  hoverVideoCardDelayed: false,
  onlyCoverVideoPreview: false,
  showVideoCardAuthorName: true,
  showVideoCardPublishTime: true,
  showVideoWatchedBadge: false,
  videoCardContextMenuAdvanced: ['copyOriginalLink', 'copyBVNumber', 'copyAVNumber'],

  // Desktop & Dock
  showBewlyOrBiliPageSwitcher: true,
  topBarLogoStyle: 'icon',
  topBarComponentsConfig: [
    { key: 'moments', visible: true, badgeType: 'number' },
    { key: 'favorites', visible: true, badgeType: 'none' },
    { key: 'history', visible: true, badgeType: 'none' },
    { key: 'watchLater', visible: true, badgeType: 'number' },
    { key: 'creatorCenter', visible: true, badgeType: 'none' },
    { key: 'upload', visible: true, badgeType: 'none' },
  ],
  topBarPinnedChannels: [],
  showLikeNotificationReminder: false,
  showReplyNotificationReminder: true,
  showAtNotificationReminder: true,
  showSystemNotificationReminder: true,
  showFollowedPrivateMessageUnreadCount: true,
  showUnfollowedPrivateMessageUnreadCount: true,
  autoMarkPrivateMessagesRead: true,
  followNewPrivateMessages: true,
  autoLoadPrivateMessageImages: true,
  showOfficialPrivateAssistants: true,
  privateMessageDensity: 'comfortable',
  maxPrivateMessagesPerConversation: 200,
  maxCachedPrivateConversations: 10,
  privateMessageMobileOpenMode: 'list',
  hideTopBarUserPanelLv6LastLoginLocation: false,
  showBCoinReceiveReminder: true,
  autoReceiveBCoinCoupon: false,
  autoReceiveVipExp: false,
  filterArticlesInMoments: true,
  originalMomentsShowUserCard: true,
  originalMomentsUseBewlyFilters: false,
  historyLayout: 'list',
  originalMomentsShowLiveList: true,
  originalMomentsShowCommunityCenter: true,
  originalMomentsShowHotSearch: true,
  originalMomentsShowUpList: true,
  momentsSidebarShowUserCard: true,
  momentsSidebarShowPublish: true,
  momentsSidebarShowLive: true,
  momentsShowUpList: true,
  momentsEnableLivePreview: true,
  momentsEnableVideoPreview: true,
  momentsEnableVideoControls: false,
  momentsEnableVideoPreviewSwipeSeek: false,
  momentsVideoPreviewDelayed: false,
  momentsOnlyCoverVideoPreview: true,
  momentsGridColumns: '3',
  momentsStartFromLastSeen: false,
  momentsEnableKeywordFilter: false,
  momentsBlockedKeywords: '',
  momentsFilterUpRecommendation: false,
  momentsHideChargeExclusive: false,
  momentsHideVideoReservation: false,
  momentsHideLiveReservation: false,
  momentsHideLiveDynamics: false,
  momentsHideVideoDynamics: false,
  momentsHideDrawDynamics: false,
  momentsHideUgcSeasonDynamics: false,
  momentsHideForwardDynamics: false,
  momentsHidePgcDynamics: false,
  momentsHideArticleDynamics: false,
  momentsCardOpenMode: 'dialog',

  alwaysUseDock: false,
  dockCollapseMode: 'button',
  dockPosition: 'bottom',
  dockItemsConfig: [],
  pageMode: 'custom',
  disableLightDarkModeSwitcherOnDock: false,
  backToTopAndRefreshButtonsAreSeparated: true,
  showDockBackToTop: true,
  enableUndoRefreshButton: true, // 默认开启撤销刷新按钮

  sidebarPosition: 'right',
  autoHideSidebar: false,

  theme: 'auto',
  themeScheduleStart: '06:00',
  themeScheduleEnd: '18:00',
  videoPageDarkMode: false,
  themeColor: DEFAULT_THEME_COLOR,
  darkModeBaseColor: '#2a2d32', // 开启可选色调时使用；关闭时保留此值
  enableDarkModeTint: false,
  enableOledDarkMode: false,
  useLinearGradientThemeColorBackground: false,

  searchPageLogoColor: 'themeColor',
  searchPageShowLogo: true,
  searchPageSearchBarFocusCharacter: DEFAULT_SEARCH_BAR_CHARACTER,

  // 热搜功能设置（统一在搜索框聚焦时显示）
  showHotSearchInTopBar: true,

  // 搜索推荐功能设置
  showSearchRecommendation: false,

  // 搜索历史功能设置
  enableSearchHistory: true,

  // 搜索结果页设置
  usePluginSearchResultsPage: true,
  depersonalizeSearchResults: false,
  showSearchIdentitySwitcher: false,
  searchResultsPaginationMode: 'scroll', // 默认使用滚动加载

  recommendationMode: 'web',
  appRecommendationColumn: 2,
  recommendationModeSwitcherOptions: RECOMMENDATION_MODES.map(mode => ({ mode, visible: true })),
  showRecommendationModeSwitcher: false,
  showImmersiveModeEntry: true,
  immersiveWheelSwitch: true,
  immersiveKeyboardSwitch: true,
  immersiveAutoPlay: true,
  immersiveAutoNext: true,
  immersivePreloadNext: false,
  autoSwitchRecommendationMode: true,

  // filter setting
  disableFilterForFollowedUser: false,
  filterOutVerticalVideos: false,
  enableFilterByViewCount: false,
  filterByViewCount: 10000,
  enableFilterByLikeCount: false,
  filterByLikeCount: 1000,
  enableFilterByDuration: false,
  filterByDuration: 3600,
  enableFilterByTitle: false,
  filterByTitle: [],
  enableFilterByUser: false,
  filterByUser: [],
  enableFilterByPublishTime: false,
  filterByPublishTime: 30, // 默认30天

  followingTabShowLivestreamingVideos: false,
  followingFilterChargingVideos: false, // 默认不过滤充电视频
  followingFilterDynamicVideos: false, // 默认不过滤动态视频
  followingUploaderSort: 'updated',
  collectedSeasonPlayAllMode: 'beginning', // 默认从合集开头播放
  enableFollowingInactiveBlacklist: true, // 默认启用不活跃名单
  followingInactiveDays: 100, // 默认100天

  homePageTabVisibilityList: [],
  fixedHomeTabsOnHomePage: false,
  enableVersionReminder: true,
  lastAcknowledgedVersion: '',
  videoCardTitleFontSize: 'base',
  videoCardAuthorFontSize: 'sm',
  useSearchPageModeOnHomePage: true,
  preserveForYouState: false,
  rememberNoCookieRecommendationState: true,

  adaptToOtherPageStyles: true,
  useOriginalBilibiliTopBar: false,
  preventMobileRedirect: false,

  // Video Player
  defaultVideoPlayerMode: 'default',
  bewlyWidescreenSidebarPosition: 'right',
  showWidescreenIdleProgress: false,
  defaultDanmakuState: 'system',
  defaultCaptionState: 'system',
  lastDanmakuState: true,
  lastCaptionState: false,
  enableVideoPlayerModeOverrides: false,
  videoPlayerModeOverrides: {
    multipart: 'inherit',
    collection: 'inherit',
    bangumi: 'inherit',
    watchLater: 'inherit',
    playlist: 'inherit',
    momentsDialog: 'inherit',
  },
  autoExitFullscreenOnEnd: false, // 全屏播放完毕后自动退出，默认关闭
  showVerticalVideoZoomButton: true, // 默认显示竖屏视频放大按钮
  showVideoScreenshotButton: true, // 默认显示播放器截图按钮
  videoScreenshotShortcut: DEFAULT_SCREENSHOT_SHORTCUT,
  localLoudnessEnabled: LOCAL_LOUDNESS_DEFAULTS.enabled,
  localLoudnessTarget: LOCAL_LOUDNESS_DEFAULTS.target,
  localLoudnessStrength: LOCAL_LOUDNESS_DEFAULTS.strength,

  // 自动连播总开关
  useBilibiliDefaultAutoPlay: true, // 使用B站默认自动播放行为（总开关），默认开启
  autoRemoveWatchLaterOnEnd: false,

  // 分类型自动连播设置（总开关关闭时生效）
  autoPlayMultipart: 'autoPlay', // 分P视频自动播放模式，默认自动连播
  autoPlayCollection: 'autoPlay', // 合集视频自动播放模式，默认自动连播
  autoPlayRecommend: 'autoPlay', // 单视频推荐自动播放模式，默认自动连播
  autoPlayWatchLater: 'autoPlay', // 稍后再看自动播放模式，默认自动连播
  autoPlayPlaylist: 'autoPlay', // 收藏列表自动播放模式，默认自动连播

  videoPlayerScroll: true, // 默认开启视频播放器滚动
  videoPlayerScrollMode: 'sendingBar',

  // 倍速记忆设置
  rememberPlaybackRate: false, // 启用倍速记忆功能
  savedPlaybackRate: 1, // 记住的倍速值 (0.25-5)

  // 视频比例记忆设置
  rememberVideoAspectRatio: false, // 启用视频比例记忆功能
  savedVideoAspectRatio: null, // 首次启用时记住播放器当前比例
  rememberVideoQuality: false,
  savedVideoQuality: null,

  // 自定义播放设置
  enableRandomPlay: false, // 启用视频合集自定义播放功能
  defaultCustomPlayOrder: 'random', // 默认选中随机播放，但不直接开启自定义播放
  enableCustomPlayOrderOverrides: false,
  customPlayOrderOverrides: {
    multipart: 'inherit',
    collection: 'inherit',
    watchLater: 'inherit',
    playlist: 'inherit',
  },
  randomPlayMode: 'manual', // 随机播放模式：手动切换或自动启用
  minVideosForRandom: 5, // 启用随机播放的最小视频数量
}

// 本地存储配置（不会同步到云端）
export const localSettings = useStorageLocal('localSettings', originalLocalSettings, { mergeDefaults: true, writeDefaults: false })

let resolveSettingsReady: (value: Settings) => void = () => {}
let settingsReadyResolved = false
let resolveSettingsDisplayReady: (value: Settings) => void = () => {}
let settingsDisplayReadyResolved = false
let legacyGridSettingsRemoved = false
export const settingsReady = new Promise<Settings>((resolve) => {
  resolveSettingsReady = resolve
})
export const settingsDisplayReady = new Promise<Settings>((resolve) => {
  resolveSettingsDisplayReady = resolve
})

export const settings = useSettingsStorage(originalSettings, { normalize: normalizeSettings })
export const settingsInitializationState = settings.initializationState

function asUnknownRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>
}

function normalizeSettings(value: Settings) {
  removeRetiredSettings(value)
  if (typeof value.momentsStartFromLastSeen !== 'boolean')
    value.momentsStartFromLastSeen = false
  if (typeof value.enableDarkModeTint !== 'boolean')
    value.enableDarkModeTint = false
  value.dockPosition = normalizeDockPosition(value.dockPosition)
  value.themeColor = normalizeThemeColor(value.themeColor)
  if (typeof value.autoRemoveWatchLaterOnEnd !== 'boolean')
    value.autoRemoveWatchLaterOnEnd = false
  for (const key of ['topBarLinkOpenMode', 'searchBarLinkOpenMode'] as const) {
    if (!['currentTab', 'currentTabIfNotHomepage', 'currentTabIfHomepage', 'newTab', 'background'].includes(value[key]))
      value[key] = originalSettings[key]
  }
  if (!isValidScreenshotShortcut(value.videoScreenshotShortcut))
    value.videoScreenshotShortcut = ''
  const record = value as Settings & Record<string, unknown>
  if (!['web', 'webNoCookie', 'app'].includes(value.recommendationMode))
    value.recommendationMode = originalSettings.recommendationMode
  if (value.appRecommendationColumn !== 1 && value.appRecommendationColumn !== 2)
    value.appRecommendationColumn = 2
  if (!['default', 'on', 'off'].includes(value.textAutospaceMode))
    value.textAutospaceMode = 'default'
  const normalizedModes = normalizeRecommendationSwitcherOptions(value.recommendationModeSwitcherOptions)
  if (JSON.stringify(normalizedModes) !== JSON.stringify(value.recommendationModeSwitcherOptions))
    value.recommendationModeSwitcherOptions = normalizedModes
  const legacyRecord = asUnknownRecord(value)
  if (typeof value.localLoudnessEnabled !== 'boolean')
    value.localLoudnessEnabled = false
  value.localLoudnessTarget = normalizeLocalLoudnessValue(value.localLoudnessTarget, 'target')
  value.localLoudnessStrength = normalizeLocalLoudnessValue(value.localLoudnessStrength, 'strength')

  // Missing category switches preserve Nocturne's existing reminders. They
  // change badge presentation only, never the server's read/unread state.
  for (const field of ['showReplyNotificationReminder', 'showAtNotificationReminder', 'showSystemNotificationReminder', 'showFollowedPrivateMessageUnreadCount', 'showUnfollowedPrivateMessageUnreadCount', 'rememberVideoQuality', 'showWidescreenIdleProgress', 'originalMomentsUseBewlyFilters', 'showImmersiveModeEntry', 'immersiveWheelSwitch', 'immersiveKeyboardSwitch', 'immersiveAutoPlay', 'immersiveAutoNext', 'immersivePreloadNext', 'resumeFromPreviewPosition', 'showDockBackToTop', 'showSearchIdentitySwitcher'] as const) {
    if (typeof record[field] !== 'boolean')
      record[field] = originalSettings[field]
  }
  if (record.savedVideoQuality !== null && (!Number.isSafeInteger(record.savedVideoQuality) || record.savedVideoQuality < 0))
    record.savedVideoQuality = null
  if (record.historyLayout !== 'list' && record.historyLayout !== 'grid')
    record.historyLayout = 'list'

  Reflect.deleteProperty(record, 'detectCommentShadowBan')
  Reflect.deleteProperty(record, 'homeTabsPosition')
  Reflect.deleteProperty(record, 'enableHomeGridVirtualization')
  Reflect.deleteProperty(record, 'releaseOffscreenVideoCardImages')
  Reflect.deleteProperty(record, 'showBewlyOrBiliTopBarSwitcher')
  Reflect.deleteProperty(record, 'showHomeButtonInTouchMode')
  Reflect.deleteProperty(record, 'enableFrostedGlass')
  Reflect.deleteProperty(record, 'alwaysUseTransparentTopBar')
  Reflect.deleteProperty(record, 'enableTopBarGradient')
  Reflect.deleteProperty(record, 'showTopBarThemeColorGradient')
  Reflect.deleteProperty(record, 'useOriginalBilibiliHomepage')
  Reflect.deleteProperty(record, 'searchPageDarkenOnSearchFocus')
  Reflect.deleteProperty(record, 'searchPageBlurredOnSearchFocus')

  // 清理已移除的音量均衡功能设置。
  for (const field of ['enableVolumeNormalization', 'targetVolume', 'normalizationStrength', 'adaptiveGainSpeed', 'voiceGateDb', 'volumeNormalizationDebug'])
    Reflect.deleteProperty(record, field)

  // 旧布尔开关 → 评论回复树展示模式
  const validCommentReplyTreeModes: CommentReplyTreeMode[] = [
    'lineCollapseMain',
    'lineKeepMain',
    'indentOnly',
  ]
  if (typeof record.enableCommentReplyTree === 'boolean') {
    // 旧版开启对应可收起主评论；关闭则回落到新默认（引导线、不收起主评论）
    record.commentReplyTreeMode = record.enableCommentReplyTree
      ? 'lineCollapseMain'
      : 'lineKeepMain'
    Reflect.deleteProperty(record, 'enableCommentReplyTree')
  }
  if (!validCommentReplyTreeModes.includes(record.commentReplyTreeMode))
    record.commentReplyTreeMode = originalSettings.commentReplyTreeMode

  const validCommentReplyPaginationModes: CommentReplyPaginationMode[] = ['loadMore', 'pagination']
  if (!validCommentReplyPaginationModes.includes(record.commentReplyPaginationMode))
    record.commentReplyPaginationMode = originalSettings.commentReplyPaginationMode
  record.commentReplyBatchPages = normalizeCommentReplyBatch(record.commentReplyBatchPages)
  record.commentReplyTreeContainerHeight = normalizeCommentReplyContainerHeight(record.commentReplyTreeContainerHeight)
  if (typeof record.enableCommentReplyTreeContainer !== 'boolean')
    record.enableCommentReplyTreeContainer = false

  const validTopBarLogoStyles: TopBarLogoStyle[] = ['icon', 'brand']
  if (!validTopBarLogoStyles.includes(record.topBarLogoStyle))
    record.topBarLogoStyle = originalSettings.topBarLogoStyle

  const unsupportedBadgeKeys = new Set(['favorites', 'history'])
  if (Array.isArray(record.topBarComponentsConfig)) {
    // The top bar notifications button was removed.
    if (record.topBarComponentsConfig.some(component => component.key === 'notifications'))
      record.topBarComponentsConfig = record.topBarComponentsConfig.filter(component => component.key !== 'notifications')
    const hasUnsupportedBadge = record.topBarComponentsConfig.some((component) => {
      return unsupportedBadgeKeys.has(component.key) && component.badgeType !== 'none'
    })
    if (hasUnsupportedBadge) {
      record.topBarComponentsConfig = record.topBarComponentsConfig.map(component => ({
        ...component,
        badgeType: unsupportedBadgeKeys.has(component.key) ? 'none' : component.badgeType,
      }))
    }
  }

  if (!Number.isFinite(record.frostedGlassBlurIntensity))
    record.frostedGlassBlurIntensity = originalSettings.frostedGlassBlurIntensity

  if ('reduceFrostedGlassBlur' in record) {
    if (record.reduceFrostedGlassBlur === true && record.frostedGlassBlurIntensity === originalSettings.frostedGlassBlurIntensity)
      record.frostedGlassBlurIntensity = 10

    Reflect.deleteProperty(record, 'reduceFrostedGlassBlur')
  }

  if (record.frostedGlassBlurIntensity < FROSTED_GLASS_BLUR_MIN_PX)
    record.frostedGlassBlurIntensity = FROSTED_GLASS_BLUR_MIN_PX

  if (record.frostedGlassBlurIntensity > FROSTED_GLASS_BLUR_MAX_PX)
    record.frostedGlassBlurIntensity = FROSTED_GLASS_BLUR_MAX_PX

  // Normalize the user-configurable two-column list breakpoint. Older
  // versions used a fixed 640px threshold and do not have this field.
  record.autoSwitchListLayoutBreakpoint = normalizeListLayoutBreakpoint(record.autoSwitchListLayoutBreakpoint)
  record.videoCardCoverRatioOneColumn = normalizeVideoCardCoverRatio(
    record.videoCardCoverRatioOneColumn,
    originalSettings.videoCardCoverRatioOneColumn,
  )
  record.videoCardCoverRatioTwoColumns = normalizeVideoCardCoverRatio(
    record.videoCardCoverRatioTwoColumns,
    originalSettings.videoCardCoverRatioTwoColumns,
  )

  // 迁移旧的布尔类型自动播放设置到新的 AutoPlayMode 类型
  const autoPlayFields = ['autoPlayMultipart', 'autoPlayCollection', 'autoPlayRecommend', 'autoPlayWatchLater', 'autoPlayPlaylist'] as const

  // 检查是否存在旧的布尔设置需要迁移
  const needsMigration = autoPlayFields.some(field => typeof record[field] === 'boolean')

  if (needsMigration) {
    for (const field of autoPlayFields) {
      // 只对布尔类型进行迁移，其他类型（包括 'default'）保持不变
      if (typeof record[field] === 'boolean') {
        // true -> 'autoPlay', false -> 'pauseAtEnd'
        record[field] = record[field] ? 'autoPlay' : 'pauseAtEnd'
      }
    }
  }

  if (record.autoPlayRecommend === 'autoPlayWithRecommend')
    record.autoPlayRecommend = 'autoPlay'

  // 确保 useBilibiliDefaultAutoPlay 存在（新用户或旧版本升级）
  if (typeof legacyRecord.useBilibiliDefaultAutoPlay !== 'boolean')
    record.useBilibiliDefaultAutoPlay = true

  Reflect.deleteProperty(record, 'enableIndependentAutoPlay')
  Reflect.deleteProperty(record, 'independentAutoPlayStates')

  const legacyRandomPlayOrder = record.randomPlayOrder
  if (
    record.customPlayDefaultEnabled === true
    && (legacyRandomPlayOrder === 'sequential' || legacyRandomPlayOrder === 'reverse' || legacyRandomPlayOrder === 'random')
  ) {
    record.defaultCustomPlayOrder = legacyRandomPlayOrder
  }

  const validDefaultCustomPlayOrders: DefaultCustomPlayOrder[] = ['sequential', 'reverse', 'random']
  if (!validDefaultCustomPlayOrders.includes(record.defaultCustomPlayOrder))
    record.defaultCustomPlayOrder = 'random'

  const customPlayOrderContexts: CustomPlayOrderContext[] = ['multipart', 'collection', 'watchLater', 'playlist']
  const validCustomPlayOrderOverrides: CustomPlayOrderOverride[] = ['inherit', ...validDefaultCustomPlayOrders]
  const storedCustomPlayOrderOverrides = record.customPlayOrderOverrides
  const needsCustomPlayOrderOverrideNormalization = !storedCustomPlayOrderOverrides
    || typeof storedCustomPlayOrderOverrides !== 'object'
    || customPlayOrderContexts.some(context => !validCustomPlayOrderOverrides.includes(storedCustomPlayOrderOverrides[context]))

  if (needsCustomPlayOrderOverrideNormalization) {
    record.customPlayOrderOverrides = Object.fromEntries(
      customPlayOrderContexts.map((context) => {
        const storedValue = storedCustomPlayOrderOverrides?.[context]
        return [context, validCustomPlayOrderOverrides.includes(storedValue) ? storedValue : 'inherit']
      }),
    ) as CustomPlayOrderOverrides
  }

  if (typeof record.enableCustomPlayOrderOverrides !== 'boolean')
    record.enableCustomPlayOrderOverrides = false

  const legacyCustomAutoPlayFields: Array<[keyof Pick<Settings, 'autoPlayMultipart' | 'autoPlayCollection' | 'autoPlayWatchLater' | 'autoPlayPlaylist'>, CustomPlayOrderContext]> = [
    ['autoPlayMultipart', 'multipart'],
    ['autoPlayCollection', 'collection'],
    ['autoPlayWatchLater', 'watchLater'],
    ['autoPlayPlaylist', 'playlist'],
  ]
  let migratedLegacyCustomAutoPlay = false

  for (const [field, context] of legacyCustomAutoPlayFields) {
    const legacyMode = legacyRecord[field]
    const migratedOrder = legacyMode === 'customSequential'
      ? 'sequential'
      : legacyMode === 'customReverse'
        ? 'reverse'
        : legacyMode === 'customRandom'
          ? 'random'
          : null

    if (!migratedOrder)
      continue

    record.customPlayOrderOverrides[context] = migratedOrder
    record[field] = 'pauseAtEnd'
    migratedLegacyCustomAutoPlay = true
  }

  if (migratedLegacyCustomAutoPlay)
    record.enableCustomPlayOrderOverrides = true

  const validAutoPlayModes: AutoPlayMode[] = ['default', 'autoPlay', 'autoPlayWithRecommend', 'pauseAtEnd', 'loop']
  for (const field of autoPlayFields) {
    if (!validAutoPlayModes.includes(record[field]))
      record[field] = 'pauseAtEnd'
  }

  Reflect.deleteProperty(record, 'customPlayDefaultEnabled')
  Reflect.deleteProperty(record, 'randomPlayOrder')

  if (record.rememberDanmakuState === true)
    record.defaultDanmakuState = 'remember'
  if (record.rememberCaptionState === true)
    record.defaultCaptionState = 'remember'
  Reflect.deleteProperty(record, 'rememberDanmakuState')
  Reflect.deleteProperty(record, 'rememberCaptionState')

  const validPlayerDefaultStates: PlayerDefaultState[] = ['system', 'remember', 'on', 'off']
  if (!['sendingBar', 'playerCenter'].includes(record.videoPlayerScrollMode))
    record.videoPlayerScrollMode = originalSettings.videoPlayerScrollMode
  if (!validPlayerDefaultStates.includes(record.defaultDanmakuState))
    record.defaultDanmakuState = originalSettings.defaultDanmakuState
  if (!validPlayerDefaultStates.includes(record.defaultCaptionState))
    record.defaultCaptionState = originalSettings.defaultCaptionState

  // 旧开关与新的按场景覆盖语义不同，直接清理并让用户重新设置。
  Reflect.deleteProperty(record, 'keepCollectionVideoDefaultMode')
  Reflect.deleteProperty(record, 'keepWatchLaterVideoDefaultMode')

  const modeOverrideContexts: VideoPlayerModeContext[] = ['multipart', 'collection', 'bangumi', 'watchLater', 'playlist', 'momentsDialog']
  const validModeOverrides: VideoPlayerModeOverride[] = ['inherit', 'default', 'webFullscreen', 'widescreen', 'bewlyWidescreen']
  const storedModeOverrides = record.videoPlayerModeOverrides
  const needsModeOverrideNormalization = !storedModeOverrides
    || typeof storedModeOverrides !== 'object'
    || modeOverrideContexts.some(context => !validModeOverrides.includes(storedModeOverrides[context]))

  if (needsModeOverrideNormalization) {
    record.videoPlayerModeOverrides = Object.fromEntries(
      modeOverrideContexts.map((context) => {
        const storedValue = storedModeOverrides?.[context]
        return [context, validModeOverrides.includes(storedValue) ? storedValue : 'inherit']
      }),
    ) as VideoPlayerModeOverrides
  }

  // 清理已移除的 NVIDIA RTX 视频增强兼容设置
  Reflect.deleteProperty(record, 'nvidiaRtxVideoEnhancementCompatibility')
}

watch(
  [
    () => settings.value,
    () => settings.initializationState.value,
    () => localSettings.initializationState.value,
    () => settings.displayReady.value,
    () => localSettings.value,
  ] as const,
  ([value, settingsState, localSettingsState]) => {
    if (localSettingsState === 'loaded')
      removeRetiredSettings(localSettings.value)
    if (!settingsDisplayReadyResolved && settings.displayReady.value) {
      settingsDisplayReadyResolved = true
      resolveSettingsDisplayReady(value)
    }
    if (settingsState !== 'loaded')
      return
    normalizeSettings(value)

    if (!settingsReadyResolved && localSettingsState === 'loaded') {
      settingsReadyResolved = true
      resolveSettingsReady(value)
    }
    if (!legacyGridSettingsRemoved && localSettingsState === 'loaded') {
      legacyGridSettingsRemoved = true
      void browser.storage.local.remove(['gridBreakpoints', 'gridColumns', ...RETIRED_LOCAL_STORAGE_KEYS]).catch(() => {})
    }
  },
  { immediate: true },
)

export type GridLayoutType = 'adaptive' | 'twoColumns' | 'oneColumn'

export interface GridLayout {
  home: GridLayoutType
}

export const gridLayout = useStorageLocal<GridLayout>('gridLayout', {
  home: 'adaptive',
}, { mergeDefaults: true, writeDefaults: false })
