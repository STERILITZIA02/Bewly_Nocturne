const PRIVATE_MESSAGE_DEVICE_ID_STORAGE_PREFIX = 'privateMessage.devId.'
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface PrivateMessageDeviceIdDependencies {
  read: (key: string) => Promise<unknown>
  write: (key: string, value: string) => Promise<void>
  randomUUID: () => string
}

const memoryCache = new Map<string, string>()
const pendingReads = new Map<string, Promise<string>>()

const DEFAULT_DEPENDENCIES: PrivateMessageDeviceIdDependencies = {
  async read(key) {
    const browser = await import('webextension-polyfill').then(module => module.default)
    const stored = await browser.storage.local.get(key)
    return stored[key]
  },
  async write(key, value) {
    const browser = await import('webextension-polyfill').then(module => module.default)
    await browser.storage.local.set({ [key]: value })
  },
  randomUUID: () => globalThis.crypto.randomUUID(),
}

function requireSenderId(senderId: string): string {
  const normalized = senderId.trim()
  if (!/^\d+$/.test(normalized))
    throw new TypeError('senderId must be a decimal identifier')
  return normalized
}

function requireUuidV4(value: string): string {
  if (!UUID_V4_PATTERN.test(value))
    throw new TypeError('private-message devId must be a UUID v4')
  return value
}

export function getPrivateMessageDeviceIdStorageKey(senderId: string): string {
  return `${PRIVATE_MESSAGE_DEVICE_ID_STORAGE_PREFIX}${requireSenderId(senderId)}`
}

export function getPrivateMessageDevId(
  senderId: string,
  dependencies: PrivateMessageDeviceIdDependencies = DEFAULT_DEPENDENCIES,
): Promise<string> {
  const storageKey = getPrivateMessageDeviceIdStorageKey(senderId)
  const cached = memoryCache.get(storageKey)
  if (cached)
    return Promise.resolve(cached)

  const activeRequest = pendingReads.get(storageKey)
  if (activeRequest)
    return activeRequest

  const request = (async () => {
    const stored = await dependencies.read(storageKey)
    const devId = typeof stored === 'string' && UUID_V4_PATTERN.test(stored)
      ? stored
      : requireUuidV4(dependencies.randomUUID())
    if (stored !== devId)
      await dependencies.write(storageKey, devId)
    memoryCache.set(storageKey, devId)
    return devId
  })().finally(() => {
    if (pendingReads.get(storageKey) === request)
      pendingReads.delete(storageKey)
  })

  pendingReads.set(storageKey, request)
  return request
}
