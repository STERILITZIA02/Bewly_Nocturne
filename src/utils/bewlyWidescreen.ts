import { watch } from 'vue'
import browser from 'webextension-polyfill'

import type { BewlyWidescreenManualToggleDetail } from '~/constants/globalEvents'
import { BEWLY_WIDESCREEN_FAILED, BEWLY_WIDESCREEN_MANUAL_TOGGLE } from '~/constants/globalEvents'
import { settings } from '~/logic'

import type { WidescreenMutationOrigin } from './bewlyWidescreenPolicy'
import { resolveWidescreenCenterGeometry, resolveWidescreenEngagedState, shortenCommentDateText, shouldScheduleWidescreenRefresh } from './bewlyWidescreenPolicy'
import { isEditableLeafActiveElement } from './drawerEscape'
import { hasIframeEscapePriorityState } from './escapePriority'
import { i18n } from './i18n'
import { injectCSS } from './main'
import { getVideoElement } from './player'
import { isNativePlaylistEditing } from './randomPlay'
import { initVerticalVideoZoom } from './verticalVideoZoom'

type BewlyWidescreenTab = 'comment' | 'danmaku' | 'playlist'
type BewlyWidescreenSidebarLayout = 'compact' | 'expanded'

interface MovedNode {
  node: HTMLElement
  placeholder: Comment
  originalParent: Node
  preserveIfOriginMissing: boolean
}

interface BewlyWidescreenState {
  root: HTMLElement
  stage: HTMLElement
  playerSlot: HTMLElement
  playerFrame: HTMLElement
  danmakuDock: HTMLElement
  sidebarEl: HTMLElement
  sidebarTop: HTMLElement
  upSlot: HTMLElement
  toolbarSlot: HTMLElement
  descriptionSlot: HTMLElement
  tagsSlot: HTMLElement
  panels: Record<BewlyWidescreenTab, HTMLElement>
  tabButtons: Record<BewlyWidescreenTab, HTMLButtonElement>
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
  danmakuExpandTimer?: ReturnType<typeof setTimeout>
  sidebarInteractionCleanup?: () => void
  sidebarToggleAutoHideCleanup?: () => void
  activeControlCleanup?: () => void
  descriptionCleanup?: () => void
  escapeKeyCleanup?: () => void
  colorProbe?: HTMLSpanElement
  descriptionExpanded: boolean
}

const ROOT_ID = 'bewly-widescreen-root'
const LOADING_ROOT_ID = 'bewly-widescreen-loading'
const BODY_CLASS = 'bewly-widescreen-active'
const EMPTY_CLASS = 'bewly-widescreen-empty'
const EPISODE_SECTION_CLASS = 'bewly-widescreen-episode-section'
const EPISODE_ITEM_SELECTOR = '.video-pod__item, .multi-page__item, .page-item, .list-item, .episode-item, .section-item, .collect-item'
const SIDEBAR_FULL_MIN_WIDTH = 360
const SIDEBAR_FULL_MAX_WIDTH = 460
const MOBILE_BREAKPOINT = 900
const LOADING_FADE_DURATION = 240
const LOADING_EXIT_DELAY = 5000
const PREPARED_LOADING_TIMEOUT = 30_000
const READY_WAIT_TIMEOUT = 15_000
const SIDEBAR_TOGGLE_IDLE_DELAY = 1000
const BILIBILI_ACTION_ANIMATION_HUE = 196
const COMMENT_ROOT_ID_SELECTOR = '#comment-module, #comment-body, #commentapp'
const COMMENT_NESTED_UI_SELECTOR = '.reply-item, .sub-reply-item, bili-comment-renderer'
// Light-DOM markers only. Modern bili-comments mounts most UI in shadow roots,
// so readiness must not require these descendants to exist.
const COMMENT_CONTENT_MARKER_SELECTOR = 'bili-comments, bili-comment-box, bili-comment-renderer, .reply-list, .comment-list, .reply-box, .comment-header'
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
let readyDeadlineTimer: ReturnType<typeof setTimeout> | undefined
let readyMetadataHandler: ((event: Event) => void) | undefined
let loadFallbackTimer: ReturnType<typeof setTimeout> | undefined
let sidebarRefreshFrame: number | undefined
let pageLoadHandler: (() => void) | undefined
let waitingForLoad = false
let enteringWidescreen = false
let pendingEscapeCleanup: (() => void) | undefined
let pendingSidebarPosition: 'left' | 'right' = 'right'
let stopLanguageWatch: (() => void) | undefined

const MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR = [
  '.bpx-player-ctrl-wide',
  '.bilibili-player-video-btn-widescreen',
  '.squirtle-video-widescreen',
  '.bpx-player-ctrl-web',
  '.bilibili-player-video-web-fullscreen',
  '.squirtle-video-pagefullscreen',
  '.bpx-player-ctrl-full',
  '.bilibili-player-video-btn-fullscreen',
  '.squirtle-video-fullscreen',
].join(',')

function clearPendingEscapeHandler() {
  pendingEscapeCleanup?.()
  pendingEscapeCleanup = undefined
}

function ensurePendingEscapeHandler() {
  if (pendingEscapeCleanup)
    return
  let arbitrationTimer: number | undefined
  const handlePendingEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.repeat || event.isComposing || event.keyCode === 229 || state || !isBewlyWidescreenEngaged())
      return
    const hadPriorityState = isEditableLeafActiveElement()
      || hasIframeEscapePriorityState({ editingStateActive: isNativePlaylistEditing() })
    if (arbitrationTimer !== undefined)
      return
    arbitrationTimer = window.setTimeout(() => {
      arbitrationTimer = undefined
      if (!isBewlyWidescreenEngaged()
        || hadPriorityState
        || isEditableLeafActiveElement()
        || hasIframeEscapePriorityState({ editingStateActive: isNativePlaylistEditing() })) {
        return
      }
      exitBewlyWidescreen({ userInitiated: true })
    }, 0)
  }
  window.addEventListener('keydown', handlePendingEscape, { capture: true })
  pendingEscapeCleanup = () => {
    window.removeEventListener('keydown', handlePendingEscape, { capture: true })
    if (arbitrationTimer !== undefined) {
      window.clearTimeout(arbitrationTimer)
      arbitrationTimer = undefined
    }
  }
}

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
    '.bpx-player-dm-wrap',
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
    || (node.nodeType === Node.COMMENT_NODE && node.nodeValue === 'bewly-widescreen-placeholder')
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
  preserveIfOriginMissing = false,
) {
  if (!node || (!allowInsideLayout && node.closest(`#${ROOT_ID}`)))
    return false

  if (target.contains(node))
    return false

  const parent = node.parentNode
  if (!parent)
    return false

  const placeholder = document.createComment('bewly-widescreen-placeholder')
  parent.insertBefore(placeholder, node)
  target.appendChild(node)
  movedNodes.push({ node, placeholder, originalParent: parent, preserveIfOriginMissing })
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
  for (const { node, placeholder, originalParent, preserveIfOriginMissing } of [...movedNodes].reverse()) {
    const parent = placeholder.parentNode
    if (parent) {
      parent.insertBefore(node, placeholder)
      placeholder.remove()
      continue
    }
    if (!preserveIfOriginMissing)
      continue
    const replacementPlayer = findMovable(selectors.player)
    if (replacementPlayer && replacementPlayer !== node) {
      node.remove()
      continue
    }
    if (originalParent.isConnected)
      originalParent.appendChild(node)
    else
      document.body.appendChild(node)
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
  return Array.from(root.querySelectorAll('*')).some((element) => {
    const shadowRoot = (element as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot
    return !!shadowRoot
  })
}

function isCommentRootUsable(root: HTMLElement) {
  if (!root.isConnected)
    return false

  // B 站会先创建空评论壳，再异步挂载 bili-comments / shadow DOM。提前搬走
  // 空壳会与它的初始化竞争，导致头像、编辑器或评论列表漏渲染。
  if (root.querySelector(COMMENT_CONTENT_MARKER_SELECTOR))
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

function setActiveTab(nextTab: BewlyWidescreenTab) {
  if (!state)
    return

  state.activeTab = nextTab
  for (const [tab, button] of Object.entries(state.tabButtons) as Array<[BewlyWidescreenTab, HTMLButtonElement]>) {
    const active = tab === nextTab
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', String(active))
    state.panels[tab].hidden = !active
  }

  if (nextTab === 'danmaku')
    expandDanmakuTab(state)
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
) {
  if (!currentState || state !== currentState)
    return

  currentState.sidebarLayout = nextLayout
  currentState.root.dataset.sidebarLayout = nextLayout
  currentState.root.dataset.sidebarHoverExpanded = 'false'
  syncSidebarToggleButton(currentState)
  updateSidebarLayoutState(currentState)
  schedulePlayerResizeSync(currentState)
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

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'bewly-widescreen-close'
  closeButton.textContent = t('widescreen.exit')
  closeButton.addEventListener('click', () => exitBewlyWidescreen({ userInitiated: true }))

  toolbar.append(createSidebarTitle(), closeButton)
  return toolbar
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
    setSidebarLayout(state?.sidebarLayout === 'compact' ? 'expanded' : 'compact')
  })
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
  return String(i18n.global.t(key, settings.value.language))
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
  if (closeButton)
    closeButton.textContent = t('widescreen.exit')
  currentState.tabButtons.comment.textContent = t('widescreen.comments')
  currentState.tabButtons.danmaku.textContent = t('widescreen.danmaku')
  currentState.tabButtons.playlist.textContent = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
    ? t('widescreen.playlist')
    : t('widescreen.recommendations')
  syncSidebarToggleButton(currentState)
  syncDescription(currentState)

  const emptyLabels: Array<[HTMLElement, string]> = [
    [currentState.panels.comment, 'widescreen.comments_loading'],
    [currentState.panels.danmaku, 'widescreen.danmaku_loading'],
    [currentState.panels.playlist, 'widescreen.list_loading'],
  ]
  for (const [panel, key] of emptyLabels) {
    const empty = panel.querySelector<HTMLElement>(`.${EMPTY_CLASS}`)
    if (empty)
      empty.textContent = t(key)
  }
}

function startWidescreenLanguageWatch() {
  if (stopLanguageWatch)
    return
  stopLanguageWatch = watch(
    () => settings.value.language,
    () => syncLocalizedWidescreenText(),
  )
}

function showWidescreenLoading() {
  ensurePendingEscapeHandler()
  if (loadingOverlay)
    return

  loadingStyleEl = injectCSS(`
    #${LOADING_ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: var(--bew-z-widescreen);
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
      line-height: 20px;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-status {
      display: flex;
      align-items: center;
      gap: var(--bew-space-2, 8px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-icon {
      width: 36px;
      height: 36px;
      object-fit: contain;
      flex-shrink: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit {
      box-sizing: border-box;
      min-width: 72px;
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
      outline: 2px solid var(--bew-theme-color, #00aeec);
      outline-offset: 2px;
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
      loadingSuppressedUntilExit = true
      removeWidescreenLoading()
      if (!enteringWidescreen) {
        clearPendingEscapeHandler()
        stopLanguageWatch?.()
        stopLanguageWatch = undefined
      }
    }, PREPARED_LOADING_TIMEOUT)
  }
}

function createRoot(sidebarPosition: 'left' | 'right' = 'right') {
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.dataset.sidebarPosition = sidebarPosition

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

  const sidebarTop = document.createElement('div')
  sidebarTop.className = 'bewly-widescreen-sidebar-top'
  const upSlot = document.createElement('div')
  upSlot.className = 'bewly-widescreen-up-slot'
  const toolbarSlot = document.createElement('div')
  toolbarSlot.className = 'bewly-widescreen-action-slot'
  const descriptionSlot = document.createElement('div')
  descriptionSlot.className = 'bewly-widescreen-description-slot'
  const tagsSlot = document.createElement('div')
  tagsSlot.className = 'bewly-widescreen-tags-slot'
  sidebarTop.append(createSidebarToolbar(), upSlot, toolbarSlot, descriptionSlot, tagsSlot)

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
    panel.className = `bewly-widescreen-panel bewly-widescreen-panel-${tab}`
    panel.setAttribute('role', 'tabpanel')
    panelWrap.appendChild(panel)
  }

  sidebar.append(sidebarTop, tablist, panelWrap)
  if (sidebarPosition === 'left')
    stage.append(sidebar, playerSlot)
  else
    stage.append(playerSlot, sidebar)
  root.appendChild(stage)
  document.body.appendChild(root)

  return { root, stage, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, sidebarTop, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, sidebarToggleButton }
}

function injectLayoutStyle() {
  return injectCSS(`
    body.${BODY_CLASS} {
      overflow: hidden !important;
      background: #0f1115 !important;
    }

    body.${BODY_CLASS} .bili-header,
    body.${BODY_CLASS} .fixed-sidenav-storage,
    body.${BODY_CLASS} .mini-player-window {
      display: none !important;
    }

    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: var(--bew-z-base-overlay);
      color: #f4f6fb;
      background: var(--bew-dark-page-bg, #0f1115);
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      --bewly-widescreen-sidebar-bg: #f7f8fa;
      --bewly-widescreen-surface-bg: #fff;
      --bewly-widescreen-text-primary: #18191c;
      --bewly-widescreen-text-secondary: #61666d;
      --bewly-widescreen-text-muted: #9499a0;
      --bewly-widescreen-sidebar-border: rgba(255, 255, 255, 0.08);
      --bewly-widescreen-divider: rgba(0, 0, 0, 0.08);
      --bewly-widescreen-control-bg: #f1f2f3;
      --bewly-widescreen-control-hover-bg: #e3e5e7;
      --bewly-widescreen-sidebar-full-width: clamp(
        ${SIDEBAR_FULL_MIN_WIDTH}px,
        26vw,
        ${SIDEBAR_FULL_MAX_WIDTH}px
      );
      --bewly-widescreen-sidebar-max: 40vw;
      --bewly-widescreen-layout-aspect: 1.7777778;
      --bewly-widescreen-player-available-height: calc(100dvh - var(--bewly-widescreen-danmaku-height, 0px));
      --bewly-widescreen-player-target-width: calc(var(--bewly-widescreen-player-available-height) * var(--bewly-widescreen-layout-aspect));
      --bewly-widescreen-sidebar-fit-width: clamp(
        0px,
        calc(100vw - var(--bewly-widescreen-player-target-width)),
        var(--bewly-widescreen-sidebar-max)
      );
      --bewly-widescreen-sidebar-column-width: var(--bewly-widescreen-sidebar-full-width);
      --bewly-widescreen-sidebar-panel-width: var(--bewly-widescreen-sidebar-full-width);
      --bewly-widescreen-sidebar-offset: 0px;
      --bewly-widescreen-center-offset: 0px;
    }

    html.dark #${ROOT_ID} {
      --bewly-widescreen-sidebar-bg: var(--bew-content-alt-solid, #2f3238);
      --bewly-widescreen-surface-bg: var(--bew-content-solid, #2b2e33);
      --bewly-widescreen-text-primary: var(--bew-text-1, #f1f2f3);
      --bewly-widescreen-text-secondary: var(--bew-text-2, #c9ccd0);
      --bewly-widescreen-text-muted: var(--bew-text-3, #9499a0);
      --bewly-widescreen-sidebar-border: var(--bew-border-color, rgba(255, 255, 255, 0.08));
      --bewly-widescreen-divider: var(--bew-border-color, rgba(255, 255, 255, 0.08));
      --bewly-widescreen-control-bg: var(--bew-fill-1, rgba(255, 255, 255, 0.08));
      --bewly-widescreen-control-hover-bg: var(--bew-fill-2, rgba(255, 255, 255, 0.16));
    }

    #${ROOT_ID}[data-sidebar-layout="compact"] {
      --bewly-widescreen-sidebar-column-width: min(
        var(--bewly-widescreen-sidebar-fit-width),
        calc(var(--bew-control-height, 36px) * 2)
      );
      --bewly-widescreen-sidebar-offset: calc(
        var(--bewly-widescreen-sidebar-panel-width) - var(--bewly-widescreen-sidebar-column-width)
      );
    }

    #${ROOT_ID}[data-sidebar-layout="expanded"] {
      --bewly-widescreen-player-target-width: calc(100vw - var(--bewly-widescreen-sidebar-full-width));
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
    }

    #${ROOT_ID} .bewly-widescreen-stage {
      display: grid;
      grid-template-columns:
        minmax(0, calc(100vw - var(--bewly-widescreen-sidebar-column-width)))
        minmax(0, var(--bewly-widescreen-sidebar-column-width));
      width: 100%;
      height: 100dvh;
      overflow: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-player-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      min-width: 0;
      min-height: 0;
      padding: 0;
      background: #050609;
      overflow: hidden;
      gap: 0;
    }

    #${ROOT_ID} .bewly-widescreen-player-frame {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: var(--bewly-widescreen-player-available-height);
      flex: 0 1 var(--bewly-widescreen-player-available-height);
      overflow: hidden;
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

    #${ROOT_ID} .bewly-widescreen-danmaku-dock {
      width: 100% !important;
      max-width: 100%;
      min-height: 0;
      flex: 0 0 auto;
      background: var(--bewly-widescreen-surface-bg);
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-dock:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-dock .bpx-player-sending-bar,
    #${ROOT_ID} .bewly-widescreen-danmaku-dock .bilibili-player-video-sendbar,
    #${ROOT_ID} .bewly-widescreen-danmaku-dock .bilibili-player-video-inputbar {
      position: relative !important;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      transform: none !important;
      box-shadow: none !important;
      z-index: auto !important;
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
      background: #000 !important;
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
      display: flex;
      flex-direction: column;
      justify-self: end;
      width: var(--bewly-widescreen-sidebar-panel-width);
      min-width: 0;
      min-height: 0;
      background: var(--bewly-widescreen-sidebar-bg);
      color: var(--bewly-widescreen-text-primary);
      border-left: 1px solid var(--bewly-widescreen-sidebar-border);
      box-shadow: -12px 0 28px rgba(0, 0, 0, 0.28);
      overflow: hidden;
      transform: translateX(var(--bewly-widescreen-sidebar-offset));
      transition: transform 180ms ease;
      will-change: transform;
      z-index: 2002;
    }

    #${ROOT_ID}[data-sidebar-layout="expanded"] .bewly-widescreen-sidebar,
    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-sidebar {
      transform: translateX(0);
      box-shadow: none;
    }

    #${ROOT_ID}[data-sidebar-layout="compact"][data-sidebar-hover-expanded="true"] .bewly-widescreen-sidebar {
      transform: translateX(0);
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-stage {
      grid-template-columns:
        minmax(0, var(--bewly-widescreen-sidebar-column-width))
        minmax(0, calc(100vw - var(--bewly-widescreen-sidebar-column-width)));
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar {
      justify-self: start;
      border-left: none;
      border-right: 1px solid var(--bewly-widescreen-sidebar-border);
      box-shadow: 12px 0 28px rgba(0, 0, 0, 0.28);
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-layout="expanded"] .bewly-widescreen-sidebar {
      box-shadow: none;
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-layout="compact"] {
      --bewly-widescreen-sidebar-offset: calc(
        var(--bewly-widescreen-sidebar-column-width) - var(--bewly-widescreen-sidebar-panel-width)
      );
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
      width: calc(100vw - var(--bewly-widescreen-sidebar-full-width)) !important;
      max-width: calc(100vw - var(--bewly-widescreen-sidebar-full-width)) !important;
      flex: 0 0 calc(100vw - var(--bewly-widescreen-sidebar-full-width));
    }

    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-danmaku-dock {
      width: calc(100vw - var(--bewly-widescreen-sidebar-full-width)) !important;
      max-width: calc(100vw - var(--bewly-widescreen-sidebar-full-width));
      align-self: flex-start;
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-danmaku-dock {
      align-self: flex-end;
    }

    #${ROOT_ID}[data-centered="true"] .bpx-player-video-area,
    #${ROOT_ID}[data-centered="true"] .bilibili-player-video-area {
      translate: var(--bewly-widescreen-center-offset) 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-toggle {
      position: absolute;
      right: 0;
      top: 50%;
      z-index: 2003;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 42px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: var(--bew-interactive-radius, 8px) 0 0 var(--bew-interactive-radius, 8px);
      color: #fff;
      background: rgba(24, 25, 28, 0.72);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(10px);
      cursor: pointer;
      font-size: 14px;
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: 1;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%);
      transition: opacity 160ms ease, background-color 160ms ease, border-color 160ms ease;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-toggle {
      right: auto;
      left: 0;
      border-radius: 0 var(--bew-interactive-radius, 8px) var(--bew-interactive-radius, 8px) 0;
    }

    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-sidebar-toggle {
      right: var(--bewly-widescreen-sidebar-full-width);
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-sidebar-toggle {
      right: auto;
      left: var(--bewly-widescreen-sidebar-full-width);
    }

    #${ROOT_ID}[data-sidebar-toggle-visible="true"][data-pointer-active="true"] .bewly-widescreen-player-slot:hover .bewly-widescreen-sidebar-toggle,
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
      z-index: 0;
      flex: 0 1 auto;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding: 8px 10px 8px;
      border-bottom: 1px solid var(--bewly-widescreen-divider);
      background: var(--bewly-widescreen-surface-bg);
    }

    #${ROOT_ID} .bewly-widescreen-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }

    #${ROOT_ID} .bewly-widescreen-close {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      width: 28px;
      height: 28px;
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
      width: 13px;
      height: 2px;
      border-radius: 2px;
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
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      flex: 1 1 auto;
      overflow: hidden;
      margin: 0;
      color: var(--bewly-widescreen-text-primary);
      font-size: 18px;
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: 24px;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot {
      min-height: 0;
      margin-top: 4px;
      container-type: inline-size;
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot {
      margin-top: 8px;
      padding-top: 8px;
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
      line-height: 20px !important;
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
      height: 40px !important;
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
      padding-top: 6px !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: 20px !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot a {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle {
      display: block;
      margin-top: 4px;
      padding: 0;
      border: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: var(--bew-font-size-control, 13px);
      line-height: 20px;
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
      gap: 4px !important;
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
      line-height: 20px !important;
      min-height: 28px !important;
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
      gap: 4px !important;
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
      z-index: 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      flex: 0 0 auto;
      height: 42px;
      background: var(--bewly-widescreen-surface-bg);
      border-bottom: 1px solid var(--bewly-widescreen-divider);
    }

    #${ROOT_ID} .bewly-widescreen-tab {
      position: relative;
      border: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: transparent;
      cursor: pointer;
      font-size: 14px;
      line-height: 42px;
    }

    #${ROOT_ID} .bewly-widescreen-tab.is-active {
      color: var(--bew-theme-color, #00aeec);
      font-weight: var(--bew-font-weight-semibold, 600);
    }

    #${ROOT_ID} .bewly-widescreen-tab.is-active::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 24px;
      height: 3px;
      border-radius: 3px 3px 0 0;
      background: var(--bew-theme-color, #00aeec);
      transform: translateX(-50%);
    }

    #${ROOT_ID} .bewly-widescreen-panels {
      position: relative;
      z-index: 1;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      background: var(--bewly-widescreen-sidebar-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel {
      width: 100%;
      height: 100%;
      overflow: auto;
      overscroll-behavior: contain;
      padding: 8px 8px 16px;
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
      margin: 0 0 12px !important;
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
      max-height: min(52dvh, 560px) !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
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
      margin-left: 8px !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .user-info,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-user-info {
      min-width: 0 !important;
      max-width: 100% !important;
      flex-wrap: wrap !important;
      gap: 4px 6px !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-time,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-time,
    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-time-location {
      white-space: nowrap !important;
      font-size: 12px !important;
    }

    #${ROOT_ID} .bewly-widescreen-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 160px;
      color: var(--bewly-widescreen-text-muted);
      font-size: 14px;
    }

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      #${ROOT_ID} {
        --bewly-widescreen-player-available-height: calc(56dvh - var(--bewly-widescreen-danmaku-height, 0px));
        --bewly-widescreen-sidebar-column-width: 100vw;
        --bewly-widescreen-sidebar-panel-width: 100vw;
        --bewly-widescreen-sidebar-offset: 0px;
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

      #${ROOT_ID} .bewly-widescreen-sidebar {
        grid-column: 1;
        grid-row: 2;
        width: 100%;
        transform: none;
        transition: none;
        box-shadow: none;
      }

      #${ROOT_ID} .bewly-widescreen-sidebar-toggle {
        display: none;
      }

      #${ROOT_ID} .bewly-widescreen-player-frame > *,
      #${ROOT_ID}[data-centered="true"] .bewly-widescreen-player-frame > * {
        width: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        flex-basis: auto;
      }

      #${ROOT_ID} .bewly-widescreen-danmaku-dock,
      #${ROOT_ID}[data-centered="true"] .bewly-widescreen-danmaku-dock {
        width: 100% !important;
        max-width: 100%;
      }

      #${ROOT_ID}[data-centered="true"] .bpx-player-video-area,
      #${ROOT_ID}[data-centered="true"] .bilibili-player-video-area {
        translate: none !important;
      }
    }
  `)
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
    sidebarWidth: sidebarRect.width,
  })
  const direction = currentState.sidebarPosition === 'right' ? 1 : -1

  currentState.root.dataset.centered = String(geometry.enabled)
  currentState.root.dataset.sidebarToggleVisible = 'true'
  currentState.root.style.setProperty(
    '--bewly-widescreen-center-offset',
    `${geometry.offset * direction}px`,
  )
  if (geometry.enabled)
    currentState.root.dataset.sidebarHoverExpanded = 'false'
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

function updateDanmakuDockHeight() {
  if (!state)
    return

  const height = state.danmakuDock.childElementCount > 0
    ? state.danmakuDock.getBoundingClientRect().height
    : 0

  state.root.style.setProperty('--bewly-widescreen-danmaku-height', `${height}px`)
  updateSidebarLayoutState(state)
  schedulePlayerResizeSync(state)
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

function setupAspectObservers(currentState: BewlyWidescreenState) {
  const video = getVideoElement()
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
    updateDanmakuDockHeight()
    syncDescription(currentState)
    scheduleActionGeometrySync(currentState)
  }

  currentState.resizeObserver = new ResizeObserver(refreshMeasuredLayout)
  currentState.resizeObserver.observe(currentState.root)
  currentState.resizeObserver.observe(currentState.playerFrame)
  currentState.resizeObserver.observe(currentState.sidebarEl)
  currentState.resizeObserver.observe(currentState.danmakuDock)
  currentState.resizeObserver.observe(currentState.descriptionSlot)

  const playerHost = video?.closest<HTMLElement>('.bewly-vertical-video-zoom-host, .bpx-player-container, .player-wrap')
  if (playerHost) {
    currentState.playerStateObserver = new MutationObserver(refreshMeasuredLayout)
    currentState.playerStateObserver.observe(playerHost, { attributes: true, attributeFilter: ['class'] })
  }

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
  }

  updateAspectRatio(currentState)
  schedulePlayerResizeSync(currentState)
}

function setupActiveWidescreenControl(currentState: BewlyWidescreenState) {
  const handleControlClick = (event: Event) => {
    const eventElements = event.composedPath().filter((node): node is Element => node instanceof Element)
    if (eventElements.some(element => element.closest('.bewly-widescreen-entry-control'))) {
      event.preventDefault()
      event.stopImmediatePropagation()
      exitBewlyWidescreen({ userInitiated: true })
      return
    }
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
  const { root, sidebarEl: sidebar, playerFrame } = currentState

  function canTemporarilyExpand() {
    return currentState.sidebarLayout === 'compact'
      && currentState.root.dataset.centered !== 'true'
  }

  function expandSidebar() {
    if (canTemporarilyExpand())
      root.dataset.sidebarHoverExpanded = 'true'
  }

  function collapseSidebar() {
    if (currentState.sidebarLayout === 'compact')
      root.dataset.sidebarHoverExpanded = 'false'
  }

  sidebar.addEventListener('pointerenter', expandSidebar)
  sidebar.addEventListener('pointerleave', collapseSidebar)
  playerFrame.addEventListener('pointerenter', collapseSidebar)
  root.addEventListener('pointerleave', collapseSidebar)

  currentState.sidebarInteractionCleanup = () => {
    sidebar.removeEventListener('pointerenter', expandSidebar)
    sidebar.removeEventListener('pointerleave', collapseSidebar)
    playerFrame.removeEventListener('pointerenter', collapseSidebar)
    root.removeEventListener('pointerleave', collapseSidebar)
    delete root.dataset.sidebarHoverExpanded
  }
}

function setupSidebarToggleAutoHide(currentState: BewlyWidescreenState) {
  const { playerSlot, sidebarToggleButton, root } = currentState
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

  playerSlot.addEventListener('pointermove', showToggle)
  playerSlot.addEventListener('pointerleave', onPointerLeave)
  sidebarToggleButton.addEventListener('pointerenter', onToggleEnter)
  sidebarToggleButton.addEventListener('pointerleave', onToggleLeave)

  currentState.sidebarToggleAutoHideCleanup = () => {
    clearIdleTimer()
    playerSlot.removeEventListener('pointermove', showToggle)
    playerSlot.removeEventListener('pointerleave', onPointerLeave)
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
    if (addedDanmakuInput) {
      scheduleSidebarRefresh(currentState)
      return
    }

    const origins = records.map(record => classifyWidescreenMutation(record, currentState))
    if (shouldScheduleWidescreenRefresh(origins))
      scheduleSidebarRefresh(currentState)
  })

  currentState.mutationObserver.observe(document.body, { childList: true, subtree: true })
}

function moveDanmakuInput(currentState: BewlyWidescreenState) {
  if (currentState.danmakuDock.querySelector(selectors.danmakuInput.join(',')))
    return true

  const inputBar = findFirst(selectors.danmakuInput, currentState.playerSlot)
    || findMovable(selectors.danmakuInput)

  const moved = moveNode(inputBar, currentState.danmakuDock, currentState.movedNodes, !!inputBar?.closest(`#${ROOT_ID}`))
  updateDanmakuDockHeight()
  return moved
}

function expandDanmakuTab(currentState: BewlyWidescreenState) {
  const focusable = findFirst(selectors.danmakuFocusable, currentState.panels.danmaku)
  if (!focusable)
    return

  currentState.panels.danmaku.scrollTo({ top: 0, behavior: 'smooth' })
  if (currentState.danmakuExpandTimer)
    clearTimeout(currentState.danmakuExpandTimer)
  currentState.danmakuExpandTimer = setTimeout(() => {
    currentState.danmakuExpandTimer = undefined
    if (state !== currentState || !focusable.isConnected)
      return
    focusable.click()
    focusable.focus?.({ preventScroll: true })
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
  const hasDescription = !!descriptionText && !/^[-–—]+$/.test(descriptionText) && descriptionText !== '暂无简介'
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
  const nextTitle = getTitleText()
  if (titleElement && nextTitle && titleElement.textContent !== nextTitle)
    titleElement.textContent = nextTitle
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

function syncEpisodeSectionMarker(panel: HTMLElement, movedNodes: MovedNode[]) {
  clearEpisodeSectionMarker(panel, movedNodes)

  const episodeSection = findEpisodeSectionNode(panel, movedNodes)
  if (episodeSection)
    episodeSection.classList.add(EPISODE_SECTION_CLASS)
}

function fillSidebar(currentState: BewlyWidescreenState) {
  syncActionAnimationTheme(currentState)
  syncSidebarTitle(currentState)

  moveOrReplaceNode(selectors.toolbar, currentState.toolbarSlot, currentState.movedNodes)
  scheduleActionGeometrySync(currentState)

  moveOrReplaceNode(selectors.upPanel, currentState.upSlot, currentState.movedNodes)

  const descriptionResult = moveOrReplaceNode(selectors.description, currentState.descriptionSlot, currentState.movedNodes)
  if (descriptionResult.changed)
    currentState.descriptionExpanded = false
  syncDescription(currentState)

  moveOrReplaceNode(selectors.tags, currentState.tagsSlot, currentState.movedNodes)

  moveDanmakuInput(currentState)
  const commentResult = moveCommentRoot(currentState.panels.comment, currentState.movedNodes)
  if (!commentResult.found) {
    ensureEmptyPanel(currentState.panels.comment, t('widescreen.comments_loading'))
  }
  else {
    clearEmptyPanel(currentState.panels.comment)
    shortenCommentTimes(currentState.panels.comment)
  }

  const danmakuResult = moveOrReplaceNode(selectors.danmaku, currentState.panels.danmaku, currentState.movedNodes)
  if (!danmakuResult.found)
    ensureEmptyPanel(currentState.panels.danmaku, t('widescreen.danmaku_loading'))
  else
    clearEmptyPanel(currentState.panels.danmaku)

  movePlaylistControls(currentState.panels.playlist, currentState.movedNodes)
  moveMatchingNodes(['[class*="eplist_ep_list_wrapper"]'], currentState.panels.playlist, currentState.movedNodes)
  const existingPlaylist = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
  const existingRecommend = currentState.panels.playlist.querySelector(selectors.recommend.join(','))
  const playlist = existingPlaylist ? null : findMovable(selectors.playlist)
  const playlistMoved = existingPlaylist || moveNode(playlist, currentState.panels.playlist, currentState.movedNodes)
  // 推荐列表与选集是同一侧栏面板中的两个连续区块；即使选集已经存在，
  // 也要继续搬运推荐列表，保证推荐内容显示在选集下方。
  const recommend = existingRecommend ? null : findMovable(selectors.recommend)
  const recommendMoved = existingRecommend || moveNode(recommend, currentState.panels.playlist, currentState.movedNodes)
  placeRecommendAfterPlaylist(currentState.panels.playlist, currentState.movedNodes)
  syncEpisodeSectionMarker(currentState.panels.playlist, currentState.movedNodes)
  const hasPlaylist = !!(existingPlaylist || playlistMoved)
  const hasRecommend = !!(existingRecommend || recommendMoved)
  const playlistLabel = hasPlaylist ? t('widescreen.playlist') : t('widescreen.recommendations')
  if (currentState.tabButtons.playlist.textContent !== playlistLabel)
    currentState.tabButtons.playlist.textContent = playlistLabel
  if (!hasPlaylist && !hasRecommend)
    ensureEmptyPanel(currentState.panels.playlist, t('widescreen.list_loading'))
  else
    clearEmptyPanel(currentState.panels.playlist)
}

function clearEmptyPanel(panel: HTMLElement) {
  panel.querySelectorAll(`.${EMPTY_CLASS}`).forEach(element => element.remove())
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
  currentState.layoutEventCleanup?.()
  currentState.layoutEventCleanup = undefined
  currentState.settingsWatchCleanup?.forEach(stop => stop())
  currentState.settingsWatchCleanup = undefined
  currentState.descriptionCleanup?.()
  currentState.descriptionCleanup = undefined
  if (currentState.danmakuExpandTimer)
    clearTimeout(currentState.danmakuExpandTimer)
  currentState.danmakuExpandTimer = undefined
  clearPlayerResizeSync(currentState)
  clearActionGeometry(currentState)
  clearSidebarRefreshTimer()
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
  document.body.classList.remove(BODY_CLASS)
}

function isReadyForLayout() {
  const player = findMovable(selectors.player)
  if (!player)
    return false

  const video = getVideoElement()
  if (video instanceof HTMLVideoElement) {
    return video.readyState >= HTMLMediaElement.HAVE_METADATA
      && video.videoWidth > 0
      && video.videoHeight > 0
  }

  const customVideo = player.querySelector<HTMLElement & { currentSrc?: string, readyState?: number }>('bwp-video')
  return !!customVideo
    && ((customVideo.readyState ?? 0) >= HTMLMediaElement.HAVE_METADATA || !!customVideo.currentSrc)
}

function applyNow(sidebarPosition: 'left' | 'right' = 'right') {
  const player = findMovable(selectors.player)
  if (!player)
    return false

  const { root, stage, playerSlot, playerFrame, danmakuDock, sidebarEl, sidebarTop, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, sidebarToggleButton } = createRoot(sidebarPosition)
  const styleEl = injectLayoutStyle()
  const movedNodes: MovedNode[] = []

  const nextState: BewlyWidescreenState = {
    root,
    stage,
    playerSlot,
    playerFrame,
    danmakuDock,
    sidebarEl,
    sidebarTop,
    upSlot,
    toolbarSlot,
    descriptionSlot,
    tagsSlot,
    panels,
    tabButtons,
    sidebarToggleButton,
    movedNodes,
    styleEl,
    activeTab: 'comment',
    sidebarLayout: settings.value.bewlyWidescreenLayoutPriority === 'sidebar-first' ? 'expanded' : 'compact',
    sidebarPosition,
    descriptionExpanded: false,
  }

  state = nextState
  enteringWidescreen = false
  clearPendingEscapeHandler()
  document.body.classList.add(BODY_CLASS)

  const hasVisiblePlayerDialog = () => Array.from(document.querySelectorAll<HTMLElement>(
    '[role="dialog"], .bili-mini-mask, .bpx-player-dialog-wrap',
  )).some((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  })
  const hasEscapePriorityState = () => hasIframeEscapePriorityState({
    editingStateActive: isNativePlaylistEditing(),
  }) || hasVisiblePlayerDialog()
  let escapeArbitrationTimer: number | undefined
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
      return
    }
    if (event.key !== 'Escape' || escapeArbitrationTimer !== undefined)
      return

    const hadPriorityState = hasEscapePriorityState()
    // Bilibili's base player prevents Escape even when no mode is active, so
    // explicit priority ownership—not defaultPrevented alone—decides here.
    escapeArbitrationTimer = window.setTimeout(() => {
      escapeArbitrationTimer = undefined
      if (!nextState.root.isConnected || hadPriorityState || hasEscapePriorityState())
        return
      exitBewlyWidescreen({ userInitiated: true })
    }, 0)
  }
  window.addEventListener('keydown', handleWidescreenKeydown, { capture: true })
  nextState.escapeKeyCleanup = () => {
    window.removeEventListener('keydown', handleWidescreenKeydown, { capture: true })
    if (escapeArbitrationTimer !== undefined) {
      window.clearTimeout(escapeArbitrationTimer)
      escapeArbitrationTimer = undefined
    }
  }

  moveNode(player, playerFrame, movedNodes, false, true)
  fillSidebar(nextState)
  setActiveTab('comment')
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

function clearReadyWait() {
  readyObserver?.disconnect()
  readyObserver = undefined
  if (readyFrame !== undefined)
    cancelAnimationFrame(readyFrame)
  readyFrame = undefined
  if (readyDeadlineTimer) {
    clearTimeout(readyDeadlineTimer)
    readyDeadlineTimer = undefined
  }
  if (readyMetadataHandler) {
    document.removeEventListener('loadedmetadata', readyMetadataHandler, true)
    readyMetadataHandler = undefined
  }
}

function clearLoadFallbackTimer() {
  if (loadFallbackTimer) {
    clearTimeout(loadFallbackTimer)
    loadFallbackTimer = undefined
  }
}

function clearPageLoadHandler() {
  if (!pageLoadHandler)
    return

  window.removeEventListener('load', pageLoadHandler)
  pageLoadHandler = undefined
}

function clearSidebarRefreshTimer() {
  if (sidebarRefreshFrame !== undefined) {
    cancelAnimationFrame(sidebarRefreshFrame)
    sidebarRefreshFrame = undefined
  }
}

function waitForReadyLayout() {
  clearReadyWait()

  const scheduleAttempt = () => {
    if (readyFrame !== undefined)
      return
    readyFrame = requestAnimationFrame(() => {
      readyFrame = undefined
      if (state) {
        clearReadyWait()
        return
      }
      if (isReadyForLayout() && applyNow(pendingSidebarPosition))
        clearReadyWait()
    })
  }

  readyObserver = new MutationObserver(scheduleAttempt)
  readyObserver.observe(document.body || document.documentElement, { childList: true, subtree: true })
  readyMetadataHandler = scheduleAttempt
  document.addEventListener('loadedmetadata', readyMetadataHandler, true)
  readyDeadlineTimer = setTimeout(() => {
    clearReadyWait()
    enteringWidescreen = false
    clearPendingEscapeHandler()
    removeWidescreenLoading()
    stopLanguageWatch?.()
    stopLanguageWatch = undefined
    window.dispatchEvent(new Event(BEWLY_WIDESCREEN_FAILED))
  }, READY_WAIT_TIMEOUT)
  scheduleAttempt()
}

function startAfterPageLoad(sidebarPosition: 'left' | 'right' = 'right') {
  if (state) {
    enteringWidescreen = false
    return
  }

  waitingForLoad = false
  clearPageLoadHandler()
  clearLoadFallbackTimer()
  pendingSidebarPosition = sidebarPosition
  waitForReadyLayout()
}

function scheduleSidebarRefresh(currentState = state) {
  if (!currentState || state !== currentState || sidebarRefreshFrame !== undefined)
    return

  sidebarRefreshFrame = requestAnimationFrame(() => {
    sidebarRefreshFrame = undefined
    if (!state || state !== currentState)
      return

    fillSidebar(currentState)
  })
}

export function applyBewlyWidescreen(
  sidebarPosition: 'left' | 'right' = 'right',
  showLoading = true,
) {
  startWidescreenLanguageWatch()
  if (state || enteringWidescreen || waitingForLoad || readyObserver || readyFrame !== undefined || readyDeadlineTimer)
    return

  enteringWidescreen = true
  ensurePendingEscapeHandler()
  leaveMutuallyExclusivePlayerModes()
  pendingSidebarPosition = sidebarPosition
  if (showLoading)
    showWidescreenLoading()

  if (document.readyState === 'complete') {
    startAfterPageLoad(sidebarPosition)
    return
  }

  waitingForLoad = true
  pageLoadHandler = () => startAfterPageLoad(sidebarPosition)
  window.addEventListener('load', pageLoadHandler, { once: true })

  clearLoadFallbackTimer()
  loadFallbackTimer = setTimeout(() => {
    if (waitingForLoad)
      startAfterPageLoad(pendingSidebarPosition)
  }, 6000)
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
  clearLoadFallbackTimer()
  clearPageLoadHandler()
  clearPendingEscapeHandler()
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
      || !!readyDeadlineTimer
      || !!loadFallbackTimer
      || !!pageLoadHandler,
    waitingForLoad,
  })
}
