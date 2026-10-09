import type { PlaybackTab } from '~/utils/playbackTab'

export const OPEN_TABS_WATCH_LATER = 'watchLater:open-tabs'
export const OPEN_TABS_WATCH_LATER_UPDATED = 'watchLater:open-tabs:updated'
export type OpenTabsItemStatus = 'pending' | 'resolving' | 'sending' | 'added' | 'skipped' | 'failed' | 'unknown'
export type OpenTabsItemReason = 'duplicate' | 'existing' | 'sourceChanged' | 'unresolved' | 'readFailed' | 'writeFailed' | 'unknown'
export interface OpenTabsItem extends PlaybackTab {
  status: OpenTabsItemStatus
  aid?: number
  reason?: OpenTabsItemReason
  message?: string
}
export interface OpenTabsTask {
  id: string
  accountId: number
  incognito: boolean
  status: 'ready' | 'running' | 'stopped' | 'complete'
  stopReason?: 'user' | 'accountChanged' | 'interrupted' | 'readFailed'
  items: OpenTabsItem[]
}
export interface OpenTabsCommand {
  action: 'get' | 'prepare' | 'start' | 'stop' | 'retry' | 'unsubscribe'
  taskId?: string
  accountId: number
  selectedTabIds?: number[]
}

/** Apply a confirmed selection once, before the existing runner owns the task. */
export function selectOpenTabsTaskItems(task: OpenTabsTask, selectedTabIds: number[]) {
  const selected = new Set(selectedTabIds)
  if (!selected.size || selected.size !== selectedTabIds.length
    || selectedTabIds.some(id => !Number.isSafeInteger(id) || !task.items.some(item => item.tabId === id))) {
    throw new TypeError('Select items from the current preview')
  }
  return task.items.filter(item => selected.has(item.tabId))
}

export function countOpenTabsTask(task: OpenTabsTask) {
  const counts = { total: task.items.length, added: 0, skipped: 0, failed: 0, unprocessed: 0 }
  for (const item of task.items) {
    if (item.status === 'added' || item.status === 'skipped')
      counts[item.status]++
    else if (item.status === 'failed' || item.status === 'unknown')
      counts.failed++
    else
      counts.unprocessed++
  }
  return counts
}
