import type { InjectionKey } from 'vue'
import { provide, ref } from 'vue'

/** Popups anchored inside a hover-scaled card report open (true) and close (false). */
export const HOVER_LIFT_HOLD: InjectionKey<(open: boolean) => void> = Symbol('hover-lift-hold')

/**
 * Keeps a hover-scaled card scaled while a menu or picker it opened stays open.
 * Otherwise the pointer leaving for the popup shrinks the card and the popup's
 * anchor moves out from under it. A popup opened while the pointer is not over
 * the card changes nothing.
 */
export function useHoverLiftHold(card: () => HTMLElement | null) {
  const held = ref(false)
  let open = 0
  function hold(next: boolean) {
    open = Math.max(0, open + (next ? 1 : -1))
    if (next && open === 1)
      held.value = card()?.matches(':hover') ?? false
    else if (!open)
      held.value = false
  }
  provide(HOVER_LIFT_HOLD, hold)
  return { held, hold }
}
