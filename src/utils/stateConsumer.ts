import type { StateConsumerReply, StateTopic } from '~/constants/stateConsumers'
import { STATE_CONSUMER_MESSAGE } from '~/constants/stateConsumers'

import { isExtensionContextInvalidatedError, reportRuntimeFailure, sendMessage } from './messaging'

const followed = new Map<StateTopic, () => void>()
let pageListenersAttached = false

function report(topic: StateTopic, active: boolean) {
  return sendMessage<{ topic: StateTopic, active: boolean }, StateConsumerReply | undefined>(STATE_CONSUMER_MESSAGE.REGISTER, { topic, active })
    .then(reply => reply?.stale === true)
    .catch((error) => {
      if (!isExtensionContextInvalidatedError(error))
        reportRuntimeFailure(`Failed to update the ${topic} subscription`, error)
      return false
    })
}

function attachPageListeners() {
  if (pageListenersAttached || typeof document === 'undefined')
    return
  pageListenersAttached = true
  const syncActivity = () => {
    for (const [topic, onStale] of followed) {
      void report(topic, !document.hidden).then((stale) => {
        if (stale && !document.hidden)
          onStale()
      })
    }
  }
  document.addEventListener('visibilitychange', syncActivity)
  // The document leaves (navigation or close); a bfcache return registers again.
  window.addEventListener('pagehide', () => {
    if (followed.size)
      void sendMessage(STATE_CONSUMER_MESSAGE.RELEASE, {}).catch(() => {})
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted)
      syncActivity()
  })
}

/**
 * The background registers this document when it reads a topic. A hidden page
 * reports that it has no display need, so the background only marks it stale;
 * on return it reconciles once through `onStale` instead of receiving every
 * intermediate broadcast.
 */
export function followStateTopic(topic: StateTopic, onStale: () => void) {
  if (followed.has(topic))
    return
  followed.set(topic, onStale)
  attachPageListeners()
}

/** For a topic whose display need is owned by a component (e.g. TopBar). */
export function reportStateTopicActive(topic: StateTopic, active: boolean) {
  return report(topic, active)
}
