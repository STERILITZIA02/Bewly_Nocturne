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
  /**
   * The picture's last frame, lying under the stage while it arrives, so the
   * video crosses into the stage instead of blanking first. The stage removes
   * it once it covers it.
   */
  frame?: HTMLCanvasElement
  /**
   * The session has ended: the needle lifts and the stage dissolves over the
   * returning picture (listenStageMotion.ts), then the host is removed.
   */
  leaving?: boolean
}

/** The listening session the app renders, or null while the video plays. */
export const listenStage = shallowRef<ListenStage | null>(null)
