import { computed } from 'vue'

import type { GridLayoutType } from '~/logic'

export function useGridLayout(gridLayout: () => GridLayoutType) {
  const gridClass = computed((): string[] => {
    const layout = gridLayout()
    if (layout === 'adaptive')
      return ['bew-grid-adaptive']
    if (layout === 'twoColumns')
      return ['bew-grid-two-columns']
    return ['bew-grid-one-column']
  })

  return { gridClass }
}
