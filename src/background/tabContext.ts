import type { Runtime, Tabs } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { isContentScriptTargetUrl } from '~/constants/contentScript'

export function requireSupportedTabSender(sender?: Runtime.MessageSender): Tabs.Tab & { id: number } {
  if (sender?.id !== browser.runtime.id || sender.tab?.id === undefined || !isContentScriptTargetUrl(sender.url))
    throw new Error('Unsupported sender')
  return sender.tab as Tabs.Tab & { id: number }
}

export function sameTabContext(tab: Pick<Tabs.Tab, 'incognito'>, incognito: boolean) {
  return Boolean(tab.incognito) === incognito
}
