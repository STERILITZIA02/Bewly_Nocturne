<script setup lang="ts">
/**
 * Following Component - 正在关注页面
 *
 * ## 功能概述
 * 显示用户关注的UP主列表及其视频动态流。支持两种视图模式：
 * 1. ALL视图：显示所有关注UP主的混合视频流
 * 2. 单UP主视图：显示特定UP主的视频动态
 *
 * UP主列表优先使用页面已加载到的历史投稿时间排序，来源包括：
 * 1. ALL视图的关注动态流中实际加载到的视频时间
 * 2. 用户点击某个UP主后实际加载到的视频时间
 * 3. 右上角动态Pop和插件动态页已经加载到的视频时间
 *
 * 没有历史投稿时间时使用关注接口的关注时间兜底，不发起后台逐人请求。
 *
 * ## 缓存策略
 *
 * ### 已读状态 (VIEWED_UPLOADERS_KEY)
 * - 记录用户查看每个UP主的时间戳
 * - 用于判断 hasUpdate 状态（红点提示）
 *
 * ### UP主投稿时间缓存
 * - 通过扩展级共享存储复用上述四类页面已经加载到的最新视频时间
 * - 旧版后台逐人同步产生的缓存不会参与排序
 *
 * ## 排序策略
 *
 * UP主列表按最新投稿时间降序排列；没有投稿记录时使用关注时间。
 *
 * ## 布局模式
 *
 * ### 新布局（默认，可在设置中关闭）
 * - 左侧：Sticky侧边栏显示UP主列表
 * - 右侧：全宽视频流，支持全页面滚动
 * - 参考 Ranking.vue 的布局设计
 *
 * ## 性能优化
 * - 扩展级共享缓存减少重复计算
 * - 分页加载，避免一次性加载过多数据
 */
import { useI18n } from 'vue-i18n'

import type { Author, Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import { HOME_SEARCH_STAGE_HEIGHT } from '~/constants/layout'
import { mapMomentItemToVideo } from '~/contentScripts/views/Home/adapters/followingVideo'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import { parseDedeUserID } from '~/logic/loginStatus'
import { recordUploaderLatestVideoTimes } from '~/logic/uploaderLatestVideoTimes'
import type { FollowingLiveResult, List as FollowingLiveItem } from '~/models/live/getFollowingLiveList'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import { BadgeText } from '~/models/moment/moment'
import type { AccountId } from '~/utils/accountScope'
import { getAccountScopedStorageKey, isSameAccount } from '~/utils/accountScope'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { reportRuntimeFailure } from '~/utils/messaging'

import FollowingSidebar from '../following/FollowingSidebar.vue'
import type { FollowingUploader as UploaderInfo } from '../following/model'
import { useFollowingDirectory } from '../following/useFollowingDirectory'
import { useFollowingGroupWrites } from '../following/useFollowingGroupWrites'

interface Props {
  gridLayout?: GridLayoutType
  topBarVisibility?: boolean
}

interface VideoElement {
  uniqueId: string
  bvid?: string
  item?: MomentItem
  liveItem?: FollowingLiveItem
  authorList?: Author[]
  displayData?: Video
  isLive?: boolean
}

withDefaults(defineProps<Props>(), {
  gridLayout: 'adaptive',
  topBarVisibility: true,
})

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

useI18n()

const { scrollViewportRef, handlePageRefresh, handleReachBottom, canRefreshHomeSubPage } = useBewlyApp()
const tabState = useHomeTabState()
const hasSettled = tabState.ref('hasSettled', false)
const videoList = tabState.ref<VideoElement[]>('videoList', [])
const selectedUploader = tabState.ref<number | null>('selectedUploader', null) // null means "All"
const previousSelectedUploader = tabState.ref<number | null>('previousSelectedUploader', null)
const selectionToken = ref<number>(0) // 用于防止竞态条件的令牌
const liveListLoaded = tabState.ref<boolean>('liveListLoaded', false) // 标记直播列表是否已加载（防止重复加载）

// Provide selectedUploader to child components for preview loading control
provide('moments-selected-uploader', selectedUploader)
const isLoading = ref<boolean>(false)
const requestFailed = tabState.ref<boolean>('requestFailed', false)
const noMoreContent = tabState.ref<boolean>('noMoreContent', false)
const needToLoginFirst = tabState.ref<boolean>('needToLoginFirst', false)
const isRefreshContextActive = ref<boolean>(false)

// 分别管理ALL和单个UP主的分页状态
const allViewOffset = tabState.ref<string>('allViewOffset', '')
const allViewUpdateBaseline = tabState.ref<string>('allViewUpdateBaseline', '')
const userMomentsOffset = tabState.ref<string>('userMomentsOffset', '')

let loadedAccountMid: AccountId = tabState.read('loadedAccountMid', null)
tabState.capture('loadedAccountMid', () => loadedAccountMid)
const directory = useFollowingDirectory(tabState, getDirectoryAccount, {
  viewed: getViewedUploaders,
  blocked: getBlacklistedUploaders,
  selected: () => selectedUploader.value,
})
const { uploaders: uploaderList } = directory
const groupWrites = useFollowingGroupWrites(directory, getDirectoryAccount, tabState.isCurrent)
const expandedGroupIds = tabState.ref<number[]>('followingExpandedGroups', [-10, 0])
const uploaderScrollRef = ref<HTMLElement | null>(null)
tabState.capture('uploaderScrollTop', () => uploaderScrollRef.value?.scrollTop ?? 0)
let followingAccountInitialized = tabState.restored

function syncRefreshAvailability() {
  canRefreshHomeSubPage.value = isRefreshContextActive.value && selectedUploader.value === null
}

watch(selectedUploader, syncRefreshAvailability, { immediate: true })

// Track viewed uploaders in localStorage
const VIEWED_UPLOADERS_KEY = 'bewlycat_moments_viewed_uploaders'
// Blacklist for inactive uploaders
const UPLOADER_BLACKLIST_KEY = 'bewlycat_uploader_blacklist'

function getCurrentAccountMid(): AccountId {
  return parseDedeUserID(document.cookie) ?? null
}

function getDirectoryAccount(): AccountId {
  return isSameAccount(loadedAccountMid, getCurrentAccountMid()) ? loadedAccountMid : null
}

function getFollowingStorageKey(baseKey: string): string | undefined {
  return loadedAccountMid === null || !isSameAccount(loadedAccountMid, getCurrentAccountMid())
    ? undefined
    : getAccountScopedStorageKey(baseKey, loadedAccountMid)
}

function isFollowingRequestCurrent(token?: number): boolean {
  return tabState.isCurrent() && (token === undefined || token === selectionToken.value)
    && isSameAccount(loadedAccountMid, getCurrentAccountMid())
}

// 获取已查看的UP主记录（存储用户实际看到的最新投稿时间）
function getViewedUploaders(): Record<number, number> {
  try {
    const key = getFollowingStorageKey(VIEWED_UPLOADERS_KEY)
    if (!key)
      return {}
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : {}
  }
  catch {
    return {}
  }
}

// 标记UP主为已查看（记录用户看到的最新投稿时间）
function markUploaderAsViewed(mid: number, updateTime?: number) {
  const viewed = getViewedUploaders()
  // 如果提供了updateTime，使用它；否则使用当前UP主的lastUpdateTime
  const uploader = uploaderList.value.find(u => u.mid === mid)
  const timeToMark = updateTime || (uploader?.lastUpdateTime) || Date.now()

  viewed[mid] = timeToMark
  const key = getFollowingStorageKey(VIEWED_UPLOADERS_KEY)
  if (!key)
    return
  localStorage.setItem(key, JSON.stringify(viewed))

  directory.markViewed(mid)
}

// 获取黑名单
function getBlacklistedUploaders(): Set<number> {
  try {
    const key = getFollowingStorageKey(UPLOADER_BLACKLIST_KEY)
    if (!key)
      return new Set()
    const data = localStorage.getItem(key)
    return data ? new Set(JSON.parse(data)) : new Set()
  }
  catch {
    return new Set()
  }
}

// 添加到黑名单
function addToBlacklist(mid: number) {
  try {
    const key = getFollowingStorageKey(UPLOADER_BLACKLIST_KEY)
    if (!key)
      return
    const blacklist = getBlacklistedUploaders()
    blacklist.add(mid)
    localStorage.setItem(key, JSON.stringify([...blacklist]))
  }
  catch (error) {
    reportRuntimeFailure('Following: failed to add user to blacklist', error)
  }
}

// 从黑名单移除
function removeFromBlacklist(mid: number) {
  try {
    const key = getFollowingStorageKey(UPLOADER_BLACKLIST_KEY)
    if (!key)
      return
    const blacklist = getBlacklistedUploaders()
    if (blacklist.has(mid)) {
      blacklist.delete(mid)
      localStorage.setItem(key, JSON.stringify([...blacklist]))
    }
  }
  catch (error) {
    reportRuntimeFailure('Following: failed to remove user from blacklist', error)
  }
}

// 检查UP主是否应该在黑名单（超过指定天数未更新）
function shouldBeBlacklisted(uploader: UploaderInfo): boolean {
  // 如果没有缓存时间，使用 lastUpdateTime（可能是关注时间）
  const inactiveDays = settings.value.followingInactiveDays
  const inactiveThresholdMs = inactiveDays * 24 * 60 * 60 * 1000
  const now = Date.now()

  return (now - uploader.lastUpdateTime) > inactiveThresholdMs
}

// 检查视频是否为充电专属视频
function isChargingVideo(item: MomentItem): boolean {
  const major = item.modules?.module_dynamic?.major
  const badgeText = major?.archive?.badge?.text || major?.ugc_season?.badge?.text
  return badgeText === BadgeText.充电专属
}

// 检查视频是否为动态视频
function isDynamicVideo(item: MomentItem): boolean {
  const major = item.modules?.module_dynamic?.major
  const badgeText = major?.archive?.badge?.text || major?.ugc_season?.badge?.text
  return badgeText === BadgeText.动态视频
}

// 判断视频是否应该被过滤
function shouldFilterVideo(item: MomentItem): boolean {
  // 如果开启了过滤充电视频设置，且该视频是充电专属视频，则返回 true（表示应该过滤）
  if (settings.value.followingFilterChargingVideos && isChargingVideo(item)) {
    return true
  }
  // 如果开启了过滤动态视频设置，且该视频是动态视频，则返回 true（表示应该过滤）
  if (settings.value.followingFilterDynamicVideos && isDynamicVideo(item)) {
    return true
  }
  return false
}

// 搜索关键词
const searchKeyword = tabState.ref<string>('searchKeyword', '')

const gridKey = computed(() => `following-grid-${selectedUploader.value ?? 'all'}`)

// 加载关注的直播列表（仅加载正在直播的）
const OFFLINE_LIVE_TEXT = /未开播|休息|离线|下播|轮播|回放/

function isLiveStreamingItem(liveItem: FollowingLiveItem): boolean {
  const liveStatus = Number(liveItem.live_status)
  if (liveStatus !== 1)
    return false

  const statusText = (liveItem.text_small ?? '').trim()
  if (statusText && OFFLINE_LIVE_TEXT.test(statusText))
    return false

  return true
}

async function loadFollowingLiveList(token: number): Promise<VideoElement[]> {
  if (!settings.value.followingTabShowLivestreamingVideos) {
    return []
  }

  try {
    const response: FollowingLiveResult = await api.live.getFollowingLiveList({
      page: 1,
      page_size: 30,
    })

    if (!isFollowingRequestCurrent(token))
      return []

    if (response.code === 0 && response.data.list) {
      // 只保留正在直播的（live_status === 1）
      const liveItems = response.data.list
        .filter((liveItem: FollowingLiveItem) => isLiveStreamingItem(liveItem))
        .map((liveItem: FollowingLiveItem) => ({
          uniqueId: `live-${liveItem.roomid}`,
          liveItem,
          displayData: mapLiveItemToVideo(liveItem),
          isLive: true,
        }))
      return liveItems
    }
  }
  catch (error) {
    reportRuntimeFailure('Following: failed to load live list', error)
  }

  return []
}

// 加载ALL视图的动态流（渐进式加载，每页加载后立即显示）
async function loadAllViewVideos(maxPages: number = 3, token?: number) {
  if (!isFollowingRequestCurrent(token))
    return
  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false
  needToLoginFirst.value = false

  // 追踪每个UP主在ALL视图中的最新视频时间
  const uploaderLatestTimes = new Map<number, number>()

  try {
    // 只在首次加载且未加载过直播列表时，才加载直播列表（防止重复加载）
    if (!allViewOffset.value && !liveListLoaded.value && settings.value.followingTabShowLivestreamingVideos) {
      const liveItems = await loadFollowingLiveList(token ?? selectionToken.value)
      if (!isFollowingRequestCurrent(token))
        return
      if (liveItems.length > 0) {
        videoList.value = [...liveItems, ...videoList.value]
      }
      // 标记为已加载，无论成功与否都不再重复加载
      liveListLoaded.value = true
    }

    let tempOffset = allViewOffset.value || undefined
    let pageCount = 0

    while (pageCount < maxPages) {
      pageCount++

      const response: MomentResult = await api.moment.getMoments({
        type: 'video',
        offset: tempOffset,
        update_baseline: allViewUpdateBaseline.value || undefined,
      })

      // 竞态条件检查：如果当前选择已改变，停止加载
      if (!isFollowingRequestCurrent(token))
        return

      if (response.code === -101) {
        needToLoginFirst.value = true
        requestFailed.value = false
        noMoreContent.value = false
        return
      }

      if (response.code === 0) {
        const newOffset = response.data.offset
        allViewUpdateBaseline.value = response.data.update_baseline

        // 检查是否有数据
        if (!response.data.items || response.data.items.length === 0) {
          noMoreContent.value = true
          break
        }

        if (newOffset === '0' || newOffset === tempOffset) {
          noMoreContent.value = true
          break
        }
        else {
          tempOffset = newOffset
          allViewOffset.value = newOffset
        }

        response.data.items.forEach((item: MomentItem) => {
          // 如果应该过滤该视频（充电专属视频），则跳过
          if (shouldFilterVideo(item)) {
            return
          }

          const authors: Author[] = []

          if ((item.modules?.module_dynamic?.major?.archive?.stat as any)?.coop_num) {
            (item.modules.module_dynamic.major.archive as any).coop_info?.forEach((coop: any) => {
              authors.push({
                name: coop.name,
                authorFace: coop.face,
                mid: coop.mid,
              })
            })
          }
          else {
            authors.push({
              name: item.modules?.module_author?.name,
              authorFace: item.modules?.module_author?.face,
              mid: item.modules?.module_author?.mid,
            })
          }

          // 提取视频发布时间，更新UP主最新时间
          const pubTs = item.modules?.module_author?.pub_ts
          if (pubTs) {
            const videoTime = pubTs * 1000
            authors.forEach((author) => {
              if (author.mid) {
                const currentLatest = uploaderLatestTimes.get(author.mid) || 0
                if (videoTime > currentLatest) {
                  uploaderLatestTimes.set(author.mid, videoTime)
                }
              }
            })
          }

          const major = item.modules?.module_dynamic?.major
          videoList.value.push({
            uniqueId: `following-all-${item.id_str}`,
            bvid: major?.archive?.bvid || major?.ugc_season?.bvid,
            item,
            authorList: authors,
            displayData: mapMomentItemToVideo(item, authors),
          })
        })
      }
      else {
        reportRuntimeFailure('Following: API returned an error code', response.code)
        requestFailed.value = true
        noMoreContent.value = false
        return
      }
    }

    // 再次检查 token，防止在处理缓存更新期间选择改变
    if (!isFollowingRequestCurrent(token))
      return

    // 记录从ALL视图中提取的最新投稿时间
    void recordUploaderLatestVideoTimes(
      Array.from(uploaderLatestTimes, ([mid, time]) => ({ mid, time })),
      'following-all',
    )

    let updatedCount = 0
    let removedFromBlacklistCount = 0
    let markedAsViewedCount = 0
    uploaderLatestTimes.forEach((time, mid) => {
      const uploader = uploaderList.value.find(u => u.mid === mid)
      if (uploader) {
        const knownPostTime = uploader.hasPostTime ? uploader.lastUpdateTime : 0

        if (time > knownPostTime) {
          directory.notePublication(mid, time)
          updatedCount++
        }

        // 用户在ALL视图中看到了该UP主的投稿，标记为已查看
        // 使用该UP主在ALL视图中的最新投稿时间作为已查看时间
        const viewed = getViewedUploaders()
        const lastViewedTime = viewed[mid] || 0

        // 如果当前看到的时间等于或晚于已知的最新时间，更新已查看时间
        if (time >= knownPostTime && time > lastViewedTime) {
          markUploaderAsViewed(mid, time)
          markedAsViewedCount++
        }

        // 如果该UP主在黑名单中，说明他们有新活动，从黑名单移除
        const blacklist = getBlacklistedUploaders()
        if (blacklist.has(mid)) {
          removeFromBlacklist(mid)
          removedFromBlacklistCount++
        }
      }
    })

    if (updatedCount > 0 || removedFromBlacklistCount > 0 || markedAsViewedCount > 0) {
      directory.updateStatus()
    }

    // 如果一条视频都没加载到，设置 noMoreContent
    if (videoList.value.length === 0) {
      noMoreContent.value = true
    }
  }
  catch (error) {
    reportRuntimeFailure('Following: failed to load all view', error)
    if (isFollowingRequestCurrent(token)) {
      requestFailed.value = true
      noMoreContent.value = false
    }
  }
  finally {
    // 只有当前 token 仍然有效时才清除加载状态
    if (isFollowingRequestCurrent(token)) {
      hasSettled.value = true
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

// 加载单个UP主的动态（渐进式加载，每页加载后立即显示）
async function loadUserMoments(mid: number, maxPages: number = 3, token?: number) {
  if (!isFollowingRequestCurrent(token))
    return
  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false
  needToLoginFirst.value = false

  // 收集本次点击后实际加载到的视频时间
  const allVideoTimes: number[] = []

  try {
    let tempOffset = userMomentsOffset.value || undefined
    let pageCount = 0

    while (pageCount < maxPages) {
      pageCount++

      const response: MomentResult = await api.moment.getUserMoments({
        host_mid: mid.toString(),
        offset: tempOffset,
        features: 'itemOpusStyle',
      })

      // 竞态条件检查：如果当前选择已改变，停止加载
      if (!isFollowingRequestCurrent(token))
        return

      if (response.code === -101) {
        needToLoginFirst.value = true
        requestFailed.value = false
        noMoreContent.value = false
        return
      }

      if (response.code === 0) {
        const newOffset = response.data.offset

        if (newOffset === '0' || newOffset === tempOffset || !response.data.items || response.data.items.length === 0) {
          noMoreContent.value = true
          break
        }
        else {
          tempOffset = newOffset
          userMomentsOffset.value = newOffset
        }

        // 收集所有视频动态用于显示
        const allVideoItems: { item: MomentItem, time: number }[] = []

        response.data.items.forEach((item: MomentItem) => {
          // 只处理包含视频的动态（投稿 archive / 合集订阅 ugc_season）
          const major = item.modules?.module_dynamic?.major
          if (!major?.archive && !major?.ugc_season) {
            return
          }

          // 如果应该过滤该视频（充电专属视频），则跳过
          if (shouldFilterVideo(item)) {
            return
          }

          const authors: Author[] = []

          if ((major.archive?.stat as any)?.coop_num) {
            (major.archive as any).coop_info?.forEach((coop: any) => {
              authors.push({
                name: coop.name,
                authorFace: coop.face,
                mid: coop.mid,
              })
            })
          }
          else {
            authors.push({
              name: item.modules?.module_author?.name,
              authorFace: item.modules?.module_author?.face,
              mid: item.modules?.module_author?.mid,
            })
          }

          const displayData = mapMomentItemToVideo(item, authors)
          if (displayData) {
            const time = item.modules.module_author.pub_ts * 1000

            videoList.value.push({
              uniqueId: `user-moment-${item.id_str}`,
              bvid: major.archive?.bvid || major.ugc_season?.bvid,
              item,
              authorList: authors,
              displayData,
            })

            allVideoItems.push({ item, time })
            allVideoTimes.push(time) // 收集所有视频时间
          }
        })
      }
      else {
        reportRuntimeFailure('Following: API returned an error code', response.code)
        requestFailed.value = true
        noMoreContent.value = false
        return
      }
    }

    // 加载完成后，用点击后实际取得的最新投稿时间更新排序
    if (allVideoTimes.length > 0) {
      // 再次检查 token，防止在处理缓存更新期间选择改变
      if (!isFollowingRequestCurrent(token))
        return

      const uploader = uploaderList.value.find(u => u.mid === mid)
      if (uploader) {
        // 排序视频时间（降序）
        allVideoTimes.sort((a, b) => b - a)

        // 计算最新视频时间（考虑置顶）
        const latestTime = allVideoTimes.length === 1
          ? allVideoTimes[0]
          : Math.max(allVideoTimes[0], allVideoTimes[1])

        const knownLatestTime = uploader.hasPostTime
          ? Math.max(uploader.lastUpdateTime, latestTime)
          : latestTime
        directory.notePublication(mid, knownLatestTime)
        void recordUploaderLatestVideoTimes(
          [{ mid, time: knownLatestTime }],
          'following-selected',
        )

        // 用户主动点击TAB查看，标记为已查看
        markUploaderAsViewed(mid, knownLatestTime)

        if (settings.value.enableFollowingInactiveBlacklist && shouldBeBlacklisted(uploader)) {
          addToBlacklist(mid)
        }

        directory.sort(selectedUploader.value)
      }
    }

    // 如果一条视频都没加载到，设置 noMoreContent
    if (videoList.value.length === 0) {
      noMoreContent.value = true
    }
  }
  catch (error) {
    reportRuntimeFailure('Following: failed to load user moments', error)
    if (isFollowingRequestCurrent(token)) {
      requestFailed.value = true
      noMoreContent.value = false
    }
  }
  finally {
    // 只有当前 token 仍然有效时才清除加载状态
    if (isFollowingRequestCurrent(token)) {
      hasSettled.value = true
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

// 切换UP主
function selectUploader(mid: number | null) {
  if (!tabState.isCurrent())
    return
  hasSettled.value = false
  // 生成新的选择令牌，用于防止竞态条件
  const currentToken = ++selectionToken.value

  // 即时滚动到顶部（或搜索页面模式下的偏移位置）
  const viewport = scrollViewportRef.value
  if (viewport) {
    const scrollTarget = Math.min(viewport.scrollTop, settings.value.useSearchPageModeOnHomePage ? HOME_SEARCH_STAGE_HEIGHT : 0)
    viewport.scrollTop = scrollTarget
  }

  // 重置视频列表和分页状态
  videoList.value = []
  noMoreContent.value = false

  if (mid === null) {
    // 切换到ALL视图
    if (previousSelectedUploader.value !== null) {
      directory.sort(null)
    }

    selectedUploader.value = null
    previousSelectedUploader.value = null

    // 重置ALL视图分页和直播加载标志
    allViewOffset.value = ''
    allViewUpdateBaseline.value = ''
    liveListLoaded.value = false // 重置直播加载标志，允许重新加载

    // 加载ALL视图（初始加载3页，每页加载后立即显示）
    loadAllViewVideos(3, currentToken)
  }
  else {
    // 切换到具体UP主

    markUploaderAsViewed(mid)

    // 用户点击了UP主，如果在黑名单中则移除
    const blacklist = getBlacklistedUploaders()
    if (blacklist.has(mid)) {
      removeFromBlacklist(mid)
    }

    if (previousSelectedUploader.value !== null && previousSelectedUploader.value !== mid) {
      directory.sort(mid)
    }

    selectedUploader.value = mid
    previousSelectedUploader.value = mid

    // 重置用户动态分页
    userMomentsOffset.value = ''

    // 加载UP主动态（初始加载3页，每页加载后立即显示）
    loadUserMoments(mid, 3, currentToken)
  }
}

// 将直播item转换为Video格式
function mapLiveItemToVideo(liveItem: FollowingLiveItem): Video {
  return {
    id: liveItem.roomid,
    title: decodeHtmlEntities(liveItem.title),
    cover: liveItem.room_cover,
    author: {
      name: decodeHtmlEntities(liveItem.uname),
      authorFace: liveItem.face,
      mid: liveItem.uid,
    },
    viewStr: liveItem.text_small,
    displayTags: [decodeHtmlEntities(liveItem.area_name_v2)].filter(Boolean),
    roomid: liveItem.roomid,
    liveStatus: liveItem.live_status,
    threePointV2: [],
  }
}

function transformVideoItem(item: VideoElement): Video | undefined {
  return item.displayData
}

// 加载更多
async function handleLoadMore() {
  if (isLoading.value || noMoreContent.value)
    return

  if (selectedUploader.value === null) {
    // ALL视图：继续加载视频
    await loadAllViewVideos(1, selectionToken.value)
  }
  else {
    // UP主视图：继续加载动态
    await loadUserMoments(selectedUploader.value, 1, selectionToken.value)
  }
}

// 初始化
function initData() {
  if (!tabState.isCurrent())
    return
  hasSettled.value = false
  // 生成新的令牌，确保旧的加载请求被取消
  const currentToken = ++selectionToken.value
  const accountMid = loadedAccountMid

  // 保存当前选中的UP主
  const currentSelectedUploader = selectedUploader.value

  videoList.value = []
  allViewOffset.value = ''
  allViewUpdateBaseline.value = ''
  userMomentsOffset.value = ''
  noMoreContent.value = false
  needToLoginFirst.value = false
  requestFailed.value = false
  liveListLoaded.value = false // 重置直播加载标志

  if (accountMid === null) {
    needToLoginFirst.value = true
    return
  }
  void directory.load()

  // 如果当前已经选中了某个UP主，刷新该UP主的动态
  if (currentSelectedUploader !== null) {
    loadUserMoments(currentSelectedUploader, 3, currentToken)
  }
  else {
    // The directory and feed own independent requests; late directory loading
    // must not reset the selected uploader or scroll away from the search hero.
    loadAllViewVideos(3, currentToken)
  }
}

async function resumeFollowingData() {
  if (!tabState.isCurrent() || loadedAccountMid === null || requestFailed.value || needToLoginFirst.value)
    return
  const token = selectionToken.value
  void directory.load()
  if (!hasSettled.value) {
    if (selectedUploader.value === null)
      await loadAllViewVideos(3, token)
    else
      await loadUserMoments(selectedUploader.value, 3, token)
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

function resetFollowingAccountState(accountMid: AccountId) {
  const wasLoading = isLoading.value
  selectionToken.value++
  directory.reset()
  expandedGroupIds.value = [-10, 0]
  searchKeyword.value = ''
  selectedUploader.value = null
  previousSelectedUploader.value = null
  videoList.value = []
  allViewOffset.value = ''
  allViewUpdateBaseline.value = ''
  userMomentsOffset.value = ''
  liveListLoaded.value = false
  isLoading.value = false
  requestFailed.value = false
  needToLoginFirst.value = accountMid === null
  noMoreContent.value = false
  if (wasLoading)
    emit('afterLoading')
}

function ensureFollowingAccount() {
  const accountMid = getCurrentAccountMid()
  if (followingAccountInitialized && isSameAccount(loadedAccountMid, accountMid))
    return false

  loadedAccountMid = accountMid
  followingAccountInitialized = true
  resetFollowingAccountState(accountMid)
  if (accountMid !== null)
    initData()
  return true
}

onMounted(() => {
  isRefreshContextActive.value = true
  syncRefreshAvailability()
  const changed = ensureFollowingAccount()
  if (!changed)
    void resumeFollowingData()
  if (settings.value.followingUploaderSort === 'group')
    void directory.loadGroups()
  if (uploaderScrollRef.value)
    uploaderScrollRef.value.scrollTop = tabState.read('uploaderScrollTop', 0)

  // 确保在 nextTick 中调用，以保证所有依赖都已准备好
  nextTick(() => {
    initPageAction()
  })
})

watch(() => settings.value.followingUploaderSort, (sort) => {
  if (sort === 'group')
    void directory.loadGroups()
})

onUnmounted(() => {
  selectionToken.value++
  isRefreshContextActive.value = false
  if (tabState.isActiveTab())
    syncRefreshAvailability()
})

function initPageAction() {
  if (!tabState.isCurrent())
    return
  // VideoCardGrid owns infinite scrolling. Clear callbacks left by other kept-alive tabs.
  handleReachBottom.value = undefined

  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    initData()
  }
}

defineExpose({ initData })
</script>

<template>
  <div class="following-layout">
    <FollowingSidebar
      v-model:query="searchKeyword" v-model:expanded="expandedGroupIds"
      :uploaders="uploaderList" :groups="directory.groups.value" :grouped="settings.followingUploaderSort === 'group'"
      :account-id="loadedAccountMid" :selected="selectedUploader" :loading="directory.loading.value" :failed="directory.failed.value"
      :groups-loading="directory.groupsLoading.value" :groups-failed="directory.groupsFailed.value" :busy="groupWrites.busy.value"
      :load-groups="() => directory.loadGroups()" :load-member="directory.refreshMember" :write="groupWrites.submit"
      @select="selectUploader" @retry="directory.load()" @retry-groups="directory.loadGroups(true)"
      @scroll-element="uploaderScrollRef = $event"
    />

    <!-- Right Panel: Video Feed -->
    <div class="following-feed">
      <VideoCardGrid
        :key="gridKey"
        :items="videoList"
        :grid-layout="gridLayout"
        :loading="isLoading"
        :no-more-content="noMoreContent"
        :need-to-login-first="needToLoginFirst"
        :request-failed="requestFailed"
        :transform-item="transformVideoItem"
        :get-item-key="(item: VideoElement) => item.uniqueId"
        :show-watch-later="false"
        is-following-page
        show-preview
        @refresh="initData"
        @login="jumpToLoginPage"
        @load-more="handleLoadMore"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.following-layout {
  display: flex;
  gap: var(--bew-space-10);
  min-height: calc(100dvh - var(--bew-space-2));
}
.following-feed {
  flex: 1;
  min-width: 0;
}
</style>
