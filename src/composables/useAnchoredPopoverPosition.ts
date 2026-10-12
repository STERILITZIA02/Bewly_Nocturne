import type { MaybeElement } from '@vueuse/core'
import { unrefElement } from '@vueuse/core'
import type { Ref } from 'vue'
import { nextTick, onScopeDispose, watch } from 'vue'

import type { PopoverPositionResolver } from '~/utils/floatingMenu'
import { computeAnchoredPopoverPosition } from '~/utils/floatingMenu'

export function useAnchoredPopoverPosition(
  trigger: Ref<MaybeElement>,
  popup: Ref<MaybeElement>,
  visible: Readonly<Ref<boolean>>,
  resolvePosition: PopoverPositionResolver = computeAnchoredPopoverPosition,
) {
  let frame: number | undefined
  let resizeObserver: ResizeObserver | undefined
  let disposed = false

  function cancelFrame() {
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
  }

  function updatePosition() {
    frame = undefined
    const triggerElement = unrefElement(trigger)
    const popupElement = unrefElement(popup)
    if (disposed || !triggerElement || !popupElement || !visible.value)
      return

    const triggerRect = triggerElement.getBoundingClientRect()
    const paintedPopup = popupElement.getBoundingClientRect()
    // Entry scale must not move the final anchor. Use layout dimensions while
    // a popup is animating, with the measured rect as the non-HTML fallback.
    const popupRect = popupElement instanceof HTMLElement
      ? { width: popupElement.offsetWidth || paintedPopup.width, height: popupElement.offsetHeight || paintedPopup.height }
      : paintedPopup
    const visualViewport = window.visualViewport
    const viewportLeft = visualViewport?.offsetLeft ?? 0
    const viewportTop = visualViewport?.offsetTop ?? 0
    const viewportWidth = visualViewport?.width ?? window.innerWidth
    const viewportHeight = visualViewport?.height ?? window.innerHeight
    const position = resolvePosition(
      {
        top: triggerRect.top - viewportTop,
        right: triggerRect.right - viewportLeft,
        bottom: triggerRect.bottom - viewportTop,
        left: triggerRect.left - viewportLeft,
        width: triggerRect.width,
      },
      popupRect,
      viewportWidth,
      viewportHeight,
    )
    const top = position.top + viewportTop
    const left = position.left + viewportLeft
    const anchorCenter = triggerRect.left + triggerRect.width / 2
    const originX = Math.min(Math.max(anchorCenter - left, 0), popupRect.width)
    popupElement.style.top = `${top}px`
    popupElement.style.left = `${left}px`
    popupElement.style.setProperty('--bew-popover-origin-x', `${originX}px`)
    popupElement.style.setProperty('--bew-popover-origin-y', position.openUp ? '100%' : '0%')
    popupElement.dataset.openUp = String(position.openUp)
    popupElement.dataset.positioned = 'true'
    popupElement.style.removeProperty('visibility')
  }

  function scheduleUpdate() {
    if (!disposed && visible.value && frame === undefined)
      frame = requestAnimationFrame(updatePosition)
  }

  function stop() {
    cancelFrame()
    resizeObserver?.disconnect()
    resizeObserver = undefined
    window.removeEventListener('resize', scheduleUpdate)
    window.removeEventListener('scroll', scheduleUpdate, true)
    window.visualViewport?.removeEventListener('resize', scheduleUpdate)
    window.visualViewport?.removeEventListener('scroll', scheduleUpdate)
  }

  function start() {
    stop()
    const triggerElement = unrefElement(trigger)
    const popupElement = unrefElement(popup)
    if (disposed || !triggerElement || !popupElement || !visible.value)
      return

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleUpdate)
      resizeObserver.observe(triggerElement)
      resizeObserver.observe(popupElement)
    }
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    window.visualViewport?.addEventListener('resize', scheduleUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleUpdate)
    popupElement.style.visibility = 'hidden'
    updatePosition()
  }

  watch([trigger, popup, visible], () => {
    if (visible.value)
      nextTick(start)
    else
      stop()
  }, { immediate: true, flush: 'post' })

  onScopeDispose(() => {
    disposed = true
    stop()
  })
  return { scheduleUpdate }
}
