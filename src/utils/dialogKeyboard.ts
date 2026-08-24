export type DialogKeyboardAction = 'block' | 'close' | 'confirm' | 'hide-shortcut' | 'ignore' | 'show-shortcut'

export interface DialogKeyboardContext {
  closing: boolean
  defaultPrevented: boolean
  editingContext?: boolean
  eventType: 'keydown' | 'keyup'
  isComposing?: boolean
  key: string
  loading: boolean
  preventCloseWhenLoading: boolean
  visible: boolean
}

export interface DialogKeyboardDecision {
  action: DialogKeyboardAction
  preventDefault: boolean
}

const IGNORE_DECISION: DialogKeyboardDecision = {
  action: 'ignore',
  preventDefault: false,
}

export function resolveDialogKeyboardAction(context: DialogKeyboardContext): DialogKeyboardDecision {
  if (!context.visible || context.closing || context.defaultPrevented)
    return IGNORE_DECISION

  if (context.key === 'Alt') {
    return {
      action: context.eventType === 'keydown' ? 'show-shortcut' : 'hide-shortcut',
      preventDefault: false,
    }
  }

  if (context.eventType !== 'keydown')
    return IGNORE_DECISION

  if (context.key === 'Enter') {
    if (context.loading || context.editingContext || context.isComposing)
      return IGNORE_DECISION

    return {
      action: 'confirm',
      preventDefault: true,
    }
  }

  if (context.key === 'Escape') {
    if (context.loading && context.preventCloseWhenLoading) {
      return {
        action: 'block',
        preventDefault: true,
      }
    }

    return {
      action: 'close',
      preventDefault: true,
    }
  }

  return IGNORE_DECISION
}
