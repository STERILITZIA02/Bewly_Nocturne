import type { CSSProperties } from 'vue'
import { computed } from 'vue'

import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'

export function useGridLayout(gridLayout: () => GridLayoutType) {
  const gridCssVars = computed<CSSProperties>(() => ({
    '--grid-cols-base': settings.value.gridColumns.base,
    '--grid-cols-sm': settings.value.gridColumns.sm,
    '--grid-cols-md': settings.value.gridColumns.md,
    '--grid-cols-lg': settings.value.gridColumns.lg,
    '--grid-cols-xl': settings.value.gridColumns.xl,
    '--grid-cols-xxl': settings.value.gridColumns.xxl,
  }))

  const gridClass = computed((): string[] => {
    const layout = gridLayout()
    if (layout === 'adaptive')
      return ['bew-grid-adaptive']
    if (layout === 'twoColumns') {
      return settings.value.autoSwitchListLayout
        ? ['bew-grid-two-columns', 'bew-grid-list-auto-switch']
        : ['bew-grid-two-columns']
    }
    return ['bew-grid-one-column']
  })

  return { gridClass, gridCssVars }
}
