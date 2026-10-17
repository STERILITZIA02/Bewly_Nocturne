import type { Ref } from 'vue'
import { watch } from 'vue'

import { computeAnchoredFloatingMenuPosition, computeAnchoredPopoverPosition } from '~/utils/floatingMenu'

import { useAnchoredPopoverPosition } from './useAnchoredPopoverPosition'

/** Auxiliary editors escape the card without resizing its scrollable content. */
export function useComposerPicker(
  panel: Ref<HTMLElement | null>,
  popup: Ref<HTMLElement | null>,
  visible: Readonly<Ref<boolean>>,
  dismiss: () => void,
) {
  useAnchoredPopoverPosition(panel, popup, visible, (bounds, size, width, height) => {
    const maximumHeight = Number.parseFloat(getComputedStyle(panel.value!).getPropertyValue('--bew-moment-forward-picker-max-height')) || size.height
    const position = computeAnchoredFloatingMenuPosition(bounds, maximumHeight, width, height, maximumHeight)
    popup.value?.style.setProperty('--bew-composer-picker-height', `${position.maxHeight}px`)
    return {
      top: position.openUp ? position.top - Math.min(size.height, position.maxHeight) : position.top,
      left: computeAnchoredPopoverPosition(bounds, size, width, height).left,
      openUp: position.openUp,
    }
  })
  watch(visible, (open, _previous, onCleanup) => {
    if (!open)
      return
    const dismissOutside = (event: PointerEvent) => {
      const path = event.composedPath()
      if (!path.includes(panel.value!) && !path.includes(popup.value!))
        dismiss()
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    onCleanup(() => document.removeEventListener('pointerdown', dismissOutside, true))
  }, { immediate: true })
}
