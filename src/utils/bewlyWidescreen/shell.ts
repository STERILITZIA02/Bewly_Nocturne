import { ROOT_ID } from '~/utils/bewlyWidescreen/constants'
import { schedulePlayerResizeSync } from '~/utils/bewlyWidescreen/geometry'
import { t } from '~/utils/bewlyWidescreen/labels'
import { getTitleText } from '~/utils/bewlyWidescreen/nativeDom'
import { publishRailTabs } from '~/utils/bewlyWidescreen/railTabs'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState, BewlyWidescreenTab } from '~/utils/bewlyWidescreen/types'
import { isImmersiveFrame } from '~/utils/iframeActivity'

export function setActiveTab(nextTab: BewlyWidescreenTab, hydrate = true) {
  if (!session.current)
    return

  session.current.activeTab = nextTab
  session.current.sidebarHydrationTimedOut = false
  for (const [tab, button] of Object.entries(session.current.tabButtons) as Array<[BewlyWidescreenTab, HTMLButtonElement]>) {
    const active = tab === nextTab
    button.classList.toggle('is-active', active)
    button.dataset.active = String(active)
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
    session.current.panels[tab].hidden = !active
  }
  const tablist = session.current.tabButtons[nextTab].parentElement
  if (tablist)
    publishRailTabs(tablist, nextTab)

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
  toolbar.append(titleGroup)
  return toolbar
}

function createTabButton(tab: BewlyWidescreenTab, label: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-tab bew-segment-control__item bew-segment-control__item--wide'
  button.setAttribute('data-segment-item', '')
  button.textContent = label
  button.setAttribute('role', 'tab')
  button.addEventListener('click', () => setActiveTab(tab))
  return button
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
  root.dataset.displayMode = 'card'
  // The label of the recommendations that follow a collection (a CSS string).
  root.style.setProperty('--bewly-widescreen-up-next-label', JSON.stringify(t('widescreen.up_next')))

  // Covers the native page below the native player: the page background beside
  // the video pane, the player canvas behind the pane and the filled video. The
  // player sits above it and below the shell, so it cannot live inside the
  // shell's stacking context.
  const backdrop = document.createElement('div')
  backdrop.className = 'bewly-widescreen-backdrop'
  backdrop.setAttribute('aria-hidden', 'true')
  backdrop.dataset.displayMode = 'card'
  backdrop.dataset.sidebarPosition = sidebarPosition

  const stage = document.createElement('div')
  stage.className = 'bewly-widescreen-stage'

  const playerSlot = document.createElement('main')
  playerSlot.className = 'bewly-widescreen-player-slot'
  const playerFrame = document.createElement('div')
  playerFrame.className = 'bewly-widescreen-player-frame'
  const danmakuDock = document.createElement('div')
  danmakuDock.className = 'bewly-widescreen-danmaku-dock'
  // Empty for now: room for future icons over the pane's top-left corner.
  const playerToolbar = document.createElement('div')
  playerToolbar.className = 'bewly-widescreen-player-toolbar'
  playerSlot.append(playerFrame, danmakuDock, playerToolbar)

  const sidebar = document.createElement('aside')
  sidebar.className = 'bewly-widescreen-sidebar'
  // Title, author, actions and description head the column, above the tabs.
  const info = document.createElement('section')
  info.className = 'bewly-widescreen-info'

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
  const authorActions = document.createElement('div')
  authorActions.className = 'bewly-widescreen-author-actions'
  authorActions.append(upSlot, toolbarSlot)
  const descriptionCard = document.createElement('div')
  descriptionCard.className = 'bewly-widescreen-description-card'
  descriptionCard.append(descriptionSlot, tagsSlot)
  sidebarTop.append(toolbar, metadataSlot, authorActions, descriptionCard)
  info.append(sidebarTop)

  const tablist = document.createElement('div')
  tablist.className = 'bewly-widescreen-tabs bew-segment-control bew-segment-control--surface bew-segment-control--track'
  tablist.setAttribute('role', 'tablist')

  const tabButtons = {
    comment: createTabButton('comment', t('widescreen.comments')),
    danmaku: createTabButton('danmaku', t('widescreen.danmaku')),
    playlist: createTabButton('playlist', t('widescreen.playlist')),
    recommendations: createTabButton('recommendations', t('settings.immersive_recommendations')),
  }
  tabButtons.recommendations.hidden = !isImmersiveFrame()
  tablist.append(...Object.values(tabButtons).filter(button => !button.hidden))

  const panelWrap = document.createElement('div')
  panelWrap.className = 'bewly-widescreen-panels'

  const panels = {
    comment: document.createElement('section'),
    danmaku: document.createElement('section'),
    playlist: document.createElement('section'),
    recommendations: document.createElement('section'),
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
    if (!tabButtons[tab].hidden)
      panelWrap.appendChild(panel)
  }

  const playlistToggleButton = createPlaylistToggleButton()
  panels.playlist.prepend(playlistToggleButton)

  const tabOrder = (Object.keys(tabButtons) as BewlyWidescreenTab[]).filter(tab => !tabButtons[tab].hidden)
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

  sidebar.append(info, tablist, panelWrap)
  // Grid areas place both columns; DOM order keeps the video first for focus.
  stage.append(playerSlot, sidebar)
  root.append(stage)
  document.body.append(backdrop, root)

  return { root, backdrop, stage, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, infoEl: info, sidebarTop, metadataSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, playlistToggleButton }
}
