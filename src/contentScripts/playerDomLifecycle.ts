import { getPlayerRoot as findPlayerRoot, PLAYER_ROOT_SELECTOR } from '~/utils/playerMedia'

const subscribers = new Set<(mutations?: MutationRecord[]) => void>()
let playerRoot: HTMLElement | null = null
let playerObserver: MutationObserver | null = null
let parentObserver: MutationObserver | null = null
let bootstrapObserver: MutationObserver | null = null
let bindPlayerRoot: () => void

export function hasPlayerMediaMutation(mutations?: MutationRecord[]) {
  return !mutations || mutations.some(record => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
    .some(node => node instanceof Element && (node.matches('video, bwp-video') || !!node.querySelector('video, bwp-video'))))
}

function containsPlayerRoot(node: Node) {
  return node instanceof Element
    && (node.matches(PLAYER_ROOT_SELECTOR) || Boolean(node.querySelector(PLAYER_ROOT_SELECTOR)))
}

function notifySubscribers(mutations?: MutationRecord[]) {
  subscribers.forEach(onChange => onChange(mutations))
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
    if (!playerRoot?.isConnected
      || hasPlayerMediaMutation(mutations)
      || mutations.some(mutation => [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some(containsPlayerRoot))) {
      bindPlayerRoot()
    }
  })
  bootstrapObserver.observe(document.body, { childList: true, subtree: true })
}

bindPlayerRoot = () => {
  const nextRoot = findPlayerRoot()
  if (!nextRoot) {
    playerRoot = null
    disconnectScopedObservers()
    notifySubscribers()
    startBootstrapObserver()
    return
  }
  if (nextRoot === playerRoot && playerObserver)
    return

  playerRoot = nextRoot
  disconnectScopedObservers()
  startBootstrapObserver()

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

export function observePlayerDom(onChange: (mutations?: MutationRecord[]) => void) {
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
