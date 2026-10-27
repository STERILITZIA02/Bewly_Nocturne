import { createSharedComposable, usePreferredReducedMotion } from '@vueuse/core'
import { computed } from 'vue'

import { settings } from '~/logic'

export const useReducedMotion = createSharedComposable(() => {
  const system = usePreferredReducedMotion()
  return computed(() => settings.value.motionPreference === 'reduce'
    || (settings.value.motionPreference !== 'full' && system.value === 'reduce'))
})
