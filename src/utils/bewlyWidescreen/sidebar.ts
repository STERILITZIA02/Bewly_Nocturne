import { scheduleActionGeometrySync, syncActionAnimationTheme } from '~/utils/bewlyWidescreen/actionEffects'
import { wakeNativeCommentList } from '~/utils/bewlyWidescreen/commentWake'
import { COMMENT_TIME_SELECTOR, DANMAKU_SKELETON_CLASS, EMPTY_CLASS, selectors, SIDEBAR_HYDRATION_FAST_DURATION, SIDEBAR_HYDRATION_FAST_INTERVAL, SIDEBAR_HYDRATION_INTERVAL, SIDEBAR_HYDRATION_RECOVERY_INTERVAL } from '~/utils/bewlyWidescreen/constants'
import { activateDanmakuTab, clearDanmakuActivation, isDanmakuPanelReady, syncDanmakuInputSource, syncDanmakuSenderOrderButton } from '~/utils/bewlyWidescreen/danmaku'
import { syncDescription } from '~/utils/bewlyWidescreen/description'
import { ensureAnchoredPlayer, schedulePlayerResizeSync, syncAuxiliaryControlGeometry, syncControlsGlassGeometry } from '~/utils/bewlyWidescreen/geometry'
import { t } from '~/utils/bewlyWidescreen/labels'
import { syncNativePlayerControlVisibility } from '~/utils/bewlyWidescreen/nativeControls'
import { findCommentRoot, findMovable, findRetainedNode, isCommentRootUsable, isNativeCommentRequestPending, moveCommentRoot, moveMatchingNodes, moveNativeMusicPanel, moveNode, moveOrReplaceNode, movePlaylistControls, restoreCommentPrewarm, restoreMovedNodes, startCommentPrewarm } from '~/utils/bewlyWidescreen/nativeDom'
import { clearEpisodeSectionMarker, placeRecommendAfterPlaylist, syncEpisodeSectionMarker, syncPlaylistToggleButton } from '~/utils/bewlyWidescreen/playlist'
import { session } from '~/utils/bewlyWidescreen/session'
import { scheduleInitialPanelScrollReset } from '~/utils/bewlyWidescreen/shell'
import type { BewlyWidescreenState, WidescreenSidebarReadiness } from '~/utils/bewlyWidescreen/types'
import { clearVideoMetadataObserver, renderFallbackVideoInfo, syncSidebarTitle, syncVideoMetadata, syncViewerCount } from '~/utils/bewlyWidescreen/videoInfo'
import { resolveWidescreenSidebarHydrationPhase, shortenCommentDateText } from '~/utils/bewlyWidescreenPolicy'
import { createLoadingRingElement, getLoadingRingCloseDuration } from '~/utils/loadingRing'
import { getMotionDuration } from '~/utils/motionTiming'

let sidebarRefreshFrame: number | undefined

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
      block.setAttribute('data-bew-skeleton', '')
      row.appendChild(block)
    }
    rows.appendChild(row)
  }
  skeleton.appendChild(rows)
  return skeleton
}

export function syncSidebarReadiness(
  currentState: BewlyWidescreenState,
  readiness: WidescreenSidebarReadiness,
) {
  currentState.root.dataset.sidebarTopReady = String(readiness.overview)
  currentState.root.dataset.sidebarCommentReady = String(readiness.comment)
  currentState.root.dataset.sidebarDanmakuReady = String(readiness.danmaku)
  currentState.root.dataset.sidebarPlaylistReady = String(readiness.playlist)
  currentState.root.dataset.sidebarContentReady = String(readiness.complete)
  currentState.panels.overview.setAttribute('aria-busy', String(!readiness.overview))
  currentState.panels.comment.setAttribute('aria-busy', String(!readiness.comment))
  currentState.panels.danmaku.setAttribute('aria-busy', String(!readiness.danmaku))
}

function fillOverviewInfo(currentState: BewlyWidescreenState) {
  syncSidebarTitle(currentState)

  const metadataReady = syncVideoMetadata(currentState)
  const toolbarResult = moveOrReplaceNode(selectors.toolbar, currentState.toolbarSlot, currentState.movedNodes)
  scheduleActionGeometrySync(currentState)

  const upResult = moveOrReplaceNode(selectors.upPanel, currentState.upSlot, currentState.movedNodes)

  const descriptionResult = moveOrReplaceNode(selectors.description, currentState.descriptionSlot, currentState.movedNodes)
  if (descriptionResult.changed)
    currentState.descriptionExpanded = false
  syncDescription(currentState)

  moveOrReplaceNode(selectors.tags, currentState.tagsSlot, currentState.movedNodes)
  moveNativeMusicPanel(currentState.movedNodes)
  renderFallbackVideoInfo(currentState)
  const ownerReady = (currentState.root.dataset.pageKind === 'pgc' && metadataReady) || upResult.found
    || !!currentState.upSlot.querySelector('.bewly-widescreen-fallback-owner')
  return ownerReady && toolbarResult.found
}

function fillSidebar(currentState: BewlyWidescreenState): WidescreenSidebarReadiness {
  ensureAnchoredPlayer(currentState)
  syncActionAnimationTheme(currentState)
  const activeTab = currentState.activeTab
  const overviewReady = activeTab === 'overview'
    ? fillOverviewInfo(currentState)
    : currentState.hydratedTabs.has('overview')
  syncDanmakuInputSource(currentState)
  syncViewerCount(currentState)
  syncControlsGlassGeometry(currentState)
  syncNativePlayerControlVisibility(currentState)
  syncAuxiliaryControlGeometry(currentState)
  if (!currentState.controlsLayoutReady)
    schedulePlayerResizeSync(currentState)

  const existingComment = findCommentRoot(currentState.panels.comment)
  let commentFound = !!existingComment && isCommentRootUsable(existingComment)
  if (activeTab === 'comment') {
    const commentResult = moveCommentRoot(currentState.panels.comment, currentState.movedNodes)
    commentFound = commentResult.found
    if (!commentFound) {
      if (currentState.sidebarHydrationTimedOut)
        ensureSidebarHydrationFailure(currentState)
      else
        ensureLoadingPanel(currentState.panels.comment, t('widescreen.comments_loading'), 'comment')
    }
    else {
      finishPanelLoading(currentState.panels.comment)
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
      if (currentState.sidebarHydrationTimedOut) {
        ensureSidebarHydrationFailure(currentState)
      }
      else {
        clearEmptyPanel(currentState.panels.danmaku)
        ensureDanmakuSkeleton(currentState.panels.danmaku, t('widescreen.danmaku_loading'))
      }
    }
    else {
      if (!currentState.sidebarHydrationTimedOut)
        activateDanmakuTab(currentState)
      danmakuReady = isDanmakuPanelReady(currentState.panels.danmaku)
      if (danmakuReady) {
        clearEmptyPanel(currentState.panels.danmaku)
        clearDanmakuSkeleton(currentState.panels.danmaku)
        syncDanmakuSenderOrderButton(currentState.panels.danmaku)
      }
      else if (currentState.sidebarHydrationTimedOut) {
        ensureSidebarHydrationFailure(currentState)
      }
      else {
        clearEmptyPanel(currentState.panels.danmaku)
        ensureDanmakuSkeleton(currentState.panels.danmaku, t('widescreen.danmaku_loading'))
      }
    }
  }
  if (danmakuReady)
    currentState.hydratedTabs.add('danmaku')

  if (activeTab === 'overview') {
    movePlaylistControls(currentState.playlistSlot, currentState.movedNodes)
    moveMatchingNodes(['[class*="eplist_ep_list_wrapper"]'], currentState.playlistSlot, currentState.movedNodes)
    for (const list of [selectors.playlist, selectors.recommend]) {
      if (!findRetainedNode(list, currentState.playlistSlot, currentState.movedNodes))
        moveNode(findMovable(list), currentState.playlistSlot, currentState.movedNodes)
    }
    placeRecommendAfterPlaylist(currentState.playlistSlot, currentState.movedNodes)
    syncEpisodeSectionMarker(currentState)
  }
  const hasVideoList = !!currentState.playlistSlot.querySelector([...selectors.playlist, ...selectors.recommend].join(','))
  clearEmptyPanel(currentState.playlistSlot)

  const readiness = {
    // API counters are read-only information, never proof that native actions work.
    overview: overviewReady,
    comment: commentFound,
    danmaku: danmakuReady,
    playlist: hasVideoList,
    complete: false,
  }
  readiness.complete = readiness[activeTab]
  if (readiness.overview) {
    currentState.hydratedTabs.add('overview')
    clearEmptyPanel(currentState.sidebarTop)
  }
  if (currentState.hydratedTabs.has(activeTab))
    scheduleInitialPanelScrollReset(currentState, activeTab)
  if (readiness.complete)
    currentState.sidebarHydrationTimedOut = false
  syncSidebarReadiness(currentState, readiness)
  return readiness
}

function clearEmptyPanel(panel: HTMLElement) {
  panel.querySelectorAll(`.${EMPTY_CLASS}`).forEach(element => element.remove())
}

function ensureSidebarHydrationFailure(currentState: BewlyWidescreenState, panel = currentState.panels[currentState.activeTab]) {
  if (panel.querySelector('.bewly-widescreen-panel-error'))
    return
  clearEmptyPanel(panel)
  clearDanmakuSkeleton(panel)
  const error = createPanelEmpty('')
  error.classList.add('bewly-widescreen-panel-error')
  error.setAttribute('role', 'status')
  const label = document.createElement('span')
  label.textContent = t('widescreen.panel_load_incomplete')
  const reload = document.createElement('button')
  reload.type = 'button'
  reload.textContent = t('widescreen.reload_page')
  reload.onclick = () => {
    if (session.current === currentState && !currentState.navigationPending)
      location.reload()
  }
  const exit = document.createElement('button')
  exit.type = 'button'
  exit.textContent = t('widescreen.exit')
  exit.onclick = () => {
    if (session.current === currentState)
      currentState.exit({ userInitiated: true })
  }
  error.append(label, reload, exit)
  panel.appendChild(error)
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

const PANEL_LOADING_CLASS = 'bewly-widescreen-panel-loading'
const LOADING_COMPLETE_ATTRIBUTE = 'data-bew-loading-complete'

/** Comments have no layout to sketch: one ring holds the whole panel. */
function ensureLoadingRingPanel(panel: HTMLElement, label: string) {
  const existing = panel.querySelector<HTMLElement>(`.${PANEL_LOADING_CLASS}:not([${LOADING_COMPLETE_ATTRIBUTE}])`)
  if (existing) {
    existing.setAttribute('aria-label', label)
    return
  }
  clearEmptyPanel(panel)
  const loading = createPanelEmpty('')
  loading.classList.add(PANEL_LOADING_CLASS)
  loading.setAttribute('role', 'status')
  loading.setAttribute('aria-label', label)
  loading.append(createLoadingRingElement())
  panel.appendChild(loading)
}

/** The ring closes, then fades off the content it covered; other notices go at once. */
function finishPanelLoading(panel: HTMLElement) {
  panel.querySelectorAll(`.${EMPTY_CLASS}:not(.${PANEL_LOADING_CLASS})`).forEach(element => element.remove())
  // Read every duration before the first write, so styles resolve once.
  const loadings = Array.from(panel.querySelectorAll<HTMLElement>(`.${PANEL_LOADING_CLASS}:not([${LOADING_COMPLETE_ATTRIBUTE}])`))
    .map(loading => ({
      loading,
      closeDuration: getLoadingRingCloseDuration(loading.querySelector('.bew-loading-ring')),
      fadeDuration: getMotionDuration(getComputedStyle(loading), '--bew-duration-fast', 150),
    }))
  for (const { loading, closeDuration, fadeDuration } of loadings) {
    loading.setAttribute(LOADING_COMPLETE_ATTRIBUTE, '')
    loading.removeAttribute('role')
    setTimeout(() => {
      loading.classList.add('is-leaving')
      setTimeout(() => loading.remove(), fadeDuration)
    }, closeDuration)
  }
}

function ensureLoadingPanel(panel: HTMLElement, label: string, kind: 'comment' | 'playlist') {
  if (kind === 'comment') {
    ensureLoadingRingPanel(panel, label)
    return
  }
  const existing = panel.querySelector<HTMLElement>('.bewly-widescreen-panel-skeleton')
  if (existing) {
    existing.setAttribute('aria-label', label)
    return
  }
  clearEmptyPanel(panel)
  const skeleton = createPanelEmpty('')
  skeleton.classList.add('bewly-widescreen-panel-skeleton')
  skeleton.dataset.kind = kind
  skeleton.setAttribute('role', 'status')
  skeleton.setAttribute('aria-label', label)
  for (let index = 0; index < 5; index++) {
    const row = document.createElement('div')
    row.className = 'bewly-widescreen-panel-skeleton__row'
    row.setAttribute('aria-hidden', 'true')
    for (const part of ['leading', 'content']) {
      const block = document.createElement('span')
      block.className = `bewly-widescreen-panel-skeleton__${part}`
      block.setAttribute('data-bew-skeleton', '')
      row.appendChild(block)
    }
    skeleton.appendChild(row)
  }
  panel.appendChild(skeleton)
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

export function clearSidebarHydration(currentState: BewlyWidescreenState) {
  if (currentState.sidebarHydrationTimer)
    clearTimeout(currentState.sidebarHydrationTimer)
  currentState.sidebarHydrationTimer = undefined
  currentState.sidebarHydrationResumeCleanup?.()
  currentState.sidebarHydrationResumeCleanup = undefined
}

function runSidebarHydration(currentState: BewlyWidescreenState): WidescreenSidebarReadiness | null {
  if (currentState.navigationPending)
    return null

  try {
    const readiness = fillSidebar(currentState)
    currentState.sidebarHydrationWarningShown = false
    return readiness
  }
  catch (error) {
    if (!currentState.sidebarHydrationWarningShown) {
      currentState.sidebarHydrationWarningShown = true
      console.warn('[Bewly Nocturne] Sidebar hydration failed; retrying within the bounded hydration window.', error)
    }
    return null
  }
}

export function startSidebarHydration(currentState: BewlyWidescreenState) {
  clearSidebarHydration(currentState)
  if (currentState.navigationPending)
    return

  // The budget counts visible time only: a hidden tab neither paints nor runs
  // the native list's lazy-load observer, so hydration pauses and starts a
  // fresh budget when the page shows again.
  currentState.sidebarHydrationTimedOut = false
  currentState.commentListReloadRequested = false
  const startedAt = Date.now()

  const hydrate = () => {
    currentState.sidebarHydrationTimer = undefined
    if (session.current !== currentState || !currentState.root.isConnected || currentState.navigationPending)
      return
    if (document.hidden) {
      const resume = () => {
        if (document.hidden)
          return
        clearSidebarHydration(currentState)
        if (session.current === currentState && currentState.root.isConnected && !currentState.navigationPending)
          startSidebarHydration(currentState)
      }
      document.addEventListener('visibilitychange', resume)
      currentState.sidebarHydrationResumeCleanup = () => document.removeEventListener('visibilitychange', resume)
      return
    }

    // Keeps the native list in view so its lazy-load can start; restored once
    // it is moved, or when hydration gives up.
    if (currentState.activeTab === 'comment' && !findCommentRoot(currentState.panels.comment))
      startCommentPrewarm()
    const readiness = runSidebarHydration(currentState)
    const elapsed = Date.now() - startedAt
    const commentMissing = currentState.activeTab === 'comment' && !readiness?.comment
    const nativeRequestPending = commentMissing && isNativeCommentRequestPending()
    const phase = resolveWidescreenSidebarHydrationPhase({
      complete: readiness?.complete ?? false,
      elapsed,
      nativeRequestPending,
    })
    if (phase === 'complete')
      return
    if (phase === 'stopped') {
      if (!readiness?.comment)
        restoreCommentPrewarm()
      return
    }
    if (commentMissing) {
      // The prewarm only works while it pins the current list; Bilibili may
      // re-render it below the fold. Release the list's lazy-load wait every
      // tick, and reload once a first page that outlasts the budget.
      const reload = phase !== 'hydrating' && nativeRequestPending && !currentState.commentListReloadRequested
      if (reload)
        currentState.commentListReloadRequested = true
      wakeNativeCommentList(reload)
    }
    if (phase === 'recovering') {
      // A slow request or a late native component still finishes on its own;
      // the next hydration that finds it removes the notice.
      if (!readiness?.[currentState.activeTab]) {
        currentState.sidebarHydrationTimedOut = true
        ensureSidebarHydrationFailure(currentState, currentState.activeTab === 'overview' ? currentState.sidebarTop : currentState.panels[currentState.activeTab])
      }
    }

    const interval = phase === 'recovering'
      ? SIDEBAR_HYDRATION_RECOVERY_INTERVAL
      : elapsed < SIDEBAR_HYDRATION_FAST_DURATION ? SIDEBAR_HYDRATION_FAST_INTERVAL : SIDEBAR_HYDRATION_INTERVAL
    currentState.sidebarHydrationTimer = setTimeout(hydrate, interval)
  }

  hydrate()
}

function clearNavigationFallbackContent(currentState: BewlyWidescreenState) {
  clearVideoMetadataObserver(currentState)
  currentState.metadataSlot.querySelector('.bewly-widescreen-metadata-clone')?.remove()
  currentState.upSlot.querySelector('.bewly-widescreen-fallback-owner')?.remove()
  currentState.toolbarSlot.querySelector('.bewly-widescreen-fallback-stats')?.remove()
  currentState.descriptionSlot.querySelector('.bewly-widescreen-fallback-description')?.remove()
  currentState.tagsSlot.querySelector('.bewly-widescreen-fallback-category')?.remove()
}

function showActivePanelNavigationLoading(currentState: BewlyWidescreenState) {
  for (const panel of Object.values(currentState.panels))
    clearEmptyPanel(panel)
  clearDanmakuSkeleton(currentState.panels.danmaku)

  switch (currentState.activeTab) {
    case 'comment':
      ensureLoadingPanel(currentState.panels.comment, t('widescreen.comments_loading'), 'comment')
      break
    case 'danmaku':
      ensureDanmakuSkeleton(currentState.panels.danmaku, t('widescreen.danmaku_loading'))
      break
    case 'overview':
      ensureLoadingPanel(currentState.playlistSlot, t('widescreen.list_loading'), 'playlist')
      break
  }
}

export function suspendSidebarForVideoNavigation(currentState: BewlyWidescreenState, kind: 'part' | 'video') {
  if (currentState.navigationPending === 'video' || currentState.navigationPending === kind)
    return

  currentState.navigationPending = kind
  currentState.sidebarHydrationTimedOut = false
  currentState.root.dataset.navigationPending = 'true'
  clearSidebarHydration(currentState)
  clearSidebarRefreshTimer()
  restoreCommentPrewarm()
  clearDanmakuActivation(currentState)
  if (kind === 'part') {
    // Comments, description, owner and playlist belong to the manuscript.
    // Only the danmaku list belongs to the outgoing CID.
    const panel = currentState.panels.danmaku
    const outgoing = currentState.movedNodes.filter(({ node }) => panel.contains(node))
    currentState.movedNodes = currentState.movedNodes.filter(({ node }) => !panel.contains(node))
    restoreMovedNodes(outgoing)
    currentState.hydratedTabs.delete('danmaku')
    currentState.initialScrollResetTabs.delete('danmaku')
    panel.scrollTop = 0
    if (currentState.activeTab === 'danmaku')
      ensureDanmakuSkeleton(panel, t('widescreen.danmaku_loading'))
    return
  }
  currentState.panelScrollFrames.forEach(frame => cancelAnimationFrame(frame))
  currentState.panelScrollFrames.clear()
  currentState.hydratedTabs.clear()
  currentState.initialScrollResetTabs.clear()
  currentState.videoInfoData = undefined
  currentState.videoInfoIdentity = undefined
  currentState.descriptionExpanded = false
  currentState.sidebarHydrationWarningShown = false

  clearNavigationFallbackContent(currentState)
  clearDanmakuSkeleton(currentState.panels.danmaku)
  clearEpisodeSectionMarker(currentState.playlistSlot, currentState.movedNodes)
  if (currentState.playlistToggleButton.parentElement !== currentState.playlistSlot)
    currentState.playlistSlot.prepend(currentState.playlistToggleButton)

  // Restore only the native per-video nodes before Bilibili commits its SPA
  // navigation. The Bewly Playback Page root and its interaction state stay mounted.
  currentState.mutationObserver?.disconnect()
  restoreMovedNodes(currentState.movedNodes)
  if (currentState.mutationObserver && document.body)
    currentState.mutationObserver.observe(document.body, { childList: true, subtree: true })

  for (const panel of Object.values(currentState.panels))
    panel.scrollTop = 0
  syncDescription(currentState)
  syncPlaylistToggleButton(currentState)
  showActivePanelNavigationLoading(currentState)
  syncSidebarReadiness(currentState, {
    complete: false,
    overview: false,
    comment: false,
    danmaku: false,
    playlist: false,
  })
}

export function clearSidebarRefreshTimer() {
  if (sidebarRefreshFrame !== undefined) {
    cancelAnimationFrame(sidebarRefreshFrame)
    sidebarRefreshFrame = undefined
  }
}

export function scheduleSidebarRefresh(currentState = session.current) {
  if (!currentState
    || session.current !== currentState
    || currentState.navigationPending
    || sidebarRefreshFrame !== undefined) {
    return
  }

  sidebarRefreshFrame = requestAnimationFrame(() => {
    sidebarRefreshFrame = undefined
    if (!session.current || session.current !== currentState)
      return

    if (currentState.activeTab === 'comment' && !currentState.sidebarHydrationTimedOut && !findCommentRoot(currentState.panels.comment))
      startCommentPrewarm()
    const readiness = runSidebarHydration(currentState)
    if (readiness?.complete) {
      clearSidebarHydration(currentState)
    }
    else if (!currentState.sidebarHydrationTimer && !currentState.sidebarHydrationTimedOut) {
      startSidebarHydration(currentState)
    }
  })
}
