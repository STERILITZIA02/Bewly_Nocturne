import type { Ref } from 'vue'
import { onUnmounted, reactive } from 'vue'

import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

import type { MomentForwardEmotePackage, MomentForwardSubmissionState } from './momentForwardContent'
import {
  buildMomentForwardRequest,
  buildMomentForwardSubmitCheck,
  createMomentForwardSubmissionController,
  getMomentForwardResponseCode,
  getMomentForwardResponseMessage,
  normalizeMomentForwardEmotePackages,
  serializeMomentForwardContents,
} from './momentForwardContent'
import type { DisplayMoment } from './types'

let cachedEmoteAccountId = ''
let cachedMomentEmotes: MomentForwardEmotePackage[] | undefined
let momentEmotesRequest: Promise<MomentForwardEmotePackage[]> | undefined
let momentEmotesRequestAccountId = ''
const MAX_CACHED_MOMENT_FORWARD_DRAFTS = 20
const momentForwardDraftCache = new Map<string, {
  tokens: MomentForwardSubmissionState['tokens']
  selectedTopic: MomentForwardSubmissionState['selectedTopic']
}>()

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
  const getIdentity = () => `${accountId.value || 'guest'}:${getUserID() ?? 'guest'}:${moment.value.id}`
  let draftIdentity = getIdentity()
  const cachedDraft = momentForwardDraftCache.get(draftIdentity)
  const state = reactive<MomentForwardSubmissionState>({
    status: cachedDraft ? 'editing' : 'idle',
    tokens: cachedDraft?.tokens.map(token => ({ ...token })) ?? [],
    selectedTopic: cachedDraft?.selectedTopic ? { ...cachedDraft.selectedTopic } : null,
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
      const mid = storeMid
      const csrf = getCSRF()
      if (!csrf)
        throw new Error(messages.csrfUnavailable)
      const momentId = String(moment.value.id || '').trim()
      if (!momentId)
        throw new Error(messages.momentUnavailable)

      if (serializeMomentForwardContents(tokens).length) {
        const checkPayload = buildMomentForwardSubmitCheck(tokens)
        const checkResponse = await api.moment.checkMomentCreate({
          ...checkPayload,
          platform: 'web',
          csrf,
        })
        if (getMomentForwardResponseCode(checkResponse) !== 0)
          return checkResponse
      }
      if (!context.isCurrent())
        return { code: -1, message: 'Stale moment forward request' }

      const payload = buildMomentForwardRequest({
        momentId,
        mid,
        tokens,
        topic,
      })
      return api.moment.createMoment({
        ...payload,
        platform: 'web',
        csrf,
      })
    },
  })

  const persistDraft = () => {
    const nextIdentity = getIdentity()
    if (nextIdentity !== draftIdentity)
      momentForwardDraftCache.delete(draftIdentity)
    draftIdentity = nextIdentity
    if (state.tokens.length || state.selectedTopic) {
      momentForwardDraftCache.delete(draftIdentity)
      momentForwardDraftCache.set(draftIdentity, {
        tokens: state.tokens.map(token => ({ ...token })),
        selectedTopic: state.selectedTopic ? { ...state.selectedTopic } : null,
      })
      while (momentForwardDraftCache.size > MAX_CACHED_MOMENT_FORWARD_DRAFTS) {
        const oldestKey = momentForwardDraftCache.keys().next().value
        if (typeof oldestKey !== 'string')
          break
        momentForwardDraftCache.delete(oldestKey)
      }
    }
    else {
      momentForwardDraftCache.delete(draftIdentity)
    }
  }

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
  const submit = async () => {
    const result = await controller.submit()
    if (result.applied && result.success)
      momentForwardDraftCache.delete(draftIdentity)
    else
      persistDraft()
    return result
  }
  const invalidate = (clearDraft = true) => {
    momentForwardDraftCache.delete(draftIdentity)
    controller.invalidate(clearDraft)
    draftIdentity = getIdentity()
    if (clearDraft)
      momentForwardDraftCache.delete(draftIdentity)
    else
      persistDraft()
  }

  onUnmounted(() => {
    persistDraft()
    controller.dispose()
  })

  return {
    state,
    beginEditing: controller.beginEditing,
    setTokens,
    selectTopic,
    clearTopic,
    submit,
    invalidate,
  }
}
