import { computed, nextTick, onScopeDispose, shallowRef, watch } from 'vue'

import type { MotionScope } from '~/utils/motionPriority'
import { afterMotion } from '~/utils/motionPriority'

/** Keep input feedback immediate; commit only the latest intent after its own control's motion. */
export function useMotionValue<T>(source: () => T, commit: (value: T) => void | Promise<void>, scope: MotionScope) {
  const selected = shallowRef(source())
  let generation = 0
  watch(source, (value) => {
    generation++
    selected.value = value
  }, { flush: 'sync' })
  onScopeDispose(() => {
    generation++
  })

  return computed({
    get: () => selected.value,
    set: async (value: T) => {
      if (Object.is(selected.value, value))
        return
      selected.value = value
      const version = ++generation
      // Let the indicator register its hold after Vue patches data-active.
      await nextTick()
      await afterMotion(scope)
      if (version !== generation || Object.is(source(), value))
        return
      await commit(value)
      await nextTick()
      if (version === generation)
        selected.value = source()
    },
  })
}
