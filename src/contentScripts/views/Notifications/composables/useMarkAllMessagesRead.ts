import type { MaybeRefOrGetter } from 'vue'
import { onScopeDispose, reactive, toValue, watch } from 'vue'

import { parsePrivateSessionsResponse } from '~/background/privateMessage/protocol'
import type { PrivateMessageApiResponse, PrivateSession } from '~/background/privateMessage/types'
import { waitForDelay } from '~/utils/abort'

import type { NativeNotificationSection } from '../notificationSections'

export interface MarkAllMessagesReadState {
  status: 'idle' | 'running' | 'success' | 'partial' | 'error'
}

interface Dependencies {
  active: () => boolean
  currentAccount: () => string
  fetchSessions: (endTs?: number) => Promise<unknown>
  ackSession: (session: PrivateSession) => Promise<unknown>
  sessionRead: (session: PrivateSession) => void
  markNotification: (section: NativeNotificationSection) => Promise<boolean>
  syncUnread: () => Promise<unknown>
  wait?: (signal: AbortSignal) => Promise<void>
}

const SECTIONS: NativeNotificationSection[] = ['reply', 'at', 'love', 'system']
const READ_ALL_REQUEST_INTERVAL_MS = 200

function response(value: unknown): PrivateMessageApiResponse | null {
  return value && typeof value === 'object' && 'code' in value && typeof value.code === 'number'
    ? value as PrivateMessageApiResponse
    : null
}

export function useMarkAllMessagesRead(mid: MaybeRefOrGetter<string>, dependencies: Dependencies) {
  const state = reactive<MarkAllMessagesReadState>({ status: 'idle' })
  let operation: AbortController | undefined
  let disposed = false

  function reset() {
    operation?.abort()
    operation = undefined
    state.status = 'idle'
  }

  async function markAllRead() {
    if (disposed || operation || !dependencies.active())
      return
    const account = toValue(mid)
    if (!account || dependencies.currentAccount() !== account)
      return
    const controller = new AbortController()
    operation = controller
    state.status = 'running'
    const current = () => !disposed && operation === controller && !controller.signal.aborted
      && dependencies.active() && toValue(mid) === account && dependencies.currentAccount() === account
    const assertCurrent = () => {
      if (!current())
        throw new Error('Read operation cancelled')
    }
    const pace = () => dependencies.wait?.(controller.signal) ?? waitForDelay(READ_ALL_REQUEST_INTERVAL_MS, controller.signal)
    let succeeded = 0
    let failed = 0
    try {
      // Explicit bulk intent is the only path that reads inactive categories.
      // Each category keeps its own existing server-read/merge-head contract.
      for (const section of SECTIONS) {
        assertCurrent()
        try {
          if (await dependencies.markNotification(section))
            succeeded++
          else
            failed++
        }
        catch {
          failed++
        }
      }

      let endTs: number | undefined
      const acknowledged = new Set<string>()
      try {
        while (current()) {
          const raw = response(await dependencies.fetchSessions(endTs))
          assertCurrent()
          const page = raw && parsePrivateSessionsResponse(raw)
          if (!page?.data)
            throw new Error('Invalid session page')
          for (const session of page.data.session_list) {
            if (session.unread_count <= 0)
              continue
            const key = `${session.session_type}:${session.talker_id}:${session.max_seqno}`
            if (acknowledged.has(key))
              continue
            // This workspace's verified ACK contract is one-to-one Web IM.
            // Never clear unsupported sessions only in local state.
            if (session.session_type !== 1 || !/^[1-9]\d*$/.test(session.max_seqno)) {
              failed++
              continue
            }
            await pace()
            assertCurrent()
            try {
              const ack = response(await dependencies.ackSession(session))
              assertCurrent()
              if (ack?.code !== 0)
                throw new Error('Session ACK failed')
              acknowledged.add(key)
              dependencies.sessionRead(session)
              succeeded++
            }
            catch {
              assertCurrent()
              // Stop the write sequence after rejection (including risk control).
              // Retry is explicit and starts from fresh server session metadata.
              throw new Error('Session ACK failed')
            }
          }
          if (!page.data.has_more)
            break
          const next = Math.min(...page.data.session_list.map(session => session.session_ts).filter(ts => Number.isFinite(ts) && ts > 0))
          if (!Number.isFinite(next) || (endTs !== undefined && next >= endTs))
            throw new Error('Session cursor stalled')
          endTs = next
          await pace()
        }
      }
      catch {
        assertCurrent()
        failed++
      }
      assertCurrent()
      try {
        await dependencies.syncUnread()
      }
      catch {
        failed++
      }
      assertCurrent()
      state.status = failed ? (succeeded ? 'partial' : 'error') : 'success'
    }
    catch {
      if (current())
        state.status = 'error'
    }
    finally {
      if (operation === controller) {
        operation = undefined
        if (state.status === 'running')
          state.status = 'idle'
      }
    }
  }

  watch(() => [toValue(mid), dependencies.active()], reset, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    reset()
  })
  return { state, markAllRead }
}

export type MarkAllMessagesReadController = ReturnType<typeof useMarkAllMessagesRead>
