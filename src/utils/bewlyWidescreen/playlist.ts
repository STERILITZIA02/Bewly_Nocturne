import { DISCLOSURE_TOGGLE_CLASS, EPISODE_ITEM_SELECTOR, EPISODE_SECTION_CLASS, PGC_RECOMMEND_LIST_CLASS, PGC_SECTION_ATTRIBUTE, PLAYLIST_AUTO_EXPAND_THRESHOLD, PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR, SCROLL_EDGE_FADE_CLASS, SCROLL_EDGE_FADE_INLINE_CLASS, selectors } from '~/utils/bewlyWidescreen/constants'
import { createDisclosureToggle, EPISODE_LABELS, setDisclosureToggle } from '~/utils/bewlyWidescreen/disclosureToggle'
import { schedulePlayerResizeSync } from '~/utils/bewlyWidescreen/geometry'
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

// The episode list scrolls inside the panel; it fades at an edge only while
// more of it lies beyond (the shared scroll edge fade).
const EPISODE_SECTION_CLASSES = [EPISODE_SECTION_CLASS, SCROLL_EDGE_FADE_CLASS]

// Bangumi's directory is not one scroller but sections, each with a header,
// a row of season / range tabs and its own virtual list: the lists fade at
// their top and bottom, the tab rows at their ends.
const PGC_SCROLLERS: [selector: string, fade: string][] = [
  ['[class*="EpisodeVirtualList_scroll"]', SCROLL_EDGE_FADE_CLASS],
  ['[class*="SectionTabs_scroller"], [class*="PageTabs_wrap"]', SCROLL_EDGE_FADE_INLINE_CLASS],
]

export function clearEpisodeSectionMarker(panel: HTMLElement, movedNodes: MovedNode[]) {
  for (const { node } of movedNodes)
    node.classList.remove(...EPISODE_SECTION_CLASSES)
  panel.querySelectorAll<HTMLElement>(`.${EPISODE_SECTION_CLASS}`).forEach((node) => {
    node.classList.remove(...EPISODE_SECTION_CLASSES)
  })
  for (const [selector, fade] of PGC_SCROLLERS)
    panel.querySelectorAll(selector).forEach(node => node.classList.remove(fade))
  panel.querySelector('#playlist-video-action-list')?.classList.remove(SCROLL_EDGE_FADE_CLASS)
  panel.querySelectorAll(`[${PGC_SECTION_ATTRIBUTE}]`).forEach((section) => {
    section.querySelector(`.${DISCLOSURE_TOGGLE_CLASS}`)?.remove()
    section.removeAttribute(PGC_SECTION_ATTRIBUTE)
  })
}

/**
 * Each bangumi section folds on its own with the rail's chevron, at the end
 * of its header; Bilibili's arrow beside the tabs (a menu listing the same
 * tabs again) is hidden (layout.ts). The section keeps its state in
 * PGC_SECTION_ATTRIBUTE, which the fold styles read.
 */
function syncPgcSections(panel: HTMLElement) {
  for (const [selector, fade] of PGC_SCROLLERS) {
    panel.querySelectorAll(selector).forEach((node) => {
      if (!node.classList.contains(fade))
        node.classList.add(fade)
    })
  }
  for (const section of panel.querySelectorAll<HTMLElement>('[class*="SectionPanel_panel"]')) {
    const actions = section.querySelector<HTMLElement>('[class*="SectionHeader_actions"]')
    if (!actions || actions.lastElementChild?.classList.contains(DISCLOSURE_TOGGLE_CLASS))
      continue
    section.querySelector(`.${DISCLOSURE_TOGGLE_CLASS}`)?.remove()
    const open = section.getAttribute(PGC_SECTION_ATTRIBUTE) !== 'folded'
    section.setAttribute(PGC_SECTION_ATTRIBUTE, open ? 'open' : 'folded')
    const toggle = createDisclosureToggle(EPISODE_LABELS, open)
    toggle.addEventListener('click', () => {
      const opening = section.getAttribute(PGC_SECTION_ATTRIBUTE) === 'folded'
      section.setAttribute(PGC_SECTION_ATTRIBUTE, opening ? 'open' : 'folded')
      setDisclosureToggle(toggle, EPISODE_LABELS, opening)
    })
    actions.append(toggle)
  }
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
  const panel = currentState.playlistSlot
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
  const panel = currentState.playlistSlot
  const episodeSection = panel.querySelector<HTMLElement>(`.${EPISODE_SECTION_CLASS}`)
  // Bangumi's sections fold on their own (syncPgcSections).
  const hasEpisodeSection = !!episodeSection && currentState.root.dataset.pageKind !== 'pgc'
  if (currentState.playlistToggleButton.hidden !== !hasEpisodeSection)
    currentState.playlistToggleButton.hidden = !hasEpisodeSection
  setDisclosureToggle(currentState.playlistToggleButton, EPISODE_LABELS, hasEpisodeSection && !currentState.playlistCollapsed)
  const collapsed = hasEpisodeSection && currentState.playlistCollapsed
  if (panel.classList.contains('is-episode-section-collapsed') !== collapsed)
    panel.classList.toggle('is-episode-section-collapsed', collapsed)
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

    const panel = currentState.panels.overview
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
  currentState.panels.overview.addEventListener('scroll', handlePlaylistScroll, { passive: true })
  currentState.playlistToggleCleanup = () => {
    currentState.playlistToggleButton.removeEventListener('click', handleToggle)
    currentState.panels.overview.removeEventListener('scroll', handlePlaylistScroll)
    currentState.playlistSlot.classList.remove('is-episode-section-collapsed')
    currentState.playlistToggleButton.remove()
  }
}

/**
 * Bangumi's related recommendations sit in a classless list; marking it lets
 * the rail lay them out as the video page's two-column cards without class
 * substrings above the subject (layout.ts).
 */
export function markPgcRecommendations(panel: HTMLElement) {
  const list = panel.querySelector('[class*="RecommendItem_wrap"]')?.parentElement
  if (list && !list.classList.contains(PGC_RECOMMEND_LIST_CLASS))
    list.classList.add(PGC_RECOMMEND_LIST_CLASS)
}

export function syncEpisodeSectionMarker(currentState: BewlyWidescreenState) {
  const panel = currentState.playlistSlot
  const movedNodes = currentState.movedNodes
  ensurePlaylistCoverLayout(panel)

  const episodeSection = findEpisodeSectionNode(panel, movedNodes)
  panel.querySelectorAll(`.${EPISODE_SECTION_CLASS}`).forEach((node) => {
    if (node !== episodeSection)
      node.classList.remove(...EPISODE_SECTION_CLASSES)
  })
  // Bangumi's directory scrolls in its sections (syncPgcSections), not as one.
  const isPgc = currentState.root.dataset.pageKind === 'pgc'
  if (episodeSection && !episodeSection.classList.contains(EPISODE_SECTION_CLASS))
    episodeSection.classList.add(...(isPgc ? [EPISODE_SECTION_CLASS] : EPISODE_SECTION_CLASSES))
  const actionList = episodeSection?.querySelector('#playlist-video-action-list')
  if (actionList) {
    episodeSection?.classList.remove(SCROLL_EDGE_FADE_CLASS)
    actionList.classList.add(SCROLL_EDGE_FADE_CLASS)
  }
  if (isPgc)
    syncPgcSections(panel)
  placePlaylistToggleButton(currentState)
  syncPlaylistToggleButton(currentState)
}
