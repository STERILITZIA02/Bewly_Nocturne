/** Shared extension state that pages subscribe to instead of receiving broadcasts. */
export type StateTopic = 'topBar' | 'watchLater' | 'videoHistory'

export interface StateConsumerRegistration {
  topic: StateTopic
  /** False while the page has no current display need (hidden or unmounted UI). */
  active: boolean
}

export interface StateConsumerReply {
  /** The topic changed while this consumer was inactive: reconcile once. */
  stale: boolean
}

export const STATE_CONSUMER_MESSAGE = {
  REGISTER: 'stateConsumer:register',
  RELEASE: 'stateConsumer:release',
} as const
