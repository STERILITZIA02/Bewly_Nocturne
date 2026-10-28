import { shallowRef } from 'vue'

import type { BewlyWidescreenTab } from '~/utils/bewlyWidescreen/types'

export interface PlaybackRailTabs {
  tablist: HTMLElement
  activeTab: BewlyWidescreenTab
  /** Changes with the tab list, so the indicator remounts and measures the new one. */
  generation: number
}

/**
 * The playback rail's tab list and its selected tab. The shell is plain DOM,
 * so the app teleports the shared sliding indicator into the list
 * (PlaybackRailTabsIndicator.vue) instead of the shell painting its own.
 */
export const playbackRailTabs = shallowRef<PlaybackRailTabs | null>(null)

let generation = 0

export function publishRailTabs(tablist: HTMLElement, activeTab: BewlyWidescreenTab) {
  const current = playbackRailTabs.value
  if (current?.tablist === tablist && current.activeTab === activeTab)
    return
  playbackRailTabs.value = {
    tablist,
    activeTab,
    generation: current?.tablist === tablist ? current.generation : ++generation,
  }
}

export function clearRailTabs(tablist: HTMLElement) {
  if (playbackRailTabs.value?.tablist === tablist)
    playbackRailTabs.value = null
}
