import { shallowRef } from 'vue'

import type { Video } from '~/components/VideoCard/types'

/** A bounded projection supplied by the home feed, never a second feed owner. */
export interface ImmersiveRailWindow {
  revision: number
  items: Array<{ uniqueId: string, displayData: Video }>
  currentKey: string
  loading: boolean
  hasMore: boolean
  failed: boolean
}

export const immersiveRail = shallowRef<{
  window: ImmersiveRailWindow
  visible: boolean
  action: (action: 'select' | 'more', key?: string) => void
} | null>(null)
