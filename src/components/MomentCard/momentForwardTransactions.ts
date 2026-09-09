import type { InjectionKey } from 'vue'
import { reactive, readonly } from 'vue'

import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

import type { MomentForwardToken, SelectedMomentTopic } from './momentForwardContent'
import { buildMomentForwardRequest, buildMomentForwardSubmitCheck, getMomentForwardResponseCode, resolveForwardCountAfterSuccess, serializeMomentForwardContents } from './momentForwardContent'

interface ForwardDraft {
  tokens: MomentForwardToken[]
  topic: SelectedMomentTopic | null
  revision: number
  pending?: Promise<unknown>
}

// This is the existing 20-draft memory budget, now also retaining issued writes
// until their result is reconciled. No draft or transaction is persisted to disk.
const MAX_CACHED_DRAFTS = 20
const drafts = new Map<string, ForwardDraft>()
let draftRevision = 0

function trimDrafts() {
  let remaining = [...drafts.values()].filter(draft => !draft.pending).length
  for (const [key, draft] of drafts) {
    if (remaining <= MAX_CACHED_DRAFTS)
      break
    if (!draft.pending) {
      drafts.delete(key)
      remaining--
    }
  }
}

export function createMomentForwardTransactions(
  getAccountId: () => AccountId,
  commitCount: (momentId: string, count: number) => void,
) {
  const lifetime = createAccountLifetime(getAccountId)
  const joined = reactive(new Map<string, Promise<unknown>>())

  const keyOf = (momentId: string) => `${getAccountId() ?? 'guest'}:${momentId}`
  const read = (key: string) => drafts.get(key)
  function save(key: string, tokens: MomentForwardToken[], topic: SelectedMomentTopic | null) {
    const previous = drafts.get(key)
    if (previous && JSON.stringify([previous.tokens, previous.topic]) === JSON.stringify([tokens, topic]))
      return previous
    const next: ForwardDraft = previous ?? { tokens: [], topic: null, revision: 0 }
    next.tokens = tokens.map(token => ({ ...token }))
    next.topic = topic ? { ...topic } : null
    next.revision = ++draftRevision
    drafts.delete(key)
    if (tokens.length || topic || next.pending)
      drafts.set(key, next)
    trimDrafts()
    return next
  }

  function join(momentId: string, task: Promise<unknown>, forwardCount: number) {
    if (joined.get(momentId) === task)
      return
    joined.set(momentId, task)
    const owner = lifetime.capture()
    void task.then((response) => {
      if (owner.isCurrent() && getMomentForwardResponseCode(response) === 0)
        commitCount(momentId, resolveForwardCountAfterSuccess(response, forwardCount))
    }).catch(() => {}).finally(() => {
      if (joined.get(momentId) === task)
        joined.delete(momentId)
    })
  }

  function submit(momentId: string, tokens: MomentForwardToken[], topic: SelectedMomentTopic | null, forwardCount: number, isViewCurrent: () => boolean) {
    const key = keyOf(momentId)
    const pending = drafts.get(key)?.pending
    if (pending) {
      join(momentId, pending, forwardCount)
      return pending
    }
    const owner = lifetime.capture()
    const csrf = getCSRF()
    const isCurrent = () => owner.isCurrent() && isViewCurrent() && String(getUserID()) === String(owner.accountId)
    if (!isCurrent())
      return Promise.resolve({ code: -101 })
    if (!csrf)
      return Promise.resolve({ code: -111 })
    const draft = save(key, tokens, topic)
    const revision = draft.revision
    // Empty forwards are valid, so retain their transaction even without text.
    drafts.set(key, draft)
    const snapshotTokens = tokens.map(token => ({ ...token }))
    const snapshotTopic = topic ? { ...topic } : null
    const task = (async () => {
      if (serializeMomentForwardContents(snapshotTokens).length) {
        const check = await api.moment.checkMomentCreate({ ...buildMomentForwardSubmitCheck(snapshotTokens), platform: 'web', csrf })
        if (getMomentForwardResponseCode(check) !== 0)
          return check
      }
      if (!isCurrent())
        return { code: -1 }
      // From this point the server owns the write. View disposal can prevent
      // another step, but cannot cancel this request or erase its outcome.
      const response = await api.moment.createMoment({
        ...buildMomentForwardRequest({ momentId, mid: String(owner.accountId), tokens: snapshotTokens, topic: snapshotTopic }),
        platform: 'web',
        csrf,
      })
      if (getMomentForwardResponseCode(response) === 0 && drafts.get(key) === draft && draft.revision === revision) {
        draft.tokens = []
        draft.topic = null
      }
      return response
    })().finally(() => {
      if (draft.pending === task) {
        draft.pending = undefined
        if (drafts.get(key) === draft && !draft.tokens.length && !draft.topic)
          drafts.delete(key)
      }
      trimDrafts()
    })
    draft.pending = task
    join(momentId, task, forwardCount)
    return task
  }

  return { keyOf, read, save, submit, join, pending: readonly(joined), invalidate: lifetime.invalidate, dispose: lifetime.dispose }
}

export const MOMENT_FORWARD_TRANSACTIONS: InjectionKey<ReturnType<typeof createMomentForwardTransactions>> = Symbol('moment-forward-transactions')
