import { COMMENT_CONTENT_MARKER_SELECTOR, COMMENT_NESTED_UI_SELECTOR, COMMENT_ROOT_ID_SELECTOR, COMMENT_SHADOW_HOST_SELECTOR, NATIVE_LIGHT_OFF_CONTROL_SELECTORS, ROOT_ID, selectors, SIDEBAR_RELEVANT_SELECTOR } from '~/utils/bewlyWidescreen/constants'
import type { BewlyWidescreenState, CommentPrewarmState, MovedNode } from '~/utils/bewlyWidescreen/types'
import type { WidescreenMutationOrigin } from '~/utils/bewlyWidescreenPolicy'
import { transferCommentNode } from '~/utils/commentDomTransfer'
import { getVideoElement } from '~/utils/player'

let commentPrewarmState: CommentPrewarmState | undefined

export function leaveMutuallyExclusivePlayerModes() {
  const fullscreenDocument = document as Document & {
    webkitExitFullscreen?: () => void
    webkitFullscreenElement?: Element | null
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch((error) => {
      console.warn('[Bewly Nocturne] Failed to exit browser fullscreen before entering the Bewly Playback Page:', error)
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

export function exitNativeMiniPlayer(root: ParentNode = document) {
  const container = root instanceof HTMLElement && root.matches('.bpx-player-container')
    ? root
    : root.querySelector<HTMLElement>('.bpx-player-container')
  if (container?.dataset.screen !== 'mini')
    return false

  container.querySelector<HTMLElement>('.bpx-player-mini-close')?.click()
  return true
}

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

export function classifyWidescreenMutation(
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

export function findFirst(selectors: string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector)
    if (element)
      return element
  }
  return null
}

export function findMovable(selectors: string[]): HTMLElement | null {
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

export function findCommentRoot(root: ParentNode = document, excludeWidescreenRoot = false): HTMLElement | null {
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

export function moveNode(
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
  transferCommentNode(node, target)
  movedNodes.push({ node, placeholder, originalParent: parent })
  return true
}

export function moveMatchingNodes(selectors: string[], target: HTMLElement, movedNodes: MovedNode[], limit = 8) {
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

export function restoreMovedNodes(movedNodes: MovedNode[]) {
  for (const { node, placeholder, originalParent } of [...movedNodes].reverse()) {
    const parent = placeholder.parentNode
    if (parent) {
      transferCommentNode(node, parent, placeholder)
      placeholder.remove()
      continue
    }
    if (originalParent.isConnected)
      transferCommentNode(node, originalParent)
    else
      node.remove()
  }
  movedNodes.length = 0
}

export function removeMovedNode(node: HTMLElement, movedNodes: MovedNode[]) {
  const index = movedNodes.findIndex(movedNode => movedNode.node === node)
  if (index >= 0) {
    const [movedNode] = movedNodes.splice(index, 1)
    movedNode.placeholder.remove()
  }

  node.remove()
}

export function moveOrReplaceNode(selectors: string[], target: HTMLElement, movedNodes: MovedNode[], allowInsideLayout = false) {
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

export function isCommentRootUsable(root: HTMLElement) {
  if (!root.isConnected)
    return false

  // B 站会先创建空评论壳，再异步挂载 bili-comments / shadow DOM。提前搬走
  // 空壳会与它的初始化竞争，导致头像、编辑器、登录态或评论列表漏渲染。
  const comments = root.querySelector('bili-comments')
  if (comments) {
    const shadow = comments.shadowRoot
    // A completed native render includes the header/feed even when the list is
    // empty or comments are restricted. An editor alone is not a ready feed.
    return !!shadow?.querySelector('#header')
      && !!shadow.querySelector('#feed')
      && !shadow.querySelector('#spinner-container')
  }
  const modernRoots = Array.from(root.querySelectorAll<HTMLElement>(
    'bili-comments, bili-comment-box, bili-comment-renderer',
  ))
  if (modernRoots.length)
    return hasCommentShadowTree(root)

  if (root.querySelector('.reply-list, .comment-list, .reply-box, .comment-header'))
    return true

  return hasCommentShadowTree(root)
}

export function moveCommentRoot(target: HTMLElement, movedNodes: MovedNode[]) {
  // Once mounted, keep the same root. Replacing it in response to a body
  // mutation can race Bilibili's renderer and create another comment editor.
  const existing = findCommentRoot(target)
  if (existing)
    return { found: isCommentRootUsable(existing), changed: false }

  const next = findCommentRoot(document, true)
  if (!next || !isCommentRootUsable(next))
    return { found: false, changed: false }

  if (commentPrewarmState?.root === next)
    restoreCommentPrewarm()
  const moved = moveNode(next, target, movedNodes)
  return { found: moved, changed: moved }
}

export function movePlaylistControls(target: HTMLElement, movedNodes: MovedNode[]) {
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

export function getTitleText() {
  const titleElement = findFirst(selectors.title)
  const title = titleElement?.getAttribute('title') || titleElement?.textContent?.trim()
  if (title)
    return title

  const metaTitle = document.querySelector<HTMLMetaElement>('meta[itemprop="name"], meta[property="og:title"]')?.content
  return metaTitle?.replace(/_哔哩哔哩_bilibili$/, '') || document.title.replace(/_哔哩哔哩_bilibili$/, '')
}

export function disableNativeLightOffMode(playerRoot: ParentNode) {
  for (const selector of NATIVE_LIGHT_OFF_CONTROL_SELECTORS) {
    playerRoot.querySelectorAll<HTMLElement>(selector).forEach((control) => {
      const input = control.matches('input[type="checkbox"]')
        ? control as HTMLInputElement
        : control.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (input?.checked)
        input.click()
    })
  }
}

export function isReadyForLayout() {
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

export function isWidescreenTransferContentReady(): boolean {
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

export function restoreCommentPrewarm() {
  const snapshot = commentPrewarmState
  commentPrewarmState = undefined
  if (!snapshot)
    return

  if (snapshot.styleAttribute === null)
    snapshot.root.removeAttribute('style')
  else
    snapshot.root.setAttribute('style', snapshot.styleAttribute)
}

export function startCommentPrewarm() {
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
