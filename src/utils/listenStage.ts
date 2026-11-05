import { shallowRef } from 'vue'

import type { NativePlaybackUnit } from './videoMetadataBridge'

export interface ListenStage {
  /** Inside the stage host's shadow root, over the picture and under Bpx's control bar. */
  mount: HTMLElement
  /** Null while a restored session reconnects its sources. */
  audio: HTMLAudioElement | null
  unit: NativePlaybackUnit
  /** A source request (start, restore or retry) is in flight. */
  loading: boolean
  /** Every source failed; the session holds its place until a retry. */
  failed: boolean
  retry: () => void
}

/** The listening session the app renders, or null while the video plays. */
export const listenStage = shallowRef<ListenStage | null>(null)
