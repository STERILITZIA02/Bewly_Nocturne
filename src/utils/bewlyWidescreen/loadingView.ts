function createLoadingSkeletonElement(className: string) {
  const element = document.createElement('div')
  element.className = className
  return element
}

function createLoadingSkeletonBlock(modifier: string) {
  const block = document.createElement('span')
  block.className = `bewly-widescreen-loading-skeleton-block ${modifier}`
  return block
}

export function createWidescreenLoadingSkeleton() {
  const stage = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-stage')
  stage.setAttribute('aria-hidden', 'true')

  const player = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-player')
  player.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-player-mark'))

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

  const danmakuControls = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-danmaku-controls')
  danmakuControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-viewers'))
  for (let index = 0; index < 5; index += 1)
    danmakuControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-circle'))
  danmakuControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-input'))
  danmakuControls.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-send'))
  controls.appendChild(danmakuControls)
  player.appendChild(controls)

  const sidebar = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-sidebar')
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
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-owner-action'),
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-owner-action bewly-widescreen-loading-skeleton-owner-action--wide'),
  )
  sidebarTop.appendChild(owner)

  const stats = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-stats')
  for (let index = 0; index < 4; index += 1)
    stats.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-stat'))
  sidebarTop.appendChild(stats)
  const description = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-description')
  description.append(
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line'),
    createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line bewly-widescreen-loading-skeleton-line--description-short'),
  )
  sidebarTop.appendChild(description)
  sidebar.appendChild(sidebarTop)

  const tabs = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-tabs')
  for (let index = 0; index < 3; index += 1)
    tabs.appendChild(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-tab'))
  sidebar.appendChild(tabs)

  const list = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-list')
  for (let index = 0; index < 6; index += 1) {
    const row = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-list-row')
    const rowContent = createLoadingSkeletonElement('bewly-widescreen-loading-skeleton-list-content')
    rowContent.append(
      createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line'),
      createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-line bewly-widescreen-loading-skeleton-line--list-short'),
    )
    row.append(createLoadingSkeletonBlock('bewly-widescreen-loading-skeleton-list-avatar'), rowContent)
    list.appendChild(row)
  }
  sidebar.appendChild(list)

  stage.append(player, sidebar)
  return stage
}
