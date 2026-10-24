import browser from 'webextension-polyfill'

import { BILIBILI_DESKTOP_USER_AGENT, isPreventMobileRedirectEnabled } from '~/utils/bilibiliDesktopNavigation'

import { setupAppClient } from './appClient'
import { setupContentScriptRefreshPrompt } from './contentScriptRefreshPrompt'
import { setupLoginStateWatcher } from './loginStateWatcher'
import { setupApiMsgListeners } from './messageListeners/api'
import { setupTabMsgListeners } from './messageListeners/tabs'
import { setupOpenTabsWatchLater } from './openTabsWatchLater'
import { setupRefreshTabs } from './refreshTabs'
import { setupSettingsCloudSync } from './settingsCloudSync'
import { setupSettingsStorageCoordinator } from './settingsStorageCoordinator'
import { setupStateConsumers } from './stateConsumers'
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

let preventMobileRedirectEnabled: boolean | undefined
let preventMobileRedirectSync = Promise.resolve()

function applyPreventMobileRedirectSetting(storedSettings: unknown) {
  const enabled = isPreventMobileRedirectEnabled(storedSettings)
  if (enabled === preventMobileRedirectEnabled)
    return
  preventMobileRedirectEnabled = enabled
  preventMobileRedirectSync = preventMobileRedirectSync.then(() => syncPreventMobileRedirectRule(enabled))
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.settings)
    return

  applyPreventMobileRedirectSetting(changes.settings.newValue)
})

void browser.storage.local.get('settings').then((result) => {
  // onChanged received during the read is newer than this startup snapshot.
  if (preventMobileRedirectEnabled === undefined)
    applyPreventMobileRedirectSetting(result.settings)
}).catch(error => console.error('[Bewly Nocturne] Failed to read the mobile redirect setting:', error))

// Signed transports restore/fetch their WBI keys on demand. Waking this worker
// for storage or a hidden tab does not itself start a profile/network request.
// Setup all message listeners
setupStateConsumers()
setupSettingsStorageCoordinator()
setupVideoVisitHistoryCoordinator()
setupSettingsCloudSync()
setupApiMsgListeners()
setupAppClient()
setupTabMsgListeners()
setupTopBarStateBroker()
setupOpenTabsWatchLater()
setupContentScriptRefreshPrompt()
setupRefreshTabs()
setupLoginStateWatcher()
