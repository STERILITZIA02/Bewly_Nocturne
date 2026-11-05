import { shallowRef } from 'vue'

import type { BewlyWidescreenTab } from '~/utils/bewlyWidescreen/types'
import { createMotionScope } from '~/utils/motionPriority'

export interface PlaybackSegment<Key extends string> {
  tablist: HTMLElement
  activeKey: Key
  /** Changes with the tab list, so the indicator remounts and measures the new one. */
  generation: number
}

let generation = 0

/**
 * A segment row on the playback page and its selected item. The shell is
 * plain DOM, so the app teleports the shared sliding indicator into the row
 * (PlaybackRailTabsIndicator.vue) instead of the shell painting its own. A
 * picked item's content swaps in once the plate lands (`motion`).
 */
function createPlaybackSegment<Key extends string>(name: string) {
  const state = shallowRef<PlaybackSegment<Key> | null>(null)
  return {
    motion: createMotionScope(name),
    state,
    publish(tablist: HTMLElement, activeKey: Key) {
      const current = state.value
      if (current?.tablist === tablist && current.activeKey === activeKey)
        return
      state.value = {
        tablist,
        activeKey,
        generation: current?.tablist === tablist ? current.generation : ++generation,
      }
    },
    clear(tablist: HTMLElement) {
      if (state.value?.tablist === tablist)
        state.value = null
    },
  }
}

/** The rail's overview / comment / danmaku tabs. */
export const railTabs = createPlaybackSegment<BewlyWidescreenTab>('rail-tabs')

/** Bpx's danmaku list / block settings / advanced views. */
export type DanmakuView = 'LIST' | 'BLOCK' | 'ADV'
export const danmakuViews = createPlaybackSegment<DanmakuView>('danmaku-views')

export const PLAYBACK_SEGMENTS = [railTabs, danmakuViews]
