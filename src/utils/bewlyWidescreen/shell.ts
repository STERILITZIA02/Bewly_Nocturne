// @unocss-include
import { nextTick } from 'vue'

import { DISCLOSURE_TOGGLE_CLASS, INFO_FOLDING_PARTS, ROOT_ID } from '~/utils/bewlyWidescreen/constants'
import { createDanmakuViews } from '~/utils/bewlyWidescreen/danmakuViews'
import type { DisclosureLabels } from '~/utils/bewlyWidescreen/disclosureToggle'
import { createDisclosureToggle, EPISODE_LABELS, setDisclosureToggle } from '~/utils/bewlyWidescreen/disclosureToggle'
import { schedulePlayerResizeSync } from '~/utils/bewlyWidescreen/geometry'
import { t } from '~/utils/bewlyWidescreen/labels'
import { getTitleText, restoreCommentPrewarm } from '~/utils/bewlyWidescreen/nativeDom'
import { railTabs } from '~/utils/bewlyWidescreen/railTabs'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState, BewlyWidescreenTab } from '~/utils/bewlyWidescreen/types'
import { afterMotion } from '~/utils/motionPriority'

export function setActiveTab(nextTab: BewlyWidescreenTab, hydrate = true) {
  if (!session.current)
    return

  if (session.current.activeTab === 'comment' && nextTab !== 'comment')
    restoreCommentPrewarm()
  session.current.activeTab = nextTab
  session.current.sidebarHydrationTimedOut = false
  markActiveTab(session.current, nextTab)
  for (const [tab, panel] of Object.entries(session.current.panels) as Array<[BewlyWidescreenTab, HTMLElement]>)
    panel.hidden = tab !== nextTab

  if (nextTab === 'danmaku') {
    // Native long-list virtualization measures the visible viewport on resize.
    schedulePlayerResizeSync(session.current)
  }
  if (session.current.hydratedTabs.has(nextTab))
    scheduleInitialPanelScrollReset(session.current, nextTab)
  if (hydrate)
    session.current.hydrateSidebar()
}

function markActiveTab(currentState: BewlyWidescreenState, nextTab: BewlyWidescreenTab) {
  for (const [tab, button] of Object.entries(currentState.tabButtons) as Array<[BewlyWidescreenTab, HTMLButtonElement]>) {
    const active = tab === nextTab
    button.classList.toggle('is-active', active)
    button.dataset.active = String(active)
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
  }
  const tablist = currentState.tabButtons[nextTab].parentElement
  if (tablist)
    railTabs.publish(tablist, nextTab)
}

let tabChoice = 0

/**
 * A tab the user picks shows as selected at once; its panel swaps in once the
 * sliding plate lands (railTabs.motion), so laying out a long native panel
 * does not stall the slide. A later pick replaces a pending one.
 */
function chooseTab(nextTab: BewlyWidescreenTab) {
  const currentState = session.current
  if (!currentState)
    return
  const choice = ++tabChoice
  markActiveTab(currentState, nextTab)
  if (currentState.activeTab === nextTab)
    return
  void nextTick()
    .then(() => afterMotion(railTabs.motion))
    .then(() => {
      if (choice === tabChoice && session.current === currentState)
        setActiveTab(nextTab)
    })
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

function createSidebarToolbar(body: HTMLElement) {
  const toolbar = document.createElement('div')
  toolbar.className = 'bewly-widescreen-toolbar'
  const titleGroup = document.createElement('div')
  titleGroup.className = 'bewly-widescreen-title-group'
  titleGroup.append(createSidebarTitle())
  toolbar.append(titleGroup, createInfoToggle(body))
  return toolbar
}

// The info card folds to its title and the uploader's row (avatar, name,
// follow and charge); the other parts close under them (layout.ts animates
// each part's height, and hides it when closed).
const INFO_LABELS: DisclosureLabels = { collapse: 'widescreen.collapse_info', expand: 'widescreen.expand_info' }

function createInfoToggle(body: HTMLElement) {
  const button = createDisclosureToggle(INFO_LABELS, true)
  button.setAttribute('aria-controls', body.id)
  // The rail content below the card (collection and recommendations) moves
  // with every frame of the fold. On its own layer it moves without
  // repainting; painted in place, the tall list repaints each frame and the
  // fold drops frames. The layer comes up when the pointer reaches the
  // toggle, so the click does not pay for it, and goes once the fold settles.
  const below = () => button.closest('.bewly-widescreen-sidebar-top')?.nextElementSibling as HTMLElement | null
  let pointerOver = false
  let folding = false
  const lift = (on: boolean) => {
    const content = below()
    if (on)
      content?.style.setProperty('will-change', 'transform')
    else
      content?.style.removeProperty('will-change')
  }
  button.addEventListener('pointerenter', () => {
    pointerOver = true
    lift(true)
  })
  button.addEventListener('pointerleave', () => {
    pointerOver = false
    if (!folding)
      lift(false)
  })
  let fold = 0
  button.addEventListener('click', () => {
    const card = button.closest<HTMLElement>('.bewly-widescreen-info-card')
    if (!card)
      return
    // The parts clip while they move (layout.ts), until their transitions settle.
    const current = ++fold
    folding = true
    lift(true)
    card.classList.add('is-folding')
    setDisclosureToggle(button, INFO_LABELS, !card.classList.toggle('is-collapsed'))
    requestAnimationFrame(() => {
      const moving = Array.from(card.querySelectorAll(INFO_FOLDING_PARTS), part => part.getAnimations()).flat()
      void Promise.allSettled(moving.map(animation => animation.finished)).then(() => {
        if (current !== fold)
          return
        folding = false
        card.classList.remove('is-folding')
        if (!pointerOver)
          lift(false)
      })
    })
  })
  return button
}

const TAB_ICONS: Record<BewlyWidescreenTab, string> = {
  overview: 'i-tabler:info-circle',
  comment: 'i-tabler:message-circle',
  danmaku: 'i-tabler:messages',
}
const TAB_LABELS: Record<BewlyWidescreenTab, string> = {
  overview: 'widescreen.overview',
  comment: 'widescreen.comments',
  danmaku: 'widescreen.danmaku',
}

function createTabButton(tab: BewlyWidescreenTab) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-tab bew-segment-control__item bew-segment-control__item--wide'
  button.setAttribute('data-segment-item', '')
  const icon = document.createElement('span')
  icon.className = `${TAB_ICONS[tab]} bewly-widescreen-tab__icon`
  icon.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.className = 'bewly-widescreen-tab__label'
  label.textContent = t(TAB_LABELS[tab])
  button.append(icon, label)
  // Filled from the video's stats (syncTabCounts); empty until they load.
  if (tab !== 'overview') {
    const count = document.createElement('span')
    count.className = 'bewly-widescreen-tab__count'
    button.append(count)
  }
  button.setAttribute('role', 'tab')
  button.addEventListener('click', () => chooseTab(tab))
  return button
}

function createPlaylistToggleButton() {
  const button = createDisclosureToggle(EPISODE_LABELS, true)
  button.hidden = true
  return button
}

export function syncShellLabels({ root, tabButtons }: Pick<BewlyWidescreenState, 'root' | 'tabButtons'>) {
  for (const [tab, button] of Object.entries(tabButtons) as Array<[BewlyWidescreenTab, HTMLButtonElement]>) {
    const label = button.querySelector('.bewly-widescreen-tab__label')!
    const text = t(TAB_LABELS[tab])
    if (label.textContent !== text)
      label.textContent = text
  }
  root.style.setProperty('--bewly-widescreen-up-next-label', JSON.stringify(t('widescreen.up_next')))
  const infoToggle = root.querySelector<HTMLButtonElement>(`.bewly-widescreen-toolbar .${DISCLOSURE_TOGGLE_CLASS}`)!
  setDisclosureToggle(infoToggle, INFO_LABELS, infoToggle.getAttribute('aria-expanded') === 'true')
}

export function createRoot(sidebarPosition: 'left' | 'right' = 'right') {
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.dataset.sidebarPosition = sidebarPosition
  root.dataset.displayMode = 'card'

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
  const sidebarTop = document.createElement('div')
  sidebarTop.className = 'bewly-widescreen-sidebar-top'
  const infoBody = document.createElement('div')
  infoBody.className = 'bewly-widescreen-info-body'
  infoBody.id = `${ROOT_ID}-info`
  const toolbar = createSidebarToolbar(infoBody)
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
  const infoContent = document.createElement('div')
  infoContent.className = 'bewly-widescreen-info-content'
  infoContent.append(metadataSlot, authorActions, descriptionCard)
  infoBody.append(infoContent)
  const infoCard = document.createElement('section')
  infoCard.className = 'bewly-widescreen-info-card'
  infoCard.append(toolbar, infoBody)
  sidebarTop.append(infoCard)

  const tablist = document.createElement('div')
  tablist.className = 'bewly-widescreen-tabs bew-segment-control bew-segment-control--surface bew-segment-control--track bew-segment-control--rect'
  tablist.setAttribute('role', 'tablist')

  const tabButtons = {
    overview: createTabButton('overview'),
    comment: createTabButton('comment'),
    danmaku: createTabButton('danmaku'),
  }
  tablist.append(...Object.values(tabButtons))

  const panelWrap = document.createElement('div')
  panelWrap.className = 'bewly-widescreen-panels'

  const panels = {
    overview: document.createElement('section'),
    comment: document.createElement('section'),
    danmaku: document.createElement('section'),
  }

  for (const [tab, panel] of Object.entries(panels) as Array<[BewlyWidescreenTab, HTMLElement]>) {
    const tabId = `${ROOT_ID}-tab-${tab}`
    const panelId = `${ROOT_ID}-panel-${tab}`
    tabButtons[tab].id = tabId
    tabButtons[tab].tabIndex = -1
    tabButtons[tab].setAttribute('aria-controls', panelId)
    // Scrolled content is cut at the hairline under the tabs (layout.ts).
    panel.className = `bewly-widescreen-panel bewly-widescreen-panel-${tab}`
    panel.id = panelId
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', tabId)
    panel.tabIndex = 0
    panelWrap.appendChild(panel)
  }

  const playlistToggleButton = createPlaylistToggleButton()
  const playlistSlot = document.createElement('div')
  playlistSlot.className = 'bewly-widescreen-panel-playlist'
  playlistSlot.append(playlistToggleButton)
  panels.overview.append(sidebarTop, playlistSlot)
  const danmakuViews = createDanmakuViews()
  panels.danmaku.append(danmakuViews)

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
    chooseTab(nextTab)
    tabButtons[nextTab].focus({ preventScroll: true })
  })

  sidebar.append(tablist, panelWrap)
  // Grid areas place both columns; DOM order keeps the video first for focus.
  stage.append(playerSlot, sidebar)
  root.append(stage)
  syncShellLabels({ root, tabButtons })
  document.body.append(backdrop, root)

  return { root, backdrop, stage, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, sidebarTop, metadataSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, danmakuViews, playlistSlot, playlistToggleButton }
}
