import { reactive } from 'vue'

/** Read only visible folders, one at a time; never delay the content request. */
export function createFavoriteFolderCoverLoader(fetchCover: (id: number, signal: AbortSignal) => Promise<string>) {
  const covers = reactive<Record<number, string>>({})
  const requested = new Set<number>()
  const queue: number[] = []
  let generation = 0
  let running = false
  let disposed = false
  let controller: AbortController | undefined

  async function drain() {
    if (running || disposed)
      return
    running = true
    const owner = generation
    try {
      while (queue.length) {
        if (owner !== generation || disposed)
          break
        const id = queue.shift()!
        if (Object.hasOwn(covers, id))
          continue
        controller = new AbortController()
        try {
          const cover = await fetchCover(id, controller.signal)
          if (owner === generation && !disposed && !Object.hasOwn(covers, id))
            covers[id] = cover
        }
        catch {
          // A thumbnail failure keeps the folder usable with its neutral icon.
        }
      }
    }
    finally {
      if (owner === generation) {
        running = false
        controller = undefined
      }
    }
  }

  function reset() {
    generation++
    controller?.abort()
    controller = undefined
    running = false
    queue.length = 0
    requested.clear()
    for (const id of Object.keys(covers))
      delete covers[Number(id)]
  }

  return {
    covers,
    load(id: number) {
      if (disposed || requested.has(id) || Object.hasOwn(covers, id))
        return
      requested.add(id)
      queue.push(id)
      void drain()
    },
    seed(id: number, cover: string) {
      if (!disposed)
        covers[id] = cover
    },
    reset,
    dispose() {
      disposed = true
      reset()
    },
  }
}
