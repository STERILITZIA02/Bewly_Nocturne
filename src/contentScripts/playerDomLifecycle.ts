import { getPlayerModeContainer, getPlayerModeControl, getPlayerRoot as findPlayerRoot, PLAYER_MODE_CONTROL_SELECTORS, PLAYER_ROOT_SELECTOR } from '~/utils/playerMedia'

const subscribers = new Set<(mutations?: MutationRecord[]) => void>()
let playerRoot: HTMLElement | null = null
let playerObserver: MutationObserver | null = null
let parentObserver: MutationObserver | null = null
let bootstrapObserver: MutationObserver | null = null
let observedParents: HTMLElement[] = []
let bindPlayerRoot: () => void

export function hasPlayerMediaMutation(mutations?: MutationRecord[]) {
  return !mutations || mutations.some(record => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
    .some(node => node instanceof Element && (node.matches('video, bwp-video') || !!node.querySelector('video, bwp-video'))))
}

function containsPlayerRoot(node: Node) {
  return node instanceof Element
    && (node.matches(PLAYER_ROOT_SELECTOR) || Boolean(node.querySelector(PLAYER_ROOT_SELECTOR)))
}

function notifySubscriber(onChange: (mutations?: MutationRecord[]) => void, mutations?: MutationRecord[]) {
  try {
    onChange(mutations)
  }
  catch (error) {
    console.error('[Bewly Nocturne] Player DOM subscriber failed:', error)
  }
}

function notifySubscribers(mutations?: MutationRecord[]) {
  for (const onChange of [...subscribers]) {
    if (subscribers.has(onChange))
      notifySubscriber(onChange, mutations)
  }
}

function disconnectScopedObservers() {
  playerObserver?.disconnect()
  parentObserver?.disconnect()
  playerObserver = null
  parentObserver = null
  observedParents = []
}

function disconnectAllObservers() {
  bootstrapObserver?.disconnect()
  bootstrapObserver = null
  disconnectScopedObservers()
  playerRoot = null
}

function startBootstrapObserver() {
  if (bootstrapObserver || subscribers.size === 0)
    return

  bootstrapObserver = new MutationObserver((mutations) => {
    if (!playerRoot?.isConnected
      || hasPlayerMediaMutation(mutations)
      || mutations.some(mutation => [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some(containsPlayerRoot))) {
      bindPlayerRoot()
    }
  })
  // document_start can run before <body> (or even <html>) exists.
  bootstrapObserver.observe(document.documentElement ?? document, { childList: true, subtree: true })
}

function observeRootParents() {
  const parents: HTMLElement[] = []
  for (let parent = playerRoot?.parentElement; parent; parent = parent.parentElement)
    parents.push(parent)
  if (parents.length === observedParents.length && parents.every((parent, index) => parent === observedParents[index]))
    return
  parentObserver ??= new MutationObserver(() => bindPlayerRoot())
  parentObserver.disconnect()
  observedParents = parents
  // Shallow ancestry detects root replacement/transfer without observing all
  // comments, recommendation cards and danmaku twice through the document body.
  parents.forEach(parent => parentObserver!.observe(parent, { childList: true }))
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
  if (nextRoot === playerRoot && playerObserver) {
    observeRootParents()
    return
  }

  playerRoot = nextRoot
  disconnectScopedObservers()
  bootstrapObserver?.disconnect()
  bootstrapObserver = null

  playerObserver = new MutationObserver(notifySubscribers)
  playerObserver.observe(playerRoot, { childList: true, subtree: true })

  observeRootParents()
  notifySubscribers()
}

export function observePlayerDom(onChange: (mutations?: MutationRecord[]) => void) {
  subscribers.add(onChange)
  if (!playerRoot || !playerObserver)
    bindPlayerRoot()
  else
    notifySubscriber(onChange)

  return () => {
    subscribers.delete(onChange)
    if (subscribers.size === 0)
      disconnectAllObservers()
  }
}

/** The native mode buttons can be replaced without replacing the player root. */
export function observePlayerMode(onChange: (mode: 'default' | 'widescreen' | 'webFullscreen') => void) {
  let container: HTMLElement | null = null
  let webControl: HTMLElement | null = null
  let wideControl: HTMLElement | null = null
  let previousMode: string | undefined
  const controlsSelector = [...PLAYER_MODE_CONTROL_SELECTORS.web, ...PLAYER_MODE_CONTROL_SELECTORS.wide].join(',')
  function report() {
    if (!container?.isConnected)
      return
    const screen = container.getAttribute('data-screen')
    const mode = screen === 'web' || webControl?.classList.contains('bpx-state-entered')
      ? 'webFullscreen'
      : screen === 'wide' || wideControl?.classList.contains('bpx-state-entered') ? 'widescreen' : 'default'
    if (mode !== previousMode) {
      previousMode = mode
      onChange(mode)
    }
  }
  const observer = new MutationObserver(report)
  const stop = observePlayerDom((mutations) => {
    if (container?.isConnected && (!webControl || webControl.isConnected) && (!wideControl || wideControl.isConnected) && mutations
      && !hasPlayerMediaMutation(mutations)
      && !mutations.some(record => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => node instanceof Element
        && (node.matches(controlsSelector) || node.querySelector(controlsSelector))))) {
      return
    }
    const nextContainer = getPlayerModeContainer()
    const nextWeb = getPlayerModeControl('web', nextContainer)
    const nextWide = getPlayerModeControl('wide', nextContainer)
    if (container === nextContainer && webControl === nextWeb && wideControl === nextWide)
      return
    observer.disconnect()
    container = nextContainer
    webControl = nextWeb
    wideControl = nextWide
    previousMode = undefined
    if (container)
      observer.observe(container, { attributes: true, attributeFilter: ['data-screen'] })
    for (const control of [webControl, wideControl]) {
      if (control)
        observer.observe(control, { attributes: true, attributeFilter: ['class'] })
    }
    report()
  })
  return () => {
    stop()
    observer.disconnect()
    container = webControl = wideControl = null
  }
}
