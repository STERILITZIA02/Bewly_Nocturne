import { createLoadingRingElement } from '~/utils/loadingRing'

function createLoadingSkeletonElement(className: string) {
  const element = document.createElement('div')
  element.className = className
  return element
}

function createLoadingSkeletonBlock(modifier: string) {
  const block = document.createElement('span')
  block.className = `bewly-widescreen-loading-skeleton-block ${modifier}`
  block.setAttribute('data-bew-skeleton', '')
  return block
}

export function createWidescreenLoadingSkeleton() {
  const stage = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-stage')
  stage.setAttribute('aria-hidden', 'true')

  const player = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-player')
  const playerMark = createLoadingRingElement()
  playerMark.classList.add('bewly-widescreen-loading-skeleton-player-mark')
  player.appendChild(playerMark)

  const controls = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-controls')
  controls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-progress'))

  const playerControls = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-player-controls')
  for (let index = 0; index < 3; index += 1)
    playerControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-circle'))
  playerControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-time'))
  const playerControlsSpacer = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-spacer')
  playerControls.appendChild(playerControlsSpacer)
  for (let index = 0; index < 5; index += 1)
    playerControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-control-label'))
  controls.appendChild(playerControls)

  // The viewer count sits in the info's meta line while the card shows.
  const danmakuControls = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-danmaku-controls')
  // Home, page mode, theme, settings and feedback, then the two danmaku toggles.
  for (let index = 0; index < 7; index += 1)
    danmakuControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-circle'))
  danmakuControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-input'))
  danmakuControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-send'))
  controls.appendChild(danmakuControls)
  player.appendChild(controls)

  // Title, author, actions and description head the column.
  const info = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-info')
  const sidebarTop = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-sidebar-top')
  const title = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-title')
  title.append(
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line bewly-widescreen-loading-skeleton-line--title'),
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line bewly-widescreen-loading-skeleton-line--title-short'),
  )
  sidebarTop.appendChild(title)
  sidebarTop.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line bewly-widescreen-loading-skeleton-line--meta'))

  const owner = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-owner')
  owner.append(
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-avatar'),
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line bewly-widescreen-loading-skeleton-line--owner'),
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line bewly-widescreen-loading-skeleton-line--owner-sign'),
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-owner-action'),
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-owner-action bewly-widescreen-loading-skeleton-owner-action--wide'),
  )
  const authorActions = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-author-actions')
  authorActions.appendChild(owner)

  const stats = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-stats')
  for (let index = 0; index < 5; index += 1)
    stats.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-stat'))
  authorActions.appendChild(stats)
  sidebarTop.appendChild(authorActions)
  const description = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-description')
  description.append(
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line'),
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line bewly-widescreen-loading-skeleton-line--description-short'),
  )
  sidebarTop.appendChild(description)
  info.appendChild(sidebarTop)

  // The column beside the video pane: the info, then comments / danmaku /
  // recommendations.
  const sidebar = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-sidebar')
  sidebar.appendChild(info)

  const tabs = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-tabs')
  for (let index = 0; index < 3; index += 1)
    tabs.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-tab'))
  sidebar.appendChild(tabs)

  // Comments have no known layout: the same single ring as the comment panel.
  const list = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-list')
  list.appendChild(createLoadingRingElement())
  sidebar.appendChild(list)
  // The comment composer docked under the list.
  sidebar.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-composer'))

  stage.append(player, sidebar)
  return stage
}
