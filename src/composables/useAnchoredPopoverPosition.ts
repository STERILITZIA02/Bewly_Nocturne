import type { MaybeElement } from '@vueuse/core'
import { unrefElement } from '@vueuse/core'
import type { Ref } from 'vue'

import { computeAnchoredPopoverPosition } from '~/utils/floatingMenu'

export function useAnchoredPopoverPosition(
  trigger: Ref<MaybeElement>,
  popup: Ref<MaybeElement>,
  visible: Readonly<Ref<boolean>>,
) {
  let frame: number | undefined
  let resizeObserver: ResizeObserver | undefined

  function cancelFrame() {
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
  }

  function updatePosition() {
    frame = undefined
    const triggerElement = unrefElement(trigger)
    const popupElement = unrefElement(popup)
    if (!triggerElement || !popupElement || !visible.value)
      return

    const triggerRect = triggerElement.getBoundingClientRect()
    const popupRect = popupElement.getBoundingClientRect()
    const position = computeAnchoredPopoverPosition(
      triggerRect,
      popupRect,
      window.innerWidth,
      window.innerHeight,
    )
    popupElement.style.top = `${position.top}px`
    popupElement.style.left = `${position.left}px`
    popupElement.dataset.openUp = String(position.openUp)
  }

  function scheduleUpdate() {
    if (frame === undefined)
      frame = requestAnimationFrame(updatePosition)
  }

  function stop() {
    cancelFrame()
    resizeObserver?.disconnect()
    resizeObserver = undefined
    window.removeEventListener('resize', scheduleUpdate)
    window.removeEventListener('scroll', scheduleUpdate, true)
  }

  function start() {
    stop()
    const triggerElement = unrefElement(trigger)
    const popupElement = unrefElement(popup)
    if (!triggerElement || !popupElement || !visible.value)
      return

    resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(triggerElement)
    resizeObserver.observe(popupElement)
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    scheduleUpdate()
  }

  watch([trigger, popup, visible], () => {
    if (visible.value)
      nextTick(start)
    else
      stop()
  }, { immediate: true, flush: 'post' })

  onScopeDispose(stop)
}
