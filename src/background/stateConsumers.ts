import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import type { StateConsumerRegistration, StateConsumerReply, StateTopic } from '~/constants/stateConsumers'
import { STATE_CONSUMER_MESSAGE } from '~/constants/stateConsumers'
import { onMessage } from '~/utils/messaging'

interface ConsumerTopic {
  active: boolean
  /** Something changed while inactive: one reconcile is due on resume. */
  stale: boolean
  /** Last delivered revision per resource, so equal snapshots are not resent. */
  delivered: Record<string, string>
}

interface Consumer {
  tabId: number
  frameId: number
  documentId?: string
  privacy: 'private' | 'normal'
  topics: Partial<Record<StateTopic, ConsumerTopic>>
}

export interface StateConsumerBrowser {
  storage?: { session?: Pick<Browser.Storage.StorageAreaWithUsage, 'get' | 'set'> }
  tabs: Pick<Browser.Tabs.Static, 'sendMessage'> & {
    onRemoved?: Pick<Browser.Tabs.Static['onRemoved'], 'addListener'>
  }
}

export interface StateDelivery {
  /** Resource whose revision is compared per consumer (e.g. `unread`). */
  resource?: string
  /** Monotonic description of the delivered content; equal values are skipped. */
  revision?: string
}

const STORAGE_KEY = 'stateConsumers:v1'

function privacyOf(tab?: Browser.Tabs.Tab): Consumer['privacy'] {
  return tab?.incognito ? 'private' : 'normal'
}

/**
 * Pages that actually use a shared state topic, keyed by tab, frame and
 * document. Delivery goes to active subscribers of the same privacy context
 * only; inactive ones are marked stale and reconcile once when they resume.
 * Entries leave on tab close, the document's pagehide release, replacement by
 * a new document in the same frame, or a failed delivery.
 * The registry lives in session storage, so a restarted worker keeps it
 * without keep-alive timers; consumers still re-register on every activation.
 */
export function createStateConsumerRegistry(extensionApi: StateConsumerBrowser = browser) {
  const consumers = new Map<string, Consumer>()
  const session = extensionApi.storage?.session
  let loaded: Promise<void> | undefined
  let persistQueued = false
  let dirty = false

  async function load() {
    loaded ??= (async () => {
      try {
        const stored = (await session?.get(STORAGE_KEY))?.[STORAGE_KEY]
        if (stored && typeof stored === 'object') {
          for (const [key, value] of Object.entries(stored as Record<string, Consumer>)) {
            if (value && Number.isSafeInteger(value.tabId) && Number.isSafeInteger(value.frameId) && value.topics)
              consumers.set(key, value)
          }
        }
      }
      catch {
        // Without session storage the registry lives with this worker.
      }
    })()
    await loaded
  }

  // Registration changes are rare; coalesce one write per task.
  function persist() {
    dirty = true
    if (!session || persistQueued)
      return
    persistQueued = true
    queueMicrotask(() => {
      persistQueued = false
      if (!dirty)
        return
      dirty = false
      void session.set({ [STORAGE_KEY]: Object.fromEntries(consumers) }).catch(() => {})
    })
  }

  function keyOf(sender?: Browser.Runtime.MessageSender) {
    const tabId = sender?.tab?.id
    return tabId === undefined ? undefined : `${tabId}:${sender?.frameId ?? 0}`
  }

  function removeTab(tabId: number) {
    let changed = false
    for (const [key, consumer] of consumers) {
      if (consumer.tabId === tabId) {
        consumers.delete(key)
        changed = true
      }
    }
    if (changed)
      persist()
  }

  extensionApi.tabs.onRemoved?.addListener(tabId => void load().then(() => removeTab(tabId)))

  async function register({ topic, active }: StateConsumerRegistration, sender?: Browser.Runtime.MessageSender): Promise<StateConsumerReply> {
    await load()
    const key = keyOf(sender)
    if (!key || !sender?.tab?.id)
      return { stale: false }
    let consumer = consumers.get(key)
    const documentId = (sender as { documentId?: string }).documentId
    if (!consumer || (documentId && consumer.documentId && consumer.documentId !== documentId)) {
      consumer = { tabId: sender.tab.id, frameId: sender.frameId ?? 0, documentId, privacy: privacyOf(sender.tab), topics: {} }
      consumers.set(key, consumer)
    }
    const entry = consumer.topics[topic] ??= { active, stale: false, delivered: {} }
    const stale = active && entry.stale
    entry.active = active
    if (active)
      entry.stale = false
    // An inactive page may miss deliveries; resend nothing it already has.
    if (!active)
      entry.delivered = {}
    persist()
    return { stale }
  }

  function release({ topic }: { topic?: StateTopic }, sender?: Browser.Runtime.MessageSender) {
    const key = keyOf(sender)
    const consumer = key ? consumers.get(key) : undefined
    if (!consumer)
      return
    if (topic)
      delete consumer.topics[topic]
    if (!topic || !Object.keys(consumer.topics).length)
      consumers.delete(key!)
    persist()
  }

  /** A read or claim proves an active display need of the sending document. */
  function touch(topic: StateTopic, sender?: Browser.Runtime.MessageSender) {
    return register({ topic, active: true }, sender)
  }

  /** One message per document that uses any of `topics`; inactive ones turn stale. */
  async function deliverOnce(topics: readonly StateTopic[], message: { type: string, data?: unknown }) {
    await load()
    const targets: Array<{ key: string, consumer: Consumer }> = []
    for (const [key, consumer] of consumers) {
      let active = false
      for (const topic of topics) {
        const entry = consumer.topics[topic]
        if (entry?.active)
          active = true
        else if (entry)
          entry.stale = true
      }
      if (active)
        targets.push({ key, consumer })
    }
    await Promise.all(targets.map(({ key, consumer }) => extensionApi.tabs.sendMessage(consumer.tabId, message, { frameId: consumer.frameId })
      .catch(() => {
        if (consumers.get(key) === consumer)
          consumers.delete(key)
      })))
    persist()
  }

  /** Send to active subscribers of `topic` in the sender's privacy context. */
  async function deliver(topic: StateTopic, message: { type: string, data?: unknown }, privacy: Consumer['privacy'], delivery: StateDelivery = {}) {
    await load()
    const targets: Array<{ key: string, consumer: Consumer }> = []
    let changed = false
    for (const [key, consumer] of consumers) {
      const entry = consumer.topics[topic]
      if (!entry || consumer.privacy !== privacy)
        continue
      if (!entry.active) {
        changed ||= !entry.stale
        entry.stale = true
        continue
      }
      if (delivery.resource && delivery.revision !== undefined) {
        if (entry.delivered[delivery.resource] === delivery.revision)
          continue
        entry.delivered[delivery.resource] = delivery.revision
        changed = true
      }
      targets.push({ key, consumer })
    }
    await Promise.all(targets.map(async ({ key, consumer }) => {
      try {
        await extensionApi.tabs.sendMessage(consumer.tabId, message, { frameId: consumer.frameId })
      }
      catch {
        // The document is gone (or never had a receiver); it registers again on load.
        if (consumers.get(key) === consumer) {
          consumers.delete(key)
          changed = true
        }
      }
    }))
    if (changed)
      persist()
  }

  return { register, release, touch, deliver, deliverOnce, privacyOf }
}

let sharedRegistry: ReturnType<typeof createStateConsumerRegistry> | undefined

export function getStateConsumerRegistry() {
  sharedRegistry ??= createStateConsumerRegistry()
  return sharedRegistry
}

export function setupStateConsumers() {
  const registry = getStateConsumerRegistry()
  onMessage<StateConsumerRegistration>(STATE_CONSUMER_MESSAGE.REGISTER, (data, sender) => registry.register(data, sender))
  onMessage<{ topic?: StateTopic }>(STATE_CONSUMER_MESSAGE.RELEASE, (data, sender) => registry.release(data ?? {}, sender))
  return registry
}
