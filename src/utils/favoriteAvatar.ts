const FAVORITE_AVATAR_CONCURRENCY = 4
const FAVORITE_AVATAR_CACHE_LIMIT = 256
const FAVORITE_AVATAR_TTL = 10 * 60_000
const FAVORITE_AVATAR_FAILURE_TTL = 60_000

/** Public avatar lookup cache owned by the Favorites reader, shared across its sources. */
export function createFavoriteAvatarLoader(fetchFace: (mid: number) => Promise<string | undefined>, now = Date.now) {
  const cache = new Map<number, { face: string | undefined, expiresAt: number }>()
  const requests = new Map<number, { promise: Promise<string | undefined>, resolve: (face?: string) => void }>()
  const queue: number[] = []
  let active = 0
  let disposed = false

  function drain() {
    if (disposed)
      return
    while (active < FAVORITE_AVATAR_CONCURRENCY && queue.length) {
      const mid = queue.shift()!
      const request = requests.get(mid)!
      active++
      void fetchFace(mid).catch(() => undefined).then((face) => {
        if (!disposed) {
          cache.delete(mid)
          cache.set(mid, { face, expiresAt: now() + (face ? FAVORITE_AVATAR_TTL : FAVORITE_AVATAR_FAILURE_TTL) })
          while (cache.size > FAVORITE_AVATAR_CACHE_LIMIT)
            cache.delete(cache.keys().next().value!)
        }
        request.resolve(disposed ? undefined : face)
      }).finally(() => {
        active--
        requests.delete(mid)
        drain()
      })
    }
  }

  function load(mid: number): Promise<string | undefined> {
    if (disposed || !Number.isSafeInteger(mid) || mid <= 0)
      return Promise.resolve(undefined)
    const cached = cache.get(mid)
    if (cached && cached.expiresAt > now()) {
      cache.delete(mid)
      cache.set(mid, cached)
      return Promise.resolve(cached.face)
    }
    const pending = requests.get(mid)
    if (pending)
      return pending.promise
    let resolve!: (face?: string) => void
    const promise = new Promise<string | undefined>((done) => {
      resolve = done
    })
    requests.set(mid, { promise, resolve })
    queue.push(mid)
    drain()
    return promise
  }

  return {
    load,
    get cacheSize() { return cache.size },
    dispose() {
      disposed = true
      queue.length = 0
      cache.clear()
      for (const request of requests.values())
        request.resolve()
      requests.clear()
    },
  }
}
