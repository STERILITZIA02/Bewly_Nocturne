import type { Ref } from 'vue'
import { onScopeDispose, reactive, watch } from 'vue'

import type { PrivateSession } from '~/background/privateMessage/types'
import type { PrivateConversationRoute } from '~/utils/privateConversationRoute'

import type { TransientPrivateRecipient } from './privateRecipientSearch'
import { extractPrivateUserCards, transformPrivateSessions } from './privateSession'
import type { PrivateSessionsController } from './usePrivateSessions'

export function usePrivateConversationTarget(options: {
  account: Ref<string>
  route: Ref<PrivateConversationRoute | null>
  active: () => boolean
  sessions: PrivateSessionsController
  fetchTarget: (route: PrivateConversationRoute) => Promise<unknown>
  fetchCards: (ids: string[]) => Promise<unknown>
  selectRecipient: (recipient: TransientPrivateRecipient | null) => void
}) {
  const state = reactive({ loading: false, failed: false })
  let generation = 0
  let requestedKey = ''
  let disposed = false
  const identity = () => `${options.account.value}:${options.active()}:${options.route.value?.sessionType}:${options.route.value?.talkerId}`
  const key = () => `${options.account.value}:${options.route.value?.sessionType}:${options.route.value?.talkerId}`
  async function resolve() {
    const route = options.route.value
    if (!route || !options.account.value || !options.active() || !options.sessions.state.loaded)
      return
    const existing = options.sessions.state.items.find(item => item.key === `${route.sessionType}:${route.talkerId}`)
    if (existing) {
      generation++
      state.loading = false
      state.failed = false
      options.selectRecipient(null)
      options.sessions.selectSession(existing)
      return
    }
    if (requestedKey === key())
      return
    requestedKey = key()
    const owner = identity()
    const version = ++generation
    const current = () => !disposed && version === generation && owner === identity()
    state.loading = true
    state.failed = false
    try {
      const [raw, cards] = await Promise.all([options.fetchTarget(route), options.fetchCards([route.talkerId])])
      if (!current())
        return
      const result = raw as { code?: number, data?: { session?: PrivateSession | null } }
      if (result?.code !== 0 || !result.data || !('session' in result.data))
        throw new Error('Invalid conversation target')
      if (result.data.session) {
        const [session] = transformPrivateSessions([result.data.session], cards)
        if (!session || session.key !== `${route.sessionType}:${route.talkerId}`)
          throw new Error('Mismatched conversation target')
        options.sessions.includeRouteSession(session)
        options.selectRecipient(null)
        options.sessions.selectSession(session)
      }
      else {
        const card = extractPrivateUserCards(cards).find(card => card.mid === route.talkerId)
        if (route.sessionType !== 1 || !card?.name)
          throw new Error('Missing recipient')
        options.sessions.clearSelectedSession()
        options.selectRecipient({ ...card, source: 'global' })
      }
    }
    catch {
      if (current())
        state.failed = true
    }
    finally {
      if (current())
        state.loading = false
    }
  }
  watch(identity, () => {
    generation++
    requestedKey = ''
    state.loading = false
    state.failed = false
    void resolve()
  }, { flush: 'sync' })
  watch(() => [options.sessions.state.loaded, options.sessions.state.items], () => void resolve(), { immediate: true })
  onScopeDispose(() => {
    disposed = true
    generation++
  })
  return { state, resolve, retry: () => {
    requestedKey = ''
    return resolve()
  } }
}
