import type { Runtime } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_MATCHES } from '~/constants/contentScript'
import { WATCH_LATER_STATE_UPDATED } from '~/constants/watchLaterState'
import type { WatchLaterResult } from '~/models/video/watchLater'
import type { ReadRequestOptions } from '~/utils/abort'
import { toWatchLaterEntry } from '~/utils/watchLaterSnapshot'
import type { WatchLaterWriteResponse } from '~/utils/watchLaterWrite'

import type { APIMAP } from '../../utils'
import { AHS, doRequest } from '../../utils'
import { createWatchLaterStateBroker } from '../../watchLaterStateBroker'

const endpoints = {
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/history&toview/toview.md#%E8%A7%86%E9%A2%91%E6%B7%BB%E5%8A%A0%E7%A8%8D%E5%90%8E%E5%86%8D%E7%9C%8B
  saveToWatchLater: {
    url: 'https://api.bilibili.com/x/v2/history/toview/add',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        aid: 0,
        bvid: '',
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/history&toview/toview.md#%E5%88%A0%E9%99%A4%E7%A8%8D%E5%90%8E%E5%86%8D%E7%9C%8B%E8%A7%86%E9%A2%91
  removeFromWatchLater: {
    url: 'https://api.bilibili.com/x/v2/history/toview/del',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        viewed: false,
        csrf: '',
      },
    },
    params: {
      aid: 0,
    },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/history&toview/toview.md#%E8%8E%B7%E5%8F%96%E7%A8%8D%E5%90%8E%E5%86%8D%E7%9C%8B%E8%A7%86%E9%A2%91%E5%88%97%E8%A1%A8
  getAllWatchLaterList: {
    url: 'https://api.bilibili.com/x/v2/history/toview',
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 分页获取稍后再看列表
  getWatchLaterListByPage: {
    url: 'https://api.bilibili.com/x/v2/history/toview/web',
    _fetch: {
      method: 'get',
    },
    params: {
      pn: 1,
      ps: 20,
    },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/history&toview/toview.md#%E6%B8%85%E7%A9%BA%E7%A8%8D%E5%90%8E%E5%86%8D%E7%9C%8B%E8%A7%86%E9%A2%91%E5%88%97%E8%A1%A8
  clearAllWatchLater: {
    url: 'https://api.bilibili.com/x/v2/history/toview/clear',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

const privateContext = Boolean(browser.extension?.inIncognitoContext)
const state = createWatchLaterStateBroker({
  storage: browser.storage.session,
  storageKey: `watchLaterState:v1:${privateContext ? 'private' : 'normal'}`,
  async account() {
    const [mid, csrf] = await Promise.all(['DedeUserID', 'bili_jct'].map(name => browser.cookies.get({ url: 'https://www.bilibili.com/', name })))
    return { accountId: Number(mid?.value) || 0, csrf: csrf?.value ?? '' }
  },
  read: (full, signal) => doRequest(
    full ? { contentScriptQuery: 'watchLaterMembership' } : { contentScriptQuery: 'watchLaterCount', pn: 1, ps: 1 },
    full ? endpoints.getAllWatchLaterList : endpoints.getWatchLaterListByPage,
    { signal },
  ) as Promise<{ code: number, data?: { count: number, list?: { aid: number, bvid?: string }[] } }>,
  async broadcast(update) {
    const tabs = await browser.tabs.query({ url: [...CONTENT_SCRIPT_MATCHES] }).catch(() => [])
    await Promise.allSettled(tabs.filter(tab => tab.id !== undefined && Boolean(tab.incognito) === privateContext)
      .map(tab => browser.tabs.sendMessage(tab.id!, { type: WATCH_LATER_STATE_UPDATED, data: update })))
  },
})

function checkContext(sender?: Runtime.MessageSender) {
  if (sender?.tab && Boolean(sender.tab.incognito) !== privateContext)
    throw new Error('Watch Later privacy context changed')
}

interface ReadOptions { contentScriptQuery?: string, accountId?: number, force?: boolean }
interface WriteOptions extends ReadOptions { aid?: number, bvid?: string, epid?: number, viewed?: boolean, csrf?: string }

const API_WATCHLATER = {
  async getWatchLaterState(options: ReadOptions = {}, sender?: Runtime.MessageSender) {
    checkContext(sender)
    return { code: 0, data: await state.readMembership(options.accountId, options.force) }
  },
  async getWatchLaterCount(options: ReadOptions = {}, sender?: Runtime.MessageSender) {
    checkContext(sender)
    return { code: 0, data: await state.readCount(options.accountId, options.force) }
  },
  async invalidateWatchLaterState(options: ReadOptions = {}, sender?: Runtime.MessageSender) {
    checkContext(sender)
    return { code: 0, data: await state.invalidate(options.accountId) }
  },
  async getWatchLaterListByPage(options: ReadOptions & { pn?: number, ps?: number } = {}, sender?: Runtime.MessageSender, readOptions?: ReadRequestOptions) {
    checkContext(sender)
    return state.readPage(options.accountId, signal => doRequest({
      contentScriptQuery: 'getWatchLaterListByPage',
      pn: options.pn,
      ps: options.ps,
    }, endpoints.getWatchLaterListByPage, { signal }) as Promise<WatchLaterResult>, readOptions)
  },
  async getWatchLaterLibrary(options: ReadOptions = {}, sender?: Runtime.MessageSender, readOptions?: ReadRequestOptions) {
    checkContext(sender)
    return state.readPage(options.accountId, signal => doRequest({
      contentScriptQuery: 'getWatchLaterLibrary',
    }, endpoints.getAllWatchLaterList, { signal }) as Promise<WatchLaterResult>, readOptions)
  },
  async saveToWatchLater(options: WriteOptions = {}, sender?: Runtime.MessageSender) {
    checkContext(sender)
    const entry = toWatchLaterEntry(options)
    if (!entry)
      throw new TypeError('Watch Later requires a resolved aid')
    return state.write(options.accountId, options.csrf ?? '', { type: 'add', entry }, () => doRequest({
      contentScriptQuery: 'saveToWatchLater',
      aid: entry.aid,
      bvid: entry.bvid,
      csrf: options.csrf,
    }, endpoints.saveToWatchLater) as Promise<WatchLaterWriteResponse>)
  },
  async removeFromWatchLater(options: WriteOptions = {}, sender?: Runtime.MessageSender) {
    checkContext(sender)
    const entry = toWatchLaterEntry(options)
    if (!entry && !options.viewed)
      throw new TypeError('Watch Later requires a resolved aid')
    return state.write(options.accountId, options.csrf ?? '', entry ? { type: 'remove', entry } : { type: 'invalidate' }, () => doRequest({
      contentScriptQuery: 'removeFromWatchLater',
      aid: entry?.aid,
      viewed: options.viewed ?? false,
      csrf: options.csrf,
    }, endpoints.removeFromWatchLater) as Promise<WatchLaterWriteResponse>)
  },
  async clearAllWatchLater(options: WriteOptions = {}, sender?: Runtime.MessageSender) {
    checkContext(sender)
    return state.write(options.accountId, options.csrf ?? '', { type: 'clear' }, () => doRequest({
      contentScriptQuery: 'clearAllWatchLater',
      csrf: options.csrf,
    }, endpoints.clearAllWatchLater) as Promise<WatchLaterWriteResponse>)
  },
} satisfies APIMAP

export default API_WATCHLATER
