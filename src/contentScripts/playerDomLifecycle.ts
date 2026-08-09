const PLAYER_ROOT_SELECTOR = '#bilibili-player, .bilibili-player, .squirtle-video-wrap, .bpx-player-container'

const subscribers = new Set<() => void>()
let playerRoot: HTMLElement | null = null
let playerObserver: MutationObserver | null = null
let parentObserver: MutationObserver | null = null
let bootstrapObserver: MutationObserver | null = null
let bindPlayerRoot: () => void

function findPlayerRoot() {
  return document.querySelector<HTMLElement>(PLAYER_ROOT_SELECTOR)
}

function containsPlayerRoot(node: Node) {
  return node instanceof Element
    && (node.matches(PLAYER_ROOT_SELECTOR) || Boolean(node.querySelector(PLAYER_ROOT_SELECTOR)))
}

function notifySubscribers() {
  subscribers.forEach(onChange => onChange())
}

function disconnectScopedObservers() {
  playerObserver?.disconnect()
  parentObserver?.disconnect()
  playerObserver = null
  parentObserver = null
}

function disconnectAllObservers() {
  bootstrapObserver?.disconnect()
  bootstrapObserver = null
  disconnectScopedObservers()
  playerRoot = null
}

function startBootstrapObserver() {
  if (bootstrapObserver || !document.body || subscribers.size === 0)
    return

  bootstrapObserver = new MutationObserver((mutations) => {
    if (mutations.some(mutation => Array.from(mutation.addedNodes).some(containsPlayerRoot)))
      bindPlayerRoot()
  })
  bootstrapObserver.observe(document.body, { childList: true, subtree: true })
}

bindPlayerRoot = () => {
  const nextRoot = findPlayerRoot()
  if (!nextRoot) {
    playerRoot = null
    disconnectScopedObservers()
    startBootstrapObserver()
    return
  }
  if (nextRoot === playerRoot && playerObserver)
    return

  playerRoot = nextRoot
  bootstrapObserver?.disconnect()
  bootstrapObserver = null
  disconnectScopedObservers()

  playerObserver = new MutationObserver(notifySubscribers)
  playerObserver.observe(playerRoot, { childList: true, subtree: true })

  if (playerRoot.parentElement) {
    parentObserver = new MutationObserver(() => {
      if (!playerRoot?.isConnected || findPlayerRoot() !== playerRoot)
        bindPlayerRoot()
    })
    parentObserver.observe(playerRoot.parentElement, { childList: true })
  }
  notifySubscribers()
}

export function observePlayerDom(onChange: () => void) {
  subscribers.add(onChange)
  if (subscribers.size === 1)
    bindPlayerRoot()
  else if (playerRoot)
    onChange()

  return () => {
    subscribers.delete(onChange)
    if (subscribers.size === 0)
      disconnectAllObservers()
  }
}
