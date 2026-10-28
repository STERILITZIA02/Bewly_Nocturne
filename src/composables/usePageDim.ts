import type { MaybeRefOrGetter } from 'vue'
import { computed, onScopeDispose, shallowReactive, toValue, watch } from 'vue'

// Popovers and panels that take the page's attention dim the page under the
// top bar the way modal windows do. Each opener holds the dim while it is
// open; App draws the one shared layer.
const holders = shallowReactive(new Set<symbol>())

export const pageDimmed = computed(() => holders.size > 0)

export function usePageDim(active: MaybeRefOrGetter<boolean>) {
  const id = Symbol('page-dim')
  watch(() => toValue(active), (on) => {
    if (on)
      holders.add(id)
    else
      holders.delete(id)
  }, { immediate: true })
  onScopeDispose(() => holders.delete(id))
}
