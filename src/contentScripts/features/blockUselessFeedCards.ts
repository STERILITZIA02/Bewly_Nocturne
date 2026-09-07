const BLOCKED_FEED_CARD_CLASS = 'bewly-blocked-feed-card'
const VIDEO_CARD_CLASS = 'bili-video-card'

// Semantically adapted from AdGuard Chinese / EasyList China Bilibili rules.
// Absence of a "not interested" menu is not evidence that a video is an ad.
const AD_CLASS_NAMES = ['bili-video-card__info--ad', 'bili-video-card__info--creative-ad', 'ad-feedback-entry']
const AD_CONTENT_SELECTOR = [
  ...AD_CLASS_NAMES.map(name => `.${name}`),
  'a[href^="https://cm.bilibili.com/"]',
  'a[href^="//cm.bilibili.com/"]',
].join(',')
const FEED_CARD_SELECTOR = '.feed-card, .bili-feed-card, .floor-single-card, .video-list > div'
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

interface UselessFeedCardBlockerContext {
  blockAds: boolean
  homePage: boolean
  searchPage?: boolean
  inIframe: boolean
}

export function shouldEnableUselessFeedCardBlocker({
  blockAds,
  homePage,
  searchPage = false,
}: UselessFeedCardBlockerContext) {
  return blockAds && (homePage || searchPage)
}

function getObserveRoot(): Element {
  // Prefer the feed container if it exists; fallback to body.
  const firstFeedCard = document.querySelector('.feed-card, .bili-feed-card, .floor-single-card')
  return firstFeedCard?.parentElement || document.querySelector('.video-list') || document.body || document.documentElement
}

function ensureObserveRoot() {
  if (!feedCardObserver)
    return

  const preferred = getObserveRoot()
  if (observeRoot === preferred && observeRoot?.isConnected)
    return

  try {
    feedCardObserver.disconnect()
    feedCardObserver.observe(preferred, OBSERVER_OPTIONS)
    observeRoot = preferred
  }
  catch {
    // ignore
  }
}

function syncFeedCard(feedCard: HTMLElement) {
  const blocked = feedCard.querySelector(AD_CONTENT_SELECTOR) !== null
  if (feedCard.classList.contains(BLOCKED_FEED_CARD_CLASS) !== blocked)
    feedCard.classList.toggle(BLOCKED_FEED_CARD_CLASS, blocked)
}

function getFeedCardSlot(element: Element): HTMLElement | null {
  // 首屏卡片有 .feed-card 外层，后续懒加载卡片则可能直接使用 .bili-feed-card。
  return element.closest<HTMLElement>('.feed-card')
    || element.closest<HTMLElement>('.bili-feed-card')
    || element.closest<HTMLElement>('.floor-single-card')
    || element.closest<HTMLElement>('.video-list > div')
}

function scanForRcmdCards(root: ParentNode) {
  const feedCardSlots = new Set<HTMLElement>()

  // 新增或更新的节点可能位于已有卡片内部。
  if (root instanceof Element) {
    const closestFeedCard = getFeedCardSlot(root)
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

  for (const root of pendingRoots)
    scanForRcmdCards(root)

  pendingRoots.clear()

  // If we started early (before feed cards existed), retarget the observer to the feed container.
  ensureObserveRoot()
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
  scanForRcmdCards(document)

  feedCardObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const target = mutation.target
        const wasVideoCard = mutation.oldValue?.split(/\s+/).includes(VIDEO_CARD_CLASS)
        const wasAdMarker = mutation.attributeName === 'class'
          && mutation.oldValue?.split(/\s+/).some(name => AD_CLASS_NAMES.includes(name))
        const wasAdLink = mutation.attributeName === 'href'
          && /^(?:https:)?\/\/cm\.bilibili\.com\//.test(mutation.oldValue || '')

        // Bilibili attaches recommendation classes asynchronously during hydration.
        if (target instanceof Element && (target.closest(`.${VIDEO_CARD_CLASS}`)
          || target.matches(AD_CONTENT_SELECTOR) || wasVideoCard || wasAdMarker || wasAdLink)) {
          pendingRoots.add(target)
        }

        continue
      }

      // If the matching child is removed, resync its existing feed-card parent.
      if (mutation.removedNodes.length > 0 && mutation.target instanceof Element)
        pendingRoots.add(mutation.target)

      for (let index = 0; index < mutation.addedNodes.length; index++) {
        const node = mutation.addedNodes[index]
        if (node.nodeType !== Node.ELEMENT_NODE)
          continue
        pendingRoots.add(node as Element)
      }
    }

    if (pendingRoots.size > 0)
      scheduleFlushPending()
  })

  observeRoot = getObserveRoot()
  feedCardObserver.observe(observeRoot, OBSERVER_OPTIONS)
}

function stop() {
  if (!feedCardObserver)
    return

  feedCardObserver.disconnect()
  feedCardObserver = null
  observeRoot = null

  pendingRoots.clear()
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
