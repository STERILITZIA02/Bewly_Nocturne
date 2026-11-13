import type { InjectionKey, Ref } from 'vue'
import { onScopeDispose, reactive, watch } from 'vue'

import type { PrivateSessionActionState, PrivateSessionMutation, PrivateSessionTarget, PrivateUserReport } from '~/background/privateMessage/sessionActions'
import { asRecord } from '~/utils/plainObject'

import type { DisplayPrivateSession } from './privateSession'

interface Dependencies {
  active: () => boolean
  getCsrf: () => string
  detail: (target: PrivateSessionTarget) => Promise<unknown>
  settings: (target: { talkerId: string }) => Promise<unknown>
  relation: (id: string) => Promise<unknown>
  mutate: (action: 'top' | 'dnd' | 'push', input: PrivateSessionMutation) => Promise<unknown>
  block: (account: string, id: string) => Promise<unknown>
  report: (input: PrivateUserReport) => Promise<unknown>
  messages: (id: string) => Promise<unknown>
  reconcile: (detail: PrivateSessionActionState) => void
  blocked: (session: DisplayPrivateSession) => void
}

class ActionRequestError extends Error {
  constructor(readonly kind: string, readonly code: number | null = null) {
    super(kind)
  }
}

function dataOf(value: unknown): Record<string, unknown> {
  const response = value as { code?: unknown, bewlyError?: { kind?: string } } | null
  if (!response || typeof response !== 'object' || response.code !== 0) {
    const code = typeof response?.code === 'number' ? response.code : null
    const kind = response?.bewlyError?.kind ?? (code === -101 ? 'login-required' : code === -403 || code === -412 ? 'risk-control' : 'api-error')
    throw new ActionRequestError(kind, code)
  }
  const data = (value as { data?: unknown }).data
  if (data == null)
    return {}
  const record = asRecord(data)
  if (!record)
    throw new ActionRequestError('invalid-response')
  return record
}

export function canManagePrivateUser(session: DisplayPrivateSession) {
  return session.sessionType === 1 && ['user', 'unfollowed-user', 'intercepted-user'].includes(session.kind)
}

export function canManagePrivateSession(session: DisplayPrivateSession) {
  return [1, 2].includes(session.sessionType) && /^[1-9]\d*$/.test(session.talkerId)
    && !['system', 'unsupported'].includes(session.kind)
}

interface SessionIntent { action: 'top' | 'dnd' | 'push' | 'block', enabled: boolean }
type SessionMutation
  = | { phase: 'idle' | 'sending' | 'reported' }
    | { phase: 'verifying' | 'unconfirmed', intent: SessionIntent }

export function usePrivateSessionActions(mid: Ref<string>, dependencies: Dependencies) {
  const state = reactive({
    target: null as DisplayPrivateSession | null,
    readPhase: 'idle' as 'idle' | 'details' | 'evidence',
    mutation: { phase: 'idle' } as SessionMutation,
    get loading() { return this.readPhase !== 'idle' },
    get busy() { return this.mutation.phase === 'sending' || this.mutation.phase === 'verifying' },
    get unconfirmed() { return this.mutation.phase === 'unconfirmed' },
    get reported() { return this.mutation.phase === 'reported' },
    ready: false,
    detailReady: false,
    relationReady: false,
    settingsReady: false,
    error: '',
    errorCode: null as number | null,
    pinned: false,
    muted: false,
    blocked: false,
    pushAvailable: false,
    pushEnabled: false,
  })
  let generation = 0
  let disposed = false
  let write: { phase: 'sending' | 'accepted' } | undefined
  let messageKeys: string[] | null = null
  const current = (epoch: number, account: string) => !disposed && epoch === generation && account === mid.value && dependencies.active()

  function close() {
    generation++
    messageKeys = null
    Object.assign(state, { target: null, ready: false, detailReady: false, relationReady: false, settingsReady: false, readPhase: 'idle', mutation: { phase: 'idle' }, error: '', errorCode: null, pinned: false, muted: false, blocked: false, pushAvailable: false, pushEnabled: false })
  }
  function recordError(error: unknown, fallback: string) {
    const kind = error instanceof ActionRequestError ? error.kind : ''
    const known = ['login-required', 'risk-control', 'network', 'server-error', 'invalid-response', 'wbi-unavailable']
    state.error = known.includes(kind) ? `errors.${kind}` : fallback
    state.errorCode = error instanceof ActionRequestError ? error.code : null
  }
  async function readDetail(session: DisplayPrivateSession, epoch: number, account: string) {
    const target = { talkerId: session.talkerId, sessionType: session.sessionType as 1 | 2 }
    const detail = dataOf(await dependencies.detail(target))
    if (!current(epoch, account))
      return false
    if (String(detail.talker_id) !== session.talkerId || detail.session_type !== session.sessionType || typeof detail.top_ts !== 'number' || !Number.isFinite(detail.top_ts) || detail.top_ts < 0 || (detail.is_dnd !== 0 && detail.is_dnd !== 1))
      throw new ActionRequestError('invalid-response')
    Object.assign(state, { pinned: detail.top_ts > 0, muted: detail.is_dnd === 1, detailReady: true })
    dependencies.reconcile({ talker_id: session.talkerId, session_type: target.sessionType, top_ts: detail.top_ts, is_dnd: detail.is_dnd })
    return true
  }
  async function readSettings(session: DisplayPrivateSession, epoch: number, account: string) {
    const settings = dataOf(session.sessionType === 1 ? await dependencies.settings({ talkerId: session.talkerId }) : { code: 0, data: { show_push_setting: 0 } })
    if (!current(epoch, account))
      return false
    if ((settings.show_push_setting !== 0 && settings.show_push_setting !== 1) || (settings.show_push_setting === 1 && settings.push_setting !== 0 && settings.push_setting !== 1))
      throw new ActionRequestError('invalid-response')
    Object.assign(state, { pushAvailable: settings.show_push_setting === 1, pushEnabled: settings.push_setting === 0, settingsReady: true })
    return true
  }
  async function readRelation(session: DisplayPrivateSession, epoch: number, account: string) {
    const relation = dataOf(canManagePrivateUser(session) ? await dependencies.relation(session.talkerId) : { code: 0, data: {} })
    if (!current(epoch, account))
      return false
    const attribute = Object.hasOwn(relation, session.talkerId) ? asRecord(relation[session.talkerId])?.attribute : 0
    if (canManagePrivateUser(session) && (typeof attribute !== 'number' || ![0, 1, 2, 6, 128].includes(attribute)))
      throw new ActionRequestError('invalid-response')
    Object.assign(state, { blocked: attribute === 128, relationReady: true })
    return true
  }
  async function read(session: DisplayPrivateSession, epoch: number, account: string) {
    Object.assign(state, { detailReady: false, relationReady: false, settingsReady: false })
    const results = await Promise.allSettled([readDetail(session, epoch, account), readSettings(session, epoch, account), readRelation(session, epoch, account)])
    if (!current(epoch, account))
      return false
    state.ready = true
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected')
      recordError(failure.reason, 'load_failed')
    return true
  }
  async function refresh() {
    const session = state.target
    if (!session || state.loading || state.busy)
      return
    const epoch = generation
    const account = mid.value
    const pendingIntent = state.mutation.phase === 'unconfirmed' ? state.mutation.intent : null
    state.readPhase = 'details'
    state.error = ''
    state.errorCode = null
    try {
      if (pendingIntent?.action === 'block') {
        if (!await readRelation(session, epoch, account))
          return
        if (!state.blocked)
          throw new Error('not-reconciled')
        state.blocked = true
        dependencies.blocked(session)
      }
      else {
        if (pendingIntent) {
          const reader = pendingIntent.action === 'push' ? readSettings : readDetail
          if (!await reader(session, epoch, account))
            return
          const actual = pendingIntent.action === 'top' ? state.pinned : pendingIntent.action === 'dnd' ? state.muted : state.pushEnabled
          if (actual !== pendingIntent.enabled)
            throw new Error('not-reconciled')
        }
        else if (!await read(session, epoch, account)) {
          return
        }
      }
      if (pendingIntent)
        state.mutation = { phase: 'idle' }
    }
    catch (error) {
      if (current(epoch, account)) {
        recordError(error, 'load_failed')
        if (state.unconfirmed)
          state.error = 'unconfirmed'
      }
    }
    finally {
      if (current(epoch, account))
        state.readPhase = 'idle'
    }
  }
  async function open(session: DisplayPrivateSession) {
    if (write || disposed || !mid.value || !dependencies.active() || !canManagePrivateSession(session))
      return false
    close()
    state.target = session
    state.pinned = session.pinned
    state.muted = session.muted
    await refresh()
    return true
  }
  async function perform(action: 'top' | 'dnd' | 'push' | 'block' | 'report', report?: { reason: number, description: string }) {
    const session = state.target
    const account = mid.value
    const epoch = generation
    const csrf = dependencies.getCsrf()
    if (!session || !account || !current(epoch, account) || !state.ready || state.loading || write || state.unconfirmed || state.reported)
      return false
    if (!csrf) {
      recordError(new ActionRequestError('login-required'), 'write_failed')
      return false
    }
    if ((action === 'top' || action === 'dnd') && !state.detailReady)
      return false
    if ((action === 'block' || action === 'report') && !canManagePrivateUser(session))
      return false
    if (action === 'block' && (!state.relationReady || state.blocked))
      return false
    if (action === 'push' && (!state.settingsReady || !state.pushAvailable))
      return false
    if (action === 'report' && (!report || messageKeys === null))
      return false
    const enabled = action === 'top' ? !state.pinned : action === 'dnd' ? !state.muted : !state.pushEnabled
    const task = { phase: 'sending' as 'sending' | 'accepted' }
    write = task
    state.mutation = { phase: 'sending' }
    state.error = ''
    state.errorCode = null
    try {
      const response = action === 'block'
        ? await dependencies.block(account, session.talkerId)
        : action === 'report'
          ? await dependencies.report({ talkerId: session.talkerId, csrf, reason: report!.reason, description: report!.description, messageKeys: messageKeys! })
          : await dependencies.mutate(action, { talkerId: session.talkerId, sessionType: session.sessionType as 1 | 2, uid: account, csrf, enabled })
      dataOf(response)
      task.phase = 'accepted'
      if (!current(epoch, account))
        return false
      if (action === 'report') {
        state.mutation = { phase: 'reported' }
        return true
      }
      state.mutation = { phase: 'verifying', intent: { action, enabled } }
      if (action === 'block') {
        if (!await readRelation(session, epoch, account))
          return false
        if (!state.blocked)
          throw new Error('not-reconciled')
        state.blocked = true
        state.mutation = { phase: 'idle' }
        dependencies.blocked(session)
        return true
      }
      if (!await (action === 'push' ? readSettings : readDetail)(session, epoch, account))
        return false
      const verified = action === 'top' ? state.pinned === enabled : action === 'dnd' ? state.muted === enabled : state.pushEnabled === enabled
      if (!verified)
        throw new Error('not-reconciled')
      state.mutation = { phase: 'idle' }
      return true
    }
    catch (error) {
      if (current(epoch, account)) {
        recordError(error, 'write_failed')
        if (state.mutation.phase === 'verifying') {
          state.mutation = { phase: 'unconfirmed', intent: state.mutation.intent }
          state.error = 'unconfirmed'
        }
        else if (task.phase === 'sending') {
          state.mutation = { phase: 'idle' }
        }
      }
      return false
    }
    finally {
      if (write === task)
        write = undefined
    }
  }
  async function prepareReport() {
    const session = state.target
    if (!session || !canManagePrivateUser(session) || state.loading || state.busy)
      return false
    const epoch = generation
    const account = mid.value
    state.readPhase = 'evidence'
    messageKeys = null
    state.error = ''
    state.errorCode = null
    try {
      const data = dataOf(await dependencies.messages(session.talkerId))
      if (!current(epoch, account))
        return false
      if (!Array.isArray(data.messages))
        throw new Error('invalid-evidence')
      const keys = data.messages.slice(0, 10).map((item: unknown) => {
        const key = asRecord(item)?.msg_key
        return typeof key === 'string' ? key : ''
      })
      if (!keys.every(key => /^[1-9]\d*$/.test(key)))
        throw new Error('invalid-evidence')
      messageKeys = keys
      return true
    }
    catch (error) {
      if (current(epoch, account))
        recordError(error, 'load_failed')
      return false
    }
    finally {
      if (current(epoch, account))
        state.readPhase = 'idle'
    }
  }
  watch([mid, dependencies.active], close, { flush: 'sync' })
  const onVisibility = () => {
    if (document.hidden)
      close()
  }
  watch(() => Boolean(state.target), (open) => {
    document.removeEventListener('visibilitychange', onVisibility)
    if (open)
      document.addEventListener('visibilitychange', onVisibility)
  }, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    close()
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return { state, open, close, refresh, perform, prepareReport }
}

export type PrivateSessionActions = ReturnType<typeof usePrivateSessionActions>
export const privateSessionActionsKey: InjectionKey<PrivateSessionActions> = Symbol('private-session-actions')
