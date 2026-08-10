import type { Ref } from 'vue'

import { computeAnchoredFloatingMenuPosition } from '~/utils/floatingMenu'

export function useFloatingMenuPosition(
  triggerRef: Ref<HTMLElement | null>,
  menuRef: Ref<HTMLElement | null>,
  maximumHeight: number,
) {
  const position = ref({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: maximumHeight,
    openUp: false,
  })
  let updateFrame = 0
  let listening = false

  const update = () => {
    const trigger = triggerRef.value
    if (!trigger)
      return

    const desiredHeight = menuRef.value?.scrollHeight ?? maximumHeight
    position.value = computeAnchoredFloatingMenuPosition(
      trigger.getBoundingClientRect(),
      desiredHeight,
      window.innerWidth,
      window.innerHeight,
      maximumHeight,
    )
  }

  const scheduleUpdate = () => {
    if (updateFrame)
      return
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0
      update()
    })
  }

  const start = () => {
    if (listening)
      return
    listening = true
    update()
    window.addEventListener('resize', scheduleUpdate, { passive: true })
    window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true })
  }

  const stop = () => {
    if (listening) {
      listening = false
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
    }
    if (updateFrame) {
      cancelAnimationFrame(updateFrame)
      updateFrame = 0
    }
  }

  onBeforeUnmount(stop)

  return {
    position,
    scheduleUpdate,
    start,
    stop,
  }
}
