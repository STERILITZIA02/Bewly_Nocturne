import browser from 'webextension-polyfill'

import { onMessage } from '~/utils/messaging'
import type { SETTINGS_CLOUD_SYNC_AVAILABILITY_MESSAGE, SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE } from '~/utils/settingsCloudSyncProtocol'
import type { SETTINGS_STORAGE_PATCH_MESSAGE, SETTINGS_STORAGE_READ_MESSAGE } from '~/utils/settingsStorageProtocol'

type SettingsMessage = typeof SETTINGS_STORAGE_PATCH_MESSAGE | typeof SETTINGS_STORAGE_READ_MESSAGE
  | typeof SETTINGS_CLOUD_SYNC_AVAILABILITY_MESSAGE | typeof SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE
type Handler = (value: unknown) => unknown | Promise<unknown>
const RELAY_PREFIX = 'bewly:private-settings:'
const RELAY_DEADLINE = 10_000
interface RelayRecord {
  at: number
  phase: 'request' | 'response'
  type: SettingsMessage
  value?: unknown
  result?: unknown
  failed?: boolean
}

/** Split Cookie contexts still share chrome.storage.local. Only the regular worker writes settings. */
export function createSettingsContextRelay(extension = browser) {
  const handlers = new Map<SettingsMessage, Handler>()
  const processing = new Set<string>()
  let initialized = false

  async function processRequest(key: string, value: unknown) {
    if (!key.startsWith(RELAY_PREFIX) || !value || typeof value !== 'object')
      return
    const record = value as RelayRecord
    if (Date.now() - record.at > RELAY_DEADLINE) {
      await extension.storage.local.remove(key)
      return
    }
    if (record.phase !== 'request' || !handlers.has(record.type) || processing.has(key))
      return
    processing.add(key)
    try {
      let response: RelayRecord
      try {
        response = { ...record, value: undefined, phase: 'response', result: await handlers.get(record.type)!(record.value) }
      }
      catch {
        response = { ...record, value: undefined, phase: 'response', failed: true }
      }
      // A timed-out requester removed its slot. Its original patch may have committed,
      // but retrying the same client/operation ID remains the coordinator's job.
      if ((await extension.storage.local.get(key))[key])
        await extension.storage.local.set({ [key]: response })
    }
    finally {
      processing.delete(key)
    }
  }

  async function forward(type: SettingsMessage, value: unknown) {
    const key = `${RELAY_PREFIX}${crypto.randomUUID()}`
    let listener: Parameters<typeof extension.storage.onChanged.addListener>[0]
    let timer: ReturnType<typeof setTimeout>
    try {
      return await new Promise<unknown>((resolve, reject) => {
        listener = (changes, area) => {
          const response = changes[key]?.newValue as RelayRecord | undefined
          if (area !== 'local' || response?.phase !== 'response')
            return
          if (response.failed)
            reject(new Error('Settings coordinator failed'))
          else resolve(response.result)
        }
        extension.storage.onChanged.addListener(listener)
        timer = setTimeout(() => reject(new Error('Settings coordinator timed out')), RELAY_DEADLINE)
        void extension.storage.local.set({ [key]: { at: Date.now(), phase: 'request', type, value } satisfies RelayRecord }).catch(reject)
      })
    }
    finally {
      clearTimeout(timer!)
      extension.storage.onChanged.removeListener(listener!)
      await extension.storage.local.remove(key)
    }
  }

  return {
    register(type: SettingsMessage, handler: Handler) {
      handlers.set(type, handler)
      if (extension.extension?.inIncognitoContext)
        return (value: unknown) => forward(type, value)
      if (!initialized) {
        initialized = true
        extension.storage.onChanged.addListener((changes, area) => {
          if (area === 'local') {
            for (const [key, change] of Object.entries(changes))
              void processRequest(key, change.newValue).catch(() => {})
          }
        })
        // Recover only this narrow settings mailbox when the normal worker wakes.
        void extension.storage.local.get(null).then(stored => Promise.all(Object.entries(stored)
          .filter(([key]) => key.startsWith(RELAY_PREFIX))
          .map(([key, value]) => processRequest(key, value)))).catch(() => {})
      }
      return handler
    },
  }
}

const relay = createSettingsContextRelay()
export function onSettingsMessage(type: SettingsMessage, handler: Handler) {
  onMessage(type, relay.register(type, handler))
}
