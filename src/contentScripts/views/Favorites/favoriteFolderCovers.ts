import { reactive } from 'vue'

type CoverLane = 'rail' | 'hero'

/**
 * Read folder covers one at a time per lane; never delay the content request.
 * The rail reads its visible rows; the hero row reads the cards around the
 * current one in a lane of its own, so it never waits behind the rail.
 */
export function createFavoriteFolderCoverLoader(fetchCover: (id: number, signal: AbortSignal) => Promise<string>) {
  const covers = reactive<Record<number, string>>({})
  const requested = new Set<number>()
  const lanes: Record<CoverLane, { queue: number[], running: boolean, controller?: AbortController }> = {
    rail: { queue: [], running: false },
    hero: { queue: [], running: false },
  }
  let generation = 0
  let disposed = false

  async function drain(name: CoverLane) {
    const lane = lanes[name]
    if (lane.running || disposed)
      return
    lane.running = true
    const owner = generation
    try {
      while (lane.queue.length) {
        if (owner !== generation || disposed)
          break
        const id = lane.queue.shift()!
        if (Object.hasOwn(covers, id))
          continue
        lane.controller = new AbortController()
        try {
          const cover = await fetchCover(id, lane.controller.signal)
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
        lane.running = false
        lane.controller = undefined
      }
    }
  }

  function reset() {
    generation++
    for (const lane of Object.values(lanes)) {
      lane.controller?.abort()
      lane.controller = undefined
      lane.running = false
      lane.queue.length = 0
    }
    requested.clear()
    for (const id of Object.keys(covers))
      delete covers[Number(id)]
  }

  return {
    covers,
    load(id: number, name: CoverLane = 'rail') {
      if (disposed || Object.hasOwn(covers, id))
        return
      // The hero takes over a cover still waiting in the rail's queue.
      const waiting = name === 'hero' ? lanes.rail.queue.indexOf(id) : -1
      if (waiting >= 0)
        lanes.rail.queue.splice(waiting, 1)
      else if (requested.has(id))
        return
      requested.add(id)
      lanes[name].queue.push(id)
      void drain(name)
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
