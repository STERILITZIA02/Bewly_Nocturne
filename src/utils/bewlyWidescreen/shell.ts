import { settings } from '~/logic'
import { ROOT_ID } from '~/utils/bewlyWidescreen/constants'
import { schedulePlayerResizeSync, updateSidebarLayoutState } from '~/utils/bewlyWidescreen/geometry'
import { t } from '~/utils/bewlyWidescreen/labels'
import { getTitleText } from '~/utils/bewlyWidescreen/nativeDom'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenSidebarLayout, BewlyWidescreenState, BewlyWidescreenTab } from '~/utils/bewlyWidescreen/types'
import { clampWidescreenSidebarWidth, WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY } from '~/utils/bewlyWidescreenPolicy'

export function setActiveTab(nextTab: BewlyWidescreenTab, hydrate = true) {
  if (!session.current)
    return

  session.current.activeTab = nextTab
  session.current.sidebarHydrationTimedOut = false
  for (const [tab, button] of Object.entries(session.current.tabButtons) as Array<[BewlyWidescreenTab, HTMLButtonElement]>) {
    const active = tab === nextTab
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
    session.current.panels[tab].hidden = !active
  }

  if (nextTab === 'danmaku') {
    // Native long-list virtualization measures the visible viewport on resize.
    schedulePlayerResizeSync(session.current)
  }
  if (session.current.hydratedTabs.has(nextTab))
    scheduleInitialPanelScrollReset(session.current, nextTab)
  if (hydrate)
    session.current.hydrateSidebar()
}

export function scheduleInitialPanelScrollReset(currentState: BewlyWidescreenState, tab: BewlyWidescreenTab) {
  if (currentState.initialScrollResetTabs.has(tab) || currentState.panelScrollFrames.has(tab))
    return

  const frame = requestAnimationFrame(() => {
    currentState.panelScrollFrames.delete(tab)
    if (session.current !== currentState || !currentState.root.isConnected)
      return
    currentState.panels[tab].scrollTop = 0
    currentState.initialScrollResetTabs.add(tab)
  })
  currentState.panelScrollFrames.set(tab, frame)
}

export function syncSidebarToggleButton(currentState: BewlyWidescreenState) {
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

export function clearSidebarEdgeRevealSuppression(currentState: BewlyWidescreenState) {
  if (currentState.sidebarEdgeRevealSuppressionTimer)
    clearTimeout(currentState.sidebarEdgeRevealSuppressionTimer)
  currentState.sidebarEdgeRevealSuppressionTimer = undefined
  delete currentState.root.dataset.sidebarEdgeRevealSuppressed
}

function temporarilySuppressSidebarEdgeReveal(currentState: BewlyWidescreenState) {
  clearSidebarEdgeRevealSuppression(currentState)
  currentState.root.dataset.sidebarEdgeRevealSuppressed = 'true'
  currentState.sidebarEdgeRevealSuppressionTimer = setTimeout(() => {
    currentState.sidebarEdgeRevealSuppressionTimer = undefined
    if (session.current === currentState && currentState.root.isConnected)
      delete currentState.root.dataset.sidebarEdgeRevealSuppressed
  }, WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY)
}

export function setSidebarLayout(
  nextLayout: BewlyWidescreenSidebarLayout,
  currentState: BewlyWidescreenState | null = session.current,
  userClosed = false,
) {
  if (!currentState || session.current !== currentState)
    return

  currentState.sidebarLayout = nextLayout
  currentState.root.dataset.sidebarLayout = nextLayout
  currentState.root.dataset.sidebarHoverExpanded = 'false'
  if (userClosed && nextLayout === 'compact') {
    temporarilySuppressSidebarEdgeReveal(currentState)
    currentState.root.dataset.sidebarManuallyClosed = 'true'
  }
  else {
    clearSidebarEdgeRevealSuppression(currentState)
    if (nextLayout === 'expanded')
      delete currentState.root.dataset.sidebarManuallyClosed
  }
  syncSidebarToggleButton(currentState)
  updateSidebarLayoutState(currentState)
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
  titleGroup.append(createSidebarTitle())

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'bewly-widescreen-close'
  const closeLabel = t('widescreen.close_sidebar')
  closeButton.textContent = closeLabel
  closeButton.setAttribute('aria-label', closeLabel)
  closeButton.addEventListener('click', () => {
    const currentState = session.current
    if (!currentState)
      return
    setSidebarLayout('compact', currentState, true)
    currentState.sidebarToggleButton.focus({ preventScroll: true })
  })

  toolbar.append(titleGroup, closeButton)
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
    const nextLayout = session.current?.sidebarLayout === 'compact' ? 'expanded' : 'compact'
    setSidebarLayout(nextLayout, session.current, nextLayout === 'compact')
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

export function createRoot(sidebarPosition: 'left' | 'right' = 'right') {
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
  const toolbar = createSidebarToolbar()
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

  return { root, stage, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, sidebarTop, metadataSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, playlistToggleButton, sidebarResizer, sidebarToggleButton }
}
