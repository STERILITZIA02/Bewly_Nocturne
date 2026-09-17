import browser from 'webextension-polyfill'

import { REFRESH_SUPPORTED_TABS } from '~/constants/refreshTabs'
import { onMessage } from '~/utils/messaging'

import type { RefreshTabsTask } from './refreshTabsTask'
import { createRefreshTabsTask } from './refreshTabsTask'
import { requireSupportedTabSender } from './tabContext'

const RELOAD_START_TIMEOUT_MS = 8_000
const SOURCE_RELOAD_ACK_DELAY_MS = 100

export function setupRefreshTabs() {
  const tasks = new Map<boolean, { owner: ReturnType<typeof createRefreshTabsTask>, documentId?: string }>()
  const restored = new Map<boolean, Promise<void>>()
  const reloads = new Map<number, () => void>()
  const tabsApi = {
    query: browser.tabs.query.bind(browser.tabs),
    get: browser.tabs.get.bind(browser.tabs),
    reload(tabId: number) {
      // tabs.reload acknowledges the request, not acceptance of a page's leave confirmation.
      return new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>
        const finish = (error?: Error) => {
          clearTimeout(timer)
          reloads.delete(tabId)
          if (error)
            reject(error)
          else resolve()
        }
        timer = setTimeout(() => finish(new Error('Page did not begin refreshing')), RELOAD_START_TIMEOUT_MS)
        reloads.set(tabId, () => finish())
        void browser.tabs.reload(tabId).catch(error => finish(error))
      })
    },
  }
  const storageKey = (context: boolean) => `bewly:refresh-tabs:${context}`
  const persist = async (context: boolean) => {
    const entry = tasks.get(context)
    if (entry)
      await browser.storage.session.set({ [storageKey(context)]: { task: entry.owner.task, documentId: entry.documentId } })
  }
  async function restore(context: boolean) {
    if (!restored.has(context)) {
      restored.set(context, (async () => {
        const saved = (await browser.storage.session.get(storageKey(context)))[storageKey(context)] as { task?: RefreshTabsTask, documentId?: string } | undefined
        if (saved?.task && !saved.task.running && saved.task.incognito === context && Array.isArray(saved.task.items)) {
          tasks.set(context, { owner: createRefreshTabsTask(tabsApi, { id: saved.task.sourceTabId, incognito: context } as browser.Tabs.Tab & { id: number }, saved.task), documentId: saved.documentId })
        }
      })())
    }
    await restored.get(context)
  }
  onMessage<{ action: 'start' | 'retry' | 'finish' | 'status', taskId?: string }>(REFRESH_SUPPORTED_TABS, async (command, sender) => {
    const tab = requireSupportedTabSender(sender)
    if (sender?.frameId !== 0)
      throw new Error('Top document required')
    const context = Boolean(tab.incognito)
    const documentId = (sender as browser.Runtime.MessageSender & { documentId?: string }).documentId
    await restore(context)
    let entry = tasks.get(context)
    if (entry?.owner.task.sourceTabId === tab.id && entry.documentId !== documentId)
      entry.owner.invalidateSource()
    if (command.action === 'start' && (!entry || (!entry.owner.task.running && entry.owner.task.items.every(item => item.status === 'success' || item.status === 'skipped')))) {
      entry = { owner: createRefreshTabsTask(tabsApi, tab), documentId }
      tasks.set(context, entry)
      const result = await entry.owner.run()
      await persist(context)
      return result
    }
    if (!entry)
      throw new Error('Refresh task unavailable')
    if (command.action === 'start' || command.action === 'status')
      return entry.owner.task
    if (command.taskId !== entry.owner.task.id)
      throw new Error('Refresh task expired')
    if (command.action === 'retry') {
      const result = await entry.owner.run(true)
      await persist(context)
      return result
    }
    if (command.action === 'finish' && entry.owner.task.sourceTabId === tab.id && entry.documentId === documentId) {
      const owner = entry.owner
      // This second message is an ACK: the initiating document already has the other-tab result.
      setTimeout(() => {
        void owner.finish().then(() => persist(context)).catch(() => {})
      }, SOURCE_RELOAD_ACK_DELAY_MS)
    }
    return entry.owner.task
  })
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading')
      reloads.get(tabId)?.()
    if (change.status === 'loading' || change.url) {
      for (const { owner } of tasks.values()) {
        if (owner.task.sourceTabId === tabId)
          owner.invalidateSource()
      }
    }
  })
  browser.tabs.onRemoved.addListener((tabId) => {
    for (const { owner } of tasks.values()) {
      if (owner.task.sourceTabId === tabId)
        owner.invalidateSource()
    }
  })
}
