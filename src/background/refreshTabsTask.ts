import type { Tabs } from 'webextension-polyfill'

import { CONTENT_SCRIPT_MATCHES, isContentScriptTargetUrl } from '~/constants/contentScript'

export interface RefreshTabItem {
  tabId: number
  url: string
  status: 'pending' | 'success' | 'skipped' | 'failed'
}
export interface RefreshTabsTask {
  id: string
  sourceTabId: number
  incognito: boolean
  items: RefreshTabItem[]
  running: boolean
}

/** The initiating document acknowledges the completed other-tab result before finish(). */
export function createRefreshTabsTask(tabs: Pick<Tabs.Static, 'query' | 'get' | 'reload'>, source: Tabs.Tab & { id: number }, restored?: RefreshTabsTask) {
  const task: RefreshTabsTask = restored ?? { id: crypto.randomUUID(), sourceTabId: source.id, incognito: Boolean(source.incognito), items: [], running: false }
  let pending: Promise<RefreshTabsTask> | undefined
  let sourceInvalidated = false
  async function reload(item: RefreshTabItem) {
    const tab = await tabs.get(item.tabId).catch(() => undefined)
    if (!tab || Boolean(tab.incognito) !== task.incognito || tab.discarded
      || (tab.pendingUrl ?? tab.url) !== item.url || !isContentScriptTargetUrl(item.url)
      || (item.tabId === source.id && sourceInvalidated)) {
      item.status = 'skipped'
      return
    }
    try {
      await tabs.reload(item.tabId)
      item.status = 'success'
    }
    catch {
      item.status = 'failed'
    }
  }
  async function run(retry: boolean) {
    task.running = true
    try {
      if (!retry) {
        const candidates = await tabs.query({ url: [...CONTENT_SCRIPT_MATCHES] })
        task.items = candidates.filter(tab => tab.id !== undefined && Boolean(tab.incognito) === task.incognito && isContentScriptTargetUrl(tab.pendingUrl ?? tab.url))
          .map(tab => ({ tabId: tab.id!, url: (tab.pendingUrl ?? tab.url)!, status: tab.discarded ? 'skipped' : 'pending' }))
      }
      for (const item of task.items) {
        if (item.tabId !== source.id && item.status === (retry ? 'failed' : 'pending'))
          await reload(item)
      }
      return task
    }
    finally {
      task.running = false
    }
  }
  return {
    task,
    invalidateSource() {
      sourceInvalidated = true
      const item = task.items.find(item => item.tabId === source.id)
      if (item?.status === 'pending')
        item.status = 'skipped'
    },
    run(retry = false) {
      pending ??= run(retry).finally(() => {
        pending = undefined
      })
      return pending
    },
    async finish() {
      if (task.running || task.items.some(item => item.tabId !== source.id && (item.status === 'failed' || item.status === 'pending')))
        return task
      const current = task.items.find(item => item.tabId === source.id)
      if (current && (current.status === 'pending' || current.status === 'failed'))
        await reload(current)
      return task
    },
  }
}
