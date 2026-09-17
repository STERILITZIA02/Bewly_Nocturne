import type { OpenTabsItem, OpenTabsTask } from '~/constants/openTabsWatchLater'
import type { WatchLaterWriteResponse } from '~/utils/watchLaterWrite'
import { sendOwnedWatchLaterWrite } from '~/utils/watchLaterWrite'

interface Dependencies {
  accountCurrent: () => Promise<boolean>
  sourceCurrent: (item: OpenTabsItem) => Promise<boolean>
  readMembership: () => Promise<readonly number[]>
  resolveAid: (item: OpenTabsItem) => Promise<number | undefined>
  add: (aid: number) => Promise<WatchLaterWriteResponse>
  changed: () => Promise<void>
  reconcile: () => Promise<void>
}

/** One confirmed snapshot, not a second Watch Later membership store. */
export function createOpenTabsWatchLaterTask(task: OpenTabsTask, dependencies: Dependencies) {
  let running: Promise<void> | undefined
  let stopped = false
  const stop = (reason: OpenTabsTask['stopReason'] = 'user') => {
    stopped = true
    task.stopReason = reason
  }
  const eligible = async () => {
    if (!stopped && !await dependencies.accountCurrent())
      stop('accountChanged')
    return !stopped
  }
  async function run(retry: boolean) {
    task.status = 'running'
    delete task.stopReason
    stopped = false
    let sent = false
    try {
      await dependencies.changed()
      if (!await eligible())
        return
      const members = new Set(await dependencies.readMembership())
      const attempted = new Set<number>()
      const resolvedAids = new Map<string, number | undefined>()
      for (const item of task.items) {
        if (retry ? item.status !== 'failed' : item.status !== 'pending')
          continue
        if (!await eligible())
          break
        item.status = 'resolving'
        delete item.reason
        delete item.message
        await dependencies.changed()
        let writeSent = false
        try {
          if (!await dependencies.sourceCurrent(item)) {
            item.status = 'skipped'
            item.reason = 'sourceChanged'
            continue
          }
          const mediaKey = JSON.stringify(item.target)
          const aid = item.aid ?? (resolvedAids.has(mediaKey) ? resolvedAids.get(mediaKey) : await dependencies.resolveAid(item))
          resolvedAids.set(mediaKey, aid)
          if (!await eligible()) {
            item.status = 'pending'
            break
          }
          if (!aid) {
            item.status = 'skipped'
            item.reason = 'unresolved'
            continue
          }
          item.aid = aid
          if (members.has(aid) || attempted.has(aid)) {
            item.status = 'skipped'
            item.reason = attempted.has(aid) ? 'duplicate' : 'existing'
            continue
          }
          if (!await dependencies.sourceCurrent(item)) {
            item.status = 'skipped'
            item.reason = 'sourceChanged'
            continue
          }
          item.status = 'sending'
          await dependencies.changed() // Persist before sending; a worker restart never resends this item.
          const result = await sendOwnedWatchLaterWrite(async () => {
            if (!await eligible())
              return false
            if (!await dependencies.sourceCurrent(item)) {
              item.status = 'skipped'
              item.reason = 'sourceChanged'
              return false
            }
            return !stopped
          }, () => {
            attempted.add(aid)
            sent = true
            writeSent = true
            return dependencies.add(aid)
          })
          if (!result) {
            if (item.reason === 'sourceChanged')
              continue
            item.status = 'pending'
            break
          }
          if (result.code === 0) {
            members.add(aid)
            item.status = 'added'
          }
          else {
            item.status = 'failed'
            item.reason = 'writeFailed'
            item.message = result.message
            if ([-101, -111, -412, 90001].includes(result.code))
              stop(result.code === -101 || result.code === -111 ? 'accountChanged' : 'user')
          }
        }
        catch {
          item.reason = writeSent ? 'unknown' : 'readFailed'
          item.status = writeSent ? 'unknown' : 'failed'
        }
        finally {
          await dependencies.changed()
        }
      }
    }
    catch {
      stop('readFailed')
    }
    finally {
      task.status = stopped ? 'stopped' : 'complete'
      if (sent)
        await dependencies.reconcile().catch(() => {})
      await dependencies.changed()
    }
  }
  return {
    stop,
    start(retry = false) {
      running ??= run(retry).finally(() => {
        running = undefined
      })
      return running
    },
  }
}
