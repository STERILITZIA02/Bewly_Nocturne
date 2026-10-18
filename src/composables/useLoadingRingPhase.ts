import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'

import { getLoadingRingCloseDuration } from '~/utils/loadingRing'

export type LoadingRingPhase = 'idle' | 'spinning' | 'complete'

/**
 * Tracks one indeterminate load: `complete` lasts for the ring's close
 * duration after `loading` ends. Owners whose container must outlive the load
 * (masks, collapsing rows) gate presence on `phase !== 'idle'`.
 */
export function useLoadingRingPhase(loading: () => boolean, timingElement: () => Element | undefined | null): Ref<LoadingRingPhase> {
  const phase = ref<LoadingRingPhase>(loading() ? 'spinning' : 'idle')
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  function clearCloseTimer() {
    if (closeTimer !== undefined)
      clearTimeout(closeTimer)
    closeTimer = undefined
  }

  watch(loading, (active) => {
    clearCloseTimer()
    if (active) {
      phase.value = 'spinning'
      return
    }
    if (phase.value !== 'spinning')
      return
    phase.value = 'complete'
    closeTimer = setTimeout(() => {
      closeTimer = undefined
      phase.value = 'idle'
    }, getLoadingRingCloseDuration(timingElement()))
  })

  onScopeDispose(clearCloseTimer)
  return phase
}
