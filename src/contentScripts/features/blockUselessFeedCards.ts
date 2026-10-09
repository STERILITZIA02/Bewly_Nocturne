const BLOCKED_FEED_CARD_CLASS = 'bewly-blocked-feed-card'
const VIDEO_CARD_CLASS = 'bili-video-card'

// Semantically adapted from AdGuard Chinese / EasyList China Bilibili rules.
// Absence of a "not interested" menu is not evidence that a video is an ad.
const AD_CLASS_NAMES = ['bili-video-card__info--ad', 'bili-video-card__info--creative-ad', 'ad-feedback-entry']
const AD_CONTENT_SELECTOR = [
  ...AD_CLASS_NAMES.map(name => `.${name}`),
  'a[href^="https://cm.bilibili.com/"]',
  'a[href^="//cm.bilibili.com/"]',
  '[data-target-url^="https://cm.bilibili.com/"]',
  '[data-target-url^="//cm.bilibili.com/"]',
].join(',')
const FEED_CARD_SELECTOR = '.feed-card, .bili-feed-card, .floor-single-card, .video-list > div, .bili-video-card, .video-page-card-small, .video-page-game-card-small'
const OBSERVER_OPTIONS: MutationObserverInit = {
  attributeFilter: ['class', 'href', 'data-target-url'],
  attributeOldValue: true,
  attributes: true,
  childList: true,
  subtree: true,
}

let feedCardObserver: MutationObserver | null = null
let observeRoot: Element | null = null
let flushFrame: number | null = null
const pendingRoots = new Set<Element>()
const MAX_PENDING_ROOTS = 100
let fullScanPending = false

interface UselessFeedCardBlockerContext {
  blockAds: boolean
  homePage: boolean
  searchPage?: boolean
  nativeFeedPage?: boolean
  inIframe: boolean
  nativeHome?: boolean
  active?: boolean
}

export function shouldEnableUselessFeedCardBlocker({
  blockAds,
  homePage,
  searchPage = false,
  nativeFeedPage = false,
  nativeHome = true,
  active = true,
}: UselessFeedCardBlockerContext) {
  return blockAds && active && ((homePage && nativeHome) || searchPage || nativeFeedPage)
}

function getObserveRoot(): Element {
  // A channel has separate head/feed lists. Observe their common owner so late cards
  // in the second list remain visible to the same observer.
  const pageFeed = document.querySelector('.feedchannel, .bili-feed4, .search-layout, .space-main, .bili-dyn-home--member, .right-container')
  if (pageFeed)
    return pageFeed
  const firstFeedCard = document.querySelector('.feed-card, .bili-feed-card, .floor-single-card')
  return firstFeedCard?.parentElement || document.querySelector('.video-list') || document.body || document.documentElement
}

function ensureObserveRoot() {
  if (!feedCardObserver || document.hidden)
    return

  const preferred = getObserveRoot()
  if (observeRoot === preferred && observeRoot?.isConnected)
    return

  try {
    feedCardObserver.disconnect()
    feedCardObserver.observe(preferred, OBSERVER_OPTIONS)
    // Watch only direct children of ancestors so replacing the entire feed is discoverable.
    for (let ancestor = preferred.parentElement; ancestor; ancestor = ancestor.parentElement)
      feedCardObserver.observe(ancestor, { childList: true })
    observeRoot = preferred
  }
  catch {
    // ignore
  }
}

function syncFeedCard(feedCard: HTMLElement) {
  const blocked = feedCard.matches(AD_CONTENT_SELECTOR) || feedCard.querySelector(AD_CONTENT_SELECTOR) !== null
  if (feedCard.classList.contains(BLOCKED_FEED_CARD_CLASS) !== blocked)
    feedCard.classList.toggle(BLOCKED_FEED_CARD_CLASS, blocked)
}

function getFeedCardSlot(element: Element): HTMLElement | null {
  // 首屏卡片有 .feed-card 外层，后续懒加载卡片则可能直接使用 .bili-feed-card。
  const feed = element.closest<HTMLElement>('.feed-card')
    || element.closest<HTMLElement>('.bili-feed-card')
    || element.closest<HTMLElement>('.floor-single-card')
  if (feed)
    return feed
  const searchSlot = element.closest<HTMLElement>('.video-list > div')
  // Only a wrapper containing exactly one native card owns that card's slot.
  // A list/row may contain multiple recommendations and must remain visible.
  if (searchSlot?.childElementCount === 1 && searchSlot.firstElementChild?.matches('.bili-video-card'))
    return searchSlot
  return element.closest<HTMLElement>('.video-page-card-small, .video-page-game-card-small, .bili-video-card')
}

function scanForRcmdCards(root: ParentNode) {
  const feedCardSlots = new Set<HTMLElement>()

  // 新增或更新的节点可能位于已有卡片内部。
  if (root instanceof Element) {
    const closestFeedCard = getFeedCardSlot(root)
    if (root.classList.contains(BLOCKED_FEED_CARD_CLASS) && closestFeedCard !== root)
      root.classList.remove(BLOCKED_FEED_CARD_CLASS)
    if (closestFeedCard)
      feedCardSlots.add(closestFeedCard)
  }

  root.querySelectorAll?.<HTMLElement>(FEED_CARD_SELECTOR).forEach((feedCard) => {
    const feedCardSlot = getFeedCardSlot(feedCard)
    if (feedCardSlot)
      feedCardSlots.add(feedCardSlot)
  })

  feedCardSlots.forEach(syncFeedCard)
}

function flushPending() {
  flushFrame = null
  if (!feedCardObserver)
    return
  if (document.hidden) {
    deferFullScan()
    return
  }
  if (fullScanPending) {
    scanForRcmdCards(document)
  }
  else {
    for (const root of pendingRoots) {
      if (root.isConnected)
        scanForRcmdCards(root)
    }
  }
  fullScanPending = false

  pendingRoots.clear()

  // If we started early (before feed cards existed), retarget the observer to the feed container.
  ensureObserveRoot()
}

function deferFullScan() {
  if (flushFrame !== null)
    cancelAnimationFrame(flushFrame)
  flushFrame = null
  pendingRoots.clear()
  fullScanPending = true
}

function queueRoot(root: Element) {
  if (!root.isConnected || fullScanPending)
    return
  for (const queued of pendingRoots) {
    if (queued.contains(root))
      return
    if (root.contains(queued))
      pendingRoots.delete(queued)
  }
  if (pendingRoots.size >= MAX_PENDING_ROOTS)
    deferFullScan()
  else
    pendingRoots.add(root)
}

function handleVisibilityChange() {
  if (document.hidden) {
    deferFullScan()
    feedCardObserver?.disconnect()
    observeRoot = null
  }
  else if (fullScanPending || pendingRoots.size) {
    scheduleFlushPending()
  }
}

function scheduleFlushPending() {
  if (flushFrame !== null)
    return

  flushFrame = requestAnimationFrame(flushPending)
}

function start() {
  if (feedCardObserver) {
    ensureObserveRoot()
    return
  }

  // Initial scan (covers already-rendered cards)
  if (document.hidden)
    fullScanPending = true
  else
    scanForRcmdCards(document)

  feedCardObserver = new MutationObserver((mutations) => {
    if (document.hidden) {
      handleVisibilityChange()
      return
    }
    if (!observeRoot?.isConnected)
      deferFullScan()
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const target = mutation.target
        const wasVideoCard = mutation.oldValue?.split(/\s+/).includes(VIDEO_CARD_CLASS)
        const wasAdMarker = mutation.attributeName === 'class'
          && mutation.oldValue?.split(/\s+/).some(name => AD_CLASS_NAMES.includes(name))
        const wasAdLink = (mutation.attributeName === 'href' || mutation.attributeName === 'data-target-url')
          && /^(?:https:)?\/\/cm\.bilibili\.com\//.test(mutation.oldValue || '')

        // Bilibili attaches recommendation classes asynchronously during hydration.
        if (target instanceof Element && (target.closest(`.${VIDEO_CARD_CLASS}`)
          || target.matches(AD_CONTENT_SELECTOR) || wasVideoCard || wasAdMarker || wasAdLink)) {
          queueRoot(target)
        }

        continue
      }

      // If the matching child is removed, resync its existing feed-card parent.
      if (mutation.target instanceof Element
        && (mutation.removedNodes.length > 0 || mutation.target.classList.contains(BLOCKED_FEED_CARD_CLASS))) {
        queueRoot(mutation.target)
      }

      for (let index = 0; index < mutation.addedNodes.length; index++) {
        const node = mutation.addedNodes[index]
        if (node.nodeType !== Node.ELEMENT_NODE)
          continue
        queueRoot(node as Element)
      }
    }

    if (fullScanPending || pendingRoots.size > 0)
      scheduleFlushPending()
  })

  ensureObserveRoot()
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function stop() {
  // Disabling restores the existing native nodes; no Vue-owned cards are removed.
  document.querySelectorAll(`.${BLOCKED_FEED_CARD_CLASS}`).forEach(element => element.classList.remove(BLOCKED_FEED_CARD_CLASS))
  if (!feedCardObserver)
    return

  feedCardObserver.disconnect()
  feedCardObserver = null
  observeRoot = null

  pendingRoots.clear()
  fullScanPending = false
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (flushFrame !== null) {
    cancelAnimationFrame(flushFrame)
    flushFrame = null
  }
}

export function setUselessFeedCardBlockerEnabled(enabled: boolean) {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined')
    return

  if (enabled)
    start()
  else
    stop()
}
