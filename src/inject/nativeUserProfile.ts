import { getMotionDuration } from '~/utils/motionTiming'
import { buildPrivateConversationUrl } from '~/utils/privateConversationRoute'

interface ProfileElement extends HTMLElement {
  uid?: string
  lastShowEl?: HTMLElement | null
  updateComplete?: Promise<unknown>
  visible: (show: boolean) => void
  handleJumpMsg: () => void
  disconnectedCallback: () => void
}

const patched = new WeakSet<object>()
/** Decorate the native owner; keep its data, follow handler and hover lifetime. */
export function patchNativeUserProfile(constructor: unknown) {
  if (typeof constructor !== 'function' || patched.has(constructor))
    return
  const prototype = constructor.prototype as ProfileElement
  if (typeof prototype.visible !== 'function' || typeof prototype.handleJumpMsg !== 'function')
    return
  patched.add(constructor)
  const visible = prototype.visible
  const disconnected = prototype.disconnectedCallback
  const states = new WeakMap<ProfileElement, { version: number, showing: boolean, animation?: Animation }>()

  prototype.handleJumpMsg = function () {
    const mid = String(this.uid ?? '')
    if (/^[1-9]\d*$/.test(mid))
      window.open(buildPrivateConversationUrl({ talkerId: mid, sessionType: 1 }), '_blank', 'noopener,noreferrer')
  }
  prototype.visible = function (show) {
    const state = states.get(this) ?? { version: 0, showing: false }
    states.set(this, state)
    if (show && state.showing)
      return
    const version = ++state.version
    state.showing = show
    this.inert = !show
    if (show)
      visible.call(this, true)
    void Promise.resolve(this.updateComplete).then(() => {
      if (state.version !== version || !this.isConnected)
        return
      const panel = this.shadowRoot?.querySelector<HTMLElement>('#wrap')
      const style = panel && getComputedStyle(panel)
      const interrupted = Boolean(state.animation)
      const fromOpacity = interrupted && style ? style.opacity : show ? '0' : '1'
      const fromTransform = interrupted && style ? style.transform : show ? 'scale(0.97)' : 'none'
      state.animation?.cancel()
      state.animation = undefined
      if (!panel || typeof panel.animate !== 'function') {
        visible.call(this, show)
        return
      }
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const bounds = panel.getBoundingClientRect()
      const anchor = this.lastShowEl?.getBoundingClientRect()
      panel.style.transformOrigin = anchor
        ? `${Math.max(0, Math.min(bounds.width, anchor.left + anchor.width / 2 - bounds.left))}px ${anchor.top >= bounds.bottom ? '100%' : '0%'}`
        : '50% 0%'
      const duration = getMotionDuration(style!, show ? '--bew-duration-normal' : '--bew-duration-fast')
      const easing = style!.getPropertyValue('--bew-ease-standard').trim() || 'ease-out'
      try {
        const animation = panel.animate([
          { opacity: fromOpacity, transform: reduced ? 'none' : fromTransform },
          { opacity: show ? 1 : 0, transform: reduced || show ? 'none' : 'scale(0.97)' },
        ], { duration, easing, fill: 'both' })
        state.animation = animation
        void animation.finished.then(() => {
          if (state.version !== version)
            return
          if (this.isConnected)
            visible.call(this, show)
          else
            state.showing = false
          animation.cancel()
          state.animation = undefined
        }, () => {})
      }
      catch { visible.call(this, show) }
    }).catch(() => {
      if (state.version === version && this.isConnected)
        visible.call(this, show)
    })
  }
  prototype.disconnectedCallback = function () {
    const state = states.get(this)
    if (state) {
      state.version++
      state.animation?.cancel()
      states.delete(this)
    }
    disconnected?.call(this)
  }
}
