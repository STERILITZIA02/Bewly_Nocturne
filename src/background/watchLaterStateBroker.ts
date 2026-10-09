import type { WatchLaterChange, WatchLaterEntry, WatchLaterSnapshot, WatchLaterUpdate } from '~/constants/watchLaterState'
import type { ReadRequestOptions } from '~/utils/abort'
import { waitWithSignal, withRequestDeadline } from '~/utils/abort'
import { applyWatchLaterChange, toWatchLaterEntry } from '~/utils/watchLaterSnapshot'
import type { WatchLaterWriteResponse } from '~/utils/watchLaterWrite'

interface Account { accountId: number, csrf: string }
interface ReadResult { code: number, message?: string, data?: { count?: number, list?: Array<WatchLaterEntry & { bangumi?: { ep_id?: number } }> } }
interface Dependencies {
  storage: { get: (key: string) => Promise<Record<string, unknown>>, set: (values: Record<string, unknown>) => Promise<void> }
  storageKey: string
  account: () => Promise<Account>
  read: (full: boolean, signal: AbortSignal) => Promise<ReadResult>
  broadcast: (update: WatchLaterUpdate) => Promise<void>
}
interface ConfirmedChange { change: WatchLaterChange, revision: number, disagreements: number }
interface PersistedEntry {
  snapshot: WatchLaterSnapshot
  confirmed: ConfirmedChange[]
  sending?: string
}
interface Entry extends PersistedEntry {
  membershipRead?: Promise<WatchLaterSnapshot>
  countRead?: Promise<WatchLaterSnapshot>
  writeQueue: Promise<unknown>
  membershipRetryAt?: number
}
const MAX_AGE = 5 * 60_000

/** The only extension-side membership writer. Tabs receive versioned projections. */
export function createWatchLaterStateBroker(dependencies: Dependencies) {
  const entries = new Map<number, Entry>()
  let loaded: Promise<void> | undefined

  async function load() {
    loaded ??= (async () => {
      const stored = (await dependencies.storage.get(dependencies.storageKey))[dependencies.storageKey]
      if (!stored || typeof stored !== 'object')
        return
      for (const value of Object.values(stored)) {
        const entry = value as PersistedEntry
        const snapshot = entry?.snapshot
        if (!snapshot || !snapshot.epoch || !Number.isSafeInteger(snapshot.revision) || !Array.isArray(snapshot.entries)
          || !Number.isSafeInteger(snapshot.accountId) || !Array.isArray(entry.confirmed)) {
          continue
        }
        // A worker can disappear after sending and before receiving. Never replay
        // that write; only a subsequent demanded read may reconcile the outcome.
        snapshot.epoch = crypto.randomUUID()
        snapshot.revision = 0
        snapshot.complete = false
        snapshot.entries = []
        snapshot.updatedAt = 0
        snapshot.countUpdatedAt = 0
        entries.set(snapshot.accountId, { ...entry, confirmed: entry.confirmed.map(item => ({ ...item, revision: 0, disagreements: 0 })), sending: undefined, writeQueue: Promise.resolve() })
      }
    })()
    await loaded
  }

  async function getEntry(accountId: number): Promise<Entry> {
    await load()
    let entry = entries.get(accountId)
    if (!entry) {
      entry = {
        snapshot: { accountId, epoch: crypto.randomUUID(), revision: 0, entries: [], complete: false, count: null, updatedAt: 0, countUpdatedAt: 0 },
        confirmed: [],
        writeQueue: Promise.resolve(),
      }
      entries.set(accountId, entry)
    }
    return entry
  }

  // Serial storage writes retain revision order, including during a batch.
  let persistQueue = Promise.resolve()
  function persist() {
    const value = Object.fromEntries([...entries].map(([id, entry]) => [id, {
      snapshot: entry.snapshot,
      confirmed: entry.confirmed,
      sending: entry.sending,
    }]))
    const task = persistQueue.then(() => dependencies.storage.set({ [dependencies.storageKey]: value }))
    persistQueue = task.catch(() => {})
    return task
  }

  async function requireAccount(accountId?: number, csrf?: string) {
    const account = await dependencies.account()
    if (!account.accountId || (accountId !== undefined && account.accountId !== accountId) || (csrf !== undefined && account.csrf !== csrf))
      throw new Error('Watch Later account changed')
    return account
  }

  async function publishChange(entry: Entry, change: WatchLaterChange, operationId = crypto.randomUUID()) {
    const previous = entry.snapshot
    const snapshot = { ...applyWatchLaterChange(previous, change), revision: previous.revision + 1 }
    entry.snapshot = snapshot
    if (change.type === 'clear' || change.type === 'invalidate')
      entry.confirmed = []
    if (change.type !== 'invalidate') {
      entry.confirmed = entry.confirmed.filter(item => item.change.type === 'clear'
        || !('entry' in item.change) || !('entry' in change) || item.change.entry.aid !== change.entry.aid)
      entry.confirmed.push({ change, revision: snapshot.revision, disagreements: 0 })
    }
    await persist()
    const update: WatchLaterUpdate = {
      type: 'change',
      accountId: previous.accountId,
      epoch: previous.epoch,
      baseRevision: previous.revision,
      revision: snapshot.revision,
      operationId,
      change,
      count: snapshot.count,
      complete: snapshot.complete,
    }
    await dependencies.broadcast(update)
    return update
  }

  function read(accountId: number | undefined, full: boolean, force = false): Promise<WatchLaterSnapshot> {
    return withRequestDeadline(async (consumerSignal) => {
      const account = await waitWithSignal(requireAccount(accountId), consumerSignal)
      const entry = await waitWithSignal(getEntry(account.accountId), consumerSignal)
      consumerSignal.throwIfAborted()
      const key = full ? 'membershipRead' : 'countRead'
      if (entry[key])
        return waitWithSignal(entry[key]!, consumerSignal)
      if (full && !force && Date.now() < (entry.membershipRetryAt ?? 0))
        throw new Error('Watch Later membership temporarily unavailable')
      if (!force && Date.now() - (full ? entry.snapshot.updatedAt : entry.snapshot.countUpdatedAt) < MAX_AGE
        && (full ? entry.snapshot.complete : entry.snapshot.count !== null)) {
        return entry.snapshot
      }
      // A full read also supplies count; force never creates a parallel request.
      if (!full && entry.membershipRead)
        return waitWithSignal(entry.membershipRead, consumerSignal)
      const task = withRequestDeadline(async (signal) => {
        await waitWithSignal(entry.writeQueue.catch(() => {}), signal)
        for (let attempt = 0; attempt < 2; attempt++) {
          await waitWithSignal(requireAccount(account.accountId, account.csrf), signal)
          const version = entry.snapshot.revision
          const response = await dependencies.read(full, signal)
          await waitWithSignal(requireAccount(account.accountId, account.csrf), signal)
          signal.throwIfAborted()
          if (response.code !== 0 || !response.data || !Number.isSafeInteger(response.data.count)
            || response.data.count! < 0 || (full && response.data.list !== undefined && !Array.isArray(response.data.list))) {
            throw new Error(response.message || 'Watch Later read failed')
          }
          if (!full) {
            if (version !== entry.snapshot.revision)
              continue
            const count = response.data.count!
            if (entry.confirmed.length && entry.snapshot.countUpdatedAt && count !== entry.snapshot.count) {
              entry.confirmed = entry.confirmed.filter(confirmation => ++confirmation.disagreements < 3)
              if (entry.confirmed.length) {
                if (attempt === 0)
                  continue
                throw new Error('Watch Later count is awaiting server reconciliation')
              }
            }
            const complete = entry.snapshot.complete && count === entry.snapshot.entries.length
            entry.snapshot = { ...entry.snapshot, count, countUpdatedAt: Date.now(), revision: version + 1, complete, entries: complete || count === entry.snapshot.count ? entry.snapshot.entries : [], updatedAt: complete ? entry.snapshot.updatedAt : 0 }
          }
          else {
            const members = new Map<number, WatchLaterEntry>()
            for (const item of response.data.list ?? []) {
              const member = toWatchLaterEntry({ ...item, epid: item.bangumi?.ep_id ?? item.epid })
              if (member)
                members.set(member.aid, member)
            }
            let snapshot: WatchLaterSnapshot = { ...entry.snapshot, entries: [...members.values()], count: response.data.count!, complete: members.size === response.data.count, updatedAt: Date.now(), countUpdatedAt: Date.now() }
            let disagreed = false
            const addedAfterClear = new Set(entry.confirmed.flatMap(({ change }) => change.type === 'add' ? [change.entry.aid] : []))
            entry.confirmed = entry.confirmed.filter((confirmation) => {
              const change = confirmation.change
              const matches = change.type === 'clear'
                ? [...members.keys()].every(aid => addedAfterClear.has(aid))
                : 'entry' in change && members.has(change.entry.aid) === (change.type === 'add')
              if (version >= confirmation.revision && matches)
                return false
              // Keep confirmed writes over an older in-flight read. A demanded
              // post-write reconciliation uses at most two reads per demand.
              // Three observed disagreements yield to the server; delivery
              // ordering and duplicate rejection never depend on a time window.
              if (version >= confirmation.revision && ++confirmation.disagreements >= 3)
                return false
              snapshot = applyWatchLaterChange(snapshot, change)
              disagreed = true
              return true
            })
            if (entry.snapshot.revision !== version && !entry.confirmed.length)
              snapshot.complete = false
            entry.snapshot = { ...snapshot, revision: entry.snapshot.revision + 1 }
            if ((!snapshot.complete || disagreed) && attempt === 0)
              continue
            if (!snapshot.complete || disagreed)
              throw new Error('Watch Later membership is awaiting server reconciliation')
          }
          const snapshot = entry.snapshot
          await persist()
          signal.throwIfAborted()
          if (full)
            entry.membershipRetryAt = 0
          await dependencies.broadcast({ type: 'snapshot', snapshot })
          return snapshot
        }
        return entry.snapshot
      }).catch((error) => {
        if (full) {
          entry.membershipRetryAt = Date.now() + 5_000
          entry.snapshot = { ...entry.snapshot, updatedAt: 0 }
        }
        throw error
      }).finally(() => {
        if (entry[key] === task)
          entry[key] = undefined
      })
      entry[key] = task
      return waitWithSignal(task, consumerSignal)
    })
  }

  return {
    readMembership: (accountId?: number, force = false) => read(accountId, true, force),
    readCount: (accountId?: number, force = false) => read(accountId, false, force),
    readPage<T extends ReadResult>(accountId: number | undefined, run: (signal: AbortSignal) => Promise<T>, options?: ReadRequestOptions): Promise<T> {
      return withRequestDeadline(async (signal) => {
        const account = await waitWithSignal(requireAccount(accountId), signal)
        const entry = await waitWithSignal(getEntry(account.accountId), signal)
        for (let attempt = 0; attempt < 2; attempt++) {
          await waitWithSignal(entry.writeQueue.catch(() => {}), signal)
          await waitWithSignal(requireAccount(account.accountId, account.csrf), signal)
          const revision = entry.snapshot.revision
          const result = await run(signal)
          await waitWithSignal(requireAccount(account.accountId, account.csrf), signal)
          signal.throwIfAborted()
          const count = result.data?.count
          if (result.code !== 0 || !Number.isSafeInteger(count) || count! < 0 || !Array.isArray(result.data?.list))
            return result

          const page = result.data.list.flatMap(item => toWatchLaterEntry({ ...item, epid: item.bangumi?.ep_id ?? item.epid }) ?? [])
          const added = new Set(entry.confirmed.flatMap(({ change }) => change.type === 'add' ? [change.entry.aid] : []))
          const contradictsWrite = entry.confirmed.some(({ change }) => change.type === 'remove'
            ? page.some(item => item.aid === change.entry.aid)
            : change.type === 'clear' && page.some(item => !added.has(item.aid)))
          || (entry.confirmed.length > 0 && entry.snapshot.countUpdatedAt > 0 && count !== entry.snapshot.count)
          if (entry.sending || revision !== entry.snapshot.revision || contradictsWrite) {
            if (attempt === 0)
              continue
            // A shortened page would silently skip the shifted page boundary.
            // Reconcile membership on proven conflict, then let the existing
            // page retry keep its cursor. Never replay a write or poll here.
            if (contradictsWrite)
              await waitWithSignal(read(account.accountId, true, true), signal)
            throw new Error('Watch Later page changed during read')
          }

          const previous = entry.snapshot
          const members = new Map((previous.count === count && Date.now() - previous.countUpdatedAt < MAX_AGE ? previous.entries : []).map(item => [item.aid, item]))
          for (const item of page)
            members.set(item.aid, { ...members.get(item.aid), ...item })
          // Partial pages only prove present entries; absence remains unknown.
          // A page containing the reported total is itself a complete result.
          const wholePage = page.length === count && new Set(page.map(item => item.aid)).size === count
          const items = wholePage || members.size > count! ? page : [...members.values()]
          const complete = wholePage || (previous.complete && previous.count === count && members.size === count)
          const changed = previous.count !== count || previous.complete !== complete || items.length !== previous.entries.length
            || items.some((item, index) => item.aid !== previous.entries[index]?.aid || item.bvid !== previous.entries[index]?.bvid || item.epid !== previous.entries[index]?.epid)
          const snapshot = { ...previous, entries: items, count: count!, complete, countUpdatedAt: Date.now(), updatedAt: wholePage ? Date.now() : complete ? previous.updatedAt : 0, revision: previous.revision + Number(changed) }
          entry.snapshot = snapshot
          await persist()
          if (changed)
            await dependencies.broadcast({ type: 'snapshot', snapshot })
          return result
        }
        throw new Error('Watch Later page changed during read')
      }, options)
    },
    async invalidate(accountId?: number) {
      const account = await requireAccount(accountId)
      return publishChange(await getEntry(account.accountId), { type: 'invalidate' })
    },
    async write(accountId: number | undefined, csrf: string, change: WatchLaterChange, send: () => Promise<WatchLaterWriteResponse>) {
      const account = await requireAccount(accountId, csrf)
      const entry = await getEntry(account.accountId)
      const operationId = crypto.randomUUID()
      const task = entry.writeQueue.catch(() => {}).then(async () => {
        await requireAccount(account.accountId, account.csrf)
        entry.sending = operationId
        await persist()
        let response: WatchLaterWriteResponse
        try {
          response = await send()
        }
        catch (error) {
          entry.sending = undefined
          await publishChange(entry, { type: 'invalidate' }, operationId)
          throw error
        }
        entry.sending = undefined
        if (response.code === 0)
          return { ...response, watchLaterUpdate: await publishChange(entry, change, operationId) }
        await persist()
        return response
      })
      entry.writeQueue = task
      return task
    },
  }
}
