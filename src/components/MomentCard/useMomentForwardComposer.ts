import type { Ref } from 'vue'
import { inject, onUnmounted, reactive } from 'vue'

import api from '~/utils/api'
import { getUserID } from '~/utils/main'

import type { MomentForwardEmotePackage, MomentForwardSubmissionState } from './momentForwardContent'
import {
  createMomentForwardSubmissionController,
  getMomentForwardResponseCode,
  getMomentForwardResponseMessage,
  normalizeMomentForwardEmotePackages,
} from './momentForwardContent'
import { MOMENT_FORWARD_TRANSACTIONS } from './momentForwardTransactions'
import type { DisplayMoment } from './types'

let cachedEmoteAccountId = ''
let cachedMomentEmotes: MomentForwardEmotePackage[] | undefined
let momentEmotesRequest: Promise<MomentForwardEmotePackage[]> | undefined
let momentEmotesRequestAccountId = ''

export async function loadMomentForwardEmotes(
  accountIdValue: number | string,
  fallbackError = 'Failed to load dynamic emotes',
): Promise<MomentForwardEmotePackage[]> {
  const accountId = `${String(accountIdValue || 'guest')}:${String(getUserID() ?? 'guest')}`
  if (cachedEmoteAccountId !== accountId) {
    cachedEmoteAccountId = accountId
    cachedMomentEmotes = undefined
    momentEmotesRequest = undefined
    momentEmotesRequestAccountId = ''
  }
  if (cachedMomentEmotes)
    return cachedMomentEmotes
  if (momentEmotesRequest && momentEmotesRequestAccountId === accountId)
    return momentEmotesRequest

  momentEmotesRequestAccountId = accountId
  const request = api.moment.getMomentEmotes({ business: 'dynamic' })
    .then((response) => {
      if (getMomentForwardResponseCode(response) !== 0)
        throw new Error(getMomentForwardResponseMessage(response) || fallbackError)
      const packages = normalizeMomentForwardEmotePackages(response)
      if (cachedEmoteAccountId === accountId) {
        cachedEmoteAccountId = accountId
        cachedMomentEmotes = packages
      }
      return packages
    })
    .finally(() => {
      if (momentEmotesRequest === request) {
        momentEmotesRequest = undefined
        momentEmotesRequestAccountId = ''
      }
    })
  momentEmotesRequest = request
  return request
}

export function resetMomentForwardEmoteCache() {
  cachedEmoteAccountId = ''
  cachedMomentEmotes = undefined
  momentEmotesRequest = undefined
  momentEmotesRequestAccountId = ''
}

interface MomentForwardComposerMessages {
  accountUnavailable: string
  csrfUnavailable: string
  momentUnavailable: string
  forwardFailed: string
}

export function useMomentForwardComposer(
  moment: Ref<DisplayMoment>,
  accountId: Ref<number | string>,
  messages: MomentForwardComposerMessages,
) {
  const transactions = inject(MOMENT_FORWARD_TRANSACTIONS)!
  const getIdentity = () => `${accountId.value || 'guest'}:${getUserID() ?? 'guest'}:${moment.value.id}`
  let draftIdentity = transactions.keyOf(moment.value.id)
  let disposed = false
  const cachedDraft = transactions.read(draftIdentity)
  const state = reactive<MomentForwardSubmissionState>({
    status: cachedDraft?.pending ? 'submitting' : cachedDraft ? 'editing' : 'idle',
    tokens: cachedDraft?.tokens.map(token => ({ ...token })) ?? [],
    selectedTopic: cachedDraft?.topic ? { ...cachedDraft.topic } : null,
  })
  const controller = createMomentForwardSubmissionController({
    state,
    fallbackError: messages.forwardFailed,
    getIdentity,
    submit: async (tokens, topic, context) => {
      const storeMid = String(accountId.value || '')
      const cookieMid = String(getUserID() ?? '')
      if (!storeMid || !cookieMid || storeMid !== cookieMid)
        throw new Error(messages.accountUnavailable)
      const momentId = String(moment.value.id || '').trim()
      if (!momentId)
        throw new Error(messages.momentUnavailable)

      const response = await transactions.submit(momentId, tokens, topic, moment.value.forwardCount, context.isCurrent)
      if (getMomentForwardResponseCode(response) === -111)
        throw new Error(messages.csrfUnavailable)
      return response
    },
  })

  const persistDraft = () => {
    transactions.save(draftIdentity, state.tokens, state.selectedTopic)
  }

  function joinPendingDraft() {
    const draft = transactions.read(draftIdentity)
    const pending = draft?.pending
    if (!pending)
      return
    const identity = getIdentity()
    const key = draftIdentity
    state.status = 'submitting'
    transactions.join(moment.value.id, pending, moment.value.forwardCount)
    void pending.then((response) => {
      if (disposed || identity !== getIdentity())
        return
      const latest = transactions.read(key)
      state.tokens = latest?.tokens.map(token => ({ ...token })) ?? []
      state.selectedTopic = latest?.topic ? { ...latest.topic } : null
      state.status = getMomentForwardResponseCode(response) === 0
        ? state.tokens.length || state.selectedTopic ? 'editing' : 'success'
        : 'error'
      if (state.status === 'error')
        state.error = getMomentForwardResponseMessage(response) || messages.forwardFailed
    }).catch((error) => {
      if (!disposed && identity === getIdentity()) {
        state.status = 'error'
        state.error = error instanceof Error ? error.message : messages.forwardFailed
      }
    })
  }
  joinPendingDraft()

  const setTokens = (tokens: MomentForwardSubmissionState['tokens']) => {
    controller.setTokens(tokens)
    persistDraft()
  }
  const selectTopic = (topic: NonNullable<MomentForwardSubmissionState['selectedTopic']>) => {
    controller.selectTopic(topic)
    persistDraft()
  }
  const clearTopic = () => {
    controller.clearTopic()
    persistDraft()
  }
  const invalidate = (clearDraft = true) => {
    if (clearDraft)
      transactions.save(draftIdentity, [], null)
    controller.invalidate(clearDraft)
    draftIdentity = transactions.keyOf(moment.value.id)
    const draft = transactions.read(draftIdentity)
    state.tokens = draft?.tokens.map(token => ({ ...token })) ?? []
    state.selectedTopic = draft?.topic ? { ...draft.topic } : null
    joinPendingDraft()
  }

  onUnmounted(() => {
    disposed = true
    controller.dispose()
  })

  return {
    state,
    beginEditing: controller.beginEditing,
    setTokens,
    selectTopic,
    clearTopic,
    submit: controller.submit,
    invalidate,
  }
}
