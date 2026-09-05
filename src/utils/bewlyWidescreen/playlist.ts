import { EPISODE_ITEM_SELECTOR, EPISODE_SECTION_CLASS, PLAYLIST_AUTO_EXPAND_THRESHOLD, PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR, selectors } from '~/utils/bewlyWidescreen/constants'
import { schedulePlayerResizeSync } from '~/utils/bewlyWidescreen/geometry'
import { t } from '~/utils/bewlyWidescreen/labels'
import type { BewlyWidescreenState, MovedNode } from '~/utils/bewlyWidescreen/types'

function findManagedPanelNode(panel: HTMLElement, selectorsToMatch: string[], movedNodes: MovedNode[]) {
  const selector = selectorsToMatch.join(',')
  return movedNodes.find(({ node }) => {
    if (node.parentElement !== panel)
      return false

    return node.matches(selector) || !!node.querySelector(selector)
  })?.node ?? null
}

export function placeRecommendAfterPlaylist(panel: HTMLElement, movedNodes: MovedNode[]) {
  const playlistNode = findManagedPanelNode(panel, selectors.playlist, movedNodes)
  const recommendNode = findManagedPanelNode(panel, selectors.recommend, movedNodes)
  if (!playlistNode || !recommendNode || playlistNode === recommendNode)
    return

  // Only reorder the top-level nodes that Bewly moved into this panel. This
  // avoids detaching recommendation/episode elements nested inside a shared
  // Bilibili wrapper.
  if (playlistNode.parentElement === panel
    && recommendNode.parentElement === panel
    && playlistNode.nextElementSibling !== recommendNode) {
    playlistNode.after(recommendNode)
  }
}

function findEpisodeSectionNode(panel: HTMLElement, movedNodes: MovedNode[]) {
  const playlistNode = findManagedPanelNode(panel, selectors.playlist, movedNodes)
  if (!playlistNode)
    return null

  const candidates = [
    playlistNode,
    ...Array.from(playlistNode.querySelectorAll<HTMLElement>(selectors.playlist.join(','))),
  ]
  const episodeCandidates = candidates.filter(candidate => candidate.querySelector(EPISODE_ITEM_SELECTOR))
  return episodeCandidates.at(-1) ?? playlistNode
}

export function clearEpisodeSectionMarker(panel: HTMLElement, movedNodes: MovedNode[]) {
  for (const { node } of movedNodes)
    node.classList.remove(EPISODE_SECTION_CLASS)
  panel.querySelectorAll<HTMLElement>(`.${EPISODE_SECTION_CLASS}`).forEach((node) => {
    node.classList.remove(EPISODE_SECTION_CLASS)
  })
}

function ensurePlaylistCoverLayout(panel: HTMLElement) {
  const playlist = panel.querySelector<HTMLElement>('.video-pod')
  if (!playlist)
    return
  if (playlist.classList.contains('expanded')) {
    delete playlist.dataset.bewlyCoverLayoutPending
    return
  }
  if (playlist.dataset.bewlyCoverLayoutPending === 'true')
    return

  const toggleButton = playlist.querySelector<HTMLElement>('.pod-expand-btn')
  if (!toggleButton)
    return
  playlist.dataset.bewlyCoverLayoutPending = 'true'
  toggleButton.click()
  requestAnimationFrame(() => {
    if (!playlist.classList.contains('expanded'))
      delete playlist.dataset.bewlyCoverLayoutPending
  })
}

function placePlaylistToggleButton(currentState: BewlyWidescreenState) {
  const panel = currentState.panels.playlist
  const toggleButton = currentState.playlistToggleButton
  const actions = panel.querySelector<HTMLElement>('.video-pod__header .header-bottom > .right')
  const subscribeButton = actions?.querySelector<HTMLElement>('.subscribe-btn') ?? null
  if (actions) {
    if (toggleButton.parentElement !== actions || toggleButton.nextElementSibling !== subscribeButton)
      actions.insertBefore(toggleButton, subscribeButton)
    return
  }

  if (toggleButton.parentElement !== panel)
    panel.prepend(toggleButton)
}

export function syncPlaylistToggleButton(currentState: BewlyWidescreenState) {
  const panel = currentState.panels.playlist
  const episodeSection = panel.querySelector<HTMLElement>(`.${EPISODE_SECTION_CLASS}`)
  const hasEpisodeSection = !!episodeSection
  if (!hasEpisodeSection)
    currentState.playlistCollapsed = false

  currentState.playlistToggleButton.hidden = !hasEpisodeSection
  const expanded = hasEpisodeSection && !currentState.playlistCollapsed
  currentState.playlistToggleButton.setAttribute('aria-expanded', String(expanded))
  const label = t(expanded
    ? 'widescreen.collapse'
    : 'widescreen.expand_more')
  currentState.playlistToggleButton.textContent = label
  currentState.playlistToggleButton.setAttribute('aria-label', label)
  panel.classList.toggle('is-episode-section-collapsed', hasEpisodeSection && currentState.playlistCollapsed)
}

export function setupPlaylistToggle(currentState: BewlyWidescreenState) {
  const handleToggle = () => {
    if (currentState.playlistToggleButton.hidden)
      return
    currentState.playlistCollapsed = !currentState.playlistCollapsed
    syncPlaylistToggleButton(currentState)
    schedulePlayerResizeSync(currentState)
  }

  const autoExpandedRecommendationFooters = new WeakSet<HTMLElement>()
  const handlePlaylistScroll = (event: Event) => {
    if (!event.isTrusted)
      return

    const panel = currentState.panels.playlist
    if (panel.scrollTop + panel.clientHeight < panel.scrollHeight - PLAYLIST_AUTO_EXPAND_THRESHOLD)
      return

    const footer = panel.querySelector<HTMLElement>(PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR)
    if (!footer || autoExpandedRecommendationFooters.has(footer))
      return
    const label = footer.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!label || /收起|收合|collapse/i.test(label))
      return

    autoExpandedRecommendationFooters.add(footer)
    footer.click()
  }

  currentState.playlistToggleButton.addEventListener('click', handleToggle)
  currentState.panels.playlist.addEventListener('scroll', handlePlaylistScroll, { passive: true })
  currentState.playlistToggleCleanup = () => {
    currentState.playlistToggleButton.removeEventListener('click', handleToggle)
    currentState.panels.playlist.removeEventListener('scroll', handlePlaylistScroll)
    currentState.panels.playlist.classList.remove('is-episode-section-collapsed')
    currentState.playlistToggleButton.remove()
  }
}

export function syncEpisodeSectionMarker(currentState: BewlyWidescreenState) {
  const panel = currentState.panels.playlist
  const movedNodes = currentState.movedNodes
  clearEpisodeSectionMarker(panel, movedNodes)
  ensurePlaylistCoverLayout(panel)

  const episodeSection = findEpisodeSectionNode(panel, movedNodes)
  if (episodeSection) {
    episodeSection.classList.add(EPISODE_SECTION_CLASS)
  }
  placePlaylistToggleButton(currentState)
  syncPlaylistToggleButton(currentState)
}
