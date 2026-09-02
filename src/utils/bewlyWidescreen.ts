import { watch } from 'vue'
import browser from 'webextension-polyfill'

import type { BewlyWidescreenManualToggleDetail } from '~/constants/globalEvents'
import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS, BEWLY_WIDESCREEN_MANUAL_TOGGLE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import type { Data as VideoInfoData, VideoInfo } from '~/models/video/videoInfo'

import api from './api'
import { setupWidescreenDanmakuSemantics } from './bewlyWidescreenNative'
import type { WidescreenMutationOrigin } from './bewlyWidescreenPolicy'
import { canCommitWidescreenLayout, clampWidescreenSidebarWidth, isWidescreenBottomControlHoverRegion, isWidescreenPlayerControlHoverRegion, resolveWidescreenAnchoredPlayerGeometry, resolveWidescreenCenterGeometry, resolveWidescreenControlSurfaceState, resolveWidescreenEngagedState, resolveWidescreenSidebarHoverExpanded, resolveWidescreenSidebarResizeWidth, shortenCommentDateText, shouldContinueWidescreenSidebarHydration, shouldScheduleWidescreenRefresh, WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY, WIDESCREEN_SIDEBAR_DEFAULT_MAX_WIDTH, WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY, WIDESCREEN_SIDEBAR_MAX_VIEWPORT_RATIO, WIDESCREEN_SIDEBAR_MIN_WIDTH, WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH } from './bewlyWidescreenPolicy'
import { isBilibiliRiskControl } from './bilibiliApiError'
import { i18n } from './i18n'
import { ensureInterfaceLanguage } from './interfaceLanguage'
import { injectCSS } from './main'
import { reportRuntimeFailure } from './messaging'
import { getVideoElement } from './player'
import { initVerticalVideoZoom } from './verticalVideoZoom'

type BewlyWidescreenTab = 'comment' | 'danmaku' | 'playlist'
type BewlyWidescreenSidebarLayout = 'compact' | 'expanded'

interface MovedNode {
  node: HTMLElement
  placeholder: HTMLElement
  originalParent: Node
}

interface WidescreenSidebarReadiness {
  top: boolean
  comment: boolean
  danmaku: boolean
  playlist: boolean
  complete: boolean
}

interface CommentPrewarmState {
  root: HTMLElement
  styleAttribute: string | null
}

interface BewlyWidescreenState {
  root: HTMLElement
  stage: HTMLElement
  playerEl: HTMLElement
  playerSlot: HTMLElement
  playerFrame: HTMLElement
  danmakuDock: HTMLElement
  sidebarEl: HTMLElement
  sidebarTop: HTMLElement
  titleNoticeSlot: HTMLElement
  metadataSlot: HTMLElement
  upSlot: HTMLElement
  toolbarSlot: HTMLElement
  descriptionSlot: HTMLElement
  tagsSlot: HTMLElement
  panels: Record<BewlyWidescreenTab, HTMLElement>
  tabButtons: Record<BewlyWidescreenTab, HTMLButtonElement>
  playlistToggleButton: HTMLButtonElement
  sidebarResizer: HTMLDivElement
  sidebarToggleButton: HTMLButtonElement
  movedNodes: MovedNode[]
  styleEl: HTMLStyleElement
  activeTab: BewlyWidescreenTab
  sidebarLayout: BewlyWidescreenSidebarLayout
  sidebarPosition: 'left' | 'right'
  resizeObserver?: ResizeObserver
  mutationObserver?: MutationObserver
  playerStateObserver?: MutationObserver
  toolbarMutationObserver?: MutationObserver
  toolbarResizeObserver?: ResizeObserver
  themeObserver?: MutationObserver
  metadataListener?: () => void
  resizeSyncFrame?: number
  actionGeometryFrame?: number
  actionGeometryElements?: Set<HTMLElement>
  layoutEventCleanup?: () => void
  settingsWatchCleanup?: Array<() => void>
  sidebarHydrationTimer?: ReturnType<typeof setTimeout>
  sidebarHydrationWarningShown?: boolean
  sidebarInteractionCleanup?: () => void
  sidebarToggleAutoHideCleanup?: () => void
  activeControlCleanup?: () => void
  descriptionCleanup?: () => void
  playlistToggleCleanup?: () => void
  danmakuActivationTimer?: ReturnType<typeof setTimeout>
  danmakuResizeTimers?: Array<ReturnType<typeof setTimeout>>
  danmakuActivatedSource?: HTMLElement
  danmakuPendingSource?: HTMLElement
  danmakuSemanticsCleanup?: () => void
  danmakuSettingsCleanup?: () => void
  danmakuSemanticsSource?: HTMLElement
  danmakuSourceHost?: HTMLElement
  danmakuGlass?: HTMLElement
  controlsGlassAppliedHeight?: number
  highEnergyProgressElement?: HTMLElement
  highEnergyProgressObserver?: MutationObserver
  escapeKeyCleanup?: () => void
  colorProbe?: HTMLSpanElement
  descriptionExpanded: boolean
  playlistCollapsed: boolean
  hydratedTabs: Set<BewlyWidescreenTab>
  initialScrollResetTabs: Set<BewlyWidescreenTab>
  panelScrollFrames: Map<BewlyWidescreenTab, number>
  videoInfoData?: VideoInfoData
  videoInfoIdentity?: string
  bottomControlsHovered: boolean
  playerPointerInside: boolean
}

const ROOT_ID = 'bewly-widescreen-root'
const LOADING_ROOT_ID = 'bewly-widescreen-loading'
const BODY_CLASS = 'bewly-widescreen-active'
const NATIVE_PLAYER_CLASS = 'bewly-widescreen-native-player'
const EMPTY_CLASS = 'bewly-widescreen-empty'
const DANMAKU_SKELETON_CLASS = 'bewly-widescreen-danmaku-skeleton'
const DANMAKU_SOURCE_CLASS = 'bewly-widescreen-danmaku-source'
const DANMAKU_SOURCE_HOST_CLASS = 'bewly-widescreen-danmaku-source-host'
const DANMAKU_GLASS_CLASS = 'bewly-widescreen-danmaku-glass'
const DANMAKU_SURFACE_SELECTOR = `:is(#${ROOT_ID} .bewly-widescreen-danmaku-dock, body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .${DANMAKU_SOURCE_HOST_CLASS})`
const EPISODE_SECTION_CLASS = 'bewly-widescreen-episode-section'
const EPISODE_ITEM_SELECTOR = '.video-pod__item, .multi-page__item, .page-item, .list-item, .episode-item, .section-item, .collect-item'
const SIDEBAR_RESIZE_KEYBOARD_STEP = 16
const SIDEBAR_MAX_VIEWPORT_PERCENT = WIDESCREEN_SIDEBAR_MAX_VIEWPORT_RATIO * 100
const MOBILE_BREAKPOINT = 900
const LOADING_FADE_DURATION = 240
const LOADING_EXIT_DELAY = 5000
const PREPARED_LOADING_TIMEOUT = 30_000
const READY_POLL_INTERVAL = 100
const READY_POLL_FAST_DURATION = 5000
const READY_POLL_SLOW_INTERVAL = 500
const READY_STABILITY_DELAY = 160
const TRANSFER_SETTLE_DELAY = 1200
const PAGE_READY_FALLBACK_DELAY = 3000
const SIDEBAR_HYDRATION_FAST_DURATION = 1500
const SIDEBAR_HYDRATION_FAST_INTERVAL = 100
const SIDEBAR_HYDRATION_INTERVAL = 250
const SIDEBAR_HYDRATION_TIMEOUT = 12_000
const SIDEBAR_TOGGLE_IDLE_DELAY = 1000
const DANMAKU_RESIZE_DELAYS = [0, 80, 180, 360, 720] as const
const BILIBILI_ACTION_ANIMATION_HUE = 196
const COMMENT_ROOT_ID_SELECTOR = '#comment-module, #comment-body, #commentapp'
const COMMENT_NESTED_UI_SELECTOR = '.reply-item, .sub-reply-item, bili-comment-renderer'
// Light-DOM markers only. Modern bili-comments mounts most UI in shadow roots,
// so readiness must not require these descendants to exist.
const COMMENT_CONTENT_MARKER_SELECTOR = 'bili-comments, bili-comment-box, bili-comment-renderer, .reply-list, .comment-list, .reply-box, .comment-header'
const COMMENT_SHADOW_HOST_SELECTOR = 'bili-comments, bili-comment-box, bili-comment-renderer, bili-comment-thread-renderer'
const DANMAKU_LIST_VIEWPORT_SELECTOR = '.bui-long-list-list, .bpx-player-dm-container'
const DANMAKU_LIST_ITEM_SELECTOR = '.bui-long-list-item, .bpx-player-dm-item, .bui-long-list-list > li, .bui-long-list-list > [data-index]'
const DANMAKU_EMPTY_STATE_SELECTOR = '.bpx-player-dm-empty, .bui-empty, [class*="dm-empty"], [class*="danmaku-empty"]'
const COMMENT_TIME_SELECTOR = [
  '.reply-time',
  '.sub-reply-time',
  '.reply-time-location',
  '.comment-time',
  'bili-comment-user-info .time',
  'bili-comment-user-info .pubdate',
].join(',')

let state: BewlyWidescreenState | null = null
let loadingOverlay: HTMLElement | null = null
let loadingStyleEl: HTMLStyleElement | null = null
let loadingFadeTimer: ReturnType<typeof setTimeout> | undefined
let loadingFadeFrame: number | undefined
let loadingPlaybackCleanup: (() => void) | undefined
let loadingPreparationFallbackTimer: ReturnType<typeof setTimeout> | undefined
let loadingExitTimer: ReturnType<typeof setTimeout> | undefined
let loadingMayDismissOnPlaying = false
let loadingSuppressedUntilExit = false
let readyObserver: MutationObserver | undefined
let readyFrame: number | undefined
let readyMetadataHandler: ((event: Event) => void) | undefined
let readyPollTimer: ReturnType<typeof setTimeout> | undefined
let pageReadyFallbackTimer: ReturnType<typeof setTimeout> | undefined
let sidebarRefreshFrame: number | undefined
let pageReadyHandler: (() => void) | undefined
let pageReadyForLayout = false
let playerReadyForLayout = false
let contentReadyForLayout = false
let pageReadySince: number | undefined
let readinessStableSince: number | undefined
let commentPrewarmState: CommentPrewarmState | undefined
let waitingForLoad = false
let enteringWidescreen = false
let pendingSidebarPosition: 'left' | 'right' = 'right'
let stopLanguageWatch: (() => void) | undefined

const HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS = [
  '.bpx-player-ctrl-wide',
  '.bilibili-player-video-btn-widescreen',
  '.squirtle-video-widescreen',
  '.bpx-player-ctrl-web',
  '.bilibili-player-video-web-fullscreen',
  '.squirtle-video-pagefullscreen',
  '.bpx-player-ctrl-full',
  '.bilibili-player-video-btn-fullscreen',
  '.squirtle-video-fullscreen',
] as const

const NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR = [
  '.bpx-player-control-wrap',
  '.bilibili-player-video-control-wrap',
  '.bilibili-player-video-control',
  '.squirtle-controller',
].join(',')
const HIGH_ENERGY_PROGRESS_SELECTOR = '.bpx-player-pbp'
const HIGH_ENERGY_PROGRESS_PIN_SELECTOR = '.bpx-player-pbp-pin'

const MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR = [
  ...HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS,
  '.bpx-player-ctrl-full',
  '.bilibili-player-video-btn-fullscreen',
  '.squirtle-video-fullscreen',
].join(',')

function leaveMutuallyExclusivePlayerModes() {
  const fullscreenDocument = document as Document & {
    webkitExitFullscreen?: () => void
    webkitFullscreenElement?: Element | null
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch((error) => {
      console.warn('[Bewly Nocturne] Failed to exit browser fullscreen before entering Widescreen:', error)
    })
  }
  else if (fullscreenDocument.webkitFullscreenElement) {
    fullscreenDocument.webkitExitFullscreen?.()
  }

  const leaveMode = (mode: 'web' | 'wide', controlSelector: string) => {
    const control = document.querySelector<HTMLElement>(controlSelector)
    if (document.querySelector(`[data-screen='${mode}']`) || control?.classList.contains('bpx-state-entered'))
      control?.click()
  }
  leaveMode('web', '.bpx-player-ctrl-web,.bilibili-player-video-web-fullscreen,.squirtle-video-pagefullscreen')
  leaveMode('wide', '.bpx-player-ctrl-wide,.bilibili-player-video-btn-widescreen,.squirtle-video-widescreen')
  exitNativeMiniPlayer()
}

function exitNativeMiniPlayer(root: ParentNode = document) {
  const container = root instanceof HTMLElement && root.matches('.bpx-player-container')
    ? root
    : root.querySelector<HTMLElement>('.bpx-player-container')
  if (container?.dataset.screen !== 'mini')
    return false

  container.querySelector<HTMLElement>('.bpx-player-mini-close')?.click()
  return true
}

const selectors = {
  player: [
    '#playerWrap',
    '#bilibili-player',
    '#bilibiliPlayer',
    '.bpx-player-container',
    '.player-wrap',
  ],
  title: [
    '.video-title',
    'h1.video-title',
    '.video-info-title h1',
    '.bpx-player-top-title',
    '[class*="mediainfo_mediaTitle"]',
    '#viewbox_report .title',
    'h1[title]',
  ],
  titleNotice: [
    '.video-argue',
  ],
  upPanel: [
    '.up-panel-container',
    '.up-info-container',
    '.up-info',
    '.upinfo',
  ],
  toolbar: [
    '#arc_toolbar_report',
    '.video-toolbar-container',
  ],
  metadata: [
    '.video-info-meta',
  ],
  description: [
    '#v_desc',
    '.video-desc-container',
  ],
  tags: [
    '.video-tag-container',
    '#v_tag',
  ],
  danmakuInput: [
    '.bpx-player-sending-bar',
    '.bilibili-player-video-sendbar',
    '.bilibili-player-video-inputbar',
  ],
  danmakuFocusable: [
    '.danmaku-wrap .bui-collapse-header',
    '.danmaku-box .bui-collapse-header',
    '.danmaku-wrap .bpx-player-dm-setting-left',
    '.danmaku-box .bpx-player-dm-setting-left',
  ],
  comment: [
    '#comment-module',
    '#comment-body',
    '#commentapp',
    '.commentapp',
    '.comment-container',
    '.bili-comment-container',
    '.bb-comment',
  ],
  danmaku: [
    '#danmukuBox',
    '[class*="DanmukuBox_wrap"]',
    '.danmaku-box',
    '.danmaku-wrap',
  ],
  playlist: [
    // Watch Later and Favorites use this inner list. Their `.playlist-container`
    // is the page-level layout and must stay outside the widescreen sidebar.
    '.action-list-container',
    '[class*="eplist_ep_list_wrapper"]',
    '#eplist_module',
    '[class*="numberList_wrapper"]',
    '[class*="imageList_wrap"]',
    '.video-pod',
    '.video-pod__body',
    '.multi-page',
    '.multi-page-v1',
    '.base-video-sections-v1',
    '.video-sections-v1',
    '.video-sections-content-list',
  ],
  playlistControls: [
    '.auto-play',
    '.continuous-btn',
  ],
  recommend: [
    '[class*="recommend_wrap"]',
    '.recommend-list-v1',
    '.recommend-list',
    '.rec-list',
    '.next-play',
  ],
}

const SIDEBAR_RELEVANT_SELECTOR = [
  ...selectors.player,
  ...selectors.title,
  ...selectors.titleNotice,
  ...selectors.upPanel,
  ...selectors.toolbar,
  ...selectors.description,
  ...selectors.tags,
  ...selectors.danmakuInput,
  ...selectors.danmaku,
  ...selectors.comment,
  ...selectors.playlist,
  ...selectors.playlistControls,
  ...selectors.recommend,
].join(',')

function isWidescreenInternalMutation(record: MutationRecord, currentState: BewlyWidescreenState): boolean {
  if (currentState.root.contains(record.target))
    return true

  const changedNodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
  return changedNodes.length > 0 && changedNodes.every(node => (
    (node !== currentState.root && currentState.root.contains(node))
    || (node instanceof Element && node.classList.contains('bewly-widescreen-origin-placeholder'))
  ))
}

function mutationNodeIsRelevant(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement
  if (!element)
    return false
  return element.matches(SIDEBAR_RELEVANT_SELECTOR)
    || !!element.closest(SIDEBAR_RELEVANT_SELECTOR)
    || (node instanceof Element && !!node.querySelector(SIDEBAR_RELEVANT_SELECTOR))
}

function classifyWidescreenMutation(
  record: MutationRecord,
  currentState: BewlyWidescreenState,
): WidescreenMutationOrigin {
  const insideRoot = isWidescreenInternalMutation(record, currentState)
  return {
    insideRoot,
    relevant: !insideRoot && (
      mutationNodeIsRelevant(record.target)
      || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(mutationNodeIsRelevant)
    ),
  }
}

function findFirst(selectors: string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector)
    if (element)
      return element
  }
  return null
}

function findMovable(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const element = candidates.find(candidate =>
      !candidate.closest(`#${ROOT_ID}`)
      && candidate.parentNode
      && candidate.offsetParent !== null,
    ) || candidates.find(candidate => !candidate.closest(`#${ROOT_ID}`) && candidate.parentNode)

    if (element)
      return element
  }
  return null
}

function isLikelyCommentRoot(candidate: HTMLElement) {
  if (candidate.closest(COMMENT_NESTED_UI_SELECTOR))
    return false

  const parentCommentRoot = candidate.parentElement?.closest<HTMLElement>(selectors.comment.join(','))
  if (parentCommentRoot)
    return false

  if (candidate.matches(`${COMMENT_ROOT_ID_SELECTOR}, .commentapp`))
    return true

  return !!candidate.querySelector(COMMENT_CONTENT_MARKER_SELECTOR)
}

function findCommentRoot(root: ParentNode = document, excludeWidescreenRoot = false): HTMLElement | null {
  const candidates: HTMLElement[] = []

  for (const selector of selectors.comment) {
    for (const candidate of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      if (excludeWidescreenRoot && candidate.closest(`#${ROOT_ID}`))
        continue
      if (!isLikelyCommentRoot(candidate))
        continue
      candidates.push(candidate)
    }
  }

  return candidates.find(candidate => candidate.offsetParent !== null) ?? candidates[0] ?? null
}

function moveNode(
  node: HTMLElement | null,
  target: HTMLElement,
  movedNodes: MovedNode[],
  allowInsideLayout = false,
) {
  if (!node || (!allowInsideLayout && node.closest(`#${ROOT_ID}`)))
    return false

  if (target.contains(node))
    return false

  const parent = node.parentNode
  if (!parent)
    return false

  const placeholder = document.createElement('span')
  placeholder.className = 'bewly-widescreen-origin-placeholder'
  placeholder.hidden = true
  placeholder.setAttribute('aria-hidden', 'true')
  parent.insertBefore(placeholder, node)
  target.appendChild(node)
  movedNodes.push({ node, placeholder, originalParent: parent })
  return true
}

function moveMatchingNodes(selectors: string[], target: HTMLElement, movedNodes: MovedNode[], limit = 8) {
  let moved = 0
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
    for (const candidate of candidates) {
      if (moved >= limit)
        return moved
      if (candidate.closest(`#${ROOT_ID}`) || !candidate.parentNode || target.contains(candidate))
        continue

      if (moveNode(candidate, target, movedNodes)) {
        moved++
        continue
      }
    }
  }
  return moved
}

function restoreMovedNodes(movedNodes: MovedNode[]) {
  for (const { node, placeholder, originalParent } of [...movedNodes].reverse()) {
    const parent = placeholder.parentNode
    if (parent) {
      parent.insertBefore(node, placeholder)
      placeholder.remove()
      continue
    }
    if (originalParent.isConnected)
      originalParent.appendChild(node)
    else
      node.remove()
  }
  movedNodes.length = 0
}

function removeMovedNode(node: HTMLElement, movedNodes: MovedNode[]) {
  const index = movedNodes.findIndex(movedNode => movedNode.node === node)
  if (index >= 0) {
    const [movedNode] = movedNodes.splice(index, 1)
    movedNode.placeholder.remove()
  }

  node.remove()
}

function moveOrReplaceNode(selectors: string[], target: HTMLElement, movedNodes: MovedNode[], allowInsideLayout = false) {
  const existing = findFirst(selectors, target)
  const next = allowInsideLayout
    ? findFirst(selectors, target) || findMovable(selectors)
    : findMovable(selectors)

  if (existing && next && existing !== next) {
    removeMovedNode(existing, movedNodes)
    const moved = moveNode(next, target, movedNodes, allowInsideLayout)
    return { found: moved, changed: moved }
  }

  if (existing)
    return { found: true, changed: false }

  const moved = moveNode(next, target, movedNodes, allowInsideLayout)
  return { found: moved, changed: moved }
}

function hasCommentShadowTree(root: HTMLElement) {
  const roots: ParentNode[] = [root]
  const visited = new Set<ParentNode>()
  while (roots.length) {
    const currentRoot = roots.shift()!
    if (visited.has(currentRoot))
      continue
    visited.add(currentRoot)

    const candidates = [
      ...(currentRoot instanceof Element && currentRoot.matches(COMMENT_SHADOW_HOST_SELECTOR) ? [currentRoot] : []),
      ...Array.from(currentRoot.querySelectorAll(COMMENT_SHADOW_HOST_SELECTOR)),
    ]
    for (const element of candidates) {
      const shadowRoot = (element as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot
      if (!shadowRoot || shadowRoot.childElementCount === 0)
        continue
      if (element.matches('bili-comment-box, bili-comment-renderer, bili-comment-thread-renderer')
        && shadowRoot.querySelector(':not(style)')) {
        return true
      }
      roots.push(shadowRoot)
    }
  }
  return false
}

function isCommentRootUsable(root: HTMLElement) {
  if (!root.isConnected)
    return false

  // B 站会先创建空评论壳，再异步挂载 bili-comments / shadow DOM。提前搬走
  // 空壳会与它的初始化竞争，导致头像、编辑器、登录态或评论列表漏渲染。
  const modernRoots = Array.from(root.querySelectorAll<HTMLElement>(
    'bili-comments, bili-comment-box, bili-comment-renderer',
  ))
  if (modernRoots.length)
    return hasCommentShadowTree(root)

  if (root.querySelector('.reply-list, .comment-list, .reply-box, .comment-header'))
    return true

  return hasCommentShadowTree(root)
}

function moveCommentRoot(target: HTMLElement, movedNodes: MovedNode[]) {
  // Once mounted, keep the same root. Replacing it in response to a body
  // mutation can race Bilibili's renderer and create another comment editor.
  const existing = findCommentRoot(target)
  if (existing)
    return { found: true, changed: false }

  const next = findCommentRoot(document, true)
  if (!next || !isCommentRootUsable(next))
    return { found: false, changed: false }

  if (commentPrewarmState?.root === next)
    restoreCommentPrewarm()
  const moved = moveNode(next, target, movedNodes)
  return { found: moved, changed: moved }
}

function movePlaylistControls(target: HTMLElement, movedNodes: MovedNode[]) {
  if (findFirst(selectors.playlistControls, target))
    return true

  if (!findFirst(selectors.playlist, target) && !findMovable(selectors.playlist))
    return false

  const control = findMovable(selectors.playlistControls)
  const playlistSelector = selectors.playlist.join(',')
  let playlistRoot = control?.closest<HTMLElement>(playlistSelector)
  while (playlistRoot?.parentElement) {
    const parentPlaylistRoot = playlistRoot.parentElement.closest<HTMLElement>(playlistSelector)
    if (!parentPlaylistRoot || parentPlaylistRoot === playlistRoot)
      break
    playlistRoot = parentPlaylistRoot
  }
  const controlRow = playlistRoot ?? control?.parentElement
  if (!controlRow || controlRow === document.body)
    return false

  // The autoplay switch and the episode list are siblings in Bilibili's
  // eplist layout. Move their original row so its listeners and adjacent
  // controls (such as random play) remain intact.
  return moveNode(controlRow, target, movedNodes)
}

function createPanelEmpty(label: string) {
  const empty = document.createElement('div')
  empty.className = EMPTY_CLASS
  empty.textContent = label
  return empty
}

function createDanmakuSkeleton(label: string) {
  const skeleton = document.createElement('div')
  skeleton.className = DANMAKU_SKELETON_CLASS
  skeleton.setAttribute('role', 'status')
  skeleton.setAttribute('aria-label', label)

  const rows = document.createElement('div')
  rows.className = `${DANMAKU_SKELETON_CLASS}__rows`
  for (let index = 0; index < 10; index++) {
    const row = document.createElement('div')
    row.className = `${DANMAKU_SKELETON_CLASS}__row`
    for (const column of ['time', 'content', 'date']) {
      const block = document.createElement('span')
      block.className = `${DANMAKU_SKELETON_CLASS}__block ${DANMAKU_SKELETON_CLASS}__${column}`
      block.setAttribute('aria-hidden', 'true')
      row.appendChild(block)
    }
    rows.appendChild(row)
  }
  skeleton.appendChild(rows)
  return skeleton
}

function setActiveTab(nextTab: BewlyWidescreenTab, hydrate = true) {
  if (!state)
    return

  state.activeTab = nextTab
  for (const [tab, button] of Object.entries(state.tabButtons) as Array<[BewlyWidescreenTab, HTMLButtonElement]>) {
    const active = tab === nextTab
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
    state.panels[tab].hidden = !active
  }

  if (nextTab === 'danmaku') {
    // Native long-list virtualization measures the visible viewport on resize.
    schedulePlayerResizeSync(state)
  }
  if (state.hydratedTabs.has(nextTab))
    scheduleInitialPanelScrollReset(state, nextTab)
  if (hydrate)
    startSidebarHydration(state)
}

function scheduleInitialPanelScrollReset(currentState: BewlyWidescreenState, tab: BewlyWidescreenTab) {
  if (currentState.initialScrollResetTabs.has(tab) || currentState.panelScrollFrames.has(tab))
    return

  const frame = requestAnimationFrame(() => {
    currentState.panelScrollFrames.delete(tab)
    if (state !== currentState || !currentState.root.isConnected)
      return
    currentState.panels[tab].scrollTop = 0
    currentState.initialScrollResetTabs.add(tab)
  })
  currentState.panelScrollFrames.set(tab, frame)
}

function syncSidebarToggleButton(currentState: BewlyWidescreenState) {
  const isCompact = currentState.sidebarLayout === 'compact'
  const isRight = currentState.sidebarPosition === 'right'
  currentState.sidebarToggleButton.textContent = isRight
    ? (isCompact ? '‹' : '›')
    : (isCompact ? '›' : '‹')
  currentState.sidebarToggleButton.title = t(isCompact
    ? 'widescreen.show_full_sidebar'
    : 'widescreen.show_compact_sidebar')
  currentState.sidebarToggleButton.setAttribute('aria-label', currentState.sidebarToggleButton.title)
  currentState.sidebarToggleButton.setAttribute('aria-pressed', String(!isCompact))
}

function setSidebarLayout(
  nextLayout: BewlyWidescreenSidebarLayout,
  currentState: BewlyWidescreenState | null = state,
  userClosed = false,
) {
  if (!currentState || state !== currentState)
    return

  currentState.sidebarLayout = nextLayout
  currentState.root.dataset.sidebarLayout = nextLayout
  currentState.root.dataset.sidebarHoverExpanded = 'false'
  if (userClosed && nextLayout === 'compact') {
    currentState.root.dataset.sidebarEdgeRevealSuppressed = 'true'
    currentState.root.dataset.sidebarManuallyClosed = 'true'
  }
  else {
    delete currentState.root.dataset.sidebarEdgeRevealSuppressed
    if (nextLayout === 'expanded')
      delete currentState.root.dataset.sidebarManuallyClosed
  }
  syncSidebarToggleButton(currentState)
  updateSidebarLayoutState(currentState)
}

function isWidescreenSidebarExpanded(currentState: BewlyWidescreenState) {
  return currentState.sidebarLayout === 'expanded'
    || currentState.root.dataset.sidebarHoverExpanded === 'true'
    || currentState.root.dataset.centered === 'true'
}

function getTitleText() {
  const titleElement = findFirst(selectors.title)
  const title = titleElement?.getAttribute('title') || titleElement?.textContent?.trim()
  if (title)
    return title

  const metaTitle = document.querySelector<HTMLMetaElement>('meta[itemprop="name"], meta[property="og:title"]')?.content
  return metaTitle?.replace(/_哔哩哔哩_bilibili$/, '') || document.title.replace(/_哔哩哔哩_bilibili$/, '')
}

function createSidebarTitle() {
  const title = document.createElement('div')
  title.className = 'bewly-widescreen-title'
  title.textContent = getTitleText()
  return title
}

function createSidebarToolbar() {
  const toolbar = document.createElement('div')
  toolbar.className = 'bewly-widescreen-toolbar'
  const titleGroup = document.createElement('div')
  titleGroup.className = 'bewly-widescreen-title-group'
  const titleNoticeSlot = document.createElement('div')
  titleNoticeSlot.className = 'bewly-widescreen-title-notice'
  titleNoticeSlot.hidden = true
  titleGroup.append(createSidebarTitle(), titleNoticeSlot)

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'bewly-widescreen-close'
  const closeLabel = t('widescreen.close_sidebar')
  closeButton.textContent = closeLabel
  closeButton.setAttribute('aria-label', closeLabel)
  closeButton.addEventListener('click', () => {
    const currentState = state
    if (!currentState)
      return
    setSidebarLayout('compact', currentState, true)
    currentState.sidebarToggleButton.focus({ preventScroll: true })
  })

  toolbar.append(titleGroup, closeButton)
  return { titleNoticeSlot, toolbar }
}

function createTabButton(tab: BewlyWidescreenTab, label: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-tab'
  button.textContent = label
  button.setAttribute('role', 'tab')
  button.addEventListener('click', () => setActiveTab(tab))
  return button
}

function createSidebarToggleButton() {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-sidebar-toggle'
  button.addEventListener('click', () => {
    const nextLayout = state?.sidebarLayout === 'compact' ? 'expanded' : 'compact'
    setSidebarLayout(nextLayout, state, nextLayout === 'compact')
  })
  return button
}

function createSidebarResizer() {
  const resizer = document.createElement('div')
  resizer.className = 'bewly-widescreen-sidebar-resizer'
  resizer.tabIndex = 0
  resizer.setAttribute('role', 'separator')
  resizer.setAttribute('aria-orientation', 'vertical')
  const label = t('widescreen.resize_sidebar')
  resizer.setAttribute('aria-label', label)
  resizer.title = label
  return resizer
}

function createPlaylistToggleButton() {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-playlist-toggle'
  button.hidden = true
  button.setAttribute('aria-expanded', 'false')
  return button
}

function getLoadingGifUrl() {
  try {
    return browser.runtime.getURL('/assets/loading.gif')
  }
  catch {
    return ''
  }
}

function t(key: string) {
  return String(i18n.global.t(key))
}

function syncLocalizedWidescreenText(currentState = state) {
  const loadingLabel = loadingOverlay?.querySelector<HTMLElement>('.bewly-widescreen-loading-label')
  if (loadingLabel)
    loadingLabel.textContent = t('widescreen.loading')
  const loadingExitButton = loadingOverlay?.querySelector<HTMLButtonElement>('.bewly-widescreen-loading-exit')
  if (loadingExitButton)
    loadingExitButton.textContent = t('widescreen.exit_loading')

  if (!currentState || state !== currentState)
    return

  const closeButton = currentState.sidebarTop.querySelector<HTMLButtonElement>('.bewly-widescreen-close')
  if (closeButton) {
    const closeLabel = t('widescreen.close_sidebar')
    closeButton.textContent = closeLabel
    closeButton.setAttribute('aria-label', closeLabel)
  }
  const resizeLabel = t('widescreen.resize_sidebar')
  currentState.sidebarResizer.setAttribute('aria-label', resizeLabel)
  currentState.sidebarResizer.title = resizeLabel
  currentState.tabButtons.comment.textContent = t('widescreen.comments')
  currentState.tabButtons.danmaku.textContent = t('widescreen.danmaku')
  currentState.tabButtons.playlist.textContent = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
    ? t('widescreen.playlist')
    : t('widescreen.recommendations')
  syncSidebarToggleButton(currentState)
  syncDescription(currentState)
  syncPlaylistToggleButton(currentState)
  syncDanmakuInputSource(currentState, true)
  renderFallbackVideoInfo(currentState)

  const emptyLabels: Array<[HTMLElement, string]> = [
    [currentState.panels.comment, 'widescreen.comments_loading'],
    [currentState.panels.playlist, 'widescreen.list_loading'],
  ]
  for (const [panel, key] of emptyLabels) {
    const empty = panel.querySelector<HTMLElement>(`.${EMPTY_CLASS}`)
    if (empty)
      empty.textContent = t(key)
  }
  currentState.panels.danmaku
    .querySelector<HTMLElement>(`.${DANMAKU_SKELETON_CLASS}`)
    ?.setAttribute('aria-label', t('widescreen.danmaku_loading'))
}

function startWidescreenLanguageWatch() {
  if (stopLanguageWatch)
    return
  stopLanguageWatch = watch(
    () => settings.value.language,
    async () => {
      await ensureInterfaceLanguage()
      syncLocalizedWidescreenText()
    },
  )
}

function showWidescreenLoading() {
  if (loadingOverlay)
    return

  loadingStyleEl = injectCSS(`
    #${LOADING_ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: var(--bew-z-widescreen-loading);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      color: var(--bew-text-2, #61666d);
      background: var(--bew-bg, #f6f7f8);
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      opacity: 1;
      transition: opacity ${LOADING_FADE_DURATION}ms ease;
    }

    html.dark #${LOADING_ROOT_ID} {
      color: var(--bew-text-2, #c9ccd0);
      background: var(--bew-bg, #17181a);
    }

    #${LOADING_ROOT_ID}.is-leaving {
      opacity: 0;
      pointer-events: none;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-content {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--bew-space-3, 12px);
      font-size: var(--bew-font-size-control, 13px);
      line-height: var(--bew-line-height-control, 18px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-status {
      display: flex;
      align-items: center;
      gap: var(--bew-space-2, 8px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-icon {
      width: var(--bew-control-height, 36px);
      height: var(--bew-control-height, 36px);
      object-fit: contain;
      flex-shrink: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit {
      box-sizing: border-box;
      min-width: calc(var(--bew-control-height, 36px) + var(--bew-control-height, 36px));
      min-height: var(--bew-control-item-height, 28px);
      padding: 0 var(--bew-space-3, 12px);
      color: var(--bew-text-1, #18191c);
      font: inherit;
      font-weight: var(--bew-font-weight-semibold, 600);
      background: var(--bew-fill-2, rgb(0 0 0 / 8%));
      border: 1px solid var(--bew-surface-border-color, #d1d2d4);
      border-radius: var(--bew-interactive-radius, 8px);
      cursor: pointer;
    }

    html.dark #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit {
      color: var(--bew-text-1, #fff);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit:hover {
      background: var(--bew-fill-3, rgb(0 0 0 / 12%));
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit:focus-visible {
      outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-color, #00aeec);
      outline-offset: var(--bew-space-0-5, 2px);
    }
  `)

  const overlay = document.createElement('div')
  overlay.id = LOADING_ROOT_ID
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-live', 'polite')

  const content = document.createElement('div')
  content.className = 'bewly-widescreen-loading-content'

  const status = document.createElement('div')
  status.className = 'bewly-widescreen-loading-status'

  const loadingGifUrl = getLoadingGifUrl()
  if (loadingGifUrl) {
    const icon = document.createElement('img')
    icon.className = 'bewly-widescreen-loading-icon'
    icon.src = loadingGifUrl
    icon.alt = ''
    icon.setAttribute('aria-hidden', 'true')
    status.appendChild(icon)
  }

  const label = document.createElement('span')
  label.className = 'bewly-widescreen-loading-label'
  label.textContent = t('widescreen.loading')
  status.appendChild(label)
  content.appendChild(status)

  overlay.appendChild(content)
  const mountTarget = document.body ?? document.documentElement
  mountTarget.appendChild(overlay)
  loadingOverlay = overlay

  loadingExitTimer = setTimeout(() => {
    loadingExitTimer = undefined
    if (loadingOverlay !== overlay)
      return

    const exitButton = document.createElement('button')
    exitButton.type = 'button'
    exitButton.className = 'bewly-widescreen-loading-exit'
    exitButton.textContent = t('widescreen.exit_loading')
    exitButton.addEventListener('click', () => {
      exitBewlyWidescreen({ userInitiated: true })
    }, { once: true })
    content.appendChild(exitButton)
  }, LOADING_EXIT_DELAY)

  const handlePlaying = (event: Event) => {
    const video = event.target
    if (video instanceof HTMLVideoElement
      && video === getVideoElement()
      && shouldDismissLoadingForPlaying(video)) {
      dismissWidescreenLoadingForPlaying()
    }
  }
  document.addEventListener('playing', handlePlaying, true)
  loadingPlaybackCleanup = () => {
    document.removeEventListener('playing', handlePlaying, true)
    loadingPlaybackCleanup = undefined
  }
}

function shouldDismissLoadingForPlaying(video: HTMLVideoElement) {
  return loadingMayDismissOnPlaying
    || video.autoplay
    || video.hasAttribute('autoplay')
    || navigator.userActivation?.hasBeenActive !== true
}

function dismissWidescreenLoadingForPlaying() {
  loadingSuppressedUntilExit = true
  removeWidescreenLoading()
}

function removeWidescreenLoading(immediate = false) {
  loadingPlaybackCleanup?.()
  loadingMayDismissOnPlaying = false

  if (loadingExitTimer) {
    clearTimeout(loadingExitTimer)
    loadingExitTimer = undefined
  }

  if (loadingPreparationFallbackTimer) {
    clearTimeout(loadingPreparationFallbackTimer)
    loadingPreparationFallbackTimer = undefined
  }

  if (loadingFadeTimer) {
    clearTimeout(loadingFadeTimer)
    loadingFadeTimer = undefined
  }
  if (loadingFadeFrame !== undefined) {
    cancelAnimationFrame(loadingFadeFrame)
    loadingFadeFrame = undefined
  }

  const overlay = loadingOverlay
  const styleEl = loadingStyleEl
  if (!overlay && !styleEl)
    return

  const remove = () => {
    overlay?.remove()
    styleEl?.remove()
    if (loadingOverlay === overlay)
      loadingOverlay = null
    if (loadingStyleEl === styleEl)
      loadingStyleEl = null
    loadingFadeTimer = undefined
  }

  if (immediate || !overlay) {
    remove()
    return
  }

  loadingFadeFrame = requestAnimationFrame(() => {
    loadingFadeFrame = undefined
    if (loadingOverlay === overlay && overlay.isConnected)
      overlay.classList.add('is-leaving')
  })
  loadingFadeTimer = setTimeout(remove, LOADING_FADE_DURATION)
}

export function prepareBewlyWidescreenLoading(allowPlayingDismiss = false) {
  startWidescreenLanguageWatch()
  if (state || loadingSuppressedUntilExit)
    return

  loadingMayDismissOnPlaying ||= allowPlayingDismiss
  showWidescreenLoading()
  const video = getVideoElement()
  if (loadingOverlay
    && video
    && !video.paused
    && !video.ended
    && shouldDismissLoadingForPlaying(video)) {
    dismissWidescreenLoadingForPlaying()
    return
  }

  if (!loadingOverlay)
    return

  if (!loadingPreparationFallbackTimer) {
    loadingPreparationFallbackTimer = setTimeout(() => {
      loadingPreparationFallbackTimer = undefined
      if (enteringWidescreen)
        return
      loadingSuppressedUntilExit = true
      removeWidescreenLoading()
      stopLanguageWatch?.()
      stopLanguageWatch = undefined
    }, PREPARED_LOADING_TIMEOUT)
  }
}

function createRoot(sidebarPosition: 'left' | 'right' = 'right') {
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.dataset.sidebarPosition = sidebarPosition
  root.style.setProperty(
    '--bewly-widescreen-sidebar-user-width',
    `${clampWidescreenSidebarWidth(
      settings.value.bewlyWidescreenSidebarWidth,
      document.documentElement.clientWidth || window.innerWidth,
    )}px`,
  )

  const stage = document.createElement('div')
  stage.className = 'bewly-widescreen-stage'

  const playerSlot = document.createElement('main')
  playerSlot.className = 'bewly-widescreen-player-slot'
  const playerFrame = document.createElement('div')
  playerFrame.className = 'bewly-widescreen-player-frame'
  const danmakuDock = document.createElement('div')
  danmakuDock.className = 'bewly-widescreen-danmaku-dock'
  const sidebarToggleButton = createSidebarToggleButton()
  playerSlot.append(playerFrame, danmakuDock, sidebarToggleButton)

  const sidebar = document.createElement('aside')
  sidebar.className = 'bewly-widescreen-sidebar'
  const sidebarResizer = createSidebarResizer()

  const sidebarTop = document.createElement('div')
  sidebarTop.className = 'bewly-widescreen-sidebar-top'
  const { titleNoticeSlot, toolbar } = createSidebarToolbar()
  const metadataSlot = document.createElement('div')
  metadataSlot.className = 'bewly-widescreen-metadata-slot'
  const upSlot = document.createElement('div')
  upSlot.className = 'bewly-widescreen-up-slot'
  const toolbarSlot = document.createElement('div')
  toolbarSlot.className = 'bewly-widescreen-action-slot'
  const descriptionSlot = document.createElement('div')
  descriptionSlot.className = 'bewly-widescreen-description-slot'
  const tagsSlot = document.createElement('div')
  tagsSlot.className = 'bewly-widescreen-tags-slot'
  sidebarTop.append(toolbar, metadataSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot)

  const tablist = document.createElement('div')
  tablist.className = 'bewly-widescreen-tabs'
  tablist.setAttribute('role', 'tablist')

  const tabButtons = {
    comment: createTabButton('comment', t('widescreen.comments')),
    danmaku: createTabButton('danmaku', t('widescreen.danmaku')),
    playlist: createTabButton('playlist', t('widescreen.playlist')),
  }
  tablist.append(tabButtons.comment, tabButtons.danmaku, tabButtons.playlist)

  const panelWrap = document.createElement('div')
  panelWrap.className = 'bewly-widescreen-panels'

  const panels = {
    comment: document.createElement('section'),
    danmaku: document.createElement('section'),
    playlist: document.createElement('section'),
  }

  for (const [tab, panel] of Object.entries(panels) as Array<[BewlyWidescreenTab, HTMLElement]>) {
    const tabId = `${ROOT_ID}-tab-${tab}`
    const panelId = `${ROOT_ID}-panel-${tab}`
    tabButtons[tab].id = tabId
    tabButtons[tab].tabIndex = -1
    tabButtons[tab].setAttribute('aria-controls', panelId)
    panel.className = `bewly-widescreen-panel bewly-widescreen-panel-${tab}`
    panel.id = panelId
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', tabId)
    panel.tabIndex = 0
    panelWrap.appendChild(panel)
  }

  const playlistToggleButton = createPlaylistToggleButton()
  panels.playlist.prepend(playlistToggleButton)

  const tabOrder = Object.keys(tabButtons) as BewlyWidescreenTab[]
  tablist.addEventListener('keydown', (event) => {
    const currentIndex = tabOrder.findIndex(tab => tabButtons[tab] === event.target)
    if (currentIndex < 0)
      return

    let nextIndex = currentIndex
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabOrder.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = tabOrder.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const nextTab = tabOrder[nextIndex]
    setActiveTab(nextTab)
    tabButtons[nextTab].focus({ preventScroll: true })
  })

  sidebar.append(sidebarResizer, sidebarTop, tablist, panelWrap)
  if (sidebarPosition === 'left')
    stage.append(sidebar, playerSlot)
  else
    stage.append(playerSlot, sidebar)
  root.appendChild(stage)
  document.body.appendChild(root)

  return { root, stage, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, sidebarTop, titleNoticeSlot, metadataSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, playlistToggleButton, sidebarResizer, sidebarToggleButton }
}

function injectLayoutStyle() {
  return injectCSS(`
    body.${BODY_CLASS} {
      --bewly-widescreen-inputbar-height: calc(
        var(--bew-control-height, 36px) + var(--bew-space-2, 8px)
      );
      --bewly-widescreen-bottom-controls-height: calc(
        var(--bewly-widescreen-inputbar-height, 44px) + var(--bew-space-4, 16px) + 1px
      );
      --bewly-widescreen-controls-block-padding: calc(
        (var(--bewly-widescreen-bottom-controls-height) - var(--bew-control-height, 36px)) / 2
      );
      --bewly-widescreen-danmaku-bar-bg: var(--bew-elevated-alt);
      --bewly-widescreen-aux-controls-width: calc(var(--bew-control-height, 36px) * 3 + var(--bew-space-2, 8px) * 3);
      --bewly-widescreen-shell-radius: var(--bew-modal-radius, 24px);
      --bewly-widescreen-controls-glass-inset: var(--bew-space-4, 16px);
      --bewly-widescreen-controls-glass-bottom: var(--bew-space-2, 8px);
      --bewly-widescreen-controls-glass-height: calc(
        var(--bewly-widescreen-bottom-controls-height) + var(--bewly-widescreen-controls-block-padding, 12px)
      );
      overflow: hidden !important;
      background: var(--bew-dark-page-bg) !important;
    }

    body.${BODY_CLASS} #bewly {
      position: relative;
      z-index: calc(var(--bew-z-widescreen) + 1);
    }

    /* Bilibili teleports uploader/user hover cards and the followed-user menu
       directly under body. Keep those native interaction surfaces above the
       widescreen shell instead of letting their legacy 1000/10099 layers hide
       behind the sidebar. */
    body.${BODY_CLASS} > :is(
      .usercard-wrap,
      bili-user-profile,
      .van-popover.van-followed
    ) {
      z-index: var(--bew-z-hud) !important;
    }

    body.${BODY_CLASS} .bili-header,
    body.${BODY_CLASS} .fixed-sidenav-storage,
    body.${BODY_CLASS} .mini-player-window {
      display: none !important;
    }

    ${HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS
      .map(selector => `body.${BODY_CLASS} ${selector}`)
      .join(',\n    ')} {
      display: none !important;
    }

    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: var(--bew-z-widescreen);
      color: var(--bew-text-1);
      background: transparent;
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      pointer-events: none;
      --bewly-widescreen-sidebar-bg: var(--bew-elevated-alt);
      --bewly-widescreen-surface-bg: var(--bew-elevated);
      --bewly-widescreen-text-primary: var(--bew-text-1, #18191c);
      --bewly-widescreen-text-secondary: var(--bew-text-2, #61666d);
      --bewly-widescreen-text-muted: var(--bew-text-3, #9499a0);
      --bewly-widescreen-sidebar-border: var(--bew-surface-border-color);
      --bewly-widescreen-divider: var(--bew-border-color);
      --bewly-widescreen-control-bg: var(--bew-fill-1);
      --bewly-widescreen-control-hover-bg: var(--bew-fill-2);
      --bewly-widescreen-sidebar-floating-inset: var(--bew-popover-card-gap, var(--bew-space-4, 16px));
      --bewly-widescreen-sidebar-resize-accent: var(--bew-text-1, #fff);
      --bew-comment-expand-all-display: none;
      --bewly-widescreen-sidebar-user-width: clamp(
        ${WIDESCREEN_SIDEBAR_MIN_WIDTH}px,
        26vw,
        ${WIDESCREEN_SIDEBAR_DEFAULT_MAX_WIDTH}px
      );
      --bewly-widescreen-sidebar-full-width: clamp(
        ${WIDESCREEN_SIDEBAR_MIN_WIDTH}px,
        var(--bewly-widescreen-sidebar-user-width),
        min(${WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH}px, ${SIDEBAR_MAX_VIEWPORT_PERCENT}vw)
      );
      --bewly-widescreen-sidebar-reserved-width: calc(
        var(--bewly-widescreen-sidebar-full-width) + var(--bewly-widescreen-sidebar-floating-inset) * 2
      );
      --bewly-widescreen-layout-aspect: 1.7777778;
      --bewly-widescreen-danmaku-bar-bg: var(--bew-elevated-alt);
      --bewly-widescreen-sidebar-panel-width: var(--bewly-widescreen-sidebar-full-width);

      --bewly-widescreen-center-offset: 0px;
      --bewly-widescreen-aux-controls-width: calc(var(--bew-control-height, 36px) * 3 + var(--bew-space-2, 8px) * 3);
    }

    /* The native player is a body child, not a descendant of the Bewly overlay.
       Keep its progress tokens on the shared widescreen owner so both themes inherit them. */
    body.${BODY_CLASS} {
      --bewly-widescreen-progress-track: color-mix(in srgb, var(--bew-text-1) 32%, transparent);
      --bewly-widescreen-progress-buffer: color-mix(in srgb, var(--bew-text-1) 44%, transparent);
      --bewly-widescreen-progress-played: var(--bew-theme-color);
      --bewly-widescreen-progress-glow: none;
    }

    html:not(.dark) #${ROOT_ID},
    html:not(.dark) body.${BODY_CLASS} {
      --bewly-widescreen-sidebar-resize-accent: var(--bew-theme-color, #00aeec);
    }

    html.dark body.${BODY_CLASS} {
      --bewly-widescreen-progress-played: #fff;
      --bewly-widescreen-progress-glow: 0 0 4px rgb(255 255 255 / 85%), 0 0 8px rgb(255 255 255 / 45%);
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
    }

    #${ROOT_ID} .bewly-widescreen-stage {
      display: grid;
      grid-template-columns: minmax(0, 100vw) 0;
      width: 100%;
      height: 100dvh;
      overflow: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-player-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: stretch;
      position: relative;
      min-width: 0;
      min-height: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      gap: 0;
      isolation: isolate;
      z-index: 0;
      grid-column: 1;
      grid-row: 1;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-player-frame {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: auto;
      flex: 1 1 0;
      overflow: hidden;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-player-frame > * {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
      aspect-ratio: auto !important;
      margin: 0 !important;
      flex: 0 1 auto;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} {
      position: fixed !important;
      top: var(--bewly-widescreen-player-top) !important;
      left: var(--bewly-widescreen-player-left) !important;
      z-index: calc(var(--bew-z-widescreen) - 1) !important;
      width: var(--bewly-widescreen-player-width) !important;
      max-width: var(--bewly-widescreen-player-width) !important;
      height: var(--bewly-widescreen-player-height) !important;
      max-height: var(--bewly-widescreen-player-height) !important;
      margin: 0 !important;
      overflow: hidden !important;
      background: var(--bew-player-canvas) !important;
      clip-path: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} > #bilibili-player,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} > #bilibiliPlayer,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-docker-major,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-container,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-primary-area,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-video-area,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-video-wrap,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bilibili-player-video-area,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bilibili-player-video-wrap {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-container {
      inset: auto !important;
      transform: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      right: var(--bewly-widescreen-controls-glass-inset) !important;
      bottom: calc(
        var(--bewly-widescreen-controls-glass-bottom) + var(--bewly-widescreen-bottom-controls-height)
      ) !important;
      left: var(--bewly-widescreen-controls-glass-inset) !important;
      width: auto !important;
      transition:
        transform var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease),
        opacity var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease) !important;
      will-change: transform;
    }

    /* 收起统一交给 BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS，忽略原生独立收起。
       常显只在非隐藏态生效，避免与统一隐藏规则发生 !important 级联战 */
    body.${BODY_CLASS}:not(.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}) .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
    }

    /* 显式反超原生空闲隐藏链（data-ctrl-hidden / bpx-state-no-cursor），
       原生隐藏只能由统一 BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS 表达 */
    body.${BODY_CLASS}:not(.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}) .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-wrap,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-wrap,
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-top,
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-bottom,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-top,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-bottom
    ) {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      pointer-events: auto !important;
    }

    /* 仅反制对整个 wrap 的 display:none 空闲隐藏，壳层内部布局不动 */
    body.${BODY_CLASS}:not(.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}) .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-wrap,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-wrap,
      .bpx-player-control-wrap[hidden]
    ) {
      display: block !important;
    }

    /* 原生底部渐变遮罩（180px repeat-x 暗化层）：禁用，悬浮卡只保留自己的玻璃表面 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-mask {
      display: none !important;
      background: none !important;
    }

    body.${BODY_CLASS}.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      transform: translate3d(0, 100%, 0) !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* 共用悬浮玻璃卡：原生控制栏去掉自带底色/渐变并提升到玻璃卡上方，
       文字与单色图标跟随主题前景，保留彩色图标语义 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      z-index: var(--bew-z-popover) !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      background-image: none !important;
      text-shadow: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) :is(.bpx-player-control-top, .bpx-player-control-bottom) {
      background: transparent !important;
    }

    /* 整个悬浮卡统一模糊与表面：清除控制栏家族（含进度区）自带的
       深色渐变 / backdrop 模糊层；仅移除 background-image，保留进度轨道纯色 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bpx-player-control-top,
      .bpx-player-control-bottom,
      .bpx-player-progress-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller,
      .squirtle-controller > *
    ) {
      background-image: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bpx-player-control-top,
      .bpx-player-control-bottom,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    )::before,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bpx-player-control-top,
      .bpx-player-control-bottom,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    )::after {
      background-image: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap .bpx-player-ctrl-btn,
      .bpx-player-control-wrap .bpx-player-ctrl-btn *,
      .bpx-player-control-wrap .bpx-player-ctrl-quality,
      .bpx-player-control-wrap .bpx-player-ctrl-quality *,
      .bpx-player-control-wrap [class*="-ctrl-"],
      .bpx-player-control-wrap [class*="-ctrl-"] *,
      .bilibili-player-video-control-wrap .bilibili-player-video-btn,
      .bilibili-player-video-control-wrap .bilibili-player-video-btn *,
      .squirtle-controller .squirtle-controller-left *,
      .squirtle-controller .squirtle-controller-right *,
      .squirtle-controller .squirtle-progress-wrap *
    ) {
      color: var(--bew-text-1) !important;
    }

    /* bpx 主题变量族主动接管：图标/文字/提示/辅助面板背景随 --bew-* 主题 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-container,
      .bilibili-player,
      .squirtle-video-wrap
    ) {
      --bpx-primary-color: var(--bew-text-1);
      --bpx-primary-bgcolor: transparent;
      --bpx-fn-color: var(--bew-text-1);
      --bpx-fn-hover-color: var(--bew-text-1);
      --bpx-tooltip-color: var(--bew-text-1);
      --bpx-tooltip-bgcolor: var(--bew-elevated-alt-solid);
      --bpx-aux-header-bg: var(--bew-elevated-alt-solid);
      --bpx-aux-content-bg: var(--bew-elevated-alt-solid);
    }

    /* 控制栏全部图标统一为文字前景色，覆盖未知填充（三角播放/音量/小窗/截图/设置等） */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) :is(svg, svg *) {
      fill: currentColor !important;
      stroke: currentColor !important;
    }

    /* 原生空闲隐藏 (data-ctrl-hidden) 会连带把进度条本体压成 visibility:hidden /
       背景透明；统一显隐接管后须补回可见性（否则任何着色都不画） */
    body.${BODY_CLASS}:not(.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}) .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-progress-wrap,
      .bpx-player-progress-wrap *
    ) {
      visibility: visible !important;
    }

    /* 进度条（实测 DOM）：轨道 = schedule 容器本体，缓冲 = schedule-buffer，
       已播放 = schedule-current；thumb 拖拽头完全不触碰 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-progress-wrap :is(
      .bpx-player-progress,
      .bpx-player-progress-schedule
    ) {
      background: var(--bewly-widescreen-progress-track) !important;
      box-shadow: none !important;
    }
    /* 部分播放器版本把可见细线画在伪元素上，覆盖同一轨道表面 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-progress-wrap :is(
      .bpx-player-progress-schedule::before,
      .bpx-player-progress-schedule::after,
      .bpx-player-progress-schedule-wrap::before,
      .bpx-player-progress-schedule-wrap::after
    ) {
      background: var(--bewly-widescreen-progress-track) !important;
      background-color: var(--bewly-widescreen-progress-track) !important;
      box-shadow: none !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-progress-wrap
      .bpx-player-progress-schedule-buffer {
      background: var(--bewly-widescreen-progress-buffer) !important;
      box-shadow: none !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-progress-wrap
      .bpx-player-progress-schedule-current {
      background: var(--bewly-widescreen-progress-played) !important;
      border-color: var(--bewly-widescreen-progress-played) !important;
      box-shadow: var(--bewly-widescreen-progress-glow) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} ${HIGH_ENERGY_PROGRESS_PIN_SELECTOR} {
      display: none !important;
    }

    /* 画质/音质/倍速/音量/播放设置等弹窗统一为弹幕设置同款实色表面并适配文字 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap :is(
      [class*="panel"],
      [class*="menu"],
      [class*="popup"],
      [class*="box"]
    ):not(svg):not([class*="-item"]):not([class*="-btn"]):not([class*="-icon"]):not(.bpx-player-ctrl-btn):not(:where([class*="box"] *)) {
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      color: var(--bew-text-1) !important;
    }

    /* 弹窗后代文字/选项：原生白字类名逐个未覆盖，统一强制主题前景 + 交互态 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap :is(
      [class*="panel"],
      [class*="menu"],
      [class*="popup"],
      [class*="box"]
    ) :is(span, div, li, a, p, i) {
      color: var(--bew-text-1) !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap [class*="box"] :is(
      [class*="item"],
      [class*="option"]
    ):hover {
      background: var(--bew-fill-1) !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap :is(
      .bpx-state-active,
      [class*="active"]
    ):not(svg) {
      color: var(--bew-theme-foreground) !important;
    }

    /* 弹幕设置/弹幕样式弹窗文字颜色适配浅色模式（含后代选项与交互态） */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box :is(span, div, li, a, p, i),
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-mode-selection-container,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-mode-selection-container :is(span, div, li, a, p, i) {
      color: var(--bew-text-1) !important;
    }

    /* Keep the player bounds stable while the bottom surfaces reveal. Changing
       flex height here moves the native hover boundary and creates an enter / leave loop. */
    ${DANMAKU_SURFACE_SELECTOR} {
      box-sizing: border-box !important;
      position: absolute !important;
      right: 0 !important;
      bottom: var(--bewly-widescreen-controls-glass-bottom) !important;
      left: 0 !important;
      display: flex !important;
      align-items: center !important;
      width: 100% !important;
      max-width: 100% !important;
      height: var(--bewly-widescreen-bottom-controls-height) !important;
      max-height: var(--bewly-widescreen-bottom-controls-height) !important;
      min-height: var(--bewly-widescreen-bottom-controls-height) !important;
      margin: 0 !important;
      padding: var(--bew-space-2, 8px) var(--bew-space-8, 32px) !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      isolation: auto !important;
      opacity: 1 !important;
      transform: none !important;
      transition:
        border-color var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease),
        opacity var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease),
        transform var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease);
      will-change: auto;
      pointer-events: auto !important;
      overflow: visible !important;
      z-index: 4 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR}::before,
    ${DANMAKU_SURFACE_SELECTOR}::after {
      content: none !important;
      display: none !important;
    }

    /* 统一悬浮玻璃卡：包住原生控制栏（含进度行）与底部弹幕控制区。
       高度由 JS 测量原生控制栏后写入 --bewly-widescreen-controls-glass-height。 */
    body.${BODY_CLASS} .${DANMAKU_GLASS_CLASS} {
      box-sizing: border-box !important;
      position: absolute !important;
      right: var(--bewly-widescreen-controls-glass-inset) !important;
      bottom: var(--bewly-widescreen-controls-glass-bottom) !important;
      left: var(--bewly-widescreen-controls-glass-inset) !important;
      width: auto !important;
      height: var(--bewly-widescreen-controls-glass-height) !important;
      z-index: calc(var(--bew-z-popover) - 1) !important;
      background: var(--bewly-widescreen-danmaku-bar-bg) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bewly-widescreen-shell-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-edge-glow-1) !important;
      backdrop-filter: var(--bew-filter-glass-1) !important;
      -webkit-backdrop-filter: var(--bew-filter-glass-1) !important;
      background-clip: padding-box !important;
      opacity: 1 !important;
      transform: none !important;
      transition:
        opacity var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease),
        transform var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease);
      will-change: opacity, transform;
      pointer-events: none !important;
    }

    #${ROOT_ID}[data-player-controls-hidden="true"] .bewly-widescreen-danmaku-dock,
    body.${BODY_CLASS}.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS} .${DANMAKU_GLASS_CLASS},
    body.${BODY_CLASS}.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}
      ${DANMAKU_SURFACE_SELECTOR}.${DANMAKU_SOURCE_HOST_CLASS} {
      opacity: 0 !important;
      transform: translate3d(0, 100%, 0) !important;
      pointer-events: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-dock {
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      pointer-events: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR}.${DANMAKU_SOURCE_HOST_CLASS} {
      z-index: var(--bew-z-popover) !important;
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif) !important;
    }

    /* 控制栏 hover 提示统一实色表面 + 主题前景（修复浅色模式深色底黑字） */
    body.${BODY_CLASS} .bpx-player-tooltip-item,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} [class*="tooltip"]:not(svg),
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} [class*="hover-tip"]:not(svg) {
      z-index: var(--bew-z-hud) !important;
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      box-shadow: var(--bew-popover-surface-shadow) !important;
      color: var(--bew-text-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR}:empty {
      display: none;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-sending-bar,
    ${DANMAKU_SURFACE_SELECTOR} .bilibili-player-video-sendbar,
    ${DANMAKU_SURFACE_SELECTOR} .bilibili-player-video-inputbar {
      position: relative !important;
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-2, 8px) !important;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      width: 100% !important;
      max-width: 100% !important;
      height: var(--bew-control-height, 36px) !important;
      min-height: var(--bew-control-height, 36px) !important;
      margin: 0 !important;
      padding: 0 !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 0 !important;
      transform: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      overflow: visible !important;
      z-index: auto !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-sending-bar,
      .bilibili-player-video-sendbar,
      .bilibili-player-video-inputbar
    )::before,
    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-sending-bar,
      .bilibili-player-video-sendbar,
      .bilibili-player-video-inputbar
    )::after {
      content: none !important;
      display: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-video-info,
      .bpx-player-dm-switch,
      .bpx-player-dm-setting,
      .bpx-player-video-inputbar
    ) {
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      background-clip: padding-box !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-info {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: var(--bew-control-height, 36px) !important;
      min-height: var(--bew-control-height, 36px) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-3, 12px) !important;
      color: var(--bew-text-1) !important;
      border-radius: var(--bew-badge-radius) !important;
      corner-shape: var(--bew-corner-shape-round);
      font-size: var(--bew-font-size-caption, 12px) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
      white-space: nowrap;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-root {
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-2, 8px) !important;
      margin-left: var(--bewly-widescreen-aux-controls-width) !important;
      min-width: 0;
      flex: 1 1 auto;
      background: transparent !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-switch, .bpx-player-dm-setting) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      width: var(--bew-control-height, 36px) !important;
      height: var(--bew-control-height, 36px) !important;
      margin: 0 !important;
      padding: 0 !important;
      flex: 0 0 var(--bew-control-height, 36px) !important;
      color: var(--bew-text-1) !important;
      background: var(--bew-elevated) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: 50% !important;
      corner-shape: var(--bew-corner-shape-round);
      box-shadow: var(--bew-shadow-1) !important;
      cursor: pointer;
      font-size: var(--bew-icon-size-md, 20px) !important;
      line-height: 1 !important;
      transition:
        color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        border-color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        box-shadow var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        transform var(--bew-duration-moderate, 300ms) var(--bew-ease-emphasized, ease);
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-switch, .bpx-player-dm-setting):hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-elevated-hover) !important;
      border-color: var(--bew-surface-border-color) !important;
      box-shadow: var(--bew-shadow-2) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-switch, .bpx-player-dm-setting):active {
      box-shadow: var(--bew-shadow-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch:hover {
      transform: scale(1.1);
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch:active {
      transform: scale(0.9);
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-setting, .bpx-player-video-btn-dm):hover {
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-setting, .bpx-player-video-btn-dm):has(
      .bpx-player-dm-setting-wrap,
      .bpx-player-mode-selection-container.active
    ) {
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-setting, .bpx-player-video-btn-dm):active {
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch > *,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting > :not(.bpx-player-dm-setting-wrap, .bpx-player-dm-setting-box) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: absolute !important;
      top: 50% !important;
      right: auto !important;
      bottom: auto !important;
      left: 50% !important;
      z-index: 1;
      margin: 0 !important;
      translate: -50% -50% !important;
      transform: none !important;
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
      padding: 0 !important;
      flex: 0 0 auto;
    }

    /* Keep the settings popover outside the button's backdrop root. */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      border-radius: inherit;
      corner-shape: var(--bew-corner-shape-round);
      background: var(--bew-elevated-alt-solid) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      pointer-events: none;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-switch, .bpx-player-dm-setting) svg {
      position: static !important;
      inset: auto !important;
      display: block;
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
      margin: 0 !important;
      translate: none !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch > .bui-area {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      translate: none !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch .bui-danmaku-switch-input {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      cursor: pointer;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch .bui-danmaku-switch-label {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch :is(
      .bui-danmaku-switch-on,
      .bui-danmaku-switch-middle,
      .bui-danmaku-switch-off
    ) {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      line-height: 0 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch :is(
      .bui-danmaku-switch-on,
      .bui-danmaku-switch-middle,
      .bui-danmaku-switch-off
    ) svg {
      position: absolute !important;
      top: 50% !important;
      right: auto !important;
      bottom: auto !important;
      left: 50% !important;
      translate: -50% -50% !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch:focus-visible,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting:focus-visible,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch:has(.bui-danmaku-switch-input:focus-visible) {
      outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-focus-ring, var(--bew-theme-color));
      outline-offset: var(--bew-space-0-5, 2px);
    }

    /* 弹幕输入条：全圆角胶囊，高于其他弹幕控制按钮（36）一个 space-2（44）
       内部件 36px 同心嵌套（22 半径 - 4 内边距 = 18 半径） */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar {
      display: flex !important;
      align-items: center !important;
      height: var(--bewly-widescreen-inputbar-height, 44px) !important;
      min-width: 0 !important;
      flex: 1 1 auto !important;
      gap: var(--bew-space-1, 4px) !important;
      padding-inline: var(--bew-space-1, 4px) !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      border-radius: var(--bew-radius-full) !important;
      corner-shape: var(--bew-corner-shape-round);
      overflow: visible !important;
      transition:
        border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        box-shadow var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    /* 风格按钮（A）嵌入输入框左半圆；发送按钮全圆角嵌右缘 */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar .bpx-player-dm-setting {
      order: -1 !important;
      margin: 0 !important;
    }

    /* 弹幕礼仪链接移除 */
    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-sending-bar,
      .bilibili-player-video-sendbar,
      .bilibili-player-video-inputbar
    ) a {
      display: none !important;
    }

    /* 控制栏收起时的底部细进度条：宽屏下永远禁用 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} [class*="shadow-progress"],
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .befilter-progress-area {
      display: none !important;
      content: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar::before {
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
      z-index: 0 !important;
      display: block !important;
      width: auto !important;
      height: auto !important;
      border-radius: inherit !important;
      corner-shape: inherit;
      background: var(--bew-elevated-alt-solid) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      background-clip: padding-box !important;
      pointer-events: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar > * {
      position: relative !important;
      z-index: 1 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-video-info,
      .bpx-player-dm-switch,
      .bpx-player-dm-setting,
      .bpx-player-video-btn-dm,
      .bpx-player-video-inputbar,
      .bpx-player-dm-input,
      .bpx-player-dm-btn-send
    ) {
      opacity: 1 !important;
      filter: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-dm-switch,
      .bpx-player-dm-setting,
      .bpx-player-video-btn-dm
    ) svg {
      color: currentColor !important;
      opacity: 1 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar:focus-within {
      border-color: var(--bew-theme-color) !important;
      box-shadow:
        0 0 0 var(--bew-space-0-5, 2px) var(--bew-theme-color-20),
        var(--bew-shadow-2),
        var(--bew-shadow-edge-glow-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar-wrap {
      min-width: 0 !important;
      flex: 1 1 auto !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: inherit !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-container {
      display: none !important;
      z-index: var(--bew-z-popover) !important;
      background: transparent !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-container.active {
      display: block !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-panel {
      color: var(--bew-text-1) !important;
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      background-clip: padding-box !important;
      overflow: hidden !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-input {
      height: var(--bew-control-height, 36px) !important;
      padding: 0 var(--bew-space-2, 8px) !important;
      background: transparent !important;
      border: 0 !important;
      color: var(--bew-text-1) !important;
      font-family: var(--bew-font-family) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      font-weight: var(--bew-font-weight-regular, 400) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-input::placeholder {
      color: var(--bew-text-3) !important;
      opacity: 1;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-btn-send {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-width: var(--bew-space-12, 48px) !important;
      height: var(--bew-control-height, 36px) !important;
      padding: 0 var(--bew-space-3, 12px) !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      color: var(--bew-on-theme-color) !important;
      background: var(--bew-theme-color) !important;
      border: 0 !important;
      border-radius: var(--bew-radius-full) !important;
      corner-shape: var(--bew-corner-shape-round);
      font-size: var(--bew-font-size-control, 13px) !important;
      font-weight: var(--bew-font-weight-semibold, 600) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
      transition: background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-btn-send:hover {
      background: var(--bew-theme-color-80) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-wrap {
      display: none !important;
      position: absolute !important;
      top: auto !important;
      right: auto !important;
      bottom: calc(100% + var(--bew-space-2, 8px)) !important;
      left: 50% !important;
      z-index: var(--bew-z-popover) !important;
      max-width: calc(100vw - var(--bew-space-8, 32px)) !important;
      margin: 0 !important;
      translate: -50% 0 !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting[aria-expanded="true"] > .bpx-player-dm-setting-wrap {
      display: block !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box {
      max-width: 100% !important;
      max-height: calc(
        100dvh
        - var(--bew-control-height, 36px)
        - var(--bew-space-12, 48px)
      ) !important;
      color: var(--bew-text-1) !important;
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      background-clip: padding-box !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-panel-wrap {
      background: transparent !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-left-block {
      overflow: visible !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-left-block-content {
      height: var(--bew-space-12, 48px) !important;
      min-height: var(--bew-space-12, 48px) !important;
      overflow: visible !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right {
      padding-top: var(--bew-space-3, 12px) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right-more {
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-1, 4px) !important;
      min-height: var(--bew-space-8, 32px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right-more > .bpx-common-svg-icon {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
      margin: 0 !important;
      flex: 0 0 var(--bew-icon-size-md, 20px) !important;
      line-height: 0 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right-more > .bpx-common-svg-icon svg {
      display: block !important;
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right-more-text {
      display: inline-flex !important;
      align-items: center !important;
      height: var(--bew-icon-size-md, 20px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
    }

    #${ROOT_ID} #playerWrap,
    #${ROOT_ID} #bilibili-player,
    #${ROOT_ID} #bilibiliPlayer,
    #${ROOT_ID} .bpx-player-container,
    #${ROOT_ID} .player-wrap {
      position: relative !important;
      left: auto !important;
      top: auto !important;
      transform: none !important;
      box-shadow: none !important;
      filter: none !important;
      border: 0 !important;
      border-radius: 0 !important;
      outline: 0 !important;
      background: var(--bew-player-canvas) !important;
      overflow: hidden !important;
    }

    #${ROOT_ID} #playerWrap::before,
    #${ROOT_ID} #playerWrap::after,
    #${ROOT_ID} .bpx-player-container::before,
    #${ROOT_ID} .bpx-player-container::after,
    #${ROOT_ID} .player-wrap::before,
    #${ROOT_ID} .player-wrap::after {
      box-shadow: none !important;
      filter: none !important;
    }

    #${ROOT_ID} .player-wrap *:not(.bili-danmaku-x-guide, .bili-danmaku-x-guide *),
    #${ROOT_ID} .bpx-player-container *:not(.bili-danmaku-x-guide, .bili-danmaku-x-guide *),
    #${ROOT_ID} .bpx-player-primary-area,
    #${ROOT_ID} .bpx-player-video-area,
    #${ROOT_ID} .bpx-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-area {
      border-top-color: transparent !important;
      border-bottom-color: transparent !important;
      box-shadow: none !important;
      filter: none !important;
      outline: 0 !important;
    }

    #${ROOT_ID} .player-wrap {
      clip-path: inset(1px 0 1px 0);
    }

    #${ROOT_ID} .player-wrap .bpx-player-shadow-progress-area,
    #${ROOT_ID} .player-wrap .bpx-player-video-area::before,
    #${ROOT_ID} .player-wrap .bpx-player-video-area::after,
    #${ROOT_ID} .player-wrap .bpx-player-primary-area::before,
    #${ROOT_ID} .player-wrap .bpx-player-primary-area::after {
      content: none !important;
      display: none !important;
      box-shadow: none !important;
      filter: none !important;
      border: 0 !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide:not(.bili-danmaku-x-guide-followed) .bili-danmaku-x-guide-follow,
    #${ROOT_ID} .bili-danmaku-x-guide-electric {
      background: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide:not(.bili-danmaku-x-guide-followed) .bili-danmaku-x-guide-follow:hover,
    #${ROOT_ID} .bili-danmaku-x-guide-electric:hover {
      background: color-mix(in srgb, var(--bew-theme-color, #00aeec) 82%, white) !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide-three {
      display: none !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide-cyc > span {
      filter: var(--bewly-widescreen-action-canvas-filter, none) !important;
    }

    #${ROOT_ID} .player-wrap > *,
    #${ROOT_ID} .bpx-player-container > * {
      border-radius: 0 !important;
    }

    #${ROOT_ID} #bilibili-player,
    #${ROOT_ID} #bilibiliPlayer,
    #${ROOT_ID} .bpx-player-container {
      width: 100% !important;
      height: 100% !important;
    }

    #${ROOT_ID} .bpx-player-primary-area,
    #${ROOT_ID} .bpx-player-video-area,
    #${ROOT_ID} .bpx-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-area,
    #${ROOT_ID} .bilibili-player-video-wrap {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-self: end;
      align-self: center;
      width: var(--bewly-widescreen-sidebar-panel-width);
      height: calc(100dvh - var(--bewly-widescreen-sidebar-floating-inset) * 2);
      margin: var(--bewly-widescreen-sidebar-floating-inset);
      min-width: 0;
      min-height: 0;
      isolation: isolate;
      background: transparent;
      color: var(--bewly-widescreen-text-primary);
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bewly-widescreen-shell-radius);
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-3), var(--bew-shadow-edge-glow-1);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      overflow: hidden;
      visibility: hidden;
      pointer-events: none;
      --bewly-widescreen-sidebar-offset: var(--bewly-widescreen-sidebar-reserved-width);
      transform: translate3d(var(--bewly-widescreen-sidebar-offset), 0, 0);
      transition:
        transform var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        visibility 0s linear var(--bew-duration-moderate, 300ms),
        border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        box-shadow var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
      will-change: transform;
      backface-visibility: hidden;
      z-index: 2;
      grid-column: 2;
      grid-row: 1;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      corner-shape: inherit;
      background: var(--bew-elevated-alt);
      backdrop-filter: var(--bew-filter-glass-1);
      -webkit-backdrop-filter: var(--bew-filter-glass-1);
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resizer {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 4;
      width: var(--bew-space-6, 24px);
      outline: none;
      cursor: ew-resize;
      touch-action: none;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-resizer {
      right: 0;
      left: auto;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resizer::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 0;
      width: var(--bew-space-0-5, 2px);
      height: var(--bew-space-12, 48px);
      border-radius: var(--bew-radius-full);
      background: var(--bewly-widescreen-divider);
      opacity: 0;
      transform: translateY(-50%);
      transition:
        opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-resizer::before {
      right: 0;
      left: auto;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resizer:hover::before,
    #${ROOT_ID} .bewly-widescreen-sidebar-resizer:focus-visible::before {
      background: var(--bew-theme-color, #00aeec);
      opacity: 1;
    }

    #${ROOT_ID}[data-sidebar-resizing="true"] .bewly-widescreen-sidebar {
      border-color: var(--bewly-widescreen-sidebar-resize-accent);
      border-width: var(--bew-space-0-5, 2px);
      box-shadow:
        0 0 var(--bew-space-6, 24px) color-mix(in oklab, var(--bewly-widescreen-sidebar-resize-accent) 42%, transparent),
        var(--bew-shadow-3),
        var(--bew-shadow-edge-glow-1);
    }

    #${ROOT_ID}[data-sidebar-resizing="true"] .bewly-widescreen-sidebar-resizer::before {
      background: var(--bewly-widescreen-sidebar-resize-accent);
      opacity: 1;
    }

    #${ROOT_ID}[data-sidebar-resizing="true"],
    #${ROOT_ID}[data-sidebar-resizing="true"] * {
      cursor: ew-resize !important;
      user-select: none !important;
    }

    #${ROOT_ID}[data-sidebar-layout="expanded"] .bewly-widescreen-sidebar,
    #${ROOT_ID}[data-sidebar-hover-expanded="true"] .bewly-widescreen-sidebar,
    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-sidebar {
      visibility: visible;
      pointer-events: auto;
      transform: translate3d(0, 0, 0);
      transition-delay: 0s;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-stage {
      grid-template-columns: 0 minmax(0, 100vw);
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-player-slot {
      grid-column: 2;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar {
      justify-self: start;
      grid-column: 1;
      --bewly-widescreen-sidebar-offset: calc(0px - var(--bewly-widescreen-sidebar-reserved-width));
    }

    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-stage {
      grid-template-columns: minmax(0, 100vw) 0;
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-stage {
      grid-template-columns: 0 minmax(0, 100vw);
    }

    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-player-frame {
      align-items: center;
      justify-content: flex-start;
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-player-frame {
      justify-content: flex-end;
    }

    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-player-frame > * {
      width: calc(100vw - var(--bewly-widescreen-sidebar-reserved-width)) !important;
      max-width: calc(100vw - var(--bewly-widescreen-sidebar-reserved-width)) !important;
      flex: 0 0 calc(100vw - var(--bewly-widescreen-sidebar-reserved-width));
    }

    #${ROOT_ID}[data-centered="true"] .bpx-player-video-area,
    #${ROOT_ID}[data-centered="true"] .bilibili-player-video-area {
      translate: var(--bewly-widescreen-center-offset) 0 !important;
    }

    body.${BODY_CLASS}:has(#${ROOT_ID}[data-centered="true"])
      .${NATIVE_PLAYER_CLASS}
      .bpx-player-video-area,
    body.${BODY_CLASS}:has(#${ROOT_ID}[data-centered="true"])
      .${NATIVE_PLAYER_CLASS}
      .bilibili-player-video-area {
      translate: var(--bewly-widescreen-center-offset) 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-toggle {
      position: absolute;
      right: 0;
      top: 50%;
      z-index: 3;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--bew-control-height, 36px);
      height: var(--bew-control-height-lg, 40px);
      padding: 0;
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bew-interactive-radius, 8px) 0 0 var(--bew-interactive-radius, 8px);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1);
      background: var(--bew-elevated-alt-solid);
      box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      cursor: pointer;
      font-size: var(--bew-font-size-control, 13px);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-control, 18px);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%);
      transition:
        opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-toggle {
      right: auto;
      left: 0;
      border-radius: 0 var(--bew-interactive-radius, 8px) var(--bew-interactive-radius, 8px) 0;
    }

    #${ROOT_ID}[data-sidebar-layout="expanded"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-hover-expanded="true"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-sidebar-toggle {
      right: calc(
        var(--bewly-widescreen-sidebar-full-width)
        + var(--bewly-widescreen-sidebar-floating-inset)
        + var(--bew-space-2, 8px)
      );
      border-radius: var(--bew-interactive-radius, 8px);
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-layout="expanded"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-hover-expanded="true"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-sidebar-toggle {
      right: auto;
      left: calc(
        var(--bewly-widescreen-sidebar-full-width)
        + var(--bewly-widescreen-sidebar-floating-inset)
        + var(--bew-space-2, 8px)
      );
      border-radius: var(--bew-interactive-radius, 8px);
    }

    #${ROOT_ID}[data-sidebar-toggle-visible="true"][data-pointer-active="true"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-toggle-visible="true"] .bewly-widescreen-sidebar-toggle:hover,
    #${ROOT_ID}[data-sidebar-toggle-visible="true"] .bewly-widescreen-sidebar-toggle:focus-visible {
      opacity: 1;
      pointer-events: auto;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-toggle:hover {
      background: var(--bew-theme-color, #00aeec);
      border-color: var(--bew-theme-color, #00aeec);
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-top {
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
      min-height: 0;
      max-height: 52%;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding: var(--bew-space-2) var(--bew-space-3);
      border-bottom: 1px solid var(--bewly-widescreen-divider);
      background: var(--bewly-widescreen-surface-bg);
    }

    #${ROOT_ID} .bewly-widescreen-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--bew-space-3);
      margin-bottom: var(--bew-space-2);
    }

    #${ROOT_ID} .bewly-widescreen-title-group {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      gap: var(--bew-space-2, 8px);
    }

    #${ROOT_ID} .bewly-widescreen-close {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      width: var(--bew-control-height-sm);
      height: var(--bew-control-height-sm);
      padding: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      cursor: pointer;
      font-size: 0;
      line-height: 1;
      flex: 0 0 auto;
    }

    #${ROOT_ID} .bewly-widescreen-close::before,
    #${ROOT_ID} .bewly-widescreen-close::after {
      content: "";
      position: absolute;
      width: var(--bew-font-size-control);
      height: var(--bew-space-0-5);
      border-radius: var(--bew-radius-full);
      background: currentColor;
      transform: rotate(45deg);
    }

    #${ROOT_ID} .bewly-widescreen-close::after {
      transform: rotate(-45deg);
    }

    #${ROOT_ID} .bewly-widescreen-close:hover {
      color: var(--bewly-widescreen-text-primary);
      background: var(--bewly-widescreen-control-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-title {
      display: block;
      overflow: visible;
      margin: 0;
      color: var(--bewly-widescreen-text-primary);
      font-size: var(--bew-font-size-heading);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-heading);
      overflow-wrap: anywhere;
      white-space: normal;
    }

    #${ROOT_ID} .bewly-widescreen-title-notice[hidden] {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-title-notice-content,
    #${ROOT_ID} .bewly-widescreen-title-notice .video-argue {
      width: 100% !important;
      margin: 0 !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
      overflow-wrap: anywhere;
      white-space: normal !important;
    }

    /* 声明内容行内布局：感叹号图标与文字同行，不再分列。原生 .video-argue-inner
       亦为 flex 行内结构，克隆后统一为固定小图标 + 可换行文字 */
    #${ROOT_ID} .bewly-widescreen-title-notice .video-argue-inner,
    #${ROOT_ID} .bewly-widescreen-title-notice-content.is-fallback {
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-1, 4px) !important;
      width: 100% !important;
      padding: var(--bew-space-2, 8px) var(--bew-space-3, 12px) !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      background: var(--bewly-widescreen-control-bg) !important;
      color: inherit !important;
    }

    #${ROOT_ID} .bewly-widescreen-title-notice .video-argue-inner .remark-icon,
    #${ROOT_ID} .bewly-widescreen-title-notice .video-argue-inner svg {
      width: var(--bew-icon-size-sm, 16px) !important;
      height: var(--bew-icon-size-sm, 16px) !important;
      margin: 0 !important;
      flex: 0 0 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-title-notice .video-argue-inner .argue-text {
      min-width: 0 !important;
      flex: 1 1 auto !important;
      overflow: visible !important;
      white-space: normal !important;
      text-overflow: clip !important;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot {
      min-height: 0;
      color: var(--bewly-widescreen-text-secondary);
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot .video-info-meta,
    #${ROOT_ID} .bewly-widescreen-metadata-slot .video-info-detail-list {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      width: 100% !important;
      min-height: 0 !important;
      margin: 0 !important;
      gap: var(--bew-space-1) var(--bew-space-3) !important;
      color: inherit !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot .item {
      display: inline-flex !important;
      align-items: center !important;
      gap: var(--bew-space-1) !important;
      margin: 0 !important;
      color: inherit !important;
      white-space: nowrap;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot svg {
      width: var(--bew-icon-size-sm) !important;
      height: var(--bew-icon-size-sm) !important;
      color: currentColor !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot {
      min-height: 0;
      margin-top: var(--bew-space-1);
      container-type: inline-size;
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--bew-space-1);
      width: 100%;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stat {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: var(--bew-control-height-sm);
      padding: 0 var(--bew-space-1);
      overflow: hidden;
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-caption);
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-line-height-caption);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot {
      margin-top: var(--bew-space-2);
      padding-top: var(--bew-space-2);
      border-top: 1px solid var(--bewly-widescreen-divider);
      color: var(--bewly-widescreen-text-primary);
    }

    #${ROOT_ID} .bewly-widescreen-description-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot {
      margin-top: var(--bew-space-2, 8px);
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .video-tag-container {
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .tag-panel {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: var(--bew-space-2, 8px) !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .tag-panel .tag {
      float: none !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .video-desc-container {
      width: 100% !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .basic-desc-info {
      height: auto !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
      overflow: hidden !important;
      overflow-wrap: anywhere;
      word-break: break-word !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .video-desc-container,
    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded #v_desc {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .basic-desc-info {
      display: block !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      -webkit-line-clamp: unset !important;
      -webkit-box-orient: initial !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-collapsed .basic-desc-info {
      display: -webkit-box !important;
      height: calc(var(--bew-line-height-control, 18px) + var(--bew-line-height-control, 18px)) !important;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .video-desc-container > .toggle-btn {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-collapsed .subtitle-maker-list {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .subtitle-maker-list {
      display: block !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .subtitle-maker-list {
      padding-top: var(--bew-space-2) !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot a {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-description {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      margin: 0;
      overflow: hidden;
      color: var(--bewly-widescreen-text-secondary);
      font-size: var(--bew-font-size-control);
      line-height: var(--bew-line-height-control);
      overflow-wrap: anywhere;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-category {
      display: inline-flex;
      align-items: center;
      min-height: var(--bew-control-height-sm);
      padding: 0 var(--bew-space-3);
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      border-radius: var(--bew-badge-radius);
      corner-shape: var(--bew-corner-shape-round);
      font-size: var(--bew-font-size-caption);
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-line-height-caption);
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle {
      display: block;
      margin-top: var(--bew-space-1);
      padding: 0;
      border: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: var(--bew-font-size-control, 13px);
      line-height: var(--bew-line-height-control, 18px);
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle:hover {
      color: var(--bew-theme-color, #00aeec);
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle[hidden] {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-container,
    #${ROOT_ID} .bewly-widescreen-action-slot #arc_toolbar_report {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      width: 100% !important;
      min-width: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot #arc_toolbar_report {
      flex-wrap: nowrap;
      gap: 0;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left {
      display: block !important;
      min-width: 0 !important;
      flex: 0 1 auto !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-main {
      display: flex !important;
      align-items: center !important;
      width: auto !important;
      min-width: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap {
      display: flex !important;
      position: relative !important;
      min-width: 0 !important;
      width: auto !important;
      margin: 0 var(--bew-space-3, 12px) 0 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap:last-child {
      margin-right: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: var(--bew-space-1) !important;
      position: relative !important;
      flex: 0 1 auto !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      background: transparent !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
      min-height: var(--bew-control-height-sm, 28px) !important;
      white-space: nowrap !important;
      text-align: center !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > .video-toolbar-left-item {
      flex: 0 1 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"],
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"],
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item > canvas,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > canvas,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > .svga-center,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"]:not(.selfdef-triple-anime),
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"]:not(.selfdef-triple-anime) {
      position: absolute !important;
      inset: auto !important;
      left: var(--bewly-action-anchor-x, 50%) !important;
      top: var(--bewly-action-anchor-y, 50%) !important;
      margin: 0 !important;
      translate: -50% -50% !important;
      color: var(--bew-theme-color, #00aeec) !important;
      pointer-events: none !important;
      z-index: 2 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item .svga-top,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left > .selfdef-triple-anime {
      position: absolute !important;
      left: var(--bewly-action-anchor-x, 50%) !important;
      translate: -50% 0 !important;
      pointer-events: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item > canvas {
      filter: var(--bewly-widescreen-action-canvas-filter, none) !important;
      opacity: 0.96 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] svg {
      width: 100% !important;
      height: 100% !important;
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] [stroke] {
      stroke: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] [fill]:not([fill="none"]) {
      fill: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap > span,
    #${ROOT_ID} .bewly-widescreen-action-slot #share-btn-outer {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: var(--bew-space-1) !important;
      min-width: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap {
      flex: 0 1 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info-text {
      display: inline !important;
      margin-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item:hover,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item:hover {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .on,
    #${ROOT_ID} .bewly-widescreen-action-slot .active,
    #${ROOT_ID} .bewly-widescreen-action-slot .liked,
    #${ROOT_ID} .bewly-widescreen-action-slot .collected,
    #${ROOT_ID} .bewly-widescreen-action-slot .is-active,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.liked,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.liked *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.collected,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.collected * {
      color: var(--bew-theme-color, #00aeec) !important;
      fill: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-item-icon,
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn__icon {
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
      margin-right: 0 !important;
      flex: 0 0 auto !important;
      font-size: var(--bew-icon-size-md, 20px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-like-icon {
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-item-text,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 0 !important;
      white-space: nowrap !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right {
      display: flex !important;
      align-items: center !important;
      flex: 0 0 auto !important;
      margin-left: var(--bew-space-3, 12px) !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right > :not(.bewly-watch-later-btn) {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: inline-flex !important;
      width: auto !important;
      min-width: var(--bew-control-height-sm, 28px) !important;
      height: var(--bew-control-height-sm, 28px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn:hover {
      color: var(--bewly-widescreen-text-primary) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn.is-active:hover {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-panel-container,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-info-container,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-info,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .upinfo {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-panel-container,
    #${ROOT_ID} .bewly-widescreen-up-slot .up-info-container,
    #${ROOT_ID} .bewly-widescreen-up-slot .up-info,
    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo {
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-tabs {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      flex: 0 0 auto;
      height: var(--bew-control-height-lg);
      background: var(--bewly-widescreen-surface-bg);
      border-bottom: 1px solid var(--bewly-widescreen-divider);
    }

    #${ROOT_ID} .bewly-widescreen-tab {
      position: relative;
      border: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: transparent;
      cursor: pointer;
      font-size: var(--bew-font-size-control);
      font-weight: var(--bew-font-weight-semibold);
      line-height: var(--bew-line-height-control);
    }

    #${ROOT_ID} .bewly-widescreen-tab.is-active {
      color: var(--bew-theme-color, #00aeec);
    }

    #${ROOT_ID} .bewly-widescreen-tab.is-active::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 0;
      width: var(--bew-space-6);
      height: var(--bew-space-0-5);
      border-radius: var(--bew-radius-sm) var(--bew-radius-sm) 0 0;
      background: var(--bew-theme-color, #00aeec);
      transform: translateX(-50%);
    }

    #${ROOT_ID} .bewly-widescreen-panels {
      position: relative;
      z-index: 0;
      flex: 1 1 0;
      min-height: 0;
      overflow: hidden;
      background: var(--bewly-widescreen-sidebar-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel {
      width: 100%;
      height: 100%;
      overflow: auto;
      overscroll-behavior: contain;
      padding: var(--bew-space-2) var(--bew-space-2) var(--bew-space-4);
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku {
      background: var(--bewly-widescreen-sidebar-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku {
      position: relative;
      padding: 0;
      overflow: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .danmaku-box,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .danmaku-wrap,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-docker,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-auxiliary,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-collapse,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-wrap {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-docker {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-collapse,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-wrap {
      display: flex !important;
      flex-direction: column;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-header {
      flex: 0 0 auto;
      display: flex !important;
      align-items: center !important;
      height: auto !important;
      min-height: var(--bew-control-height-lg, 40px) !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
      border-bottom-color: var(--bewly-widescreen-divider) !important;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-arrow {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-filter {
      pointer-events: auto;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-body {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      flex: 1 1 0 !important;
      overflow: hidden;
      background: var(--bewly-widescreen-sidebar-bg) !important;
      transform: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-wraplist {
      display: flex !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      flex-direction: column;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-filter-wrap.bpx-player-dm {
      display: flex !important;
      height: 100% !important;
      min-height: 0 !important;
      flex: 1 1 auto;
      flex-direction: column;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-management,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-function,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-footer {
      flex: 0 0 auto;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-wrap {
      position: relative !important;
      height: auto !important;
      min-height: 0 !important;
      flex: 1 1 auto;
      overflow: hidden;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-container,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-long-list-wrap {
      height: 100% !important;
      min-height: 0 !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-long-list-list {
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton {
      position: absolute;
      inset: 0;
      z-index: 3;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: var(--bew-space-3, 12px) var(--bew-space-4, 16px) var(--bew-space-4, 16px);
      background: transparent;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku:has(.bewly-widescreen-danmaku-skeleton)
      .bpx-player-dm-load-status {
      visibility: hidden !important;
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__rows {
      display: grid;
      gap: var(--bew-space-3, 12px);
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__row {
      display: grid;
      grid-template-columns: var(--bew-space-10, 40px) minmax(0, 1fr) calc(var(--bew-space-8, 32px) * 2);
      align-items: center;
      gap: var(--bew-space-3, 12px);
      min-height: var(--bew-line-height-caption, 16px);
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__block {
      display: block;
      height: var(--bew-space-3, 12px);
      border-radius: var(--bew-radius-sm);
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-skeleton);
      animation: bewly-widescreen-skeleton-shimmer 1.4s ease-in-out infinite alternate;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__time {
      width: 80%;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__content {
      width: 88%;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__row:nth-child(3n + 2) .bewly-widescreen-danmaku-skeleton__content {
      width: 68%;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__row:nth-child(3n) .bewly-widescreen-danmaku-skeleton__content {
      width: 96%;
    }

    @keyframes bewly-widescreen-skeleton-shimmer {
      to {
        opacity: 0.48;
      }
    }

    /* B 站表情面板可能向上展开；只在打开期间允许它越过评论面板边界。 */
    #${ROOT_ID} .bewly-widescreen-panels[data-bewly-comment-emoji-open],
    #${ROOT_ID} .bewly-widescreen-panel[data-bewly-comment-emoji-open] {
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-panel[hidden] {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel > * {
      width: 100% !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }

    /* B 站的选集组件会继承普通视频页的固定高度。宽屏模式下由整个
       选集面板负责滚动，列表便可以使用直到视口底部的全部剩余空间。 */
    #${ROOT_ID} .bewly-widescreen-panel-playlist {
      overflow-y: auto;
      scrollbar-gutter: stable;
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: auto !important;
      min-height: var(--bew-control-height, 36px);
      margin:
        0
        var(--bewly-widescreen-playlist-toggle-inset-end, 0px)
        var(--bew-space-2, 8px)
        var(--bewly-widescreen-playlist-toggle-inset-start, 0px);
      padding: 0 var(--bew-space-3, 12px);
      color: var(--bew-text-2);
      background: var(--bew-elevated-alt);
      border: 0;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      cursor: pointer;
      font-family: var(--bew-font-family);
      font-size: var(--bew-font-size-control, 13px);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-control, 18px);
      transition:
        color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle[hidden] {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle::after {
      content: "";
      width: var(--bew-space-2, 8px);
      height: var(--bew-space-2, 8px);
      margin-left: var(--bew-space-2, 8px);
      border-right: var(--bew-space-0-5, 2px) solid currentColor;
      border-bottom: var(--bew-space-0-5, 2px) solid currentColor;
      transform: rotate(45deg);
      transition: transform var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle[aria-expanded="true"]::after {
      transform: rotate(225deg);
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle:hover {
      color: var(--bew-text-1);
      background: var(--bew-elevated-alt-hover);
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle:focus-visible {
      outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-focus-ring, var(--bew-theme-color));
      outline-offset: var(--bew-space-0-5, 2px);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__body,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-page,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-page-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .cur-list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .list-box,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .base-video-sections-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-sections-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-sections-content-list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist #eplist_module,
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="eplist_ep_list_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="numberList_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="imageList_wrap"] {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel [class*="eplist_ep_list_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="recommend_wrap"],
    #${ROOT_ID} .bewly-widescreen-panel #danmukuBox,
    #${ROOT_ID} .bewly-widescreen-panel [class*="DanmukuBox_wrap"],
    #${ROOT_ID} .bewly-widescreen-panel #comment-module,
    #${ROOT_ID} .bewly-widescreen-panel #comment-body {
      position: relative !important;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      transform: none !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 0 var(--bew-space-3) !important;
      z-index: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel [class*="numberList_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="imageList_wrap"] {
      width: 100% !important;
      max-width: 100% !important;
    }

    /* Keep only the marked episode section internally scrollable. The panel
       itself remains the outer scroll fallback for recommendations and other
       sidebar content; nested playlist containers stay overflow-visible. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist.${EPISODE_SECTION_CLASS},
    #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS} {
      height: auto !important;
      max-height: min(52dvh, var(--bew-widescreen-episode-max-height)) !important;
      opacity: 1;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      transition:
        max-height var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        margin var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist.is-episode-section-collapsed .${EPISODE_SECTION_CLASS} {
      max-height: calc(var(--bew-control-height, 36px) + var(--bew-space-2, 8px)) !important;
      margin-bottom: 0 !important;
      overflow: hidden !important;
      scrollbar-gutter: auto;
    }

    #${ROOT_ID} .bewly-widescreen-panel .video-page-card-small {
      width: 100% !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-item,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-item,
    #${ROOT_ID} .bewly-widescreen-panel-comment .root-reply-container,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-container {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .content-warp,
    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-content-container,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-content {
      min-width: 0 !important;
      margin-left: var(--bew-space-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .user-info,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-user-info {
      min-width: 0 !important;
      max-width: 100% !important;
      flex-wrap: wrap !important;
      gap: var(--bew-space-1) var(--bew-space-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-time,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-time,
    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-time-location {
      white-space: nowrap !important;
      font-size: var(--bew-font-size-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 25%;
      color: var(--bewly-widescreen-text-muted);
      font-size: var(--bew-font-size-body);
    }

    @media (prefers-reduced-motion: reduce) {
      body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
        .bpx-player-control-wrap,
        .bilibili-player-video-control-wrap,
        .bilibili-player-video-control,
        .squirtle-controller
      ),
      body.${BODY_CLASS} .${DANMAKU_GLASS_CLASS},
      #${ROOT_ID} .bewly-widescreen-sidebar,
      ${DANMAKU_SURFACE_SELECTOR},
      #${ROOT_ID} .bewly-widescreen-sidebar-toggle,
      #${ROOT_ID} .bewly-widescreen-playlist-toggle::after,
      #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS},
      #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__block {
        transition: none;
        animation: none;
      }
    }

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      #${ROOT_ID} {
        --bewly-widescreen-sidebar-panel-width: 100vw;
      }

      #${ROOT_ID} .bewly-widescreen-stage,
      #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-stage,
      #${ROOT_ID}[data-centered="true"] .bewly-widescreen-stage,
      #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-stage {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(0, 56dvh) minmax(0, 44dvh);
      }

      #${ROOT_ID} .bewly-widescreen-player-slot {
        grid-column: 1;
        grid-row: 1;
        padding: 0;
      }

      ${DANMAKU_SURFACE_SELECTOR} {
        padding-inline: var(--bew-space-4, 16px) !important;
      }

      #${ROOT_ID} .bewly-widescreen-sidebar {
        grid-column: 1;
        grid-row: 2;
        width: 100%;
        height: 100%;
        margin: 0;
        border-radius: 0;
        visibility: visible;
        pointer-events: auto;
        transform: none;
        transition: none;
        box-shadow: none;
      }

      #${ROOT_ID} .bewly-widescreen-sidebar-toggle,
      #${ROOT_ID} .bewly-widescreen-sidebar-resizer {
        display: none;
      }

      #${ROOT_ID} .bewly-widescreen-player-frame > *,
      #${ROOT_ID}[data-centered="true"] .bewly-widescreen-player-frame > * {
        width: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        flex-basis: auto;
      }

      #${ROOT_ID}[data-centered="true"] .bpx-player-video-area,
      #${ROOT_ID}[data-centered="true"] .bilibili-player-video-area {
        translate: none !important;
      }
    }
  `)
}

const ANCHORED_PLAYER_GEOMETRY_PROPERTIES = [
  '--bewly-widescreen-player-height',
  '--bewly-widescreen-player-left',
  '--bewly-widescreen-player-top',
  '--bewly-widescreen-player-width',
  '--bewly-widescreen-center-offset',
] as const

const AUXILIARY_CONTROL_GEOMETRY_PROPERTIES = [
  '--bewly-widescreen-aux-controls-bottom',
  '--bewly-widescreen-aux-controls-left',
] as const

function clearAuxiliaryControlGeometry() {
  const host = document.querySelector<HTMLElement>('#bewly')
  AUXILIARY_CONTROL_GEOMETRY_PROPERTIES.forEach(property => host?.style.removeProperty(property))
}

function disablePinnedHighEnergyProgress(highEnergyProgress: HTMLElement) {
  if (!highEnergyProgress.classList.contains('pin'))
    return
  highEnergyProgress.querySelector<HTMLElement>(HIGH_ENERGY_PROGRESS_PIN_SELECTOR)?.click()
}

function syncHighEnergyProgressState(
  currentState: BewlyWidescreenState,
  highEnergyProgress: HTMLElement | null,
) {
  if (currentState.highEnergyProgressElement === highEnergyProgress) {
    if (highEnergyProgress)
      disablePinnedHighEnergyProgress(highEnergyProgress)
    return
  }

  currentState.highEnergyProgressObserver?.disconnect()
  currentState.highEnergyProgressObserver = undefined
  currentState.highEnergyProgressElement = highEnergyProgress ?? undefined
  if (!highEnergyProgress)
    return

  currentState.highEnergyProgressObserver = new MutationObserver(() => {
    if (state === currentState && currentState.highEnergyProgressElement === highEnergyProgress)
      disablePinnedHighEnergyProgress(highEnergyProgress)
  })
  currentState.highEnergyProgressObserver.observe(highEnergyProgress, {
    attributes: true,
    attributeFilter: ['class'],
  })
  disablePinnedHighEnergyProgress(highEnergyProgress)
}

/* 悬浮玻璃卡高度 = 弹幕区高度 + 原生控制栏实际高度 + 高能进度图高度。
   原生收起态由 CSS 属性选择器塌缩，无需在此处处理。 */
function syncControlsGlassGeometry(currentState: BewlyWidescreenState) {
  const glass = currentState.danmakuGlass
  if (!glass?.isConnected)
    return
  const container = getNativePlayerContainer(currentState) ?? currentState.playerEl
  const wrap = container?.querySelector<HTMLElement>(NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR)
  const wrapHeight = wrap?.isConnected ? Math.round(wrap.getBoundingClientRect().height) : 0
  const highEnergyProgress = container?.querySelector<HTMLElement>(HIGH_ENERGY_PROGRESS_SELECTOR)
  syncHighEnergyProgressState(currentState, highEnergyProgress ?? null)
  const highEnergyProgressHeight = highEnergyProgress?.isConnected
    ? Math.ceil(highEnergyProgress.getBoundingClientRect().height)
    : 0
  const controlsHeight = wrapHeight + highEnergyProgressHeight
  // 同值跳过：visibility/resize/observer 链频繁触发本函数，重复写自定义属性会重启过渡
  if (controlsHeight === currentState.controlsGlassAppliedHeight)
    return
  currentState.controlsGlassAppliedHeight = controlsHeight
  if (controlsHeight > 0) {
    glass.style.setProperty(
      '--bewly-widescreen-controls-glass-height',
      `calc(var(--bewly-widescreen-bottom-controls-height) + var(--bewly-widescreen-controls-block-padding, 12px) + ${controlsHeight}px)`,
    )
  }
  else {
    glass.style.removeProperty('--bewly-widescreen-controls-glass-height')
  }
}

function syncAuxiliaryControlGeometry(currentState: BewlyWidescreenState) {
  const host = document.querySelector<HTMLElement>('#bewly')
  const viewerInfo = currentState.danmakuSemanticsSource?.querySelector<HTMLElement>('.bpx-player-video-info')
  const dockRect = (currentState.danmakuSourceHost ?? currentState.danmakuDock).getBoundingClientRect()
  const viewerRect = viewerInfo?.getBoundingClientRect()
  if (!host || !viewerRect || dockRect.width <= 0 || dockRect.height <= 0) {
    clearAuxiliaryControlGeometry()
    return
  }

  const rootStyle = getComputedStyle(currentState.root)
  const gap = Number.parseFloat(rootStyle.getPropertyValue('--bew-space-2')) || 8
  const controlHeight = Number.parseFloat(rootStyle.getPropertyValue('--bew-control-height')) || 36
  const left = viewerRect.right + gap
  // 圆键贴底必须锚定不受隐藏 translate 影响的稳定几何：strip/glass 隐藏时用 transform 位移，
  // 直接读 dockRect 会在收起与归位过渡中漂移，导致圆键先贴视口底再跳回正确高度
  const glassBottom = Number.parseFloat(rootStyle.getPropertyValue('--bewly-widescreen-controls-glass-bottom')) || 8
  const stableDockBottom = currentState.danmakuSourceHost?.isConnected && currentState.playerEl.isConnected
    ? currentState.playerEl.getBoundingClientRect().bottom - glassBottom
    : currentState.playerFrame.isConnected
      ? currentState.playerFrame.getBoundingClientRect().bottom + dockRect.height
      : dockRect.bottom
  // 按卡片内容块间距贴底，与原生 36px 控制按钮同水平线
  const blockPadding = Math.max((dockRect.height - controlHeight) / 2, 0)
  const bottom = Math.max(window.innerHeight - stableDockBottom + blockPadding, 0)
  host.style.setProperty('--bewly-widescreen-aux-controls-left', `${left}px`)
  host.style.setProperty('--bewly-widescreen-aux-controls-bottom', `${bottom}px`)
}

function clearAnchoredPlayerElement(playerEl: HTMLElement) {
  playerEl.classList.remove(NATIVE_PLAYER_CLASS)
  ANCHORED_PLAYER_GEOMETRY_PROPERTIES.forEach(property => playerEl.style.removeProperty(property))
}

function syncAnchoredPlayerGeometry(currentState: BewlyWidescreenState) {
  const { playerEl, playerFrame, root, sidebarEl } = currentState
  if (!playerEl.isConnected || !playerFrame.isConnected)
    return

  exitNativeMiniPlayer(playerEl)
  const frameRect = playerFrame.getBoundingClientRect()
  const sidebarRect = sidebarEl.getBoundingClientRect()
  const sidebarFloatingInset = Number.parseFloat(
    getComputedStyle(root).getPropertyValue('--bewly-widescreen-sidebar-floating-inset'),
  ) || 0
  const geometry = resolveWidescreenAnchoredPlayerGeometry({
    centered: root.dataset.centered === 'true',
    frameHeight: frameRect.height,
    frameLeft: frameRect.left,
    frameTop: frameRect.top,
    frameWidth: frameRect.width,
    sidebarPosition: currentState.sidebarPosition,
    sidebarReservedWidth: sidebarRect.width + sidebarFloatingInset * 2,
  })

  playerEl.style.setProperty('--bewly-widescreen-player-height', `${geometry.height}px`)
  playerEl.style.setProperty('--bewly-widescreen-player-left', `${geometry.left}px`)
  playerEl.style.setProperty('--bewly-widescreen-player-top', `${geometry.top}px`)
  playerEl.style.setProperty('--bewly-widescreen-player-width', `${geometry.width}px`)
  syncAuxiliaryControlGeometry(currentState)
}

function ensureAnchoredPlayer(currentState: BewlyWidescreenState) {
  if (!currentState.playerEl.isConnected) {
    const replacement = findMovable(selectors.player)
    if (!replacement)
      return false
    clearAnchoredPlayerElement(currentState.playerEl)
    currentState.playerEl = replacement
  }

  exitNativeMiniPlayer(currentState.playerEl)
  currentState.playerEl.classList.add(NATIVE_PLAYER_CLASS)
  syncAnchoredPlayerGeometry(currentState)
  return true
}

function isHorizontalWidescreenLayout(currentState: BewlyWidescreenState) {
  const playerRect = currentState.playerSlot.getBoundingClientRect()
  const sidebarRect = currentState.sidebarEl.getBoundingClientRect()
  return playerRect.top < sidebarRect.bottom - 1
    && sidebarRect.top < playerRect.bottom - 1
}

function updateSidebarLayoutState(currentState: BewlyWidescreenState | null = state) {
  if (!currentState || state !== currentState)
    return

  const rootRect = currentState.root.getBoundingClientRect()
  const playerRect = currentState.playerFrame.getBoundingClientRect()
  const sidebarRect = currentState.sidebarEl.getBoundingClientRect()
  const sidebarFloatingInset = Number.parseFloat(
    getComputedStyle(currentState.root).getPropertyValue('--bewly-widescreen-sidebar-floating-inset'),
  ) || 0
  const configuredAspect = Number.parseFloat(
    currentState.root.style.getPropertyValue('--bewly-widescreen-layout-aspect'),
  ) || 16 / 9
  const playerHost = getVideoElement()?.closest<HTMLElement>('.bewly-vertical-video-zoom-host')
  const visualAspect = playerHost?.classList.contains('is-bewly-vertical-video-zoomed')
    ? 1
    : configuredAspect
  const geometry = resolveWidescreenCenterGeometry({
    centerEnabled: settings.value.bewlyWidescreenCenterVideo,
    compactLayout: currentState.sidebarLayout === 'compact',
    horizontalLayout: isHorizontalWidescreenLayout(currentState),
    viewportWidth: rootRect.width,
    playerHeight: playerRect.height,
    visualAspect,
    sidebarWidth: sidebarRect.width + sidebarFloatingInset * 2,
  })
  const direction = currentState.sidebarPosition === 'right' ? 1 : -1

  const centered = geometry.enabled
    && currentState.root.dataset.sidebarManuallyClosed !== 'true'
  currentState.root.dataset.centered = String(centered)
  currentState.root.dataset.sidebarToggleVisible = 'true'
  currentState.root.style.setProperty(
    '--bewly-widescreen-center-offset',
    `${geometry.offset * direction}px`,
  )
  currentState.playerEl.style.setProperty(
    '--bewly-widescreen-center-offset',
    `${geometry.offset * direction}px`,
  )
  if (centered)
    currentState.root.dataset.sidebarHoverExpanded = 'false'
  syncAnchoredPlayerGeometry(currentState)
  syncNativePlayerControlVisibility(currentState)
  scheduleActionGeometrySync(currentState)
}

function updateAspectRatio(currentState: BewlyWidescreenState | null = state) {
  if (!currentState || state !== currentState)
    return

  const video = getVideoElement()
  const aspect = video?.videoWidth && video.videoHeight
    ? video.videoWidth / video.videoHeight
    : 16 / 9
  const layoutAspect = Math.min(aspect, 16 / 9)

  currentState.root.style.setProperty('--bewly-widescreen-aspect', String(aspect))
  currentState.root.style.setProperty('--bewly-widescreen-layout-aspect', String(layoutAspect))
  updateSidebarLayoutState(currentState)
  schedulePlayerResizeSync(currentState)
}

function parseRgbColor(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match)
    return null

  return {
    r: Number(match[1]) / 255,
    g: Number(match[2]) / 255,
    b: Number(match[3]) / 255,
  }
}

function rgbToHsl({ r, g, b }: { r: number, g: number, b: number }) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2

  if (max === min)
    return { hue: 0, saturation: 0, lightness }

  const delta = max - min
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min)

  let hue = 0
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0)
      break
    case g:
      hue = (b - r) / delta + 2
      break
    default:
      hue = (r - g) / delta + 4
      break
  }

  return { hue: hue * 60, saturation, lightness }
}

function resolveCssColor(currentState: BewlyWidescreenState, value: string) {
  if (!value)
    return null

  let probe = currentState.colorProbe
  if (!probe) {
    probe = document.createElement('span')
    probe.style.position = 'fixed'
    probe.style.pointerEvents = 'none'
    probe.style.opacity = '0'
    probe.setAttribute('aria-hidden', 'true')
    currentState.root.appendChild(probe)
    currentState.colorProbe = probe
  }
  if (probe.style.color !== value)
    probe.style.color = value
  return parseRgbColor(getComputedStyle(probe).color)
}

function syncActionAnimationTheme(currentState: BewlyWidescreenState) {
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--bew-theme-color').trim()
  const rgb = resolveCssColor(currentState, themeColor || '#00aeec')
  if (!rgb)
    return

  const { hue, saturation, lightness } = rgbToHsl(rgb)
  const hueRotate = Math.round(hue - BILIBILI_ACTION_ANIMATION_HUE)
  const saturationRatio = Math.max(0.8, Math.min(2.4, saturation / 0.85))
  const brightnessRatio = Math.max(0.75, Math.min(1.35, lightness / 0.46))
  currentState.root.style.setProperty(
    '--bewly-widescreen-action-canvas-filter',
    `hue-rotate(${hueRotate}deg) saturate(${saturationRatio.toFixed(2)}) brightness(${brightnessRatio.toFixed(2)})`,
  )
}

function clearPlayerResizeSync(currentState: BewlyWidescreenState) {
  if (currentState.resizeSyncFrame !== undefined)
    cancelAnimationFrame(currentState.resizeSyncFrame)
  currentState.resizeSyncFrame = undefined
}

function schedulePlayerResizeSync(currentState: BewlyWidescreenState) {
  if (!state || state !== currentState || currentState.resizeSyncFrame !== undefined)
    return

  currentState.resizeSyncFrame = requestAnimationFrame(() => {
    currentState.resizeSyncFrame = undefined
    if (!state || state !== currentState)
      return

    updateSidebarLayoutState(currentState)
    window.dispatchEvent(new Event('resize'))
  })
}

function clearActionGeometry(currentState: BewlyWidescreenState) {
  if (currentState.actionGeometryFrame !== undefined)
    cancelAnimationFrame(currentState.actionGeometryFrame)
  currentState.actionGeometryFrame = undefined
  currentState.actionGeometryElements?.forEach((element) => {
    element.style.removeProperty('--bewly-action-anchor-x')
    element.style.removeProperty('--bewly-action-anchor-y')
  })
  currentState.actionGeometryElements?.clear()
}

function syncActionEffectGeometry(currentState: BewlyWidescreenState) {
  if (!state || state !== currentState)
    return

  const measurements: Array<{ element: HTMLElement, x: number, y: number }> = []
  const findVisibleAnchor = (button: HTMLElement) => {
    const buttonRect = button.getBoundingClientRect()
    const candidates = button.querySelectorAll<HTMLElement>(
      '.video-toolbar-item-icon, .video-like-icon, .video-share-icon, svg, i',
    )
    return Array.from(candidates).find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      return rect.width > 0
        && rect.height > 0
        && centerX >= buttonRect.left
        && centerX <= buttonRect.right
        && centerY >= buttonRect.top
        && centerY <= buttonRect.bottom
    }) || button
  }
  const wraps = currentState.toolbarSlot.querySelectorAll<HTMLElement>('.toolbar-left-item-wrap')
  wraps.forEach((wrap) => {
    const button = wrap.querySelector<HTMLElement>('.video-toolbar-left-item')
    if (!button)
      return
    const anchor = findVisibleAnchor(button)
    const anchorRect = anchor.getBoundingClientRect()
    for (const element of [wrap, button]) {
      const rect = element.getBoundingClientRect()
      measurements.push({
        element,
        x: anchorRect.left + anchorRect.width / 2 - rect.left,
        y: anchorRect.top + anchorRect.height / 2 - rect.top,
      })
    }
  })

  const toolbarLeft = currentState.toolbarSlot.querySelector<HTMLElement>('.video-toolbar-left')
  const firstButton = wraps[0]?.querySelector<HTMLElement>('.video-toolbar-left-item')
  const firstAnchor = firstButton ? findVisibleAnchor(firstButton) : null
  if (toolbarLeft && firstAnchor) {
    const anchorRect = firstAnchor.getBoundingClientRect()
    const toolbarRect = toolbarLeft.getBoundingClientRect()
    measurements.push({
      element: toolbarLeft,
      x: anchorRect.left + anchorRect.width / 2 - toolbarRect.left,
      y: anchorRect.top + anchorRect.height / 2 - toolbarRect.top,
    })
  }

  const nextElements = new Set(measurements.map(({ element }) => element))
  currentState.actionGeometryElements?.forEach((element) => {
    if (nextElements.has(element))
      return
    element.style.removeProperty('--bewly-action-anchor-x')
    element.style.removeProperty('--bewly-action-anchor-y')
  })
  measurements.forEach(({ element, x, y }) => {
    element.style.setProperty('--bewly-action-anchor-x', `${x}px`)
    element.style.setProperty('--bewly-action-anchor-y', `${y}px`)
  })
  currentState.actionGeometryElements = nextElements
}

function scheduleActionGeometrySync(currentState: BewlyWidescreenState) {
  if (!state || state !== currentState || currentState.actionGeometryFrame !== undefined)
    return

  currentState.actionGeometryFrame = requestAnimationFrame(() => {
    currentState.actionGeometryFrame = undefined
    syncActionEffectGeometry(currentState)
  })
}

function setupActionGeometryObservers(currentState: BewlyWidescreenState) {
  currentState.toolbarMutationObserver = new MutationObserver((records) => {
    if (records.some(record => record.addedNodes.length > 0 || record.removedNodes.length > 0))
      scheduleActionGeometrySync(currentState)
  })
  currentState.toolbarMutationObserver.observe(currentState.toolbarSlot, { childList: true, subtree: true })

  currentState.toolbarResizeObserver = new ResizeObserver(() => scheduleActionGeometrySync(currentState))
  currentState.toolbarResizeObserver.observe(currentState.toolbarSlot)

  currentState.themeObserver = new MutationObserver(() => syncActionAnimationTheme(currentState))
  currentState.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
  const bewlyHost = document.querySelector('#bewly')
  if (bewlyHost)
    currentState.themeObserver.observe(bewlyHost, { attributes: true, attributeFilter: ['class', 'style'] })
  scheduleActionGeometrySync(currentState)
}

function getNativePlayerContainer(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement = currentState.playerEl,
) {
  return playerHost.matches('.bpx-player-container')
    ? playerHost
    : playerHost.querySelector<HTMLElement>('.bpx-player-container')
}

function isPointerInBottomControlContainer(
  currentState: BewlyWidescreenState,
  pointerX: number,
  pointerY: number,
) {
  const glass = currentState.danmakuGlass
  if (!glass?.isConnected)
    return false

  const rect = glass.getBoundingClientRect()
  const rootRect = currentState.root.getBoundingClientRect()
  const glassBottom = Number.parseFloat(
    getComputedStyle(currentState.root).getPropertyValue('--bewly-widescreen-controls-glass-bottom'),
  ) || 0
  return isWidescreenBottomControlHoverRegion({
    currentlyHovered: currentState.bottomControlsHovered,
    pointerX,
    pointerY,
    surfaceHeight: rect.height,
    // The glass exits with a translate transform. Anchor the hit region to its
    // stable layout edge so the same area can reveal hidden controls without
    // handing the bottom-right corner to the sidebar edge trigger.
    viewportBottom: rootRect.bottom - glassBottom,
    viewportLeft: rect.left,
    viewportRight: rect.right,
  })
}

function syncNativePlayerControlVisibility(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement = currentState.playerEl,
) {
  const playerContainer = getNativePlayerContainer(currentState, playerHost)
  const { hidden, ready } = resolveWidescreenControlSurfaceState({
    bottomControlsHovered: currentState.bottomControlsHovered,
    danmakuControlsReady: currentState.danmakuSemanticsSource?.isConnected === true,
    nativeControlsHidden: (
      playerContainer?.dataset.ctrlHidden === 'true'
      || playerContainer?.classList.contains('bpx-state-no-cursor') === true
    ),
    nativeControlsReady: !!playerContainer?.querySelector(NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR),
    pointerInsidePlayer: currentState.playerPointerInside,
    sidebarExpanded: isWidescreenSidebarExpanded(currentState),
  })
  currentState.root.dataset.playerControlsReady = String(ready)
  currentState.root.dataset.playerControlsHidden = String(hidden)
  document.body.classList.toggle(BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS, hidden)
}

function forwardNativePlayerPointerActivity(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement,
  event: PointerEvent,
  allowSidebarExpanded = false,
) {
  if (!event.isTrusted || (!allowSidebarExpanded && isWidescreenSidebarExpanded(currentState)))
    return

  const playerContainer = getNativePlayerContainer(currentState, playerHost)
  if (!playerContainer || event.composedPath().some(node => (
    node === playerContainer
    || (node instanceof Node && playerContainer.contains(node))
  ))) {
    return
  }

  const rootRect = currentState.root.getBoundingClientRect()
  if (!isWidescreenPlayerControlHoverRegion({
    playerBottom: rootRect.bottom,
    playerTop: rootRect.top,
    pointerY: event.clientY,
  })) {
    return
  }

  const mouseInit: MouseEventInit = {
    bubbles: true,
    composed: true,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: event.button,
    buttons: event.buttons,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  }
  const playerSurface = playerContainer.querySelector<HTMLElement>('.bpx-player-video-area') ?? playerContainer
  playerSurface.dispatchEvent(new PointerEvent('pointermove', {
    ...mouseInit,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
  }))
  playerSurface.dispatchEvent(new MouseEvent('mousemove', mouseInit))
}

function setupAspectObservers(currentState: BewlyWidescreenState) {
  const video = currentState.playerEl.querySelector<HTMLVideoElement>('video') ?? getVideoElement()
  if (video) {
    const onLoadedMetadata = () => {
      updateAspectRatio(currentState)
      scheduleSidebarRefresh()
    }
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    currentState.metadataListener = () => video.removeEventListener('loadedmetadata', onLoadedMetadata)
  }

  const refreshMeasuredLayout = () => {
    if (!state || state !== currentState)
      return
    updateAspectRatio(currentState)
    syncDescription(currentState)
    scheduleActionGeometrySync(currentState)
    syncControlsGlassGeometry(currentState)
  }

  currentState.resizeObserver = new ResizeObserver(refreshMeasuredLayout)
  currentState.resizeObserver.observe(currentState.root)
  currentState.resizeObserver.observe(currentState.playerFrame)
  currentState.resizeObserver.observe(currentState.sidebarEl)
  currentState.resizeObserver.observe(currentState.danmakuDock)
  if (currentState.danmakuSourceHost)
    currentState.resizeObserver.observe(currentState.danmakuSourceHost)
  currentState.resizeObserver.observe(currentState.descriptionSlot)

  const playerHost = video?.closest<HTMLElement>('.bewly-vertical-video-zoom-host, .bpx-player-container, .player-wrap')
  if (playerHost) {
    const refreshPlayerState = () => {
      syncNativePlayerControlVisibility(currentState, playerHost)
      refreshMeasuredLayout()
    }
    currentState.playerStateObserver = new MutationObserver(refreshPlayerState)
    currentState.playerStateObserver.observe(playerHost, {
      attributes: true,
      attributeFilter: ['class', 'data-screen', 'data-ctrl-hidden', 'style'],
    })
    syncNativePlayerControlVisibility(currentState, playerHost)
  }
  else {
    syncNativePlayerControlVisibility(currentState)
  }

  let bottomControlsLeaveTimer: ReturnType<typeof setTimeout> | undefined
  const clearBottomControlsLeaveTimer = () => {
    if (bottomControlsLeaveTimer) {
      clearTimeout(bottomControlsLeaveTimer)
      bottomControlsLeaveTimer = undefined
    }
  }
  const setBottomControlsHovered = (hovered: boolean) => {
    if (currentState.bottomControlsHovered === hovered)
      return false
    currentState.bottomControlsHovered = hovered
    currentState.root.dataset.bottomControlsHovered = String(hovered)
    return true
  }
  const scheduleBottomControlsLeave = () => {
    if (!currentState.bottomControlsHovered || bottomControlsLeaveTimer)
      return
    bottomControlsLeaveTimer = setTimeout(() => {
      bottomControlsLeaveTimer = undefined
      if (state === currentState && setBottomControlsHovered(false))
        syncNativePlayerControlVisibility(currentState, playerHost ?? currentState.playerEl)
    }, WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY)
  }
  const updateBottomControlsHover = (event: PointerEvent) => {
    const sourceHost = currentState.danmakuSourceHost
    const pointerInBottomControlTree = event.composedPath().some(node => (
      node === currentState.danmakuDock
      || (node instanceof Node && currentState.danmakuDock.contains(node))
      || node === sourceHost
      || (node instanceof Node && !!sourceHost?.contains(node))
    ))
    const hovered = pointerInBottomControlTree || isPointerInBottomControlContainer(
      currentState,
      event.clientX,
      event.clientY,
    )
    if (hovered) {
      clearBottomControlsLeaveTimer()
      return setBottomControlsHovered(true)
    }
    scheduleBottomControlsLeave()
    return false
  }

  currentState.root.dataset.bottomControlsHovered = String(currentState.bottomControlsHovered)
  const handleBottomPointerActivity = (event: PointerEvent) => {
    if (!event.isTrusted)
      return
    const pointerHost = playerHost ?? currentState.playerEl
    const pointerRect = pointerHost.getBoundingClientRect()
    const pointerInsidePlayer = event.clientX >= pointerRect.left
      && event.clientX <= pointerRect.right
      && event.clientY >= pointerRect.top
      && event.clientY <= pointerRect.bottom
    const bottomHoverChanged = updateBottomControlsHover(event)
    const playerPointerChanged = currentState.playerPointerInside !== pointerInsidePlayer
    if (playerPointerChanged)
      currentState.playerPointerInside = pointerInsidePlayer
    if (bottomHoverChanged || playerPointerChanged)
      syncNativePlayerControlVisibility(currentState, pointerHost)
    if (playerHost && pointerInsidePlayer)
      forwardNativePlayerPointerActivity(currentState, playerHost, event)
  }
  const clearPlayerPointerState = () => {
    clearBottomControlsLeaveTimer()
    const bottomHoverChanged = setBottomControlsHovered(false)
    if (!currentState.playerPointerInside && !bottomHoverChanged)
      return
    currentState.playerPointerInside = false
    syncNativePlayerControlVisibility(currentState, playerHost ?? currentState.playerEl)
  }
  window.addEventListener('pointermove', handleBottomPointerActivity, { passive: true })
  window.addEventListener('blur', clearPlayerPointerState)
  document.documentElement.addEventListener('pointerleave', clearPlayerPointerState)

  const onWindowResize = (event: Event) => {
    if (!event.isTrusted)
      return
    refreshMeasuredLayout()
  }
  const onFullscreenChange = () => {
    const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null }
    if ((document.fullscreenElement || fullscreenDocument.webkitFullscreenElement) && state === currentState) {
      exitBewlyWidescreen({ userInitiated: true })
      return
    }
    refreshMeasuredLayout()
  }
  window.addEventListener('resize', onWindowResize)
  window.visualViewport?.addEventListener('resize', onWindowResize)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
  currentState.layoutEventCleanup = () => {
    window.removeEventListener('resize', onWindowResize)
    window.visualViewport?.removeEventListener('resize', onWindowResize)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    clearBottomControlsLeaveTimer()
    window.removeEventListener('pointermove', handleBottomPointerActivity)
    window.removeEventListener('blur', clearPlayerPointerState)
    document.documentElement.removeEventListener('pointerleave', clearPlayerPointerState)
    delete currentState.root.dataset.bottomControlsHovered
  }

  updateAspectRatio(currentState)
  schedulePlayerResizeSync(currentState)
}

function setupActiveWidescreenControl(currentState: BewlyWidescreenState) {
  const handleControlClick = (event: Event) => {
    const eventElements = event.composedPath().filter((node): node is Element => node instanceof Element)
    if (eventElements.some(element => element.closest(MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR)))
      exitBewlyWidescreen({ userInitiated: true })
  }
  document.addEventListener('click', handleControlClick, true)
  currentState.activeControlCleanup = () => {
    document.removeEventListener('click', handleControlClick, true)
  }
}

function setupWidescreenSettingsWatchers(currentState: BewlyWidescreenState) {
  const stopPriorityWatch = watch(
    () => settings.value.bewlyWidescreenLayoutPriority,
    priority => setSidebarLayout(priority === 'sidebar-first' ? 'expanded' : 'compact', currentState),
    { flush: 'sync' },
  )
  const stopCenterWatch = watch(
    () => settings.value.bewlyWidescreenCenterVideo,
    () => updateSidebarLayoutState(currentState),
    { flush: 'sync' },
  )
  const stopThemeWatch = watch(
    () => [
      settings.value.themeColor,
      settings.value.darkModeBaseColor,
      settings.value.enableOledDarkMode,
    ] as const,
    () => syncActionAnimationTheme(currentState),
    { flush: 'post' },
  )
  const stopPositionWatch = watch(
    () => settings.value.bewlyWidescreenSidebarPosition,
    (position) => {
      if (state !== currentState || currentState.sidebarPosition === position)
        return
      currentState.sidebarPosition = position
      currentState.root.dataset.sidebarPosition = position
      if (position === 'left')
        currentState.stage.append(currentState.sidebarEl, currentState.playerSlot)
      else
        currentState.stage.append(currentState.playerSlot, currentState.sidebarEl)
      syncSidebarToggleButton(currentState)
      updateSidebarLayoutState(currentState)
      schedulePlayerResizeSync(currentState)
    },
    { flush: 'sync' },
  )
  currentState.settingsWatchCleanup = [
    stopPriorityWatch,
    stopCenterWatch,
    stopThemeWatch,
    stopPositionWatch,
  ]
}

function setupSidebarInteractionTracking(currentState: BewlyWidescreenState) {
  const { root, sidebarEl: sidebar, sidebarResizer } = currentState
  let collapseTimer: ReturnType<typeof setTimeout> | undefined
  let resizeFrame: number | undefined
  let pointerTrackingFrame: number | undefined
  let pendingPointerPosition: { x: number, y: number, type: string } | undefined
  let pendingSidebarWidth: number | undefined
  let resizingPointerId: number | undefined
  let lastPointerX: number | undefined
  let lastPointerY: number | undefined
  let lastPointerEvent: PointerEvent | undefined
  let appliedSidebarWidth = clampWidescreenSidebarWidth(
    settings.value.bewlyWidescreenSidebarWidth,
    root.getBoundingClientRect().width,
  )

  function canTemporarilyExpand() {
    return currentState.sidebarLayout === 'compact'
      && currentState.root.dataset.centered !== 'true'
  }

  function clearCollapseTimer() {
    if (collapseTimer) {
      clearTimeout(collapseTimer)
      collapseTimer = undefined
    }
  }

  function setHoverExpanded(expanded: boolean) {
    if (expanded)
      clearCollapseTimer()
    const nextValue = String(expanded)
    if (root.dataset.sidebarHoverExpanded !== nextValue) {
      root.dataset.sidebarHoverExpanded = nextValue
      syncNativePlayerControlVisibility(currentState)
    }
    if (expanded)
      delete root.dataset.sidebarManuallyClosed
  }

  function collapseSidebar() {
    clearCollapseTimer()
    setHoverExpanded(false)
  }

  function scheduleCollapse() {
    if (
      collapseTimer
      || resizingPointerId !== undefined
      || !canTemporarilyExpand()
      || sidebarResizer.matches(':focus-visible')
    ) {
      return
    }

    collapseTimer = setTimeout(() => {
      collapseTimer = undefined
      if (resizingPointerId !== undefined || sidebarResizer.matches(':focus-visible'))
        return

      const playerRect = currentState.playerEl.getBoundingClientRect()
      const pointerIsInPlayerControls = lastPointerX !== undefined
        && lastPointerY !== undefined
        && lastPointerX >= playerRect.left
        && lastPointerX <= playerRect.right
        && isWidescreenPlayerControlHoverRegion({
          playerBottom: playerRect.bottom,
          playerTop: playerRect.top,
          pointerY: lastPointerY,
        })
      if (lastPointerEvent && pointerIsInPlayerControls) {
        // Let Bilibili reveal its own controller while the sidebar still masks
        // the bottom surfaces, then hand over once instead of alternating states.
        forwardNativePlayerPointerActivity(currentState, currentState.playerEl, lastPointerEvent, true)
      }

      setHoverExpanded(false)
    }, WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY)
  }

  function getResizeBounds(viewportWidth = root.getBoundingClientRect().width) {
    return {
      minWidth: Math.min(WIDESCREEN_SIDEBAR_MIN_WIDTH, viewportWidth),
      maxWidth: clampWidescreenSidebarWidth(WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH, viewportWidth),
    }
  }

  function syncSidebarResizerValue(
    width = sidebar.getBoundingClientRect().width,
    viewportWidth = root.getBoundingClientRect().width,
  ) {
    const { minWidth, maxWidth } = getResizeBounds(viewportWidth)
    sidebarResizer.setAttribute('aria-valuemin', String(Math.round(minWidth)))
    sidebarResizer.setAttribute('aria-valuemax', String(Math.round(maxWidth)))
    sidebarResizer.setAttribute('aria-valuenow', String(Math.round(width)))
  }

  function applySidebarWidth(width: number) {
    const rootRect = root.getBoundingClientRect()
    const nextWidth = clampWidescreenSidebarWidth(width, rootRect.width)
    appliedSidebarWidth = nextWidth
    root.style.setProperty('--bewly-widescreen-sidebar-user-width', `${nextWidth}px`)
    syncSidebarResizerValue(nextWidth, rootRect.width)
    return nextWidth
  }

  function persistSidebarWidth() {
    const storedWidth = Math.round(appliedSidebarWidth)
    if (settings.value.bewlyWidescreenSidebarWidth !== storedWidth)
      settings.value.bewlyWidescreenSidebarWidth = storedWidth
  }

  function flushPendingSidebarWidth() {
    if (resizeFrame !== undefined) {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = undefined
    }
    if (pendingSidebarWidth === undefined)
      return
    const width = pendingSidebarWidth
    pendingSidebarWidth = undefined
    applySidebarWidth(width)
  }

  function scheduleSidebarWidth(width: number) {
    pendingSidebarWidth = width
    if (resizeFrame !== undefined)
      return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined
      if (state !== currentState || !root.isConnected) {
        pendingSidebarWidth = undefined
        return
      }
      flushPendingSidebarWidth()
    })
  }

  function resizeFromPointer(pointerX: number) {
    const rootRect = root.getBoundingClientRect()
    scheduleSidebarWidth(resolveWidescreenSidebarResizeWidth({
      position: currentState.sidebarPosition,
      pointerX,
      viewportStart: rootRect.left,
      viewportEnd: rootRect.right,
    }))
  }

  function handlePointerPosition(pointerX: number, pointerY: number, pointerType: string) {
    lastPointerX = pointerX
    lastPointerY = pointerY
    if (resizingPointerId !== undefined)
      return
    if (pointerType === 'touch' || !canTemporarilyExpand()) {
      collapseSidebar()
      return
    }

    const currentlyExpanded = root.dataset.sidebarHoverExpanded === 'true'
    const playerRect = currentState.playerEl.getBoundingClientRect()
    const pointerIsInPlayerControls = isWidescreenPlayerControlHoverRegion({
      playerBottom: playerRect.bottom,
      playerTop: playerRect.top,
      pointerY,
    })
    const pointerIsInBottomControls = isPointerInBottomControlContainer(
      currentState,
      pointerX,
      pointerY,
    )
    if (!currentlyExpanded && (pointerIsInPlayerControls || pointerIsInBottomControls)) {
      collapseSidebar()
      return
    }

    const rootRect = root.getBoundingClientRect()
    const pointerInput = {
      position: currentState.sidebarPosition,
      pointerX,
      viewportStart: rootRect.left,
      viewportEnd: rootRect.right,
      sidebarWidth: sidebar.getBoundingClientRect().width,
    }
    // 底部控制卡片展开期间，阻止右侧栏边缘唤出
    if (!currentlyExpanded && root.dataset.playerControlsHidden === 'false')
      return
    const pointerIsAtActivationEdge = resolveWidescreenSidebarHoverExpanded({
      ...pointerInput,
      currentlyExpanded: false,
    })
    if (root.dataset.sidebarEdgeRevealSuppressed === 'true') {
      if (!pointerIsAtActivationEdge)
        delete root.dataset.sidebarEdgeRevealSuppressed
      collapseSidebar()
      return
    }

    const shouldRemainExpanded = resolveWidescreenSidebarHoverExpanded({
      ...pointerInput,
      currentlyExpanded,
    })
    if (shouldRemainExpanded) {
      setHoverExpanded(true)
    }
    else if (currentlyExpanded) {
      scheduleCollapse()
    }
    else {
      collapseSidebar()
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!event.isTrusted)
      return
    lastPointerEvent = event
    pendingPointerPosition = { x: event.clientX, y: event.clientY, type: event.pointerType }
    if (pointerTrackingFrame !== undefined)
      return
    pointerTrackingFrame = requestAnimationFrame(() => {
      pointerTrackingFrame = undefined
      const pending = pendingPointerPosition
      pendingPointerPosition = undefined
      if (pending)
        handlePointerPosition(pending.x, pending.y, pending.type)
    })
  }

  function handlePointerLeave() {
    lastPointerEvent = undefined
    pendingPointerPosition = undefined
    if (pointerTrackingFrame !== undefined)
      cancelAnimationFrame(pointerTrackingFrame)
    pointerTrackingFrame = undefined
    if (resizingPointerId === undefined && root.dataset.sidebarHoverExpanded === 'true')
      scheduleCollapse()
  }

  function handleResizePointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0)
      return
    event.preventDefault()
    clearCollapseTimer()
    resizingPointerId = event.pointerId
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    root.dataset.sidebarResizing = 'true'
    if (canTemporarilyExpand())
      setHoverExpanded(true)
    sidebarResizer.setPointerCapture(event.pointerId)
    resizeFromPointer(event.clientX)
  }

  function handleResizePointerMove(event: PointerEvent) {
    if (resizingPointerId !== event.pointerId)
      return
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    resizeFromPointer(event.clientX)
  }

  function finishResize(event: PointerEvent) {
    if (resizingPointerId !== event.pointerId)
      return
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    flushPendingSidebarWidth()
    if (sidebarResizer.hasPointerCapture(event.pointerId))
      sidebarResizer.releasePointerCapture(event.pointerId)
    resizingPointerId = undefined
    delete root.dataset.sidebarResizing
    persistSidebarWidth()
    schedulePlayerResizeSync(currentState)
    handlePointerPosition(event.clientX, event.clientY, event.pointerType)
  }

  function handleResizeKeydown(event: KeyboardEvent) {
    const currentWidth = sidebar.getBoundingClientRect().width
    const { minWidth, maxWidth } = getResizeBounds()
    let nextWidth: number | undefined
    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = currentWidth + (currentState.sidebarPosition === 'right' ? SIDEBAR_RESIZE_KEYBOARD_STEP : -SIDEBAR_RESIZE_KEYBOARD_STEP)
        break
      case 'ArrowRight':
        nextWidth = currentWidth + (currentState.sidebarPosition === 'left' ? SIDEBAR_RESIZE_KEYBOARD_STEP : -SIDEBAR_RESIZE_KEYBOARD_STEP)
        break
      case 'Home':
        nextWidth = minWidth
        break
      case 'End':
        nextWidth = maxWidth
        break
      default:
        return
    }

    event.preventDefault()
    event.stopPropagation()
    clearCollapseTimer()
    if (canTemporarilyExpand())
      setHoverExpanded(true)
    applySidebarWidth(nextWidth)
    persistSidebarWidth()
    schedulePlayerResizeSync(currentState)
  }

  function handleResizeFocus() {
    clearCollapseTimer()
    if (canTemporarilyExpand())
      setHoverExpanded(true)
  }

  function handleResizeBlur() {
    if (lastPointerX !== undefined && lastPointerY !== undefined)
      handlePointerPosition(lastPointerX, lastPointerY, 'mouse')
  }

  syncSidebarResizerValue()
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('blur', handlePointerLeave)
  document.documentElement.addEventListener('pointerleave', handlePointerLeave)
  sidebarResizer.addEventListener('pointerdown', handleResizePointerDown)
  sidebarResizer.addEventListener('pointermove', handleResizePointerMove)
  sidebarResizer.addEventListener('pointerup', finishResize)
  sidebarResizer.addEventListener('pointercancel', finishResize)
  sidebarResizer.addEventListener('keydown', handleResizeKeydown)
  sidebarResizer.addEventListener('focus', handleResizeFocus)
  sidebarResizer.addEventListener('blur', handleResizeBlur)

  currentState.sidebarInteractionCleanup = () => {
    clearCollapseTimer()
    if (resizeFrame !== undefined)
      cancelAnimationFrame(resizeFrame)
    resizeFrame = undefined
    if (pointerTrackingFrame !== undefined)
      cancelAnimationFrame(pointerTrackingFrame)
    pointerTrackingFrame = undefined
    pendingPointerPosition = undefined
    pendingSidebarWidth = undefined
    lastPointerEvent = undefined
    if (resizingPointerId !== undefined && sidebarResizer.hasPointerCapture(resizingPointerId))
      sidebarResizer.releasePointerCapture(resizingPointerId)
    resizingPointerId = undefined
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('blur', handlePointerLeave)
    document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
    sidebarResizer.removeEventListener('pointerdown', handleResizePointerDown)
    sidebarResizer.removeEventListener('pointermove', handleResizePointerMove)
    sidebarResizer.removeEventListener('pointerup', finishResize)
    sidebarResizer.removeEventListener('pointercancel', finishResize)
    sidebarResizer.removeEventListener('keydown', handleResizeKeydown)
    sidebarResizer.removeEventListener('focus', handleResizeFocus)
    sidebarResizer.removeEventListener('blur', handleResizeBlur)
    delete root.dataset.sidebarHoverExpanded
    delete root.dataset.sidebarEdgeRevealSuppressed
    delete root.dataset.sidebarManuallyClosed
    delete root.dataset.sidebarResizing
  }
}

function setupSidebarToggleAutoHide(currentState: BewlyWidescreenState) {
  const { playerEl, sidebarToggleButton, root } = currentState
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let hoveringToggle = false

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  function hideToggle() {
    root.dataset.pointerActive = 'false'
  }

  function showToggle() {
    root.dataset.pointerActive = 'true'
    clearIdleTimer()
    // 鼠标停在按钮上时保持显示，避免误隐藏
    if (!hoveringToggle)
      idleTimer = setTimeout(hideToggle, SIDEBAR_TOGGLE_IDLE_DELAY)
  }

  function onPointerLeave() {
    clearIdleTimer()
    hideToggle()
  }

  function onToggleEnter() {
    hoveringToggle = true
    root.dataset.pointerActive = 'true'
    clearIdleTimer()
  }

  function onToggleLeave() {
    hoveringToggle = false
    showToggle()
  }

  playerEl.addEventListener('pointermove', showToggle, { passive: true })
  playerEl.addEventListener('pointerleave', showToggle)
  window.addEventListener('blur', onPointerLeave)
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  sidebarToggleButton.addEventListener('pointerenter', onToggleEnter)
  sidebarToggleButton.addEventListener('pointerleave', onToggleLeave)

  currentState.sidebarToggleAutoHideCleanup = () => {
    clearIdleTimer()
    playerEl.removeEventListener('pointermove', showToggle)
    playerEl.removeEventListener('pointerleave', showToggle)
    window.removeEventListener('blur', onPointerLeave)
    document.documentElement.removeEventListener('pointerleave', onPointerLeave)
    sidebarToggleButton.removeEventListener('pointerenter', onToggleEnter)
    sidebarToggleButton.removeEventListener('pointerleave', onToggleLeave)
    delete root.dataset.pointerActive
  }
}

function setupDomRefreshObserver(currentState: BewlyWidescreenState) {
  const danmakuInputSelector = selectors.danmakuInput.join(',')
  currentState.mutationObserver = new MutationObserver((records) => {
    if (!state || state !== currentState)
      return
    if (!currentState.root.isConnected) {
      exitBewlyWidescreen()
      return
    }

    const addedDanmakuInput = records.some(record => Array.from(record.addedNodes).some((node) => {
      if (!(node instanceof Element))
        return false
      return node.matches(danmakuInputSelector) || !!node.querySelector(danmakuInputSelector)
    }))
    const nativeDanmakuChanged = currentState.activeTab === 'danmaku' && records.some((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (!target || !currentState.panels.danmaku.contains(target))
        return false

      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => {
        const element = node instanceof Element ? node : node.parentElement
        return !element || !element.closest(`.${DANMAKU_SKELETON_CLASS}`)
      })
    })
    if (addedDanmakuInput || nativeDanmakuChanged) {
      scheduleSidebarRefresh(currentState)
      return
    }

    const origins = records.map(record => classifyWidescreenMutation(record, currentState))
    if (shouldScheduleWidescreenRefresh(origins))
      scheduleSidebarRefresh(currentState)
  })

  currentState.mutationObserver.observe(document.body, { childList: true, subtree: true })
}

function setupDanmakuSettingsClickToggle(source: HTMLElement) {
  let settingsPinned = false
  let stylePinned = false
  let dispatchingNativeHover = false
  const settingSelector = '.bpx-player-dm-setting'
  const settingPanelSelector = '.bpx-player-dm-setting-wrap, .bpx-player-dm-setting-box'
  const styleSelector = '.bpx-player-video-btn-dm'
  const stylePanelSelector = '.bpx-player-mode-selection-container'
  const setting = source.querySelector<HTMLElement>(settingSelector)
  const styleButton = source.querySelector<HTMLElement>(styleSelector)
  const originalAriaExpanded = setting?.getAttribute('aria-expanded') ?? null
  const originalStyleAriaExpanded = styleButton?.getAttribute('aria-expanded') ?? null
  const settingPanel = setting?.querySelector<HTMLElement>('.bpx-player-dm-setting-wrap')
  const stylePanel = styleButton?.querySelector<HTMLElement>(stylePanelSelector)
  const originalPanelDisplay = settingPanel?.style.display ?? ''
  const originalStylePanelActive = stylePanel?.classList.contains('active') ?? false
  setting?.setAttribute('aria-expanded', 'false')
  styleButton?.setAttribute('aria-expanded', 'false')
  stylePanel?.classList.remove('active')

  function dispatchNativeSettingHover(currentSetting: HTMLElement, entering: boolean) {
    const types = entering
      ? ['mouseover', 'mouseenter'] as const
      : ['mouseout', 'mouseleave'] as const
    dispatchingNativeHover = true
    try {
      for (const type of types) {
        currentSetting.dispatchEvent(new MouseEvent(type, {
          bubbles: type === 'mouseover' || type === 'mouseout',
          cancelable: true,
          composed: true,
          relatedTarget: entering ? null : source,
          view: window,
        }))
      }
    }
    finally {
      dispatchingNativeHover = false
    }
  }

  const setSettingsPinned = (nextPinned: boolean) => {
    const currentSetting = source.querySelector<HTMLElement>(settingSelector)
    if (!currentSetting || settingsPinned === nextPinned)
      return

    settingsPinned = nextPinned
    currentSetting.setAttribute('aria-expanded', String(nextPinned))
    let currentPanel = currentSetting.querySelector<HTMLElement>('.bpx-player-dm-setting-wrap')
    if (nextPinned && !currentPanel) {
      // Bilibili creates this panel lazily on hover. Keep that initialization
      // inside its native player tree, while CSS gates visibility to the click state.
      dispatchNativeSettingHover(currentSetting, true)
      currentPanel = currentSetting.querySelector<HTMLElement>('.bpx-player-dm-setting-wrap')
    }
    if (currentPanel)
      currentPanel.style.display = nextPinned ? 'block' : 'none'
    if (!nextPinned)
      dispatchNativeSettingHover(currentSetting, false)
  }

  const setStylePinned = (nextPinned: boolean) => {
    const currentStyleButton = source.querySelector<HTMLElement>(styleSelector)
    if (!currentStyleButton || stylePinned === nextPinned)
      return

    stylePinned = nextPinned
    currentStyleButton.setAttribute('aria-expanded', String(nextPinned))
    let currentPanel = currentStyleButton.querySelector<HTMLElement>(stylePanelSelector)
    if (nextPinned && !currentPanel) {
      dispatchNativeSettingHover(currentStyleButton, true)
      currentPanel = currentStyleButton.querySelector<HTMLElement>(stylePanelSelector)
    }
    currentPanel?.classList.toggle('active', nextPinned)
    if (!nextPinned) {
      dispatchNativeSettingHover(currentStyleButton, false)
      currentPanel?.classList.remove('active')
    }
  }

  const handleStyleHover = (event: Event) => {
    if (dispatchingNativeHover || !(event.target instanceof Element))
      return
    const currentStyleButton = event.target.closest<HTMLElement>(styleSelector)
    if (!currentStyleButton
      || !source.contains(currentStyleButton)
      || event.target.closest(stylePanelSelector)) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    if (!stylePinned)
      currentStyleButton.querySelector<HTMLElement>(stylePanelSelector)?.classList.remove('active')
  }

  const handleClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element))
      return

    const target = event.target
    const currentSetting = target.closest<HTMLElement>(settingSelector)
    const currentStyleButton = target.closest<HTMLElement>(styleSelector)
    if ((!currentSetting && !currentStyleButton) || !source.contains(target))
      return

    const insideSettingPanel = !!target.closest(settingPanelSelector)
    const insideStylePanel = !!target.closest(stylePanelSelector)
    if (currentSetting && !insideSettingPanel) {
      event.preventDefault()
      event.stopImmediatePropagation()
      setStylePinned(false)
      setSettingsPinned(!settingsPinned)
      return
    }

    if (currentStyleButton && !insideStylePanel) {
      event.preventDefault()
      event.stopImmediatePropagation()
      setSettingsPinned(false)
      setStylePinned(!stylePinned)
    }
  }

  const handleOutsideClick = (event: MouseEvent) => {
    if (!settingsPinned && !stylePinned)
      return
    const currentSetting = source.querySelector<HTMLElement>(settingSelector)
    const currentStyleButton = source.querySelector<HTMLElement>(styleSelector)
    if (event.target instanceof Node) {
      if (currentSetting?.contains(event.target) || currentStyleButton?.contains(event.target))
        return
    }
    setSettingsPinned(false)
    setStylePinned(false)
  }

  source.addEventListener('mouseover', handleStyleHover, true)
  source.addEventListener('mouseenter', handleStyleHover, true)
  source.addEventListener('mouseout', handleStyleHover, true)
  source.addEventListener('mouseleave', handleStyleHover, true)
  source.addEventListener('pointerover', handleStyleHover, true)
  source.addEventListener('pointerenter', handleStyleHover, true)
  source.addEventListener('pointerout', handleStyleHover, true)
  source.addEventListener('pointerleave', handleStyleHover, true)
  source.addEventListener('click', handleClick, true)
  document.addEventListener('click', handleOutsideClick, true)

  return () => {
    if (settingsPinned)
      setSettingsPinned(false)
    if (stylePinned)
      setStylePinned(false)
    source.removeEventListener('mouseover', handleStyleHover, true)
    source.removeEventListener('mouseenter', handleStyleHover, true)
    source.removeEventListener('mouseout', handleStyleHover, true)
    source.removeEventListener('mouseleave', handleStyleHover, true)
    source.removeEventListener('pointerover', handleStyleHover, true)
    source.removeEventListener('pointerenter', handleStyleHover, true)
    source.removeEventListener('pointerout', handleStyleHover, true)
    source.removeEventListener('pointerleave', handleStyleHover, true)
    source.removeEventListener('click', handleClick, true)
    document.removeEventListener('click', handleOutsideClick, true)
    const currentSetting = source.querySelector<HTMLElement>(settingSelector)
    const currentPanel = currentSetting?.querySelector<HTMLElement>('.bpx-player-dm-setting-wrap')
    if (currentPanel)
      currentPanel.style.display = originalPanelDisplay
    if (currentSetting) {
      if (originalAriaExpanded === null)
        currentSetting.removeAttribute('aria-expanded')
      else
        currentSetting.setAttribute('aria-expanded', originalAriaExpanded)
    }
    const currentStyleButton = source.querySelector<HTMLElement>(styleSelector)
    const currentStylePanel = currentStyleButton?.querySelector<HTMLElement>(stylePanelSelector)
    currentStylePanel?.classList.toggle('active', originalStylePanelActive)
    if (currentStyleButton) {
      if (originalStyleAriaExpanded === null)
        currentStyleButton.removeAttribute('aria-expanded')
      else
        currentStyleButton.setAttribute('aria-expanded', originalStyleAriaExpanded)
    }
  }
}

function syncDanmakuInputSource(currentState: BewlyWidescreenState, force = false) {
  const source = findFirst(selectors.danmakuInput, currentState.playerEl)
    || findMovable(selectors.danmakuInput)
  const host = source?.parentElement
  if (!source || !host)
    return false

  if (!force
    && source === currentState.danmakuSemanticsSource
    && host === currentState.danmakuSourceHost
    && currentState.danmakuGlass?.isConnected
    && currentState.danmakuGlass.parentElement === host.parentElement) {
    return true
  }

  currentState.danmakuSemanticsCleanup?.()
  currentState.danmakuSettingsCleanup?.()
  currentState.danmakuGlass?.remove()
  currentState.danmakuGlass = undefined
  currentState.danmakuSemanticsSource?.classList.remove(DANMAKU_SOURCE_CLASS)
  currentState.danmakuSourceHost?.classList.remove(DANMAKU_SOURCE_HOST_CLASS)
  if (currentState.danmakuSourceHost && currentState.danmakuSourceHost !== host)
    currentState.resizeObserver?.unobserve(currentState.danmakuSourceHost)

  source.classList.add(DANMAKU_SOURCE_CLASS)
  host.classList.add(DANMAKU_SOURCE_HOST_CLASS)
  const glass = document.createElement('div')
  glass.className = DANMAKU_GLASS_CLASS
  glass.setAttribute('aria-hidden', 'true')
  host.parentElement?.insertBefore(glass, host)
  currentState.danmakuGlass = glass
  currentState.danmakuSemanticsSource = source
  currentState.danmakuSourceHost = host
  currentState.danmakuSemanticsCleanup = setupWidescreenDanmakuSemantics(
    source,
    {
      send: t('widescreen.send_danmaku'),
      settings: t('widescreen.danmaku_settings'),
      style: t('widescreen.danmaku_style'),
    },
  )
  currentState.danmakuSettingsCleanup = setupDanmakuSettingsClickToggle(source)
  currentState.resizeObserver?.observe(host)
  syncControlsGlassGeometry(currentState)
  requestAnimationFrame(() => {
    if (state === currentState)
      syncControlsGlassGeometry(currentState)
  })
  return true
}

function clearDanmakuActivation(currentState: BewlyWidescreenState) {
  if (currentState.danmakuActivationTimer)
    clearTimeout(currentState.danmakuActivationTimer)
  currentState.danmakuActivationTimer = undefined
  currentState.danmakuResizeTimers?.forEach(timer => clearTimeout(timer))
  currentState.danmakuResizeTimers = []
  currentState.danmakuActivatedSource = undefined
  currentState.danmakuPendingSource = undefined
}

function scheduleDanmakuNativeRelayout(currentState: BewlyWidescreenState) {
  currentState.danmakuResizeTimers?.forEach(timer => clearTimeout(timer))
  currentState.danmakuResizeTimers = DANMAKU_RESIZE_DELAYS.map(delay => setTimeout(() => {
    if (state === currentState && currentState.activeTab === 'danmaku')
      window.dispatchEvent(new Event('resize'))
  }, delay))
}

function isDanmakuPanelReady(panel: HTMLElement) {
  const listViewport = panel.querySelector<HTMLElement>(DANMAKU_LIST_VIEWPORT_SELECTOR)
  if (!listViewport)
    return false

  const loading = panel.querySelector<HTMLElement>('.bpx-player-dm-load-status')
  if (loading) {
    const loadingStyle = getComputedStyle(loading)
    if (loadingStyle.display !== 'none'
      && loadingStyle.visibility !== 'hidden'
      && loadingStyle.opacity !== '0') {
      return false
    }
  }

  return !!panel.querySelector(DANMAKU_LIST_ITEM_SELECTOR)
    || !!panel.querySelector(DANMAKU_EMPTY_STATE_SELECTOR)
}

function activateDanmakuTab(currentState: BewlyWidescreenState) {
  const panel = currentState.panels.danmaku
  const source = findFirst(selectors.danmaku, panel)
  if (!source)
    return

  if (currentState.danmakuActivatedSource === source) {
    scheduleDanmakuNativeRelayout(currentState)
    return
  }
  if (currentState.danmakuActivationTimer && currentState.danmakuPendingSource === source)
    return

  clearDanmakuActivation(currentState)
  currentState.danmakuPendingSource = source
  currentState.danmakuActivationTimer = setTimeout(() => {
    currentState.danmakuActivationTimer = undefined
    currentState.danmakuPendingSource = undefined
    if (state !== currentState || currentState.activeTab !== 'danmaku' || !source.isConnected)
      return

    const focusable = findFirst(selectors.danmakuFocusable, panel)
    const collapseBody = panel.querySelector<HTMLElement>('.bui-collapse-body')
    const inlineHeight = collapseBody?.style.height.trim()
    if (!focusable && !isDanmakuPanelReady(panel)) {
      scheduleDanmakuNativeRelayout(currentState)
      return
    }
    if (focusable && (inlineHeight === '0' || inlineHeight === '0px'))
      focusable.click()
    currentState.danmakuActivatedSource = source
    scheduleDanmakuNativeRelayout(currentState)
  }, 120)
}

function syncDescription(currentState: BewlyWidescreenState) {
  const { descriptionSlot } = currentState
  const description = findFirst(selectors.description, descriptionSlot)
  if (!description) {
    descriptionSlot.classList.add('is-empty')
    const toggleButton = descriptionSlot.querySelector<HTMLButtonElement>('.bewly-widescreen-description-toggle')
    if (toggleButton && !toggleButton.hidden)
      toggleButton.hidden = true
    return
  }

  const basicDescription = description.querySelector<HTMLElement>('.basic-desc-info') || description
  let toggleButton = descriptionSlot.querySelector<HTMLButtonElement>('.bewly-widescreen-description-toggle')

  if (!toggleButton) {
    toggleButton = document.createElement('button')
    toggleButton.type = 'button'
    toggleButton.className = 'bewly-widescreen-description-toggle'

    const onToggle = () => {
      currentState.descriptionExpanded = !currentState.descriptionExpanded
      syncDescription(currentState)
    }

    toggleButton.addEventListener('click', onToggle)
    descriptionSlot.appendChild(toggleButton)
    currentState.descriptionCleanup = () => {
      toggleButton?.removeEventListener('click', onToggle)
      toggleButton?.remove()
      descriptionSlot.classList.remove('is-collapsed', 'is-expanded', 'is-empty')
    }
  }

  descriptionSlot.classList.remove('is-collapsed', 'is-expanded')
  const lineHeight = Number.parseFloat(getComputedStyle(basicDescription).lineHeight) || 20
  const subtitleList = description.querySelector<HTMLElement>('.subtitle-maker-list')
  const descriptionText = basicDescription.textContent?.replace(/\s+/g, ' ').trim() || ''
  const hasDescription = !!descriptionText && !/^[-–—]+$/.test(descriptionText)
  const hasSubtitle = !!subtitleList?.childElementCount
  const hasContent = hasDescription || hasSubtitle
  const canExpand = hasContent && (basicDescription.scrollHeight > lineHeight * 2 + 1
    || hasSubtitle)

  if (!hasContent || !canExpand)
    currentState.descriptionExpanded = false

  descriptionSlot.classList.toggle('is-empty', !hasContent)
  const shouldHideToggle = !hasContent || !canExpand
  if (toggleButton.hidden !== shouldHideToggle)
    toggleButton.hidden = shouldHideToggle
  const nextLabel = currentState.descriptionExpanded ? t('widescreen.collapse') : t('widescreen.expand_more')
  if (toggleButton.textContent !== nextLabel)
    toggleButton.textContent = nextLabel
  const ariaExpanded = String(canExpand && currentState.descriptionExpanded)
  if (toggleButton.getAttribute('aria-expanded') !== ariaExpanded)
    toggleButton.setAttribute('aria-expanded', ariaExpanded)
  descriptionSlot.classList.toggle('is-collapsed', canExpand && !currentState.descriptionExpanded)
  descriptionSlot.classList.toggle('is-expanded', canExpand && currentState.descriptionExpanded)
}

function syncSidebarTitle(currentState: BewlyWidescreenState) {
  const titleElement = currentState.sidebarTop.querySelector<HTMLElement>('.bewly-widescreen-title')
  const nextTitle = currentState.videoInfoData?.title?.trim() || getTitleText()
  if (titleElement && nextTitle && titleElement.textContent !== nextTitle)
    titleElement.textContent = nextTitle
}

function syncSidebarTitleNotice(currentState: BewlyWidescreenState) {
  const source = findMovable(selectors.titleNotice)
  const sourceText = source?.textContent?.replace(/\s+/g, ' ').trim() || ''
  const fallbackText = currentState.videoInfoData?.argue_info?.argue_msg?.trim() || ''
  const signature = sourceText ? `dom:${sourceText}` : (fallbackText ? `api:${fallbackText}` : '')
  const { titleNoticeSlot } = currentState

  if (titleNoticeSlot.dataset.sourceSignature === signature)
    return

  titleNoticeSlot.replaceChildren()
  titleNoticeSlot.dataset.sourceSignature = signature
  titleNoticeSlot.hidden = !signature
  if (!signature)
    return

  if (source) {
    const clone = source.cloneNode(true) as HTMLElement
    clone.removeAttribute('id')
    clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'))
    clone.classList.add('bewly-widescreen-title-notice-content')
    titleNoticeSlot.appendChild(clone)
    return
  }

  const fallback = document.createElement('div')
  fallback.className = 'bewly-widescreen-title-notice-content is-fallback'
  fallback.textContent = fallbackText
  titleNoticeSlot.appendChild(fallback)
}

function findManagedPanelNode(panel: HTMLElement, selectorsToMatch: string[], movedNodes: MovedNode[]) {
  const selector = selectorsToMatch.join(',')
  return movedNodes.find(({ node }) => {
    if (node.parentElement !== panel)
      return false

    return node.matches(selector) || !!node.querySelector(selector)
  })?.node ?? null
}

function placeRecommendAfterPlaylist(panel: HTMLElement, movedNodes: MovedNode[]) {
  const playlistNode = findManagedPanelNode(panel, selectors.playlist, movedNodes)
  const recommendNode = findManagedPanelNode(panel, selectors.recommend, movedNodes)
  if (!playlistNode || !recommendNode || playlistNode === recommendNode)
    return

  // Only reorder the top-level nodes that Bewly moved into this panel. This
  // avoids detaching recommendation/episode elements nested inside a shared
  // Bilibili wrapper.
  if (playlistNode.parentElement === panel
    && recommendNode.parentElement === panel
    && playlistNode.nextElementSibling !== recommendNode) {
    playlistNode.after(recommendNode)
  }
}

function findEpisodeSectionNode(panel: HTMLElement, movedNodes: MovedNode[]) {
  const playlistNode = findManagedPanelNode(panel, selectors.playlist, movedNodes)
  if (!playlistNode)
    return null

  const candidates = [
    playlistNode,
    ...Array.from(playlistNode.querySelectorAll<HTMLElement>(selectors.playlist.join(','))),
  ]
  const episodeCandidates = candidates.filter(candidate => candidate.querySelector(EPISODE_ITEM_SELECTOR))
  return episodeCandidates.at(-1) ?? playlistNode
}

function clearEpisodeSectionMarker(panel: HTMLElement, movedNodes: MovedNode[]) {
  for (const { node } of movedNodes)
    node.classList.remove(EPISODE_SECTION_CLASS)
  panel.querySelectorAll<HTMLElement>(`.${EPISODE_SECTION_CLASS}`).forEach((node) => {
    node.classList.remove(EPISODE_SECTION_CLASS)
  })
}

function syncPlaylistToggleInsets(
  currentState: BewlyWidescreenState,
  episodeSection: HTMLElement | null,
) {
  const { playlistToggleButton } = currentState
  const clearInsets = () => {
    playlistToggleButton.style.removeProperty('--bewly-widescreen-playlist-toggle-inset-start')
    playlistToggleButton.style.removeProperty('--bewly-widescreen-playlist-toggle-inset-end')
  }
  const firstEpisode = episodeSection?.querySelector<HTMLElement>(EPISODE_ITEM_SELECTOR)
  const list = firstEpisode?.parentElement
  if (!episodeSection || !list || list === episodeSection || !episodeSection.contains(list)) {
    clearInsets()
    return
  }

  const sectionRect = episodeSection.getBoundingClientRect()
  const listRect = list.getBoundingClientRect()
  if (sectionRect.width <= 0 || listRect.width <= 0) {
    clearInsets()
    return
  }

  const leftInset = Math.max(0, listRect.left - sectionRect.left)
  const rightInset = Math.max(0, sectionRect.right - listRect.right)
  const rtl = getComputedStyle(episodeSection).direction === 'rtl'
  playlistToggleButton.style.setProperty(
    '--bewly-widescreen-playlist-toggle-inset-start',
    `${rtl ? rightInset : leftInset}px`,
  )
  playlistToggleButton.style.setProperty(
    '--bewly-widescreen-playlist-toggle-inset-end',
    `${rtl ? leftInset : rightInset}px`,
  )
}

function syncPlaylistToggleButton(currentState: BewlyWidescreenState) {
  const panel = currentState.panels.playlist
  const episodeSection = panel.querySelector<HTMLElement>(`.${EPISODE_SECTION_CLASS}`)
  const hasEpisodeSection = !!episodeSection
  if (!hasEpisodeSection)
    currentState.playlistCollapsed = false

  syncPlaylistToggleInsets(currentState, episodeSection)
  currentState.playlistToggleButton.hidden = !hasEpisodeSection
  const expanded = hasEpisodeSection && !currentState.playlistCollapsed
  currentState.playlistToggleButton.setAttribute('aria-expanded', String(expanded))
  currentState.playlistToggleButton.textContent = t(expanded
    ? 'widescreen.collapse'
    : 'widescreen.expand_more')
  panel.classList.toggle('is-episode-section-collapsed', hasEpisodeSection && currentState.playlistCollapsed)
}

function setupPlaylistToggle(currentState: BewlyWidescreenState) {
  const handleToggle = () => {
    if (currentState.playlistToggleButton.hidden)
      return
    currentState.playlistCollapsed = !currentState.playlistCollapsed
    syncPlaylistToggleButton(currentState)
    schedulePlayerResizeSync(currentState)
  }

  currentState.playlistToggleButton.addEventListener('click', handleToggle)
  currentState.playlistToggleCleanup = () => {
    currentState.playlistToggleButton.removeEventListener('click', handleToggle)
    currentState.panels.playlist.classList.remove('is-episode-section-collapsed')
    currentState.playlistToggleButton.remove()
  }
}

function syncEpisodeSectionMarker(currentState: BewlyWidescreenState) {
  const panel = currentState.panels.playlist
  const movedNodes = currentState.movedNodes
  clearEpisodeSectionMarker(panel, movedNodes)

  const episodeSection = findEpisodeSectionNode(panel, movedNodes)
  if (episodeSection) {
    episodeSection.classList.add(EPISODE_SECTION_CLASS)
    if (currentState.playlistToggleButton.parentElement !== episodeSection)
      episodeSection.prepend(currentState.playlistToggleButton)
  }
  else if (currentState.playlistToggleButton.parentElement !== panel) {
    panel.prepend(currentState.playlistToggleButton)
  }
  syncPlaylistToggleButton(currentState)
}

function syncSidebarReadiness(
  currentState: BewlyWidescreenState,
  readiness: WidescreenSidebarReadiness,
) {
  currentState.root.dataset.sidebarTopReady = String(readiness.top)
  currentState.root.dataset.sidebarCommentReady = String(readiness.comment)
  currentState.root.dataset.sidebarDanmakuReady = String(readiness.danmaku)
  currentState.root.dataset.sidebarPlaylistReady = String(readiness.playlist)
  currentState.root.dataset.sidebarContentReady = String(readiness.complete)
  currentState.sidebarTop.setAttribute('aria-busy', String(!readiness.top))
  currentState.panels.comment.setAttribute('aria-busy', String(!readiness.comment))
  currentState.panels.danmaku.setAttribute('aria-busy', String(!readiness.danmaku))
  currentState.panels.playlist.setAttribute('aria-busy', String(!readiness.playlist))
}

function syncVideoMetadata(currentState: BewlyWidescreenState) {
  const source = findMovable(selectors.metadata)
  const existing = currentState.metadataSlot.querySelector<HTMLElement>('.bewly-widescreen-metadata-clone')
  if (!source) {
    existing?.remove()
    return false
  }

  const signature = source.textContent?.replace(/\s+/g, ' ').trim() || ''
  if (existing?.dataset.sourceSignature === signature)
    return true

  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.classList.add('bewly-widescreen-metadata-clone')
  clone.dataset.sourceSignature = signature
  currentState.metadataSlot.replaceChildren(clone)
  return true
}

function getCurrentVideoInfoRequest() {
  const bvidMatch = location.pathname.match(/^\/video\/(BV[0-9A-Za-z]+)(?:\/|$)/)
  if (bvidMatch)
    return { identity: `bvid:${bvidMatch[1]}`, params: { bvid: bvidMatch[1] } }

  const aidMatch = location.pathname.match(/^\/video\/av(\d+)(?:\/|$)/i)
  if (aidMatch)
    return { identity: `aid:${aidMatch[1]}`, params: { aid: aidMatch[1] } }

  return null
}

function formatWidescreenStat(value: number) {
  const locale = document.documentElement.lang || navigator.language || 'zh-CN'
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(Math.max(0, value))
}

function renderFallbackVideoInfo(currentState: BewlyWidescreenState) {
  currentState.toolbarSlot.querySelector('.bewly-widescreen-fallback-stats')?.remove()
  currentState.descriptionSlot.querySelector('.bewly-widescreen-fallback-description')?.remove()
  currentState.tagsSlot.querySelector('.bewly-widescreen-fallback-category')?.remove()

  const data = currentState.videoInfoData
  if (!data)
    return

  if (!findFirst(selectors.toolbar, currentState.toolbarSlot)) {
    const stats = document.createElement('div')
    stats.className = 'bewly-widescreen-fallback-stats'
    const items: Array<[string, number]> = [
      ['widescreen.stat_likes', data.stat.like],
      ['widescreen.stat_coins', data.stat.coin],
      ['widescreen.stat_favorites', data.stat.favorite],
      ['widescreen.stat_shares', data.stat.share],
    ]
    for (const [labelKey, value] of items) {
      const item = document.createElement('span')
      const label = t(labelKey)
      item.className = 'bewly-widescreen-fallback-stat'
      item.textContent = `${label} ${formatWidescreenStat(value)}`
      item.title = `${label} ${new Intl.NumberFormat(document.documentElement.lang || navigator.language).format(value)}`
      stats.appendChild(item)
    }
    currentState.toolbarSlot.appendChild(stats)
  }

  if (!findFirst(selectors.description, currentState.descriptionSlot)) {
    const descriptionText = data.desc?.trim() || data.dynamic?.trim()
    if (descriptionText) {
      const description = document.createElement('p')
      description.className = 'bewly-widescreen-fallback-description'
      description.textContent = descriptionText
      description.setAttribute('aria-label', t('widescreen.video_description'))
      currentState.descriptionSlot.classList.remove('is-empty')
      currentState.descriptionSlot.appendChild(description)
    }
  }

  if (!findFirst(selectors.tags, currentState.tagsSlot) && data.tname?.trim()) {
    const category = document.createElement('span')
    category.className = 'bewly-widescreen-fallback-category'
    category.textContent = data.tname.trim()
    category.setAttribute('aria-label', t('widescreen.video_category'))
    currentState.tagsSlot.appendChild(category)
  }
}

async function loadFallbackVideoInfo(currentState: BewlyWidescreenState) {
  const request = getCurrentVideoInfoRequest()
  if (!request)
    return

  currentState.videoInfoIdentity = request.identity
  try {
    const response = await api.video.getVideoInfo(request.params) as VideoInfo
    if (state !== currentState
      || !currentState.root.isConnected
      || currentState.videoInfoIdentity !== request.identity
      || getCurrentVideoInfoRequest()?.identity !== request.identity
      || response?.code !== 0
      || !response.data) {
      return
    }
    currentState.videoInfoData = response.data
    renderFallbackVideoInfo(currentState)
    scheduleSidebarRefresh(currentState)
  }
  catch (error) {
    if (!isBilibiliRiskControl(error))
      reportRuntimeFailure('Failed to load widescreen video information', error)
  }
}

function fillSidebar(currentState: BewlyWidescreenState): WidescreenSidebarReadiness {
  ensureAnchoredPlayer(currentState)
  syncActionAnimationTheme(currentState)
  syncSidebarTitle(currentState)
  syncSidebarTitleNotice(currentState)
  const activeTab = currentState.activeTab

  const metadataFound = syncVideoMetadata(currentState)
  const toolbarResult = moveOrReplaceNode(selectors.toolbar, currentState.toolbarSlot, currentState.movedNodes)
  scheduleActionGeometrySync(currentState)

  const upResult = moveOrReplaceNode(selectors.upPanel, currentState.upSlot, currentState.movedNodes)

  const descriptionResult = moveOrReplaceNode(selectors.description, currentState.descriptionSlot, currentState.movedNodes)
  if (descriptionResult.changed)
    currentState.descriptionExpanded = false
  syncDescription(currentState)

  moveOrReplaceNode(selectors.tags, currentState.tagsSlot, currentState.movedNodes)
  renderFallbackVideoInfo(currentState)

  syncDanmakuInputSource(currentState)
  syncControlsGlassGeometry(currentState)
  syncNativePlayerControlVisibility(currentState)
  syncAuxiliaryControlGeometry(currentState)

  let commentFound = !!findCommentRoot(currentState.panels.comment)
  if (activeTab === 'comment') {
    const commentResult = moveCommentRoot(currentState.panels.comment, currentState.movedNodes)
    commentFound = commentResult.found
    if (!commentFound) {
      ensureEmptyPanel(currentState.panels.comment, t('widescreen.comments_loading'))
    }
    else {
      clearEmptyPanel(currentState.panels.comment)
      shortenCommentTimes(currentState.panels.comment)
    }
  }
  if (commentFound)
    currentState.hydratedTabs.add('comment')

  let danmakuFound = !!currentState.panels.danmaku.querySelector(selectors.danmaku.join(','))
  let danmakuReady = danmakuFound
  if (activeTab === 'danmaku') {
    const danmakuResult = moveOrReplaceNode(selectors.danmaku, currentState.panels.danmaku, currentState.movedNodes)
    danmakuFound = danmakuResult.found
    if (!danmakuFound) {
      clearEmptyPanel(currentState.panels.danmaku)
      ensureDanmakuSkeleton(currentState.panels.danmaku, t('widescreen.danmaku_loading'))
    }
    else {
      clearEmptyPanel(currentState.panels.danmaku)
      activateDanmakuTab(currentState)
      danmakuReady = isDanmakuPanelReady(currentState.panels.danmaku)
      if (danmakuReady)
        clearDanmakuSkeleton(currentState.panels.danmaku)
      else
        ensureDanmakuSkeleton(currentState.panels.danmaku, t('widescreen.danmaku_loading'))
    }
  }
  if (danmakuReady)
    currentState.hydratedTabs.add('danmaku')

  let existingPlaylist = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
  let existingRecommend = currentState.panels.playlist.querySelector(selectors.recommend.join(','))
  if (activeTab === 'playlist') {
    movePlaylistControls(currentState.panels.playlist, currentState.movedNodes)
    moveMatchingNodes(['[class*="eplist_ep_list_wrapper"]'], currentState.panels.playlist, currentState.movedNodes)
    existingPlaylist = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
    existingRecommend = currentState.panels.playlist.querySelector(selectors.recommend.join(','))
    const playlist = existingPlaylist ? null : findMovable(selectors.playlist)
    const playlistMoved = existingPlaylist || moveNode(playlist, currentState.panels.playlist, currentState.movedNodes)
    // 推荐列表与选集是同一侧栏面板中的两个连续区块；即使选集已经存在，
    // 也要继续搬运推荐列表，保证推荐内容显示在选集下方。
    const recommend = existingRecommend ? null : findMovable(selectors.recommend)
    const recommendMoved = existingRecommend || moveNode(recommend, currentState.panels.playlist, currentState.movedNodes)
    existingPlaylist = existingPlaylist || (playlistMoved ? playlist : null)
    existingRecommend = existingRecommend || (recommendMoved ? recommend : null)
    placeRecommendAfterPlaylist(currentState.panels.playlist, currentState.movedNodes)
    syncEpisodeSectionMarker(currentState)
  }
  const hasPlaylist = !!existingPlaylist
  const hasRecommend = !!existingRecommend
  const playlistLabel = hasPlaylist ? t('widescreen.playlist') : t('widescreen.recommendations')
  if (currentState.tabButtons.playlist.textContent !== playlistLabel)
    currentState.tabButtons.playlist.textContent = playlistLabel
  if (!hasPlaylist && !hasRecommend) {
    if (activeTab === 'playlist')
      ensureEmptyPanel(currentState.panels.playlist, t('widescreen.list_loading'))
  }
  else {
    clearEmptyPanel(currentState.panels.playlist)
  }
  if (hasPlaylist || hasRecommend)
    currentState.hydratedTabs.add('playlist')

  if (currentState.hydratedTabs.has(activeTab))
    scheduleInitialPanelScrollReset(currentState, activeTab)

  const readiness = {
    top: upResult.found && (toolbarResult.found || metadataFound || !!currentState.videoInfoData),
    comment: commentFound,
    danmaku: danmakuReady,
    playlist: hasPlaylist || hasRecommend,
    complete: false,
  }
  readiness.complete = readiness.top && readiness[activeTab]
  syncSidebarReadiness(currentState, readiness)
  return readiness
}

function clearEmptyPanel(panel: HTMLElement) {
  panel.querySelectorAll(`.${EMPTY_CLASS}`).forEach(element => element.remove())
}

function clearDanmakuSkeleton(panel: HTMLElement) {
  panel.querySelectorAll(`.${DANMAKU_SKELETON_CLASS}`).forEach(element => element.remove())
}

function getDanmakuSkeletonHost(panel: HTMLElement) {
  return panel.querySelector<HTMLElement>('.bpx-player-dm-wrap') ?? panel
}

function ensureDanmakuSkeleton(panel: HTMLElement, label: string) {
  const host = getDanmakuSkeletonHost(panel)
  const existing = panel.querySelector<HTMLElement>(`.${DANMAKU_SKELETON_CLASS}`)
  if (existing) {
    existing.setAttribute('aria-label', label)
    if (existing.parentElement !== host)
      host.appendChild(existing)
    return
  }

  host.appendChild(createDanmakuSkeleton(label))
}

function ensureEmptyPanel(panel: HTMLElement, label: string) {
  const existing = panel.querySelector<HTMLElement>(`.${EMPTY_CLASS}`)
  if (existing) {
    if (existing.textContent !== label)
      existing.textContent = label
    return
  }

  panel.appendChild(createPanelEmpty(label))
}

function shortenCommentTimes(panel: HTMLElement) {
  const timeElements = panel.querySelectorAll<HTMLElement>(COMMENT_TIME_SELECTOR)
  timeElements.forEach((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const textNode = walker.currentNode
      if (!(textNode instanceof Text) || !textNode.nodeValue)
        continue
      const nextValue = shortenCommentDateText(textNode.nodeValue)
      if (textNode.nodeValue !== nextValue)
        textNode.nodeValue = nextValue
    }
  })
}

function clearSidebarHydration(currentState: BewlyWidescreenState) {
  if (currentState.sidebarHydrationTimer)
    clearTimeout(currentState.sidebarHydrationTimer)
  currentState.sidebarHydrationTimer = undefined
}

function runSidebarHydration(currentState: BewlyWidescreenState): WidescreenSidebarReadiness | null {
  try {
    const readiness = fillSidebar(currentState)
    currentState.sidebarHydrationWarningShown = false
    return readiness
  }
  catch {
    if (!currentState.sidebarHydrationWarningShown) {
      currentState.sidebarHydrationWarningShown = true
      console.warn('[Bewly Nocturne] Sidebar hydration failed; retrying within the bounded hydration window.')
    }
    return null
  }
}

function startSidebarHydration(currentState: BewlyWidescreenState) {
  clearSidebarHydration(currentState)
  const startedAt = Date.now()
  const deadline = startedAt + SIDEBAR_HYDRATION_TIMEOUT

  const hydrate = () => {
    currentState.sidebarHydrationTimer = undefined
    if (state !== currentState || !currentState.root.isConnected)
      return

    if (currentState.activeTab === 'comment' && !findCommentRoot(currentState.panels.comment))
      startCommentPrewarm()
    const readiness = runSidebarHydration(currentState)
    const now = Date.now()
    if (!shouldContinueWidescreenSidebarHydration({ complete: readiness?.complete ?? false, now, deadline })) {
      if (!readiness?.comment)
        restoreCommentPrewarm()
      return
    }

    const interval = now - startedAt < SIDEBAR_HYDRATION_FAST_DURATION
      ? SIDEBAR_HYDRATION_FAST_INTERVAL
      : SIDEBAR_HYDRATION_INTERVAL
    currentState.sidebarHydrationTimer = setTimeout(hydrate, interval)
  }

  hydrate()
}

function cleanupState(currentState: BewlyWidescreenState) {
  currentState.escapeKeyCleanup?.()
  currentState.sidebarInteractionCleanup?.()
  currentState.sidebarToggleAutoHideCleanup?.()
  currentState.activeControlCleanup?.()
  currentState.activeControlCleanup = undefined
  currentState.metadataListener?.()
  currentState.metadataListener = undefined
  currentState.resizeObserver?.disconnect()
  currentState.resizeObserver = undefined
  currentState.playerStateObserver?.disconnect()
  currentState.playerStateObserver = undefined
  currentState.mutationObserver?.disconnect()
  currentState.mutationObserver = undefined
  currentState.toolbarMutationObserver?.disconnect()
  currentState.toolbarMutationObserver = undefined
  currentState.toolbarResizeObserver?.disconnect()
  currentState.toolbarResizeObserver = undefined
  currentState.themeObserver?.disconnect()
  currentState.themeObserver = undefined
  currentState.highEnergyProgressObserver?.disconnect()
  currentState.highEnergyProgressObserver = undefined
  currentState.highEnergyProgressElement = undefined
  currentState.layoutEventCleanup?.()
  currentState.layoutEventCleanup = undefined
  currentState.settingsWatchCleanup?.forEach(stop => stop())
  currentState.settingsWatchCleanup = undefined
  currentState.descriptionCleanup?.()
  currentState.descriptionCleanup = undefined
  currentState.playlistToggleCleanup?.()
  currentState.playlistToggleCleanup = undefined
  clearDanmakuActivation(currentState)
  currentState.danmakuSemanticsCleanup?.()
  currentState.danmakuSemanticsCleanup = undefined
  currentState.danmakuSettingsCleanup?.()
  currentState.danmakuSettingsCleanup = undefined
  currentState.danmakuGlass?.remove()
  currentState.danmakuGlass = undefined
  currentState.danmakuSemanticsSource?.classList.remove(DANMAKU_SOURCE_CLASS)
  currentState.danmakuSourceHost?.classList.remove(DANMAKU_SOURCE_HOST_CLASS)
  currentState.danmakuSemanticsSource = undefined
  currentState.danmakuSourceHost = undefined
  currentState.panelScrollFrames.forEach(frame => cancelAnimationFrame(frame))
  currentState.panelScrollFrames.clear()
  clearSidebarHydration(currentState)
  clearPlayerResizeSync(currentState)
  clearActionGeometry(currentState)
  clearSidebarRefreshTimer()
  clearAnchoredPlayerElement(currentState.playerEl)
  clearAuxiliaryControlGeometry()
  currentState.colorProbe?.remove()
  currentState.colorProbe = undefined

  // If Bilibili created a replacement while its original comment root was in
  // the sidebar, keep the replacement instead of restoring a duplicate editor.
  const movedCommentRoot = findCommentRoot(currentState.panels.comment)
  const replacementCommentRoot = findCommentRoot(document, true)
  if (movedCommentRoot && replacementCommentRoot)
    removeMovedNode(movedCommentRoot, currentState.movedNodes)

  clearEpisodeSectionMarker(currentState.panels.playlist, currentState.movedNodes)
  restoreMovedNodes(currentState.movedNodes)
  currentState.root.remove()
  currentState.styleEl.remove()
  document.body.classList.remove(BODY_CLASS, BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS)
  window.dispatchEvent(new Event('resize'))
}

function isReadyForLayout() {
  const player = findMovable(selectors.player)
  if (!player)
    return false

  const video = player.querySelector<HTMLVideoElement>('video') ?? getVideoElement()
  if (video instanceof HTMLVideoElement) {
    return video.readyState >= HTMLMediaElement.HAVE_METADATA
      && video.videoWidth > 0
      && video.videoHeight > 0
  }

  const customVideo = player.querySelector<HTMLElement & { currentSrc?: string, readyState?: number }>('bwp-video')
  return !!customVideo
    && ((customVideo.readyState ?? 0) >= HTMLMediaElement.HAVE_METADATA || !!customVideo.currentSrc)
}

function isUpPanelTransferReady(upPanel: HTMLElement | null): boolean {
  if (!upPanel)
    return false

  const buttonPanel = upPanel.querySelector<HTMLElement>('.upinfo-btn-panel, .up-info__btn-panel')
  return !buttonPanel || (buttonPanel.textContent?.trim().length ?? 0) > 0
}

function isRecommendationTransferReady(recommendation: HTMLElement | null): boolean {
  if (!recommendation)
    return false

  const firstCard = recommendation.querySelector(
    '.video-page-card-small, .video-page-game-card-small, .bili-video-card, .video-card',
  )
  return !!firstCard || (recommendation.textContent?.trim().length ?? 0) > 0
}

function isDanmakuTransferReady(danmaku: HTMLElement | null): boolean {
  if (!danmaku)
    return false
  return !!danmaku.querySelector('.bui-collapse-body, .bpx-player-dm-container, .bui-long-list-wrap')
}

function isVideoMetadataTransferReady() {
  const toolbar = findMovable(selectors.toolbar)
  if (toolbar?.childElementCount)
    return true

  const metadata = findMovable(selectors.metadata)
  return !!metadata?.textContent?.trim()
}

function isWidescreenTransferContentReady(): boolean {
  if (!location.pathname.startsWith('/video/'))
    return true

  const upPanel = findMovable(selectors.upPanel)
  const danmaku = findMovable(selectors.danmaku)
  const recommendation = findMovable(selectors.recommend)
    || findMovable(selectors.playlist)
  const commentRoot = findCommentRoot(document, true)
  return isUpPanelTransferReady(upPanel)
    && isVideoMetadataTransferReady()
    && isDanmakuTransferReady(danmaku)
    && isRecommendationTransferReady(recommendation)
    && !!commentRoot
    && isCommentRootUsable(commentRoot)
}

function restoreCommentPrewarm() {
  const snapshot = commentPrewarmState
  commentPrewarmState = undefined
  if (!snapshot)
    return

  if (snapshot.styleAttribute === null)
    snapshot.root.removeAttribute('style')
  else
    snapshot.root.setAttribute('style', snapshot.styleAttribute)
}

function startCommentPrewarm() {
  if (commentPrewarmState) {
    if (commentPrewarmState.root.isConnected)
      return
    restoreCommentPrewarm()
  }

  const commentRoot = findCommentRoot(document, true)
  if (!commentRoot || isCommentRootUsable(commentRoot))
    return

  const width = Math.max(
    commentRoot.getBoundingClientRect().width,
    commentRoot.parentElement?.getBoundingClientRect().width ?? 0,
    320,
  )
  commentPrewarmState = {
    root: commentRoot,
    styleAttribute: commentRoot.getAttribute('style'),
  }
  commentRoot.style.setProperty('position', 'fixed', 'important')
  commentRoot.style.setProperty('top', '0', 'important')
  commentRoot.style.setProperty('left', '0', 'important')
  commentRoot.style.setProperty('width', `${width}px`, 'important')
  commentRoot.style.setProperty('display', 'block', 'important')
  commentRoot.style.setProperty('opacity', '0', 'important')
  commentRoot.style.setProperty('pointer-events', 'none', 'important')
  commentRoot.style.setProperty('z-index', '-1', 'important')
}

function applyNow(sidebarPosition: 'left' | 'right' = 'right') {
  const player = findMovable(selectors.player)
  if (!player)
    return false

  const { root, stage, playerSlot, playerFrame, danmakuDock, sidebarEl, sidebarTop, titleNoticeSlot, metadataSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, playlistToggleButton, sidebarResizer, sidebarToggleButton } = createRoot(sidebarPosition)
  const styleEl = injectLayoutStyle()
  const movedNodes: MovedNode[] = []

  const nextState: BewlyWidescreenState = {
    root,
    stage,
    playerEl: player,
    playerSlot,
    playerFrame,
    danmakuDock,
    sidebarEl,
    sidebarTop,
    titleNoticeSlot,
    metadataSlot,
    upSlot,
    toolbarSlot,
    descriptionSlot,
    tagsSlot,
    panels,
    tabButtons,
    playlistToggleButton,
    sidebarResizer,
    sidebarToggleButton,
    movedNodes,
    styleEl,
    activeTab: 'comment',
    sidebarLayout: settings.value.bewlyWidescreenLayoutPriority === 'sidebar-first' ? 'expanded' : 'compact',
    sidebarPosition,
    descriptionExpanded: false,
    playlistCollapsed: false,
    hydratedTabs: new Set(),
    initialScrollResetTabs: new Set(),
    panelScrollFrames: new Map(),
    bottomControlsHovered: false,
    playerPointerInside: false,
  }

  state = nextState
  enteringWidescreen = false
  syncNativePlayerControlVisibility(nextState)
  document.body.classList.add(BODY_CLASS)
  setupPlaylistToggle(nextState)
  syncSidebarReadiness(nextState, {
    complete: false,
    top: false,
    comment: false,
    danmaku: false,
    playlist: false,
  })

  const handleWidescreenKeydown = (event: KeyboardEvent) => {
    if (event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return
    const ownsPlayerShortcut = event.composedPath().some(node => (
      node instanceof Element
      && !!node.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]',
      )
    ))
    if (ownsPlayerShortcut)
      return
    if (event.key.toLowerCase() === 'f') {
      // 只在 Bewly Widescreen 生命周期内先恢复原播放器；不接管或阻止 Bilibili 的原生快捷键。
      exitBewlyWidescreen({ userInitiated: true })
    }
  }
  window.addEventListener('keydown', handleWidescreenKeydown, { capture: true })
  nextState.escapeKeyCleanup = () => {
    window.removeEventListener('keydown', handleWidescreenKeydown, { capture: true })
  }

  player.classList.add(NATIVE_PLAYER_CLASS)
  syncAnchoredPlayerGeometry(nextState)
  setActiveTab('comment', false)
  startSidebarHydration(nextState)
  void loadFallbackVideoInfo(nextState)
  setSidebarLayout(nextState.sidebarLayout, nextState)
  setupActionGeometryObservers(nextState)
  setupAspectObservers(nextState)
  setupDomRefreshObserver(nextState)
  setupWidescreenSettingsWatchers(nextState)
  setupActiveWidescreenControl(nextState)
  setupSidebarInteractionTracking(nextState)
  setupSidebarToggleAutoHide(nextState)
  if (settings.value.showVerticalVideoZoomButton)
    initVerticalVideoZoom()
  schedulePlayerResizeSync(nextState)
  removeWidescreenLoading()

  return true
}

function clearReadyWait({ preserveCommentPrewarm = false }: { preserveCommentPrewarm?: boolean } = {}) {
  readyObserver?.disconnect()
  readyObserver = undefined
  if (readyFrame !== undefined)
    cancelAnimationFrame(readyFrame)
  readyFrame = undefined
  if (readyMetadataHandler) {
    document.removeEventListener('loadedmetadata', readyMetadataHandler, true)
    readyMetadataHandler = undefined
  }
  if (readyPollTimer !== undefined) {
    clearTimeout(readyPollTimer)
    readyPollTimer = undefined
  }
  if (pageReadyFallbackTimer !== undefined) {
    clearTimeout(pageReadyFallbackTimer)
    pageReadyFallbackTimer = undefined
  }
  if (!preserveCommentPrewarm)
    restoreCommentPrewarm()
  clearPageReadyHandler()
  pageReadyForLayout = false
  playerReadyForLayout = false
  contentReadyForLayout = false
  pageReadySince = undefined
  readinessStableSince = undefined
  waitingForLoad = false
}

function clearPageReadyHandler() {
  if (!pageReadyHandler)
    return

  window.removeEventListener('load', pageReadyHandler)
  pageReadyHandler = undefined
}

function clearSidebarRefreshTimer() {
  if (sidebarRefreshFrame !== undefined) {
    cancelAnimationFrame(sidebarRefreshFrame)
    sidebarRefreshFrame = undefined
  }
}

function hasWidescreenTransferSettleElapsed() {
  return pageReadySince !== undefined
    && Date.now() - pageReadySince >= TRANSFER_SETTLE_DELAY
}

function waitForReadyLayout() {
  clearReadyWait()
  const readinessStartedAt = Date.now()
  pageReadyForLayout = document.readyState === 'complete'
  pageReadySince = pageReadyForLayout ? Date.now() : undefined
  waitingForLoad = !pageReadyForLayout

  const tryCommitLayout = () => {
    if (state) {
      clearReadyWait({ preserveCommentPrewarm: true })
      return true
    }
    if (!canCommitWidescreenLayout({
      pageReady: pageReadyForLayout,
      playerReady: playerReadyForLayout,
      contentReady: contentReadyForLayout,
    })) {
      readinessStableSince = undefined
      return false
    }
    const now = Date.now()
    readinessStableSince ??= now
    if (now - readinessStableSince < READY_STABILITY_DELAY)
      return false
    if (!applyNow(pendingSidebarPosition)) {
      playerReadyForLayout = false
      readinessStableSince = undefined
      return false
    }
    clearReadyWait({ preserveCommentPrewarm: true })
    return true
  }

  const scheduleAttempt = () => {
    if (readyFrame !== undefined)
      return
    readyFrame = requestAnimationFrame(() => {
      readyFrame = undefined
      if (state) {
        clearReadyWait()
        return
      }
      startCommentPrewarm()
      playerReadyForLayout = isReadyForLayout()
      contentReadyForLayout = isWidescreenTransferContentReady()
        || hasWidescreenTransferSettleElapsed()
      tryCommitLayout()
    })
  }

  readyObserver = new MutationObserver(scheduleAttempt)
  readyObserver.observe(document.body || document.documentElement, { childList: true, subtree: true })
  readyMetadataHandler = scheduleAttempt
  document.addEventListener('loadedmetadata', readyMetadataHandler, true)
  if (!pageReadyForLayout) {
    pageReadyHandler = () => {
      if (pageReadyFallbackTimer !== undefined) {
        clearTimeout(pageReadyFallbackTimer)
        pageReadyFallbackTimer = undefined
      }
      pageReadyForLayout = true
      pageReadySince = Date.now()
      waitingForLoad = false
      clearPageReadyHandler()
      scheduleAttempt()
    }
    window.addEventListener('load', pageReadyHandler, { once: true })
    pageReadyFallbackTimer = setTimeout(() => {
      pageReadyFallbackTimer = undefined
      if (!pageReadyForLayout && document.readyState !== 'loading')
        pageReadyHandler?.()
    }, PAGE_READY_FALLBACK_DELAY)
    if (document.readyState === 'complete')
      pageReadyHandler()
  }
  const pollReadiness = () => {
    readyPollTimer = undefined
    if (!enteringWidescreen || state)
      return
    scheduleAttempt()
    // Slow CDN metadata is not a terminal failure. Keep the event-driven wait
    // alive until navigation or an explicit exit, but reduce idle polling cost.
    const interval = Date.now() - readinessStartedAt < READY_POLL_FAST_DURATION
      ? READY_POLL_INTERVAL
      : READY_POLL_SLOW_INTERVAL
    readyPollTimer = setTimeout(pollReadiness, interval)
  }
  readyPollTimer = setTimeout(pollReadiness, READY_POLL_INTERVAL)
  scheduleAttempt()
}

function scheduleSidebarRefresh(currentState = state) {
  if (!currentState || state !== currentState || sidebarRefreshFrame !== undefined)
    return

  sidebarRefreshFrame = requestAnimationFrame(() => {
    sidebarRefreshFrame = undefined
    if (!state || state !== currentState)
      return

    if (currentState.activeTab === 'comment' && !findCommentRoot(currentState.panels.comment))
      startCommentPrewarm()
    const readiness = runSidebarHydration(currentState)
    if (readiness?.complete) {
      clearSidebarHydration(currentState)
    }
    else if (!currentState.sidebarHydrationTimer) {
      startSidebarHydration(currentState)
    }
  })
}

export function applyBewlyWidescreen(
  sidebarPosition: 'left' | 'right' = 'right',
  showLoading = true,
) {
  startWidescreenLanguageWatch()
  if (state || enteringWidescreen || waitingForLoad || readyObserver || readyFrame !== undefined)
    return

  enteringWidescreen = true
  leaveMutuallyExclusivePlayerModes()
  pendingSidebarPosition = sidebarPosition
  if (showLoading)
    showWidescreenLoading()
  waitForReadyLayout()
}

export interface ExitBewlyWidescreenOptions {
  userInitiated?: boolean
}

function dispatchManualWidescreenToggle(action: BewlyWidescreenManualToggleDetail['action']) {
  window.dispatchEvent(new CustomEvent<BewlyWidescreenManualToggleDetail>(
    BEWLY_WIDESCREEN_MANUAL_TOGGLE,
    { detail: { action, userInitiated: true } },
  ))
}

export function exitBewlyWidescreen({ userInitiated = false }: ExitBewlyWidescreenOptions = {}) {
  if (userInitiated)
    dispatchManualWidescreenToggle('exit')
  stopLanguageWatch?.()
  stopLanguageWatch = undefined
  clearReadyWait()
  clearPageReadyHandler()
  loadingSuppressedUntilExit = false
  removeWidescreenLoading(true)
  waitingForLoad = false
  enteringWidescreen = false

  if (!state)
    return

  const currentState = state
  state = null
  cleanupState(currentState)
}

export function isBewlyWidescreenActive() {
  return !!state
}

export function isBewlyWidescreenEngaged() {
  return resolveWidescreenEngagedState({
    active: !!state,
    entering: enteringWidescreen,
    hasLoadingOverlay: !!loadingOverlay,
    hasReadyRetry: !!readyObserver
      || readyFrame !== undefined
      || !!pageReadyHandler,
    waitingForLoad,
  })
}
