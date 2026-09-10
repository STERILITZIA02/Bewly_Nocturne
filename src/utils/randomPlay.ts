import { onRouteChange } from '~/composables/useRouteState'
import { hasPlayerMediaMutation, observePlayerDom } from '~/contentScripts/playerDomLifecycle'
import { settings } from '~/logic'
import type { CustomPlayOrderContext, RandomPlayOrder } from '~/logic/storage'
import { createCustomPlayControls, disposeCustomPlayControlsStyle, findCustomPlayControlsHost, getNativePlaylistRoots, mountCustomPlayControls, PLAYLIST_RECOMMENDATION_SELECTOR, PLAYLIST_ROOT_SELECTOR, updateCustomPlayControls } from '~/utils/customPlayControls'
import { debugLog } from '~/utils/debug'
import { i18n } from '~/utils/i18n'
import { RANDOM_PLAY_UI_RETRY_MAX, shouldRetryRandomPlayVideo } from '~/utils/randomPlayRetry'

import { applyAutoPlayByVideoType, detectVideoType, disableNativeEndPlaybackBehavior, getVideoElement, setCustomEndPlaybackHandlerActive, supportsCustomPlaybackForVideoType, VideoType } from './player'

// 随机播放状态管理
let isRandomPlayEnabled = false
let isRandomPlayInitialized = false
const visitedEpisodes = new Set<string>()
let originalEndedListener: (() => void) | null = null
let originalPauseListener: (() => void) | null = null
let listenerVideo: HTMLVideoElement | null = null
let stopVideoDomObserver: (() => void) | null = null
let isPageObserverInitialized = false
let pageObserver: MutationObserver | null = null
let pageObserverTarget: Node | null = null
let stopRouteChangeListener: (() => void) | null = null
let videoListenerRetryTimer: number | null = null
let videoListenerProcessingTimer: number | null = null
let videoListenerRetryCount = 0
let videoListenerGeneration = 0
let initializationTimer: number | null = null
let initializationRetryCount = 0
let randomPlayLifecycleGeneration = 0
let routeInitTimer: number | null = null
let domChangeTimer: number | null = null
let recreateTimer: number | null = null
let userManuallySetRandomPlay = false // 用户手动设置的随机播放状态标志
let customEpisodeOrder: string[] = []
let activePlayOrder: RandomPlayOrder | null = null
let playlistEditorController: AbortController | null = null
let playlistEditorButton: HTMLButtonElement | null = null
let playlistEditorStyle: HTMLStyleElement | null = null
const originalEpisodeOrders = new Map<HTMLElement, { priority: string, value: string }>()
const originalEpisodeDraggable = new Map<HTMLElement, boolean>()
const visuallyOrderedParents = new Set<HTMLElement>()

interface EpisodeEntry {
  element: HTMLElement
  key: string
  title: string
}

const episodeRootSelector = PLAYLIST_ROOT_SELECTOR

function queryEpisodeItems(selector: string): HTMLElement[] {
  const scopedItems = getNativePlaylistRoots()
    .flatMap(root => Array.from(root.querySelectorAll(selector)) as HTMLElement[])
  if (scopedItems.length > 0)
    return Array.from(new Set(scopedItems))

  return (Array.from(document.querySelectorAll(selector)) as HTMLElement[])
    .filter(element => !element.closest(PLAYLIST_RECOMMENDATION_SELECTOR))
}

function t(key: string): string {
  return String(i18n.global.t(key, settings.value.language))
}

function getActivePlayOrder(): RandomPlayOrder {
  return activePlayOrder ?? getEffectiveCustomPlayOrder() ?? 'sequential'
}

function getVideoTypeCustomPlayOrder(): RandomPlayOrder | null {
  if (!settings.value.enableCustomPlayOrderOverrides)
    return null

  let context: CustomPlayOrderContext | null = null
  switch (detectVideoType()) {
    case VideoType.MULTIPART:
      context = 'multipart'
      break
    case VideoType.COLLECTION:
      context = 'collection'
      break
    case VideoType.WATCH_LATER:
      context = 'watchLater'
      break
    case VideoType.PLAYLIST:
      context = 'playlist'
      break
  }

  if (!context)
    return null

  const order = settings.value.customPlayOrderOverrides[context]
  return order === 'sequential' || order === 'reverse' || order === 'random' ? order : null
}

function getDefaultCustomPlayOrder(): RandomPlayOrder | null {
  if (!supportsCustomPlaybackForVideoType())
    return null

  const order = settings.value.defaultCustomPlayOrder
  return order === 'sequential' || order === 'reverse' || order === 'random' ? order : null
}

function getEffectiveCustomPlayOrder(): RandomPlayOrder | null {
  if (!settings.value.enableRandomPlay)
    return null

  return getVideoTypeCustomPlayOrder() ?? getDefaultCustomPlayOrder()
}

// 获取视频选集
export function getVideoEpisodes(): HTMLElement[] {
  // A multipart manuscript can live inside a collection. Its custom order
  // must contain only its parts, not the collection's other manuscripts.
  const multipart = detectVideoType() === VideoType.MULTIPART
  const multipartSelector = '.video-pod__item, .multi-page__item, .page-item'
  const episodes = queryEpisodeItems(multipart
    ? multipartSelector
    : `${multipartSelector}, .video-pod__list .simple-base-item`)

  if (episodes.length > 0) {
    return episodes
  }
  if (multipart)
    return []

  // 合集视频选集（稍后再看、收藏夹等），只在明确的选集容器内查找，避免扫描评论区
  const collectionEpisodes = getNativePlaylistRoots()
    .flatMap(root => Array.from(root.querySelectorAll('.list-item, .episode-item, .section-item, .collect-item')) as HTMLElement[])
  const validCollectionEpisodes = collectionEpisodes.filter((item) => {
    const link = item.querySelector('a[href*="/video/"]')
    return link !== null
  })

  if (validCollectionEpisodes.length > 0) {
    return validCollectionEpisodes
  }

  return []
}

const recommendationRootSelector = PLAYLIST_RECOMMENDATION_SELECTOR

function getCustomPlayControlsHost(): HTMLElement | null {
  // A single-video page can still expose an auto-play control for the
  // recommendation list. Custom order controls belong only to a real episode
  // playlist, never to that recommendation block.
  if (detectVideoType() === VideoType.RECOMMEND)
    return null

  return findCustomPlayControlsHost(getVideoEpisodes())
}

function normalizeEpisodeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function getEpisodeLink(episode: HTMLElement): HTMLAnchorElement | null {
  return episode.matches('a[href]')
    ? episode as HTMLAnchorElement
    : episode.querySelector<HTMLAnchorElement>('a[href]')
}

function getEpisodeBaseKey(episode: HTMLElement, index: number): string {
  const datasetKey = [
    episode.dataset.bvid,
    episode.dataset.aid,
    episode.dataset.cid,
    episode.dataset.key,
    episode.dataset.index,
  ].find(Boolean)
  if (datasetKey)
    return `data:${datasetKey}`

  const link = getEpisodeLink(episode)
  if (link?.href) {
    try {
      const url = new URL(link.href, location.href)
      const page = url.searchParams.get('p')
      return `url:${url.pathname}${page ? `?p=${page}` : ''}`
    }
    catch {
      return `url:${link.getAttribute('href')}`
    }
  }

  const title = normalizeEpisodeText(
    episode.getAttribute('title')
    ?? episode.getAttribute('aria-label')
    ?? episode.querySelector<HTMLElement>('[title], .title, .title-txt, .name, .video-name')?.textContent
    ?? episode.textContent,
  )
  return `text:${title || index}`
}

function getEpisodeTitle(episode: HTMLElement, index: number): string {
  const titleElement = episode.querySelector<HTMLElement>(
    '.title, .title-txt, .name, .video-name, .video-pod__item-text, .page-part',
  )
  return normalizeEpisodeText(
    episode.getAttribute('aria-label')
    ?? episode.getAttribute('title')
    ?? titleElement?.getAttribute('title')
    ?? titleElement?.textContent
    ?? episode.textContent,
  ) || `${index + 1}`
}

function getEpisodeEntries(episodes = getVideoEpisodes()): EpisodeEntry[] {
  const keyOccurrences = new Map<string, number>()
  return episodes.map((element, index) => {
    const baseKey = getEpisodeBaseKey(element, index)
    const occurrence = keyOccurrences.get(baseKey) ?? 0
    keyOccurrences.set(baseKey, occurrence + 1)
    return {
      element,
      key: `${baseKey}#${occurrence}`,
      title: getEpisodeTitle(element, index),
    }
  })
}

function orderEpisodeEntries(entries: EpisodeEntry[]): EpisodeEntry[] {
  if (customEpisodeOrder.length === 0)
    return entries

  const orderIndex = new Map(customEpisodeOrder.map((key, index) => [key, index]))
  return [...entries].sort((a, b) => {
    const aIndex = orderIndex.get(a.key)
    const bIndex = orderIndex.get(b.key)
    if (aIndex === undefined && bIndex === undefined)
      return 0
    if (aIndex === undefined)
      return 1
    if (bIndex === undefined)
      return -1
    return aIndex - bIndex
  })
}

function getPlaybackEpisodeEntries(): EpisodeEntry[] {
  return orderEpisodeEntries(getEpisodeEntries())
}

// 获取当前选集索引
export function getCurrentEpisodeIndex(episodes: HTMLElement[]): number {
  const activeStateSelector = [
    '.video-pod__item.active',
    '.simple-base-item.active',
    '.multip-list-item-active',
    '.page-item.active',
    '.list-item.active',
    '.episode-item.active',
    '.section-item.active',
    '.collect-item.active',
    '[aria-current="true"]',
    '[aria-selected="true"]',
    '[data-active="true"]',
  ].join(', ')
  const activeIndex = episodes.findIndex((episode) => {
    return episode.classList.contains('active')
      || episode.classList.contains('current')
      || episode.classList.contains('on')
      || episode.classList.contains('multip-list-item-active')
      || episode.matches(activeStateSelector)
      || episode.querySelector(activeStateSelector) !== null
  })
  if (activeIndex >= 0)
    return activeIndex

  const currentUrl = new URL(location.href)
  const currentPath = currentUrl.pathname.replace(/\/$/, '')
  const currentPage = currentUrl.searchParams.get('p') ?? '1'
  const urlIndex = episodes.findIndex((episode) => {
    const link = getEpisodeLink(episode)
    if (!link?.href)
      return false
    try {
      const episodeUrl = new URL(link.href, location.href)
      return episodeUrl.pathname.replace(/\/$/, '') === currentPath
        && (episodeUrl.searchParams.get('p') ?? '1') === currentPage
    }
    catch {
      return false
    }
  })
  return urlIndex >= 0 ? urlIndex : 0
}

// 获取随机下一集
export function getRandomNextEpisode(episodes: HTMLElement[], currentIndex: number): number {
  if (episodes.length <= 1)
    return currentIndex

  const episodeKeys = getEpisodeEntries(episodes).map(entry => entry.key)
  const currentKey = episodeKeys[currentIndex]
  if (currentKey)
    visitedEpisodes.add(currentKey)

  // 如果所有视频都已访问，重置访问记录
  if (visitedEpisodes.size >= episodes.length) {
    visitedEpisodes.clear()
    if (currentKey)
      visitedEpisodes.add(currentKey)
  }

  // 获取未访问的视频索引
  const unvisitedIndices = episodes
    .map((_, index) => index)
    .filter(index => !visitedEpisodes.has(episodeKeys[index]))

  if (unvisitedIndices.length === 0) {
    // 如果没有未访问的视频，随机选择一个不是当前视频的
    const availableIndices = episodes
      .map((_, index) => index)
      .filter(index => index !== currentIndex)

    if (availableIndices.length === 0)
      return currentIndex
    const selected = availableIndices[Math.floor(Math.random() * availableIndices.length)]
    return selected
  }

  const selected = unvisitedIndices[Math.floor(Math.random() * unvisitedIndices.length)]
  return selected
}

export function getNextEpisodeIndex(
  episodes: HTMLElement[],
  currentIndex: number,
  order: RandomPlayOrder,
): number {
  if (episodes.length <= 1)
    return currentIndex

  if (order === 'sequential')
    return (currentIndex + 1) % episodes.length
  if (order === 'reverse')
    return (currentIndex - 1 + episodes.length) % episodes.length
  return getRandomNextEpisode(episodes, currentIndex)
}

// 跳转到指定选集
export function jumpToEpisode(episodes: HTMLElement[], targetIndex: number): void {
  if (targetIndex < 0 || targetIndex >= episodes.length) {
    return
  }

  const targetEpisode = episodes[targetIndex]
  const targetKey = getEpisodeEntries(episodes)[targetIndex]?.key

  // 尝试多种方式找到可点击的元素
  let clickableElement: HTMLElement | null = null

  // 1. 优先查找链接
  const link = targetEpisode.matches('a[href]')
    ? targetEpisode as HTMLAnchorElement
    : targetEpisode.querySelector<HTMLAnchorElement>('a[href]')

  if (link && link.href) {
    clickableElement = link
  }
  else {
    // 2. 查找 .simple-base-item 元素（B站新版播放列表项）
    const simpleBaseItem = targetEpisode.querySelector('.simple-base-item') as HTMLElement

    if (simpleBaseItem) {
      clickableElement = simpleBaseItem
    }
    else {
      // 3. 查找其他可能的可点击元素
      const baseItem = targetEpisode.querySelector('.base-item, .item, .video-item') as HTMLElement
      if (baseItem) {
        clickableElement = baseItem
      }
      else {
        // 4. 回退到父元素
        clickableElement = targetEpisode
      }
    }
  }

  if (!clickableElement) {
    debugLog('[Bewly Nocturne Random Play] No clickable element found')
    return
  }

  // 使用更智能的点击策略
  const performClick = () => {
    try {
      // 标记为已访问（在点击前标记，防止点击失败后重复尝试）
      if (targetKey)
        visitedEpisodes.add(targetKey)

      // 如果是链接，尝试点击
      if (clickableElement instanceof HTMLAnchorElement && clickableElement.href) {
        clickableElement.click()
        return
      }

      // 对于没有链接的元素（如 video-pod__item），只触发一次点击。
      // 重复派发 click 会让 B 站 Vue 路由执行两次卸载流程。
      clickableElement!.click()
    }
    catch (error) {
      console.error('[Bewly Nocturne Random Play] Click failed:', error)
    }
  }

  // 直接执行点击，不需要滚动
  // B站点击后会自动处理页面滚动和视频加载
  performClick()
}

function ensurePlaylistEditorStyle(): void {
  if (playlistEditorStyle?.isConnected)
    return

  playlistEditorStyle = document.createElement('style')
  playlistEditorStyle.textContent = `
    .bewly-random-play-order-parent {
      display: flex !important;
      flex-direction: column !important;
    }
    .bewly-random-play-editing-item {
      position: relative !important;
      cursor: grab !important;
      user-select: none !important;
      outline: 1px dashed var(--bew-theme-color, #00aeec) !important;
      outline-offset: -1px !important;
    }
    .bewly-random-play-editing-item:active {
      cursor: grabbing !important;
    }
    .bewly-random-play-dragging-item {
      opacity: 0.45 !important;
    }
    .random-play-edit-btn.is-editing {
      color: #fff !important;
      background: var(--bew-theme-color, #00aeec) !important;
    }
  `
  document.head.appendChild(playlistEditorStyle)
}

function applyCustomEpisodeVisualOrder(): void {
  if (customEpisodeOrder.length === 0)
    return

  const entries = orderEpisodeEntries(getEpisodeEntries())
  const parents = new Set(entries.map(entry => entry.element.parentElement).filter((parent): parent is HTMLElement => Boolean(parent)))
  const parentsNeedingLayout = Array.from(parents).filter((parent) => {
    const display = getComputedStyle(parent).display
    return display !== 'flex' && display !== 'inline-flex' && display !== 'grid' && display !== 'inline-grid'
  })
  for (const parent of parentsNeedingLayout) {
    parent.classList.add('bewly-random-play-order-parent')
    visuallyOrderedParents.add(parent)
  }

  entries.forEach((entry, index) => {
    if (!originalEpisodeOrders.has(entry.element)) {
      originalEpisodeOrders.set(entry.element, {
        value: entry.element.style.getPropertyValue('order'),
        priority: entry.element.style.getPropertyPriority('order'),
      })
    }
    entry.element.style.setProperty('order', String(index), 'important')
  })
}

function clearCustomEpisodeVisualOrder(): void {
  for (const [element, originalOrder] of originalEpisodeOrders) {
    if (originalOrder.value)
      element.style.setProperty('order', originalOrder.value, originalOrder.priority)
    else
      element.style.removeProperty('order')
  }
  originalEpisodeOrders.clear()
  for (const parent of visuallyOrderedParents)
    parent.classList.remove('bewly-random-play-order-parent')
  visuallyOrderedParents.clear()
}

function updatePlaylistEditorButton(editing: boolean): void {
  if (!playlistEditorButton)
    return
  playlistEditorButton.classList.toggle('is-editing', editing)
  playlistEditorButton.title = editing
    ? t('settings.random_play_finish_editing')
    : t('settings.random_play_edit_playlist')
  playlistEditorButton.setAttribute('aria-label', playlistEditorButton.title)
  playlistEditorButton.setAttribute('aria-pressed', String(editing))
}

export function isNativePlaylistEditing(): boolean {
  return playlistEditorController !== null
}

function stopNativePlaylistEditing(): void {
  playlistEditorController?.abort()
  playlistEditorController = null
  for (const [element, draggable] of originalEpisodeDraggable) {
    element.draggable = draggable
    element.classList.remove('bewly-random-play-editing-item', 'bewly-random-play-dragging-item')
  }
  originalEpisodeDraggable.clear()
  updatePlaylistEditorButton(false)
}

function reorderNativePlaylistItem(sourceKey: string, targetKey: string, insertAfter: boolean): void {
  const orderedKeys = getPlaybackEpisodeEntries().map(entry => entry.key)
  const sourceIndex = orderedKeys.indexOf(sourceKey)
  const targetIndex = orderedKeys.indexOf(targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
    return

  orderedKeys.splice(sourceIndex, 1)
  const adjustedTargetIndex = orderedKeys.indexOf(targetKey)
  orderedKeys.splice(adjustedTargetIndex + (insertAfter ? 1 : 0), 0, sourceKey)
  customEpisodeOrder = orderedKeys
  visitedEpisodes.clear()
  applyCustomEpisodeVisualOrder()
}

function startNativePlaylistEditing(button: HTMLButtonElement): void {
  stopNativePlaylistEditing()
  const entries = getPlaybackEpisodeEntries()
  if (entries.length <= 1) {
    button.title = t('settings.random_play_edit_playlist_empty')
    return
  }

  ensurePlaylistEditorStyle()
  playlistEditorButton = button
  playlistEditorController = new AbortController()
  const { signal } = playlistEditorController
  let draggedKey = ''
  let draggedParent: HTMLElement | null = null

  applyCustomEpisodeVisualOrder()
  for (const entry of entries) {
    const { element, key } = entry
    originalEpisodeDraggable.set(element, element.draggable)
    element.draggable = true
    element.classList.add('bewly-random-play-editing-item')
    element.addEventListener('dragstart', (event) => {
      draggedKey = key
      draggedParent = element.parentElement
      element.classList.add('bewly-random-play-dragging-item')
      event.dataTransfer?.setData('text/plain', key)
      if (event.dataTransfer)
        event.dataTransfer.effectAllowed = 'move'
    }, { signal })
    element.addEventListener('dragover', (event) => {
      if (!draggedKey || draggedKey === key || element.parentElement !== draggedParent)
        return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const insertAfter = event.clientY > rect.top + rect.height / 2
      reorderNativePlaylistItem(draggedKey, key, insertAfter)
    }, { signal })
    element.addEventListener('drop', event => event.preventDefault(), { signal })
    element.addEventListener('dragend', () => {
      draggedKey = ''
      draggedParent = null
      element.classList.remove('bewly-random-play-dragging-item')
    }, { signal })
    element.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }, { capture: true, signal })
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat || event.isComposing)
      return
    event.preventDefault()
    event.stopPropagation()
    stopNativePlaylistEditing()
  }, { signal })
  updatePlaylistEditorButton(true)
}

function toggleNativePlaylistEditing(button: HTMLButtonElement): void {
  if (playlistEditorController)
    stopNativePlaylistEditing()
  else
    startNativePlaylistEditing(button)
}

// 创建随机播放UI
export function createRandomPlayUI(): HTMLElement | null {
  if (!settings.value.enableRandomPlay)
    return null
  const host = getCustomPlayControlsHost()
  if (!host)
    return null

  // 检查是否已存在随机播放按钮
  const existingRandomPlay = document.querySelector<HTMLElement>('.random-play')
  if (existingRandomPlay) {
    if (existingRandomPlay.closest(recommendationRootSelector)) {
      existingRandomPlay.remove()
    }
    else {
      mountCustomPlayControls(existingRandomPlay, host)
      syncRandomPlayUI()
      return existingRandomPlay
    }
  }
  if (playlistEditorButton && !playlistEditorButton.isConnected)
    stopNativePlaylistEditing()
  activePlayOrder ??= getEffectiveCustomPlayOrder() ?? 'sequential'
  const controls = createCustomPlayControls({
    onOrderChange(order) {
      activePlayOrder = order
      visitedEpisodes.clear()
      setRandomPlayEnabled(true)
      userManuallySetRandomPlay = true
      syncRandomPlayUI()
    },
    onToggle() {
      setRandomPlayEnabled(!isRandomPlayEnabled)
      userManuallySetRandomPlay = true
      syncRandomPlayUI()
    },
    onEdit: toggleNativePlaylistEditing,
  })
  mountCustomPlayControls(controls, host)
  syncRandomPlayUI()
  return controls
}

function invalidateVideoListenerRetry() {
  videoListenerGeneration++
  videoListenerRetryCount = 0
  if (videoListenerRetryTimer !== null)
    clearTimeout(videoListenerRetryTimer)
  videoListenerRetryTimer = null
}

function detachRandomPlayVideoListeners() {
  if (listenerVideo && originalEndedListener)
    listenerVideo.removeEventListener('ended', originalEndedListener, true)
  if (listenerVideo && originalPauseListener)
    listenerVideo.removeEventListener('pause', originalPauseListener)
  originalEndedListener = null
  originalPauseListener = null
  listenerVideo?.removeAttribute('data-bewly-random-play-listener')
  listenerVideo = null
  if (videoListenerProcessingTimer !== null)
    clearTimeout(videoListenerProcessingTimer)
  videoListenerProcessingTimer = null
}

function stopRandomPlayVideoMonitoring() {
  detachRandomPlayVideoListeners()
  stopVideoDomObserver?.()
  stopVideoDomObserver = null
}

// 启用随机播放
export function enableRandomPlay(): void {
  invalidateVideoListenerRetry()
  const generation = videoListenerGeneration

  // 使用更可靠的方式监听视频结束
  const setupVideoListener = () => {
    if (!isRandomPlayEnabled || generation !== videoListenerGeneration)
      return

    const video = getVideoElement()
    if (!video) {
      if (!shouldRetryRandomPlayVideo(videoListenerRetryCount) || videoListenerRetryTimer !== null)
        return
      videoListenerRetryCount++
      videoListenerRetryTimer = window.setTimeout(() => {
        videoListenerRetryTimer = null
        if (generation === videoListenerGeneration)
          setupVideoListener()
      }, 1000)
      return
    }
    videoListenerRetryCount = 0
    if (videoListenerRetryTimer !== null) {
      clearTimeout(videoListenerRetryTimer)
      videoListenerRetryTimer = null
    }

    // 移除之前的监听器
    detachRandomPlayVideoListeners()
    listenerVideo = video

    // 标记视频元素，防止重复添加监听器
    video.setAttribute('data-bewly-random-play-listener', 'true')

    // 用于防止重复触发
    let isProcessing = false

    // 创建新的随机播放监听器
    const randomPlayListener = () => {
      if (generation !== videoListenerGeneration || !isRandomPlayEnabled || video !== getVideoElement())
        return

      // 防止重复触发（ended 和 pause 事件可能都会触发）
      if (isProcessing) {
        return
      }

      // 关键：检查随机播放是否仍然启用
      if (!isRandomPlayEnabled) {
        return
      }

      isProcessing = true

      // 在捕获阶段立即接管切集，避免被 B 站原生连播按 DOM 顺序抢先跳转。
      const episodes = getPlaybackEpisodeEntries().map(entry => entry.element)

      if (episodes.length <= 1) {
        isProcessing = false
        return
      }

      const currentIndex = getCurrentEpisodeIndex(episodes)

      const playOrder = getActivePlayOrder()
      const nextIndex = getNextEpisodeIndex(episodes, currentIndex, playOrder)

      if (nextIndex !== currentIndex)
        jumpToEpisode(episodes, nextIndex)
      if (videoListenerProcessingTimer !== null)
        clearTimeout(videoListenerProcessingTimer)
      videoListenerProcessingTimer = window.setTimeout(() => {
        videoListenerProcessingTimer = null
        isProcessing = false
      }, 1500)
    }

    // 监听多个事件以确保兼容性
    video.addEventListener('ended', randomPlayListener, true)
    // 有些情况下pause事件可能更可靠
    const randomPlayPauseListener = () => {
      // 检查是否是播放结束（当前时间和总时间相近）
      if (video.currentTime > 0 && video.duration > 0 && (video.duration - video.currentTime) < 1) {
        randomPlayListener()
      }
    }
    video.addEventListener('pause', randomPlayPauseListener)

    originalEndedListener = randomPlayListener
    originalPauseListener = randomPlayPauseListener
  }

  // 立即尝试设置监听器
  setupVideoListener()

  // 监听DOM变化，如果视频元素被替换，重新设置监听器
  stopVideoDomObserver?.()
  stopVideoDomObserver = observePlayerDom((mutations) => {
    if (generation !== videoListenerGeneration || !isRandomPlayEnabled)
      return
    // Recheck identity when media/root nodes change, even if the old video is
    // still connected. Danmaku and clock updates cannot replace the media.
    if (listenerVideo?.isConnected && !hasPlayerMediaMutation(mutations)) {
      return
    }
    const video = getVideoElement()
    if (video && video !== listenerVideo) {
      videoListenerRetryCount = 0
      setupVideoListener()
    }
  })
}

// 禁用随机播放
export function disableRandomPlay(): void {
  invalidateVideoListenerRetry()
  stopRandomPlayVideoMonitoring()

  // 清空访问记录
  visitedEpisodes.clear()
}

// 设置随机播放状态
export function setRandomPlayEnabled(enabled: boolean): void {
  isRandomPlayEnabled = enabled
  setCustomEndPlaybackHandlerActive(enabled)
  if (enabled) {
    disableNativeEndPlaybackBehavior()
    enableRandomPlay()
  }
  else {
    disableRandomPlay()
    applyAutoPlayByVideoType()
  }
}

// 获取随机播放状态
export function isRandomPlayActive(): boolean {
  return isRandomPlayEnabled
}

export function applyRandomPlayActivationSettings(): void {
  if (!isCustomPlayPage())
    return

  userManuallySetRandomPlay = false
  if (!settings.value.enableRandomPlay) {
    activePlayOrder = 'sequential'
    setRandomPlayEnabled(false)
    syncRandomPlayUI()
    return
  }

  const effectiveOrder = getEffectiveCustomPlayOrder()
  if (effectiveOrder) {
    activePlayOrder = effectiveOrder
    if (effectiveOrder === 'random') {
      if (settings.value.randomPlayMode === 'auto') {
        const minVideos = Number(settings.value.minVideosForRandom) || 1
        setRandomPlayEnabled(getVideoEpisodes().length >= minVideos)
      }
      else {
        setRandomPlayEnabled(false)
      }
    }
    else {
      setRandomPlayEnabled(false)
    }
  }
  else {
    activePlayOrder = 'sequential'
    setRandomPlayEnabled(false)
  }
  syncRandomPlayUI()
}

// 重置初始化状态
export function resetRandomPlayInitialization(): void {
  stopNativePlaylistEditing()
  randomPlayLifecycleGeneration++
  initializationRetryCount = 0
  clearRandomPlayLifecycleTimers()
  invalidateVideoListenerRetry()
  stopRandomPlayVideoMonitoring()
  isRandomPlayInitialized = false
  // 注意：这里不清除isRandomPlayEnabled，保持用户的选择
  // 也不清除userManuallySetRandomPlay标志，保持用户手动设置的状态
  visitedEpisodes.clear()
  customEpisodeOrder = []
  clearCustomEpisodeVisualOrder()
  playlistEditorButton = null
  document.querySelector('.random-play')?.remove()
}

export function destroyRandomPlay(): void {
  randomPlayLifecycleGeneration++
  initializationRetryCount = 0
  invalidateVideoListenerRetry()
  stopRouteChangeListener?.()
  stopRouteChangeListener = null
  isPageObserverInitialized = false
  stopRandomPlayPageObserver()
  clearRandomPlayLifecycleTimers()
  cleanupRandomPlayPage()
}

function cleanupRandomPlayPage(): void {
  stopNativePlaylistEditing()
  setRandomPlayEnabled(false)
  isRandomPlayInitialized = false
  userManuallySetRandomPlay = false
  visitedEpisodes.clear()
  customEpisodeOrder = []
  activePlayOrder = null
  clearCustomEpisodeVisualOrder()
  playlistEditorButton = null
  playlistEditorStyle?.remove()
  playlistEditorStyle = null
  disposeCustomPlayControlsStyle()
  document.querySelector('.random-play')?.remove()
}

function clearRandomPlayLifecycleTimers() {
  for (const timer of [initializationTimer, routeInitTimer, domChangeTimer, recreateTimer]) {
    if (timer !== null)
      clearTimeout(timer)
  }
  initializationTimer = null
  routeInitTimer = null
  domChangeTimer = null
  recreateTimer = null
}

function stopRandomPlayPageObserver() {
  pageObserver?.disconnect()
  pageObserver = null
  pageObserverTarget = null
}

// 同步UI状态（当UI重新创建时调用）
export function syncRandomPlayOrder(): void {
  visitedEpisodes.clear()
  activePlayOrder = getEffectiveCustomPlayOrder() ?? 'sequential'
  const existingSelect = document.querySelector<HTMLSelectElement>('.random-play-order-select')
  if (existingSelect)
    existingSelect.value = activePlayOrder
}

export function syncRandomPlayUI(): void {
  const controls = document.querySelector<HTMLElement>('.random-play')
  if (controls)
    updateCustomPlayControls(controls, getActivePlayOrder(), isRandomPlayEnabled, t)
  if (playlistEditorController)
    updatePlaylistEditorButton(true)
}

// 在视频页面初始化随机播放
export function initRandomPlayOnVideoPage(): void {
  if (!settings.value.enableRandomPlay || !isCustomPlayPage() || isRandomPlayInitialized || initializationTimer !== null)
    return

  const generation = randomPlayLifecycleGeneration
  const href = location.href
  // 等待页面元素加载
  const checkAndInit = () => {
    initializationTimer = null
    if (generation !== randomPlayLifecycleGeneration || href !== location.href || !settings.value.enableRandomPlay || !isCustomPlayPage() || isRandomPlayInitialized)
      return

    const controlsHost = getCustomPlayControlsHost()
    if (controlsHost) {
      initializationRetryCount = 0
      // 只要启用了随机播放功能就创建UI（基于扩展设置）
      if (settings.value.enableRandomPlay) {
        createRandomPlayUI()

        // 如果用户手动设置过随机播放状态，直接应用该状态
        if (userManuallySetRandomPlay) {
          // 保持用户手动设置的状态，无需重新设置
          syncRandomPlayUI()
          if (isRandomPlayEnabled)
            enableRandomPlay()
        }
        else {
          // 随机播放选择自动启用时由数量阈值决定；其余情况使用默认开关。
          applyRandomPlayActivationSettings()
        }

        isRandomPlayInitialized = true
      }
      return
    }

    if (initializationRetryCount >= RANDOM_PLAY_UI_RETRY_MAX)
      return
    initializationRetryCount++
    initializationTimer = window.setTimeout(checkAndInit, 100)
  }

  // 延迟初始化，确保页面完全加载
  initializationTimer = window.setTimeout(checkAndInit, 500)
}

// 监听页面变化
export function observeRandomPlayPageChanges(): void {
  if (isPageObserverInitialized)
    return
  isPageObserverInitialized = true

  const startPageObserver = () => {
    if (pageObserver || !document.body)
      return

    const observerTarget = getNativePlaylistRoots()[0]?.parentElement ?? document.body
    pageObserverTarget = observerTarget
    pageObserver = new MutationObserver((mutations) => {
      if (!isCustomPlayPage() || !settings.value.enableRandomPlay)
        return

      if (mutations.every(record => record.target instanceof Element
        && record.target.closest('.bpx-player-container, .bilibili-player')
        && !record.target.closest(episodeRootSelector)
        && ![...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => node instanceof Element
          && (node.matches(episodeRootSelector) || !!node.querySelector(episodeRootSelector))))) {
        return
      }

      const scopedTarget = getNativePlaylistRoots()[0]?.parentElement ?? document.body
      if (!pageObserverTarget?.isConnected || pageObserverTarget !== scopedTarget) {
        stopRandomPlayPageObserver()
        startPageObserver()
      }

      // Keep one scheduled update; native activity cannot defer it indefinitely.
      if (domChangeTimer !== null)
        return

      const generation = randomPlayLifecycleGeneration
      const href = location.href
      const isCurrent = () => generation === randomPlayLifecycleGeneration && href === location.href
        && isCustomPlayPage() && settings.value.enableRandomPlay
      domChangeTimer = window.setTimeout(() => {
        domChangeTimer = null
        if (!isCurrent())
          return
        if (customEpisodeOrder.length > 0)
          applyCustomEpisodeVisualOrder()

        // 检查是否需要重新初始化
        if (!isRandomPlayInitialized) {
          if (getCustomPlayControlsHost())
            initRandomPlayOnVideoPage()
          return
        }

        // 检查随机播放按钮是否还存在
        const existingBtn = document.querySelector('.random-play-btn')
        const controlsHost = getCustomPlayControlsHost()
        const existingRandomPlay = document.querySelector<HTMLElement>('.random-play')
        const isMisplacedRandomPlay = !!existingRandomPlay && existingRandomPlay.parentElement !== controlsHost

        // 如果按钮不存在但应该存在（有自动播放容器且启用了功能），则重新创建
        if ((!existingBtn || isMisplacedRandomPlay) && controlsHost && settings.value.enableRandomPlay) {
          if (recreateTimer === null) {
            recreateTimer = window.setTimeout(() => {
              recreateTimer = null
              if (!isCurrent() || !isRandomPlayInitialized)
                return
              createRandomPlayUI()
            }, 500)
          }
        }
      }, 300) // 300ms防抖延迟
    })

    pageObserver.observe(observerTarget, {
      childList: true,
      subtree: true,
    })
    // Track replacement of the scoped playlist container through the same
    // observer, without scanning unrelated descendants of the whole page.
    for (let parent = observerTarget.parentElement; parent; parent = parent.parentElement)
      pageObserver.observe(parent, { childList: true })
  }

  let lastPath = `${location.origin}${location.pathname}${location.search}`
  stopRouteChangeListener = onRouteChange((route) => {
    const nextPath = `${location.origin}${route.pathname}${route.search}`
    if (nextPath === lastPath)
      return

    lastPath = nextPath
    clearRandomPlayLifecycleTimers()
    stopRandomPlayPageObserver()
    resetRandomPlayInitialization()

    if (!isCustomPlayPage()) {
      cleanupRandomPlayPage()
      return
    }

    startPageObserver()
    const generation = randomPlayLifecycleGeneration
    routeInitTimer = window.setTimeout(() => {
      routeInitTimer = null
      if (generation === randomPlayLifecycleGeneration && nextPath === `${location.origin}${location.pathname}${location.search}` && isCustomPlayPage())
        initRandomPlayOnVideoPage()
    }, 1500)
  })

  if (isCustomPlayPage())
    startPageObserver()
}

// 初始化随机播放功能
export function initRandomPlay(): void {
  if (isCustomPlayPage()) {
    initRandomPlayOnVideoPage()
  }

  observeRandomPlayPageChanges()
}

// 判断是否是视频页面
export function isCustomPlayPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/(?:video|list)\/.*/.test(window.location.href)
}
