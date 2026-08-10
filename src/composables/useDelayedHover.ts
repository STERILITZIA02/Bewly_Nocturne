import { settings } from '~/logic'

// DISABLED WHEN IN TOUCHSCREEN OPTIMIZATION IS ENABLED IN SETTINGS
export function useDelayedHover({ enterDelay = 300, leaveDelay = 300, beforeEnter, enter, beforeLeave, leave }:
{ enterDelay?: number, leaveDelay?: number, beforeEnter?: () => void, enter: () => void, beforeLeave?: () => void, leave: () => void }) {
  const el = ref<HTMLElement>()

  let enterTimer: ReturnType<typeof setTimeout> | undefined
  let leaveTimer: ReturnType<typeof setTimeout> | undefined

  function clearTimers() {
    if (enterTimer !== undefined)
      clearTimeout(enterTimer)
    if (leaveTimer !== undefined)
      clearTimeout(leaveTimer)
    enterTimer = undefined
    leaveTimer = undefined
  }

  function handleMouseEnter() {
    if (beforeEnter)
      beforeEnter()

    if (enterTimer) {
      clearTimeout(enterTimer)
      enterTimer = undefined
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = undefined
    }
    enterTimer = setTimeout(() => {
      enter()
    }, enterDelay)
  }
  function handleMouseLeave() {
    if (beforeLeave)
      beforeLeave()

    if (enterTimer) {
      clearTimeout(enterTimer)
      enterTimer = undefined
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = undefined
    }
    leaveTimer = setTimeout(() => {
      leave()
    }, leaveDelay)
  }

  watch([el, () => settings.value.touchScreenOptimization], ([element, touchOptimized], _, onCleanup) => {
    if (element && !touchOptimized) {
      element.addEventListener('mouseenter', handleMouseEnter)
      element.addEventListener('mouseleave', handleMouseLeave)
    }

    onCleanup(() => {
      if (element) {
        element.removeEventListener('mouseenter', handleMouseEnter)
        element.removeEventListener('mouseleave', handleMouseLeave)
      }
      clearTimers()
    })
  }, { immediate: true, flush: 'post' })

  onScopeDispose(clearTimers)

  return el
}
