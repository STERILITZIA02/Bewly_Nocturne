let channelId: string | undefined
const waiters = new Set<(value: string) => void>()

export function setPageBridgeChannelId(value: string): boolean {
  if (channelId)
    return channelId === value

  channelId = value
  waiters.forEach(resolve => resolve(value))
  waiters.clear()
  return true
}

export function getPageBridgeChannelId(): string | undefined {
  return channelId
}

export function waitForPageBridgeChannelId(timeoutMs = 1500): Promise<string> {
  if (channelId)
    return Promise.resolve(channelId)

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const resolveChannel = (value: string) => {
      globalThis.clearTimeout(timer)
      resolve(value)
    }
    timer = globalThis.setTimeout(() => {
      waiters.delete(resolveChannel)
      reject(new Error('Page bridge channel timed out'))
    }, timeoutMs)
    waiters.add(resolveChannel)
  })
}
