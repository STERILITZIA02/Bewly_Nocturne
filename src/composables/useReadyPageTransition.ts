import type { TransitionProps } from 'vue'
import { nextTick, onScopeDispose, watch } from 'vue'

import { restoreRetiringElement, retiringTransition } from '~/utils/motionPresence'

/** Keep the outgoing view painted until code is ready; never mount two data owners. */
export function useReadyPageTransition(source: () => object | undefined, prepare: (component?: object) => Promise<unknown>): TransitionProps {
  let generation = 0
  let ready = false
  let finishLeave: (() => void) | undefined
  async function finishReadyLeave() {
    const done = finishLeave
    const version = generation
    if (!ready || !done)
      return
    // out-in's done() immediately updates BaseTransition. Even a cached module
    // must wait until Vue has installed the current patch's placeholder vnode.
    await nextTick()
    if (version !== generation || !ready || finishLeave !== done)
      return
    finishLeave = undefined
    done()
  }
  watch(source, async (component) => {
    const version = ++generation
    ready = false
    try {
      await prepare(component)
    }
    catch {
      // The async component owns its load error/retry UI; do not retain the old
      // page indefinitely when preloading fails.
    }
    if (version !== generation)
      return
    ready = true
    await finishReadyLeave()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    generation++
    finishLeave = undefined
  })
  return {
    ...retiringTransition,
    css: false,
    onLeave: (_element, done) => {
      finishLeave = done
      void finishReadyLeave()
    },
    onLeaveCancelled: (element) => {
      finishLeave = undefined
      restoreRetiringElement(element)
    },
  }
}
