import { createWheelStepper } from './wheelStep'

/**
 * One step per sideways gesture: a trackpad swipe (once per gesture, its
 * inertial tail ignored) or a touch swipe. Vertical wheels keep scrolling the
 * page. Wire the handlers to the swiped element; `consumeClick` swallows the
 * click a touch swipe ends in.
 */
export function createSideSwipe(onStep: (direction: -1 | 1) => void, canStep: () => boolean = () => true) {
  const stepper = createWheelStepper({ oncePerGesture: true })
  let start: { id: number, x: number, y: number } | undefined
  let swiped = false

  function wheel(event: WheelEvent) {
    if (event.ctrlKey || event.defaultPrevented || !canStep() || Math.abs(event.deltaX) <= Math.abs(event.deltaY))
      return
    event.preventDefault()
    const direction = stepper.step(event.deltaX, event.deltaMode, event.timeStamp)
    if (direction)
      onStep(direction)
  }
  function pointerdown(event: PointerEvent) {
    start = event.pointerType === 'touch' ? { id: event.pointerId, x: event.clientX, y: event.clientY } : undefined
  }
  function pointerup(event: PointerEvent) {
    const from = start
    start = undefined
    if (!from || from.id !== event.pointerId || !canStep())
      return
    const dx = event.clientX - from.x
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(event.clientY - from.y))
      return
    swiped = true
    onStep(dx < 0 ? 1 : -1)
  }
  function pointercancel() {
    start = undefined
  }
  function consumeClick() {
    const value = swiped
    swiped = false
    return value
  }
  return { wheel, pointerdown, pointerup, pointercancel, consumeClick }
}
