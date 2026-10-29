import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'

interface CommentReplyMotionState {
  animation?: Animation
  cleanupTimer?: number
  fromHeight: number
  previousHeight: string
  previousOverflow: string
  target: HTMLElement
}

const COMMENT_REPLY_MOTION_FALLBACK_DURATION = 300
const COMMENT_REPLY_MOTION_CLEANUP_BUFFER = 80
/** Native comment expansion owns its styles and timers independently of tree layout. */
export function createCommentReplyMotion(scheduleCommentReplyTreeLayoutUpdate: (component: HTMLElement) => void) {
  const commentReplyMotionStates = new WeakMap<HTMLElement, CommentReplyMotionState>()
  function getCommentReplyMotionTarget(component: HTMLElement): HTMLElement | null {
    const rootNode = component.getRootNode()
    if (
      rootNode instanceof ShadowRoot
      && rootNode.host instanceof HTMLElement
      && rootNode.host.localName === 'bili-comment-thread-renderer'
    ) {
      return rootNode.host
    }

    return component.shadowRoot?.querySelector<HTMLElement>('#expander') ?? null
  }

  function restoreCommentReplyMotionStyle(target: HTMLElement, property: 'height' | 'overflow', value: string) {
    if (value)
      target.style.setProperty(property, value)
    else
      target.style.removeProperty(property)
  }

  function finishCommentReplyMotion(
    component: HTMLElement,
    motionState: CommentReplyMotionState,
    relayout: boolean,
  ) {
    if (commentReplyMotionStates.get(component) !== motionState)
      return

    commentReplyMotionStates.delete(component)
    if (motionState.cleanupTimer !== undefined)
      window.clearTimeout(motionState.cleanupTimer)
    if (motionState.animation) {
      motionState.animation.onfinish = null
      motionState.animation.oncancel = null
      motionState.animation.cancel()
    }
    restoreCommentReplyMotionStyle(motionState.target, 'height', motionState.previousHeight)
    restoreCommentReplyMotionStyle(motionState.target, 'overflow', motionState.previousOverflow)
    if (relayout && component.isConnected)
      scheduleCommentReplyTreeLayoutUpdate(component)
  }

  function captureCommentReplyMotion(component: any) {
    if (!(component instanceof HTMLElement))
      return

    const target = getCommentReplyMotionTarget(component)
    if (!target)
      return

    const fromHeight = target.getBoundingClientRect().height
    if (!Number.isFinite(fromHeight) || fromHeight <= 0)
      return

    const runningMotion = commentReplyMotionStates.get(component)
    const previousHeight = runningMotion?.previousHeight ?? target.style.height
    const previousOverflow = runningMotion?.previousOverflow ?? target.style.overflow
    if (runningMotion)
      finishCommentReplyMotion(component, runningMotion, false)

    target.style.height = `${fromHeight}px`
    target.style.overflow = 'hidden'
    commentReplyMotionStates.set(component, {
      fromHeight,
      previousHeight,
      previousOverflow,
      target,
    })
  }

  function animateCommentReplyMotion(component: any) {
    if (!(component instanceof HTMLElement))
      return

    const motionState = commentReplyMotionStates.get(component)
    if (!motionState)
      return

    const { target } = motionState
    if (!target.isConnected) {
      finishCommentReplyMotion(component, motionState, false)
      return
    }

    restoreCommentReplyMotionStyle(target, 'height', motionState.previousHeight)
    restoreCommentReplyMotionStyle(target, 'overflow', motionState.previousOverflow)
    const targetHeight = target.getBoundingClientRect().height
    target.style.height = `${motionState.fromHeight}px`
    target.style.overflow = 'hidden'

    const reducedMotion = prefersReducedMotion()
    if (
      reducedMotion
      || !Number.isFinite(targetHeight)
      || Math.abs(targetHeight - motionState.fromHeight) < 1
      || typeof target.animate !== 'function'
    ) {
      finishCommentReplyMotion(component, motionState, true)
      return
    }

    const style = getComputedStyle(target)
    const duration = getMotionDuration(style, '--bew-duration-moderate', COMMENT_REPLY_MOTION_FALLBACK_DURATION)
    const easing = style.getPropertyValue('--bew-ease-standard').trim()
      || 'cubic-bezier(0.22, 0.61, 0.36, 1)'
    target.style.height = `${targetHeight}px`

    try {
      const animation = target.animate([
        { height: `${motionState.fromHeight}px` },
        { height: `${targetHeight}px` },
      ], {
        duration,
        easing,
      })
      motionState.animation = animation
      const finish = () => finishCommentReplyMotion(component, motionState, true)
      animation.onfinish = finish
      animation.oncancel = finish
      motionState.cleanupTimer = window.setTimeout(
        finish,
        Math.ceil(duration) + COMMENT_REPLY_MOTION_CLEANUP_BUFFER,
      )
    }
    catch {
      finishCommentReplyMotion(component, motionState, true)
    }
  }

  return { captureCommentReplyMotion, animateCommentReplyMotion }
}
