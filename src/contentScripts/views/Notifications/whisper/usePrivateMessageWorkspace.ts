import type { Ref } from 'vue'

import type { PrivateMessageWritesDependencies } from './experimental/privateMessageWriteTypes'
import { useExperimentalPrivateMessageWrites } from './experimental/usePrivateMessageWrites'
import type { PrivateMessagesDependencies } from './usePrivateMessages'
import { usePrivateMessages } from './usePrivateMessages'

type PrivateMessageWorkspaceDependencies = Omit<PrivateMessagesDependencies, 'onMessagesReceived'>
  & Omit<PrivateMessageWritesDependencies, 'refreshHistory'>

/** One history/ACK owner, with transient Composer work reconciled from its responses. */
export function usePrivateMessageWorkspace(
  currentMid: Ref<string>,
  activeTalkerId: Ref<string>,
  dependencies: PrivateMessageWorkspaceDependencies,
) {
  const messages = usePrivateMessages(currentMid, activeTalkerId, {
    ...dependencies,
    onMessagesReceived: reconcileHistory,
  })
  const writes = useExperimentalPrivateMessageWrites(currentMid, activeTalkerId, {
    ...dependencies,
    refreshHistory: messages.refreshLatest,
  })

  function reconcileHistory(...args: Parameters<typeof writes.reconcileHistory>) {
    writes.reconcileHistory(...args)
  }

  function release() {
    writes.release()
    messages.release()
  }

  function dispose() {
    writes.dispose()
    messages.dispose()
  }

  function enforceCacheLimits() {
    messages.enforceCacheLimits()
    writes.enforceCacheLimits()
  }

  return { messages, writes, release, dispose, enforceCacheLimits }
}
