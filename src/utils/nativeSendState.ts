export type NativeSendState = 'ready' | 'idle' | 'pending' | 'blocked'

export interface NativeSendStateInput {
  hasContent: boolean
  inputDisabled: boolean
  buttonDisabled: boolean
  busy: boolean
  buttonText: string
  restrictionText?: string
}

// A level requirement may contain a digit too. Only an actual countdown or
// sending label is evidence of cooldown; a generic disabled class is not.
const COUNTDOWN = /^[（(]?\d+(?:\.\d+)?(?:s|秒|seconds?)?[）)]?$/i
const PENDING = /发送中|發送中|傳送中|发布中|發佈中|冷却|冷卻|sending|posting|cooldown|\d+\s*秒后/i
const RESTRICTED = /不(?:支持|允许|允許|能)|暂不可|暫不可|禁止|禁言|已关闭|已關閉|无权|無權|未登录|未登[錄入]|请先?登录|請先?登[錄入]|登录后|登[錄入]後|not allowed|unavailable|log ?in|sign ?in/i

export function resolveNativeSendState(input: NativeSendStateInput): NativeSendState {
  if (RESTRICTED.test(`${input.buttonText} ${input.restrictionText ?? ''}`))
    return 'blocked'
  if (input.busy || COUNTDOWN.test(input.buttonText.replace(/\s+/g, '')) || PENDING.test(input.buttonText))
    return 'pending'
  if (input.inputDisabled || (input.buttonDisabled && input.hasContent))
    return 'blocked'
  return input.hasContent ? 'ready' : 'idle'
}
