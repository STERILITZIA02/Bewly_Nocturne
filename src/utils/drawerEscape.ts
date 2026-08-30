export interface EscapeKeyboardEventLike {
  key: string
  repeat: boolean
  isComposing: boolean
}

export interface DrawerEscapeArbitrationState {
  active: boolean
  defaultPrevented: boolean
  propagationStopped: boolean
  hadPriorityState: boolean
  hasPriorityState: boolean
  iframeHandled?: boolean
}

export interface IframeEscapeArbitrationState {
  defaultPrevented: boolean
  propagationStopped: boolean
  hadPriorityState: boolean
  hasPriorityState: boolean
  editableActiveElement: boolean
}

export type IframeEscapeAction = 'handled' | 'request-close'
export type DrawerEscapeBehaviorAction = 'arm-second-press' | 'close'

export function isEligibleDrawerEscape(event: EscapeKeyboardEventLike): boolean {
  return event.key === 'Escape' && !event.repeat && !event.isComposing
}

export function shouldHandleDrawerEscape(state: DrawerEscapeArbitrationState): boolean {
  return state.active
    && !state.defaultPrevented
    && !state.propagationStopped
    && !state.hadPriorityState
    && !state.hasPriorityState
    && !state.iframeHandled
}

export function resolveDrawerEscapeBehavior(
  behavior: 'immediate' | 'secondPress',
  secondPressArmed: boolean,
): DrawerEscapeBehaviorAction {
  return behavior === 'immediate' || secondPressArmed ? 'close' : 'arm-second-press'
}

export function resolveIframeEscapeAction(state: IframeEscapeArbitrationState): IframeEscapeAction {
  if (
    state.defaultPrevented
    || state.propagationStopped
    || state.hadPriorityState
    || state.hasPriorityState
    || state.editableActiveElement
  ) {
    return 'handled'
  }
  return 'request-close'
}

export function getLeafActiveElement(root: Document | ShadowRoot = document): Element | null {
  let activeElement = root.activeElement
  while (activeElement?.shadowRoot?.activeElement)
    activeElement = activeElement.shadowRoot.activeElement
  return activeElement
}

export function isEditableLeafActiveElement(root: Document | ShadowRoot = document): boolean {
  const activeElement = getLeafActiveElement(root)
  if (!(activeElement instanceof HTMLElement))
    return false

  const tagName = activeElement.tagName.toLowerCase()
  return tagName === 'input'
    || tagName === 'textarea'
    || activeElement.isContentEditable
    || (activeElement.hasAttribute('contenteditable') && activeElement.getAttribute('contenteditable') !== 'false')
}
