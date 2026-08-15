/**
 * EXPERIMENTAL: server write protocol is blocked by real HTTP 412 evidence; do not expose to production UI.
 *
 * This helper is deliberately not mounted by Notifications.vue and does not
 * register a global or URL-triggered entry point. A future controlled protocol
 * investigation may import it directly from a DEV-only harness after explicit
 * user authorization.
 */
import type {
  PrivateTextSendDiagnostic,
  PrivateTextSendOutcome,
} from './usePrivateMessageWrites'

export const PRIVATE_TEXT_PROTOCOL_GATE_CONFIRMATION = 'I_CONFIRM_ONE_PRIVATE_TEXT_SEND'
export const PRIVATE_TEXT_PROTOCOL_GATE_VALUE = 'test-test'

export interface ExperimentalPrivateTextSendController {
  getState: (talkerId: string) => {
    lastTextSendDiagnostic: PrivateTextSendDiagnostic | null
    lastTextSendOutcome: PrivateTextSendOutcome
  }
  sendDraft: (talkerId: string) => Promise<boolean>
  setDraft: (talkerId: string, text: string) => void
}

export interface ExperimentalPrivateTextSendGateResult {
  status: PrivateTextSendOutcome | 'blocked'
  diagnostic: PrivateTextSendDiagnostic | null
}

export function createPrivateMessageWriteProtocolGate(
  controller: ExperimentalPrivateTextSendController,
) {
  let used = false
  return async (
    talkerId: string,
    confirmation: string,
    text: string,
  ): Promise<ExperimentalPrivateTextSendGateResult> => {
    if (
      used
      || !/^\d+$/.test(talkerId)
      || confirmation !== PRIVATE_TEXT_PROTOCOL_GATE_CONFIRMATION
      || text !== PRIVATE_TEXT_PROTOCOL_GATE_VALUE
    ) {
      return { status: 'blocked', diagnostic: null }
    }

    used = true
    controller.setDraft(talkerId, text)
    await controller.sendDraft(talkerId)
    const state = controller.getState(talkerId)
    return {
      status: state.lastTextSendOutcome ?? 'failed',
      diagnostic: state.lastTextSendDiagnostic,
    }
  }
}
