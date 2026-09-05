import browser from 'webextension-polyfill'

import { BILIBILI_DESKTOP_USER_AGENT, isPreventMobileRedirectEnabled } from '~/utils/bilibiliDesktopNavigation'

import { setupContentScriptRefreshPrompt } from './contentScriptRefreshPrompt'
import { setupLoginStateWatcher } from './loginStateWatcher'
import { setupApiMsgListeners } from './messageListeners/api'
import { setupTabMsgListeners } from './messageListeners/tabs'
import { setupSettingsCloudSync } from './settingsCloudSync'
import { setupSettingsStorageCoordinator } from './settingsStorageCoordinator'
import { setupTopBarStateBroker } from './topBarStateBroker'
import { initWbiKeys } from './wbiSign'

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

// 扩展启动时初始化 WBI 密钥
initWbiKeys().catch((error) => {
  console.error('[Bewly Nocturne] WBI keys initialization error:', error)
})

// Setup all message listeners
setupSettingsStorageCoordinator()
setupSettingsCloudSync()
setupApiMsgListeners()
setupTabMsgListeners()
setupTopBarStateBroker()
setupContentScriptRefreshPrompt()
setupLoginStateWatcher()
