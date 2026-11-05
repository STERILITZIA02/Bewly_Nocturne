import browser from 'webextension-polyfill'

import { AUDIO_CDN_DOMAINS, isAudioCdnHost } from '~/constants/audioCdn'
import type { ListenSession } from '~/utils/listenPlayback'
import { isListenSession, LISTEN_GATE, LISTEN_RECOVER, LISTEN_RELEASE, LISTEN_SAVE, matchesListenUnit } from '~/utils/listenPlayback'
import { onMessage } from '~/utils/messaging'
import type { NativePlaybackUnit } from '~/utils/videoMetadataBridge'

const FIRST_GATE = 10_000
const ownerKey = (tabId: number) => `listenGate:${tabId}`
type Rule = browser.DeclarativeNetRequest.Rule

export function setupListenPlayback() {
  if (!browser.declarativeNetRequest?.getSessionRules || !browser.declarativeNetRequest.updateSessionRules)
    return
  const gates = new Map<number, number[]>()
  const units = new Map<number, NativePlaybackUnit>()
  const checkpoints = new Map<number, ListenSession>()
  // Rebuild only the IDs after a service-worker sleep. Signed stream URLs stay
  // in browser session rules while their tab owns the listening session.
  let writes = browser.declarativeNetRequest.getSessionRules().then(async (rules) => {
    for (const rule of rules.sort((a, b) => a.id - b.id)) {
      const tab = rule.condition.tabIds?.[0]
      if (rule.id >= FIRST_GATE && tab !== undefined) {
        const ids = gates.get(tab) ?? []
        ids.push(rule.id)
        gates.set(tab, ids)
      }
    }
    if (!gates.size)
      return
    const owners = await browser.storage.session.get([...gates.keys()].map(ownerKey))
    for (const [tabId, ids] of gates) {
      const tab = await browser.tabs.get(tabId).catch(() => undefined)
      const saved = owners[ownerKey(tabId)] as { unit?: NativePlaybackUnit, state?: ListenSession } | undefined
      const unit = saved?.unit
      if (tab?.url && unit && matchesListenUnit(tab.url, unit)) {
        units.set(tabId, unit)
        if (isListenSession(saved?.state, tab.url) && saved.state.gate === ids[0])
          checkpoints.set(tabId, saved.state)
      }
      else {
        await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids })
        await browser.storage.session.remove(ownerKey(tabId))
        gates.delete(tabId)
      }
    }
  }).catch(error => console.warn('[Bewly Nocturne] Could not restore listening rules:', error))
  function enqueue<T>(action: () => Promise<T>) {
    const result = writes.then(action)
    writes = result.then(() => {}, () => {})
    return result
  }
  function release(tabId: number, gate: number) {
    return enqueue(async () => {
      const ids = gates.get(tabId)
      if (ids?.[0] !== gate)
        return
      await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids })
      gates.delete(tabId)
      units.delete(tabId)
      checkpoints.delete(tabId)
      await browser.storage.session.remove(ownerKey(tabId))
    })
  }
  onMessage<{ unit: NativePlaybackUnit, sources: string[] }, number | undefined>(LISTEN_GATE, async (data, sender) => {
    const tabId = sender?.tab?.id
    if (tabId === undefined || sender?.frameId !== 0 || !sender.url || !matchesListenUnit(sender.url, data?.unit) || !Array.isArray(data.sources))
      return
    const sources = Array.from(new Set(data.sources))
    if (!sources.length || !sources.every(value => URL.canParse(value) && new URL(value).protocol === 'https:' && isAudioCdnHost(new URL(value).hostname)))
      return
    return enqueue(async () => {
      const occupied = new Set(Array.from(gates.values()).flat())
      let id: number
      do {
        id = FIRST_GATE + crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000
      } while (Array.from({ length: sources.length + 2 }, (_, i) => id + i).some(candidate => occupied.has(candidate)))
      const condition = { tabIds: [tabId], initiatorDomains: ['www.bilibili.com'], resourceTypes: ['media', 'xmlhttprequest'] as Rule['condition']['resourceTypes'] }
      const addRules: Rule[] = [
        { id, priority: 1, action: { type: 'block' }, condition: { ...condition, requestDomains: AUDIO_CDN_DOMAINS.filter(domain => domain !== 'hdslb.com') } },
        // hdslb also serves unrelated scripts, pictures and JSON for the sidebar.
        { id: id + 1, priority: 1, action: { type: 'block' }, condition: { ...condition, requestDomains: ['hdslb.com'], regexFilter: '\\.(m4[asv]|mp[34]|flv|webm|aac|flac|ts)(\\?|$)' } },
        ...sources.map((url, i): Rule => ({
          id: id + 2 + i,
          priority: 2,
          action: { type: 'allow' },
          condition: { tabIds: [tabId], initiatorDomains: ['www.bilibili.com'], resourceTypes: ['media'], urlFilter: `|${url}|`, isUrlFilterCaseSensitive: true },
        })),
      ]
      await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: gates.get(tabId) ?? [], addRules })
      const ids = addRules.map(rule => rule.id)
      const previous = checkpoints.get(tabId)
      const state = previous && matchesListenUnit(sender.url!, previous.unit) ? { ...previous, gate: id } : undefined
      try {
        await browser.storage.session.set({ [ownerKey(tabId)]: { unit: data.unit, state } })
      }
      catch (error) {
        await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids })
        gates.delete(tabId)
        units.delete(tabId)
        checkpoints.delete(tabId)
        throw error
      }
      gates.set(tabId, ids)
      units.set(tabId, data.unit)
      if (state)
        checkpoints.set(tabId, state)
      else checkpoints.delete(tabId)
      return id
    })
  })
  onMessage<ListenSession, void>(LISTEN_SAVE, async (state, sender) => {
    const tabId = sender?.tab?.id
    if (tabId === undefined || sender?.frameId !== 0 || !sender.url || !isListenSession(state, sender.url))
      return
    await enqueue(async () => {
      if (gates.get(tabId)?.[0] !== state.gate)
        return
      await browser.storage.session.set({ [ownerKey(tabId)]: { unit: state.unit, state } })
      checkpoints.set(tabId, state)
    })
  })
  onMessage<undefined, ListenSession | undefined>(LISTEN_RECOVER, async (_, sender) => {
    await writes
    const tabId = sender?.tab?.id
    if (tabId === undefined || sender?.frameId !== 0 || !sender.url)
      return
    const state = checkpoints.get(tabId)
    if (state && matchesListenUnit(sender.url, state.unit))
      return state
    // The previous document may have disappeared between reserving the tab
    // and committing its first playable checkpoint.
    const gate = gates.get(tabId)?.[0]
    if (gate !== undefined)
      await release(tabId, gate)
  })
  onMessage<number, void>(LISTEN_RELEASE, async (gate, sender) => {
    if (sender?.tab?.id !== undefined && sender.frameId === 0)
      await release(sender.tab.id, gate)
  })
  function changed(tabId: number, href?: string) {
    const gate = gates.get(tabId)?.[0]
    const unit = units.get(tabId)
    if (gate !== undefined && (!unit || !href || !matchesListenUnit(href, unit)))
      void release(tabId, gate).catch(error => console.warn('[Bewly Nocturne] Failed to release listening rules:', error))
  }
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.url || (change.status === 'complete' && !tab.url))
      changed(tabId, change.url ?? tab.url)
  })
  browser.tabs.onRemoved.addListener(tabId => changed(tabId))
}
