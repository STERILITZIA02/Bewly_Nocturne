import { waitWithSignal } from '~/utils/abort'
import type { AccountId } from '~/utils/accountScope'
import type api from '~/utils/api'

type ReadApi = Pick<typeof api.favorite, 'getFavoriteResources' | 'getFavoriteCategories' | 'getFavoriteFolderInfo'>
interface Entry {
  source: number
  controller: AbortController
  promise: Promise<any>
  consumers: number
  settled: boolean
  resources: boolean
}
const PAGE_LIMIT = 32
function resourceParams(options: Parameters<ReadApi['getFavoriteResources']>[0] = {}) {
  return { media_id: -1, pn: 1, ps: 20, keyword: '', order: 'mtime', type: 0, tid: 0, platform: 'web', ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) }
}

/** A mounted Favorites owner shares exact reads, not different endpoint contracts. */
export function createFavoriteReads(client: ReadApi, getAccount: () => AccountId) {
  const entries = new Map<string, Entry>()
  let account = getAccount()
  let disposed = false
  const readKey = (method: keyof ReadApi, params: object) => JSON.stringify([account, method, Object.entries(params).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))])
  function invalidate(sources?: readonly number[]) {
    for (const [key, entry] of entries) {
      if (!sources || entry.source === 0 || sources.includes(entry.source)) {
        entries.delete(key)
        entry.controller.abort()
      }
    }
  }
  function syncAccount() {
    const current = getAccount()
    if (current !== account) {
      invalidate()
      account = current
    }
    if (disposed || account === null)
      throw new DOMException('Inactive Favorites owner', 'AbortError')
  }
  async function consume(entry: Entry, signal?: AbortSignal) {
    signal?.throwIfAborted()
    entry.consumers++
    try {
      const result = await waitWithSignal(entry.promise, signal)
      entry.controller.signal.throwIfAborted()
      return result
    }
    finally {
      if (--entry.consumers === 0 && !entry.settled)
        entry.controller.abort()
    }
  }
  function read(method: keyof ReadApi, source: number, params: object, signal?: AbortSignal) {
    syncAccount()
    signal?.throwIfAborted()
    const key = readKey(method, params)
    let entry = entries.get(key)
    if (entry?.controller.signal.aborted) {
      entries.delete(key)
      entry = undefined
    }
    if (!entry) {
      const controller = new AbortController()
      const owner = account
      const created: Entry = { source, controller, consumers: 0, settled: false, resources: method === 'getFavoriteResources' && 'type' in params && params.type === 0, promise: Promise.resolve() }
      created.promise = Promise.resolve().then(() => client[method](params, { signal: controller.signal })).then((result) => {
        controller.signal.throwIfAborted()
        if (owner !== getAccount())
          throw new DOMException('Favorites account changed', 'AbortError')
        const valid = result?.code === 0 && (method === 'getFavoriteResources'
          ? result.data?.info && typeof result.data.has_more === 'boolean' && (result.data.medias === null || Array.isArray(result.data.medias))
          : method === 'getFavoriteFolderInfo' ? result.data?.id === source && result.data.upper : Array.isArray(result.data?.list) || result.data?.list === null)
        if (!valid && entries.get(key) === created)
          entries.delete(key)
        return result
      }).catch((error) => {
        if (entries.get(key) === created)
          entries.delete(key)
        throw error
      }).finally(() => {
        created.settled = true
        for (const [oldKey, old] of entries) {
          if (entries.size <= PAGE_LIMIT)
            break
          if (old.settled)
            entries.delete(oldKey)
        }
      })
      entries.set(key, created)
      entry = created
    }
    return consume(entry, signal)
  }
  const reads: ReadApi = {
    getFavoriteResources: (options = {}, request) => {
      const params = resourceParams(options)
      return read('getFavoriteResources', params.media_id, params, request?.signal)
    },
    getFavoriteCategories: (options = {}, request) => read('getFavoriteCategories', 0, options, request?.signal),
    getFavoriteFolderInfo: (options = {}, request) => read('getFavoriteFolderInfo', options.media_id ?? 0, options, request?.signal),
  }
  return {
    reads,
    invalidate,
    forgetResources(options: Parameters<ReadApi['getFavoriteResources']>[0]) {
      entries.delete(readKey('getFavoriteResources', resourceParams(options)))
    },
    async cover(source: number, signal: AbortSignal) {
      syncAccount()
      const page = [...entries.values()].find(entry => entry.source === source && entry.resources && !entry.controller.signal.aborted)
      const response = page ? await consume(page, signal) : await reads.getFavoriteResources({ media_id: source, pn: 1, ps: 1 }, { signal })
      if (response?.code !== 0 || response.data?.info?.id !== source)
        throw new Error('Favorite cover unavailable')
      return response.data.info.cover || ''
    },
    dispose() {
      disposed = true
      invalidate()
    },
  }
}
