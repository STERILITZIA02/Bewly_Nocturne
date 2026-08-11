import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { useBewlyApp } from '~/composables/useAppProvider'
import { appAuthTokens, settings } from '~/logic'
import type { VideoInfo } from '~/models/video/videoInfo'
import type { VideoPreviewResult } from '~/models/video/videoPreview'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getTvSign, TVAppKey } from '~/utils/authProvider'
import { calcCurrentTime, numFormatter, parseStatNumber } from '~/utils/dataFormatter'
import { computeFloatingMenuPosition } from '~/utils/floatingMenu'
import { getCSRF, removeHttpFromUrl } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { openLinkInBackground } from '~/utils/tabs'
import { resolveWatchLaterAid } from '~/utils/watchLater'

import type { Video } from '../types'
import { getCurrentTime, getCurrentVideoUrl } from '../utils'
import { releaseVideoPreviewCacheEntry, retainVideoPreviewCacheEntry } from './videoPreviewCache'

interface VideoCardProps {
  skeleton?: boolean
  video?: Video
  type?: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'
  showWatchLater?: boolean
  horizontal?: boolean
  showPreview?: boolean
  moreBtn?: boolean
}

interface AppFeedFeedbackSelection {
  reasonId?: number
  feedbackId?: number
}

function createAppFeedFeedbackParams(video: Video, selection?: AppFeedFeedbackSelection) {
  return {
    access_key: appAuthTokens.value.accessToken,
    goto: video.goto,
    id: video.param || video.id,
    reason_id: selection?.reasonId,
    feedback_id: selection?.feedbackId,
    build: 1,
    mobi_app: 'android',
    appkey: TVAppKey.appkey,
    ts: Math.floor(Date.now() / 1000).toString(),
  }
}

export function useVideoCardLogic(propsOrGetter: MaybeRefOrGetter<VideoCardProps>) {
  const toast = useToast()
  const { t } = useI18n()
  const { openIframeDrawer } = useBewlyApp()
  const topBarStore = useTopBarStore()

  // 将传入的 props 转换为 computed，确保响应式
  const props = computed(() => toValue(propsOrGetter))

  // Inject selectedUploader from Following component (if available)
  // This is used to control preview loading for moments feed
  const momentsSelectedUploader = inject<Ref<number | null>>('moments-selected-uploader', ref(null))

  // Refs
  const showVideoOptions = ref<boolean>(false)
  const videoOptionsFloatingStyles = ref<CSSProperties>({})
  const removed = ref<boolean>(false)
  const moreBtnRef = ref<HTMLDivElement | null>(null)
  const contextMenuRef = ref<HTMLDivElement | null>(null)
  const selectedDislikeOpt = ref<AppFeedFeedbackSelection>()
  const videoCurrentTime = ref<number | null>(null)
  const resolvedWatchLaterAid = ref<number>()
  const isUpdatingWatchLater = ref(false)
  let watchLaterResolutionId = 0
  let previewRequestGeneration = 0
  const watchLaterAid = computed(() => {
    const video = props.value.video
    if (!video)
      return undefined
    if (resolvedWatchLaterAid.value)
      return resolvedWatchLaterAid.value
    if (video.aid)
      return video.aid
    return undefined
  })
  const isInWatchLater = computed(() => {
    return watchLaterAid.value !== undefined
      && topBarStore.isInWatchLater(watchLaterAid.value)
  })
  const isHover = ref<boolean>(false)
  const isPreviewFullscreen = ref<boolean>(false)
  const mouseEnterTimeOut = ref<number | null>(null)
  const mouseLeaveTimeOut = ref<number | null>(null)
  const previewVideoUrl = ref<string>('')
  const contentVisibility = ref<'auto' | 'visible'>('auto')
  const videoElement = ref<HTMLVideoElement | null>(null)
  const cardRootRef = ref<HTMLElement | null>(null)
  const isDisposed = ref<boolean>(false) // 跟踪组件是否已卸载
  const previewCacheKey = Symbol('video-preview-cache')

  function clearPreviewVideoUrl() {
    previewVideoUrl.value = ''
  }

  // 清理函数 - 在组件卸载时调用
  onScopeDispose(() => {
    isDisposed.value = true
    previewRequestGeneration++
    releaseVideoPreviewCacheEntry(previewCacheKey)

    // 清除所有待处理的超时
    if (mouseEnterTimeOut.value) {
      clearTimeout(mouseEnterTimeOut.value)
      mouseEnterTimeOut.value = null
    }
    if (mouseLeaveTimeOut.value) {
      clearTimeout(mouseLeaveTimeOut.value)
      mouseLeaveTimeOut.value = null
    }

    // 重置hover状态
    isHover.value = false
  })

  // Computed
  const videoUrl = computed(() => {
    if (removed.value || !props.value.video)
      return undefined

    let url = ''
    if (props.value.video.url)
      url = props.value.video.url
    else if (props.value.video.bvid || props.value.video.aid)
      url = getCurrentVideoUrl(props.value.video, videoCurrentTime)
    else if (props.value.video.epid)
      url = `https://www.bilibili.com/bangumi/play/ep${props.value.video.epid}/`
    else if (props.value.video.roomid)
      url = `https://live.bilibili.com/${props.value.video.roomid}/`
    else
      return ''

    try {
      const urlObj = new URL(url)
      if (!urlObj.pathname.endsWith('/')) {
        urlObj.pathname += '/'
      }
      return urlObj.toString()
    }
    catch {
      return url
    }
  })

  const videoStatNumbers = computed(() => {
    if (!props.value.video) {
      return {
        view: undefined,
        danmaku: undefined,
        like: undefined,
      }
    }

    const { view, viewStr, danmaku, danmakuStr, like, likeStr } = props.value.video

    return {
      view: parseStatNumber(view ?? viewStr),
      danmaku: parseStatNumber(danmaku ?? danmakuStr),
      like: parseStatNumber(like ?? likeStr),
    }
  })

  const shouldHideOverlayElements = computed(() =>
    props.value.showPreview
    && settings.value.enableVideoPreview
    && isHover.value
    && previewVideoUrl.value
    && topBarStore.isLogin,
  )

  // Helper function to extract author mids from video
  function getAuthorMids(video?: Video): number[] {
    if (!video?.author)
      return []

    // author can be a single Author object or an array of Authors
    const authors = Array.isArray(video.author) ? video.author : [video.author]
    return authors
      .map(author => author.mid)
      .filter((mid): mid is number => typeof mid === 'number')
  }

  // Watch
  watch([
    () => props.value.video,
    () => props.value.showWatchLater,
    () => topBarStore.userInfo.mid,
  ], async ([video, showWatchLater]) => {
    const resolutionId = ++watchLaterResolutionId
    resolvedWatchLaterAid.value = undefined
    if (!video || !showWatchLater)
      return

    await topBarStore.ensureWatchLaterState()
    if (resolutionId !== watchLaterResolutionId)
      return
    if (watchLaterAid.value)
      return

    try {
      const aid = await resolveWatchLaterAid(video)
      if (resolutionId === watchLaterResolutionId)
        resolvedWatchLaterAid.value = aid
    }
    catch (error) {
      if (!isExtensionContextInvalidatedError(error))
        console.error('获取视频稍后再看状态失败:', error)
    }
  }, { immediate: true })

  watch([
    () => props.value.video,
    isHover,
    () => props.value.showPreview,
    () => settings.value.enableVideoPreview,
    () => topBarStore.isLogin,
    momentsSelectedUploader,
  ], async ([video, hover, showPreview, enableVideoPreview, isLogin]) => {
    const generation = ++previewRequestGeneration
    clearPreviewVideoUrl()

    if (!video || !hover || !showPreview || !enableVideoPreview || !isLogin || isDisposed.value)
      return

    const isCurrentRequest = () => generation === previewRequestGeneration
      && !isDisposed.value
      && isHover.value
      && props.value.video === video
      && props.value.showPreview
      && settings.value.enableVideoPreview
      && topBarStore.isLogin

    if (momentsSelectedUploader.value !== null) {
      const authorMids = getAuthorMids(video)
      if (!authorMids.includes(momentsSelectedUploader.value))
        return
    }

    if (video.roomid) {
      try {
        const res = await api.live.getLivePlayUrl({
          cid: video.roomid,
          platform: 'web',
          qn: 80,
        })
        if (isCurrentRequest() && res.code === 0 && res.data.durl?.length)
          previewVideoUrl.value = res.data.durl[0].url
      }
      catch {
        // Ignore preview request errors.
      }
      return
    }

    if (!video.aid && !video.bvid)
      return

    let cid = video.cid
    if (!cid && video.bvid) {
      try {
        const res: VideoInfo = await api.video.getVideoInfo({ bvid: video.bvid })
        if (!isCurrentRequest())
          return
        if (res.code === 0)
          cid = res.data.cid
      }
      catch {
        // Ignore preview request errors.
      }
    }

    if (!isCurrentRequest())
      return

    try {
      const res: VideoPreviewResult = await api.video.getVideoPreview({
        bvid: video.bvid,
        cid,
      })
      if (isCurrentRequest() && res.code === 0 && res.data.durl?.length)
        previewVideoUrl.value = res.data.durl[0].url
    }
    catch {
      // Ignore preview request errors.
    }
  })

  watch([previewVideoUrl, isHover], ([url, hover]) => {
    if (!url) {
      releaseVideoPreviewCacheEntry(previewCacheKey)
      return
    }

    retainVideoPreviewCacheEntry(previewCacheKey, clearPreviewVideoUrl, hover)
  }, { immediate: true })

  // Methods
  async function toggleWatchLater() {
    if (!props.value.video || isUpdatingWatchLater.value)
      return

    const video = props.value.video
    isUpdatingWatchLater.value = true
    try {
      await topBarStore.ensureWatchLaterState()
      const accountId = topBarStore.userInfo.mid
      if (!topBarStore.isLogin || !accountId)
        return
      const aid = watchLaterAid.value ?? await resolveWatchLaterAid(video)
      if (props.value.video !== video)
        return
      if (!aid) {
        toast.error(t('video_card.watch_later_unavailable'))
        return
      }
      resolvedWatchLaterAid.value = aid

      if (!isInWatchLater.value) {
        const res = await api.watchlater.saveToWatchLater({
          ...(video.bvid ? { bvid: video.bvid } : { aid }),
          csrf: getCSRF(),
        })
        if (res.code !== 0) {
          toast.error(res.message)
          return
        }
        await topBarStore.commitWatchLaterMutation(aid, true, accountId)
      }
      else {
        const res = await api.watchlater.removeFromWatchLater({
          aid,
          csrf: getCSRF(),
        })
        if (res.code !== 0) {
          toast.error(res.message)
          return
        }
        await topBarStore.commitWatchLaterMutation(aid, false, accountId)
      }
    }
    catch (error) {
      console.error('更新稍后再看失败:', error)
      toast.error(t('video_card.watch_later_update_failed'))
    }
    finally {
      isUpdatingWatchLater.value = false
    }
  }

  function handleMouseEnter() {
    // Cancel any pending leave timeout
    if (mouseLeaveTimeOut.value) {
      clearTimeout(mouseLeaveTimeOut.value)
      mouseLeaveTimeOut.value = null
    }

    // fix #789
    contentVisibility.value = 'visible'
    if (mouseEnterTimeOut.value)
      clearTimeout(mouseEnterTimeOut.value)
    const previewEnabled = props.value.showPreview && settings.value.enableVideoPreview
    const delay = previewEnabled
      ? (settings.value.hoverVideoCardDelayed ? 1200 : 500)
      : 1000
    mouseEnterTimeOut.value = window.setTimeout(() => {
      mouseEnterTimeOut.value = null
      isHover.value = true
    }, delay)
  }

  function handelMouseLeave() {
    // Cancel any pending enter timeout
    if (mouseEnterTimeOut.value) {
      clearTimeout(mouseEnterTimeOut.value)
      mouseEnterTimeOut.value = null
    }

    // Delay hiding to prevent flicker when mouse hovers near boundaries
    if (mouseLeaveTimeOut.value)
      clearTimeout(mouseLeaveTimeOut.value)

    mouseLeaveTimeOut.value = window.setTimeout(() => {
      mouseLeaveTimeOut.value = null

      // Entering native fullscreen moves the video into the browser's top layer,
      // which makes the card receive mouseleave even though the preview is still active.
      if (isPreviewFullscreen.value)
        return

      contentVisibility.value = 'auto'
      isHover.value = false
    }, 100) // Short delay to debounce boundary hover
  }

  function handlePreviewFullscreenChange(isFullscreen: boolean) {
    isPreviewFullscreen.value = isFullscreen

    if (isFullscreen) {
      if (mouseLeaveTimeOut.value) {
        clearTimeout(mouseLeaveTimeOut.value)
        mouseLeaveTimeOut.value = null
      }
      contentVisibility.value = 'visible'
      isHover.value = true
      return
    }

    // A suppressed mouseleave is not fired again after fullscreen exits. Reconcile
    // the actual pointer position so an off-card preview can release its resources.
    if (!cardRootRef.value?.matches(':hover')) {
      contentVisibility.value = 'auto'
      isHover.value = false
    }
  }

  function handleClick(event: MouseEvent) {
    videoCurrentTime.value = getCurrentTime(videoElement)
    if (settings.value.videoCardLinkOpenMode === 'background' && videoUrl.value && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      openLinkInBackground(videoUrl.value)
    }
    if (settings.value.videoCardLinkOpenMode === 'drawer' && videoUrl.value && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      openIframeDrawer(videoUrl.value)
    }
  }

  function handleMoreBtnClick() {
    if (!moreBtnRef.value)
      return
    const anchor = moreBtnRef.value.getBoundingClientRect()
    const position = computeFloatingMenuPosition(anchor, window.innerWidth, window.innerHeight)

    showVideoOptions.value = false
    videoOptionsFloatingStyles.value = {
      position: 'fixed',
      top: `${position.top}px`,
      left: `${position.left}px`,
      width: `${position.width}px`,
      maxHeight: `${position.maxHeight}px`,
    }
    showVideoOptions.value = true
  }

  function handleUndo() {
    const video = props.value.video

    if (props.value.type === 'appRcmd' && video) {
      const params = createAppFeedFeedbackParams(video, selectedDislikeOpt.value)

      api.video.undoDislikeVideo({
        ...params,
        sign: getTvSign(params),
      }).then((res) => {
        if (res.code === 0) {
          removed.value = false
        }
        else {
          toast.error(res.message)
        }
      })
    }
    else {
      removed.value = false
    }
  }

  function handleRemoved(selectedOpt?: AppFeedFeedbackSelection) {
    selectedDislikeOpt.value = selectedOpt
    removed.value = true
  }

  return {
    // Refs
    showVideoOptions,
    videoOptionsFloatingStyles,
    removed,
    moreBtnRef,
    contextMenuRef,
    videoCurrentTime,
    isInWatchLater,
    isHover,
    isPreviewFullscreen,
    previewVideoUrl,
    contentVisibility,
    videoElement,
    cardRootRef,

    // Computed
    videoUrl,
    videoStatNumbers,
    shouldHideOverlayElements,

    // Methods
    clearPreviewVideoUrl,
    toggleWatchLater,
    handleMouseEnter,
    handelMouseLeave,
    handlePreviewFullscreenChange,
    handleClick,
    handleMoreBtnClick,
    handleUndo,
    handleRemoved,
    removeHttpFromUrl,
    calcCurrentTime,
    numFormatter,
  }
}
