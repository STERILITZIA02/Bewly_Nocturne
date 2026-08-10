import { computed } from 'vue'

import { settings } from '~/logic'
import { resolveSearchFocusEffect } from '~/utils/searchFocusEffect'

export function useSearchFocusEffect() {
  return computed(() => resolveSearchFocusEffect({
    disableFocusEffect: settings.value.disableSearchFocusEffect,
    disableFrostedGlass: settings.value.disableFrostedGlass,
  }))
}
