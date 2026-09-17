import type { Runtime } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import type { OpenTabsCommand, OpenTabsTask } from '~/constants/openTabsWatchLater'
import { OPEN_TABS_WATCH_LATER, OPEN_TABS_WATCH_LATER_UPDATED } from '~/constants/openTabsWatchLater'
import { onMessage } from '~/utils/messaging'
import { findPgcEpisodeVideoIds } from '~/utils/pgcEpisode'
import { parsePlaybackTabUrl } from '~/utils/playbackTab'
import type { WatchLaterWriteResponse } from '~/utils/watchLaterWrite'

import { onAccountCookieChange } from './loginStateWatcher'
import API_ANIME from './messageListeners/api/anime'
import API_VIDEO from './messageListeners/api/video'
import API_WATCHLATER from './messageListeners/api/watchLater'
import { createOpenTabsWatchLaterTask } from './openTabsWatchLaterTask'
import { requireSupportedTabSender, sameTabContext } from './tabContext'
import { apiListenerFactory } from './utils'

const request = apiListenerFactory({ ...API_ANIME, ...API_VIDEO, ...API_WATCHLATER })
const STORAGE_PREFIX = 'watchLater:open-tabs:'

/** Background ownership survives popup/page disposal; session snapshots never contain credentials. */
export function setupOpenTabsWatchLater(reconcile: (accountId: number, incognito: boolean) => Promise<void>) {
  const tasks = new Map<boolean, OpenTabsTask>()
  const runners = new Map<boolean, ReturnType<typeof createOpenTabsWatchLaterTask>>()
  const taskCookieStores = new Map<boolean, string>()
  const viewers = new Map<number, boolean>()
  let commands = Promise.resolve()

  async function readAccount(tabId: number) {
    const stores = await browser.cookies.getAllCookieStores()
    const storeId = stores.find(store => store.tabIds.includes(tabId))?.id
    if (storeId === undefined)
      throw new Error('Account context unavailable')
    const cookies = await Promise.all(['DedeUserID', 'bili_jct', 'SESSDATA'].map(name => browser.cookies.get({ url: 'https://www.bilibili.com/', name, storeId })))
    const [mid, csrf, session] = cookies.map(cookie => cookie?.value ?? '')
    if (!/^\d+$/.test(mid) || !csrf || !session)
      throw new Error('Login required')
    return { accountId: Number(mid), csrf, session, storeId }
  }

  async function publish(task: OpenTabsTask) {
    try {
      await browser.storage.session.set({ [`${STORAGE_PREFIX}${task.incognito}`]: task })
    }
    finally {
      await Promise.allSettled([...viewers].filter(([, context]) => context === task.incognito)
        .map(([tabId]) => browser.tabs.sendMessage(tabId, { type: OPEN_TABS_WATCH_LATER_UPDATED, data: task })))
    }
  }

  async function getTask(incognito: boolean) {
    if (tasks.has(incognito))
      return tasks.get(incognito)
    const key = `${STORAGE_PREFIX}${incognito}`
    const saved = (await browser.storage.session.get(key))[key] as OpenTabsTask | undefined
    if (!saved || !Array.isArray(saved.items) || saved.incognito !== incognito)
      return
    if (saved.status === 'running') {
      saved.status = 'stopped'
      saved.stopReason = 'interrupted'
      for (const item of saved.items) {
        if (item.status === 'sending') {
          item.status = 'unknown'
          item.reason = 'unknown'
        }
        else if (item.status === 'resolving') {
          item.status = 'pending'
        }
      }
    }
    tasks.set(incognito, saved)
    return saved
  }

  async function handle(command: OpenTabsCommand, sender?: Runtime.MessageSender) {
    const tab = requireSupportedTabSender(sender)
    const incognito = Boolean(tab.incognito)
    if (command.action === 'unsubscribe') {
      viewers.delete(tab.id)
      return null
    }
    // Split-mode workers use the same cookie context as their sending tabs.
    if (Boolean(browser.extension.inIncognitoContext) !== incognito)
      throw new Error('Reload the extension to enable isolated private-context tasks')
    viewers.set(tab.id, incognito)
    let task = await getTask(incognito)
    if (command.action === 'get')
      return task?.accountId === command.accountId ? task : null
    if (command.action === 'stop') {
      if (task && task.id === command.taskId && task.accountId === command.accountId)
        runners.get(incognito)?.stop()
      return task?.accountId === command.accountId ? task : null
    }
    const account = await readAccount(tab.id)
    if (account.accountId !== command.accountId)
      throw new Error('Account changed')
    if (task?.status === 'running')
      return task.accountId === account.accountId ? task : null
    if (command.action === 'prepare') {
      const tabs = await browser.tabs.query({ url: ['*://*.bilibili.com/*', '*://bilibili.com/*'] })
      task = {
        id: crypto.randomUUID(),
        accountId: account.accountId,
        incognito,
        status: 'ready',
        items: tabs.flatMap((item) => {
          const url = item.pendingUrl ?? item.url
          const target = url && parsePlaybackTabUrl(url)
          return item.id !== undefined && item.windowId !== undefined && url && target && sameTabContext(item, incognito)
            ? [{ tabId: item.id, windowId: item.windowId, incognito, url, title: item.title ?? url, target, status: 'pending' as const }]
            : []
        }),
      }
      tasks.set(incognito, task)
      await publish(task)
      return task
    }
    if (!task || task.id !== command.taskId || task.accountId !== account.accountId
      || !['start', 'retry'].includes(command.action) || (command.action === 'start' && task.status !== 'ready')) {
      throw new Error('Task expired; confirm a new snapshot')
    }
    const snapshot = task
    const runner = createOpenTabsWatchLaterTask(snapshot, {
      async accountCurrent() {
        // The initiating tab can close. The cookie store, not its page, owns this task.
        const [mid, csrf, session] = await Promise.all(['DedeUserID', 'bili_jct', 'SESSDATA'].map(name => browser.cookies.get({ url: 'https://www.bilibili.com/', name, storeId: account.storeId })))
        return Number(mid?.value) === account.accountId && csrf?.value === account.csrf && session?.value === account.session
      },
      async sourceCurrent(item) {
        const source = await browser.tabs.get(item.tabId).catch(() => undefined)
        return Boolean(source && sameTabContext(source, incognito) && (source.pendingUrl ?? source.url) === item.url)
      },
      async readMembership() {
        const response = await request({ contentScriptQuery: 'getAllWatchLaterList' }, sender) as { code: number, data?: { list?: { aid: number }[] } }
        if (response.code !== 0 || !response.data || (response.data.list !== undefined && !Array.isArray(response.data.list)))
          throw new Error('Membership unavailable')
        return (response.data.list ?? []).map(item => item.aid)
      },
      async resolveAid(item) {
        const target = item.target
        if ('aid' in target)
          return target.aid
        if ('seasonId' in target)
          return undefined // SS does not identify the currently playing episode.
        if ('epid' in target) {
          const response = await request({ contentScriptQuery: 'getAnimeDetail', ep_id: target.epid }, sender) as { code: number, result?: unknown, data?: unknown }
          if (response.code !== 0)
            throw new Error('Episode unavailable')
          return findPgcEpisodeVideoIds(response.result ?? response.data, target.epid)?.aid
        }
        const response = await request({ contentScriptQuery: 'getVideoInfo', bvid: target.bvid }, sender) as { code: number, data?: { aid: number, bvid: string } }
        if (response.code !== 0)
          throw new Error('Video unavailable')
        return response.data?.bvid === target.bvid && Number.isSafeInteger(response.data.aid) && response.data.aid > 0 ? response.data.aid : undefined
      },
      add: aid => request({ contentScriptQuery: 'saveToWatchLater', aid, csrf: account.csrf }, sender) as Promise<WatchLaterWriteResponse>,
      changed: () => publish(snapshot),
      reconcile: () => reconcile(account.accountId, incognito),
    })
    runners.set(incognito, runner)
    taskCookieStores.set(incognito, account.storeId)
    void runner.start(command.action === 'retry').finally(() => {
      if (runners.get(incognito) === runner) {
        runners.delete(incognito)
        taskCookieStores.delete(incognito)
      }
    }).catch(() => {})
    return snapshot
  }

  onMessage<OpenTabsCommand>(OPEN_TABS_WATCH_LATER, (command, sender) => {
    const result = commands.then(() => handle(command, sender))
    commands = result.then(() => {}, () => {})
    return result
  })
  browser.tabs.onRemoved.addListener(tabId => viewers.delete(tabId))
  onAccountCookieChange((storeId) => {
    for (const [context, currentStore] of taskCookieStores) {
      if (currentStore === storeId)
        runners.get(context)?.stop('accountChanged')
    }
  })
}
