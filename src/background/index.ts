import browser from 'webextension-polyfill'

import { BILIBILI_DESKTOP_USER_AGENT, isPreventMobileRedirectEnabled } from '~/utils/bilibiliDesktopNavigation'

import { setupContentScriptRefreshPrompt } from './contentScriptRefreshPrompt'
import { setupLoginStateWatcher } from './loginStateWatcher'
import { setupApiMsgListeners } from './messageListeners/api'
import { setupTabMsgListeners } from './messageListeners/tabs'
import { setupOpenTabsWatchLater } from './openTabsWatchLater'
import { setupRefreshTabs } from './refreshTabs'
import { setupSettingsCloudSync } from './settingsCloudSync'
import { setupSettingsStorageCoordinator } from './settingsStorageCoordinator'
import { setupTopBarStateBroker } from './topBarStateBroker'
import { setupVideoVisitHistoryCoordinator } from './videoVisitHistoryCoordinator'

const PREVENT_MOBILE_REDIRECT_RULE_ID = 1001
const preventMobileRedirectRule: browser.DeclarativeNetRequest.Rule = {
  id: PREVENT_MOBILE_REDIRECT_RULE_ID,
  priority: 2,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [
      {
        header: 'user-agent',
        operation: 'set',
        value: BILIBILI_DESKTOP_USER_AGENT,
      },
      {
        header: 'sec-ch-ua-mobile',
        operation: 'set',
        value: '?0',
      },
      {
        header: 'sec-ch-ua-platform',
        operation: 'set',
        value: '"Windows"',
      },
    ],
  },
  condition: {
    regexFilter: '^https?://www\\.bilibili\\.com/',
    resourceTypes: ['main_frame'],
  },
}

async function syncPreventMobileRedirectRule(enabled: boolean) {
  try {
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [PREVENT_MOBILE_REDIRECT_RULE_ID],
      addRules: enabled ? [preventMobileRedirectRule] : [],
    })
  }
  catch (error) {
    console.error('[Bewly Nocturne] Failed to update the mobile redirect compatibility rule:', error)
  }
}

void browser.storage.local.get('settings').then((result) => {
  return syncPreventMobileRedirectRule(isPreventMobileRedirectEnabled(result.settings))
})

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.settings)
    return

  const enabled = isPreventMobileRedirectEnabled(changes.settings.newValue)
  if (enabled !== isPreventMobileRedirectEnabled(changes.settings.oldValue))
    void syncPreventMobileRedirectRule(enabled)
})

// Signed transports restore/fetch their WBI keys on demand. Waking this worker
// for storage or a hidden tab does not itself start a profile/network request.
// Setup all message listeners
setupSettingsStorageCoordinator()
setupVideoVisitHistoryCoordinator()
setupSettingsCloudSync()
setupApiMsgListeners()
setupTabMsgListeners()
setupTopBarStateBroker()
setupOpenTabsWatchLater()
setupContentScriptRefreshPrompt()
setupRefreshTabs()
setupLoginStateWatcher()
