import type { Scripting, Tabs } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_COMMIT, CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG, isContentScriptTargetUrl, isCurrentContentScriptPong } from '~/constants/contentScript'
import { getRefreshTabsCopy } from '~/constants/refreshTabs'
import { LanguageType } from '~/enums/appEnums'

const CONTENT_SCRIPT_STARTUP_RETRY_DELAYS = [500, 1500]
const CONTENT_SCRIPT_PING_TIMEOUT_MS = 2_000
type RefreshReason = 'starting' | 'unreachable' | 'version-mismatch' | 'identity-mismatch'

type RefreshPromptCopy = Partial<ReturnType<typeof getRefreshTabsCopy>> & {
  reason?: RefreshReason
  reasonDescription?: string
  diagnostic?: string
  runtimeUrl?: string
  currentVersion: string
  refresh: string
  later: string
  missingDescription: string
  missingTitle: string
  updatedDescription: string
  updatedTitle: string
}

export interface ContentScriptRefreshBrowser {
  tabs: Pick<Tabs.Static, 'get' | 'sendMessage'>
  scripting: Pick<Scripting.Static, 'executeScript'>
}

export type ContentScriptRefreshResult = 'ineligible' | 'already-injected' | 'refresh-prompted'

function getRefreshPromptCopy(locale: string, currentVersion: string): RefreshPromptCopy {
  return { ...getBaseRefreshPromptCopy(locale, currentVersion), ...getRefreshTabsCopy(locale) }
}

function getBaseRefreshPromptCopy(locale: string, currentVersion: string): RefreshPromptCopy {
  const normalizedLocale = locale.toLowerCase()

  if (
    normalizedLocale === LanguageType.Mandarin_TW.toLowerCase()
    || normalizedLocale === LanguageType.Cantonese
    || normalizedLocale.startsWith('zh-tw')
    || normalizedLocale.startsWith('zh-hk')
  ) {
    return {
      currentVersion,
      refresh: '立即重新整理',
      later: '稍後',
      missingTitle: 'Bewly Nocturne 需要重新整理頁面',
      missingDescription: '擴充功能已重新載入。重新整理頁面以恢復完整樣式與功能。',
      updatedTitle: 'Bewly Nocturne 已更新',
      updatedDescription: '目前頁面仍在執行舊版本。重新整理後套用 v{version}。',
    }
  }

  if (normalizedLocale === LanguageType.Mandarin_CN.toLowerCase() || normalizedLocale.startsWith('zh')) {
    return {
      currentVersion,
      refresh: '立即刷新',
      later: '稍后',
      missingTitle: 'Bewly Nocturne 需要刷新页面',
      missingDescription: '扩展已重新加载。刷新页面以恢复完整样式和功能。',
      updatedTitle: 'Bewly Nocturne 已更新',
      updatedDescription: '当前页面仍在运行旧版本。刷新后应用 v{version}。',
    }
  }

  if (normalizedLocale.startsWith('ja')) {
    return {
      currentVersion,
      refresh: '今すぐ再読み込み',
      later: '後で',
      missingTitle: 'Bewly Nocturne の再読み込みが必要です',
      missingDescription: '拡張機能が再読み込みされました。ページを再読み込みして、スタイルと機能を復元してください。',
      updatedTitle: 'Bewly Nocturne が更新されました',
      updatedDescription: 'このページでは古いバージョンが実行されています。再読み込みして v{version} を適用してください。',
    }
  }

  if (normalizedLocale.startsWith('ko')) {
    return {
      currentVersion,
      refresh: '지금 새로고침',
      later: '나중에',
      missingTitle: 'Bewly Nocturne 페이지 새로고침 필요',
      missingDescription: '확장 프로그램이 다시 로드되었습니다. 전체 스타일과 기능을 복원하려면 페이지를 새로고침하세요.',
      updatedTitle: 'Bewly Nocturne 업데이트됨',
      updatedDescription: '이 페이지는 이전 버전을 실행 중입니다. 새로고침하여 v{version}을 적용하세요.',
    }
  }

  return {
    currentVersion,
    refresh: 'Refresh now',
    later: 'Later',
    missingTitle: 'Bewly Nocturne needs a page refresh',
    missingDescription: 'The extension was reloaded. Refresh this page to restore all styles and features.',
    updatedTitle: 'Bewly Nocturne was updated',
    updatedDescription: 'This page is still running an older version. Refresh to apply v{version}.',
  }
}

function getStoredLanguage(value: unknown): string | undefined {
  let storedSettings = value

  if (typeof storedSettings === 'string') {
    try {
      storedSettings = JSON.parse(storedSettings)
    }
    catch {
      return undefined
    }
  }

  if (typeof storedSettings !== 'object' || storedSettings === null || Array.isArray(storedSettings))
    return undefined

  const language = (storedSettings as Record<string, unknown>).language
  return typeof language === 'string' && language ? language : undefined
}

async function getRefreshPromptLocale(): Promise<string> {
  try {
    const stored = await browser.storage.local.get('settings')
    return getStoredLanguage(stored.settings) || browser.i18n.getUILanguage()
  }
  catch {
    return browser.i18n.getUILanguage()
  }
}

function showRefreshPrompt(...args: unknown[]): void {
  // Keep constants inside the function serialized into the isolated page world.
  const MESSAGE_TIMEOUT_MS = 5_000
  const TASK_WAIT_TIMEOUT_MS = 30_000
  const STATUS_CHECK_INTERVAL_MS = 400
  const [copy, expectedUrl, checkStartedAt] = args as [RefreshPromptCopy, string?, number?]
  if ((expectedUrl && location.href !== expectedUrl) || (checkStartedAt && performance.timeOrigin > checkStartedAt))
    return
  const health = (globalThis as typeof globalThis & { __BEWLY_NOCTURNE_RUNTIME_HEALTH__?: { checkedAt: number, version: string, runtimeUrl: string } }).__BEWLY_NOCTURNE_RUNTIME_HEALTH__
  if (health && checkStartedAt && health.checkedAt >= checkStartedAt
    && health.version === copy.currentVersion && health.runtimeUrl === copy.runtimeUrl) {
    return
  }
  const promptId = 'bewlycat-refresh-required'
  const existingPrompt = document.getElementById(promptId)

  const bindRefreshAll = (host: HTMLElement) => {
    const shadow = host.shadowRoot
    const actions = shadow?.querySelector('.actions')
    if (!actions || !copy.refreshAllMessage)
      return
    const button = actions.querySelector<HTMLButtonElement>('[data-refresh-all]') ?? document.createElement('button')
    button.type = 'button'
    button.dataset.refreshAll = ''
    if (!button.disabled)
      button.textContent = button.dataset.retry ? copy.refreshAllRetry! : copy.refreshAll!
    button.title = copy.refreshAllWarning!
    if (!button.isConnected)
      actions.prepend(button)
    const status = shadow!.querySelector<HTMLElement>('[data-refresh-status]') ?? document.createElement('p')
    status.dataset.refreshStatus = ''
    status.className = 'description'
    status.setAttribute('role', 'status')
    if (!status.isConnected)
      actions.after(status)
    button.onclick = async (event) => {
      if (!event.isTrusted || button.disabled || !window.confirm(copy.refreshAllWarning))
        return
      const initialHref = location.href
      const current = () => host.isConnected && !host.hidden && location.href === initialHref
      button.disabled = true
      button.textContent = copy.refreshAllBusy!
      const runtime = (globalThis as typeof globalThis & { chrome?: typeof browser, browser?: typeof browser }).browser?.runtime
        ?? (globalThis as typeof globalThis & { chrome?: typeof browser }).chrome?.runtime
      const send = (action: string): Promise<import('./refreshTabsTask').RefreshTabsTask> => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Refresh request timed out')), MESSAGE_TIMEOUT_MS)
        Promise.resolve().then(() => {
          if (!runtime)
            throw new Error('Runtime unavailable')
          return runtime.sendMessage({ type: copy.refreshAllMessage, data: { action, taskId: button.dataset.taskId } })
        }).then(value => resolve(value as import('./refreshTabsTask').RefreshTabsTask), reject).finally(() => clearTimeout(timeout))
      })
      try {
        let result = await send(button.dataset.taskId ? 'retry' : 'start')
        const deadline = Date.now() + TASK_WAIT_TIMEOUT_MS
        while (result?.running && current() && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, STATUS_CHECK_INTERVAL_MS))
          result = await send('status')
        }
        if (!current())
          return
        if (!result?.id || !Array.isArray(result.items) || result.running)
          throw new Error('Refresh incomplete')
        button.dataset.taskId = result.id
        const render = (value: typeof result) => {
          const counts = { pending: 0, success: 0, skipped: 0, failed: 0 }
          value.items.forEach(item => counts[item.status]++)
          status.textContent = copy.refreshAllResult!.replace(/\{(pending|success|skipped|failed)\}/g, (_, key: keyof typeof counts) => String(counts[key]))
          button.dataset.retry = counts.failed ? 'true' : ''
          return counts
        }
        if (!render(result).failed) {
          // The result is now visible. Only this ACK allows the background to refresh us last.
          await send('finish')
          await new Promise(resolve => setTimeout(resolve, STATUS_CHECK_INTERVAL_MS))
          if (current())
            render(await send('status'))
        }
      }
      catch {
        if (current())
          status.textContent = copy.refreshAllFailed!
      }
      finally {
        button.disabled = false
        button.textContent = button.dataset.retry ? copy.refreshAllRetry! : copy.refreshAll!
      }
    }
  }

  if (existingPrompt) {
    if (existingPrompt.dataset.dismissedVersion === copy.currentVersion)
      return
    const shadow = existingPrompt.shadowRoot
    const description = shadow?.querySelector('.description')
    if (description)
      description.textContent = copy.reasonDescription ?? copy.missingDescription
    existingPrompt.dataset.reason = copy.reason ?? 'unreachable'
    existingPrompt.dataset.promptVersion = copy.currentVersion
    existingPrompt.dataset.runtimeUrl = copy.runtimeUrl ?? ''
    const title = shadow?.querySelector('.title')
    if (title)
      title.textContent = copy.reason === 'version-mismatch' ? copy.updatedTitle : copy.missingTitle
    existingPrompt.hidden = false
    existingPrompt.style.setProperty('display', 'block', 'important')
    existingPrompt.title = copy.diagnostic ?? ''
    bindRefreshAll(existingPrompt)
    return
  }

  const bewlyContainer = document.querySelector<HTMLElement>('#bewly')
  const runningVersion = bewlyContainer?.dataset.version
  const versionChanged = Boolean(runningVersion && runningVersion !== copy.currentVersion)
  const pageUsesDarkTheme = document.documentElement.classList.contains('dark')
    || document.documentElement.classList.contains('bili_dark')
    || document.body?.classList.contains('dark') === true
  const theme = bewlyContainer
    ? (bewlyContainer.classList.contains('dark') ? 'dark' : 'light')
    : (pageUsesDarkTheme || matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const edgeOffset = matchMedia('(max-width: 560px)').matches ? '16px' : '24px'
  const host = document.createElement('div')
  host.id = promptId
  host.dataset.theme = theme
  host.dataset.reason = copy.reason ?? 'unreachable'
  host.dataset.promptVersion = copy.currentVersion
  host.dataset.runtimeUrl = copy.runtimeUrl ?? ''
  host.title = copy.diagnostic ?? ''
  host.style.setProperty('all', 'initial', 'important')
  host.style.setProperty('position', 'fixed', 'important')
  host.style.setProperty('left', edgeOffset, 'important')
  host.style.setProperty('bottom', edgeOffset, 'important')
  host.style.setProperty('z-index', '2147483647', 'important')
  host.style.setProperty('display', 'block', 'important')

  const themeSource = bewlyContainer ?? document.documentElement
  const themeStyles = getComputedStyle(themeSource)
  const themeProperties = [
    '--bew-theme-color',
    '--bew-theme-focus-ring',
    '--bew-on-theme-color',
    '--bew-dark-base-color',
    '--bew-text-1',
    '--bew-text-2',
    '--bew-border-color',
    '--bew-surface-border-color',
    '--bew-elevated',
    '--bew-elevated-solid',
    '--bew-elevated-solid-hover',
    '--bew-fill-1',
    '--bew-fill-2',
    '--bew-filter-glass-1',
    '--bew-radius',
    '--bew-panel-radius',
    '--bew-interactive-radius',
    '--bew-font-size-control',
    '--bew-font-size-body',
    '--bew-line-height-control',
    '--bew-line-height-body',
    '--bew-font-weight-regular',
    '--bew-font-weight-semibold',
    '--bew-space-2',
    '--bew-space-3',
    '--bew-control-height',
    '--bew-control-item-padding-x',
    '--bew-duration-fast',
    '--bew-duration-moderate',
    '--bew-ease-emphasized',
    '--bew-ease-standard',
    '--bew-shadow-3',
    '--bew-shadow-edge-glow-1',
  ]
  themeProperties.forEach((property) => {
    const value = themeStyles.getPropertyValue(property).trim()
    if (value)
      host.style.setProperty(property, value)
  })
  if (themeStyles.fontFamily)
    host.style.setProperty('font-family', themeStyles.fontFamily, 'important')

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    /*
     * This prompt runs in an isolated Shadow DOM after the previous content script
     * becomes unavailable. Mirror the shared tokens when present and keep fallbacks
     * so pages from older extension versions still render consistently.
     */
    :host {
      font-family: inherit;
    }
    :host([data-theme="light"]) {
      color-scheme: light;
    }
    :host([data-theme="dark"]) {
      color-scheme: dark;
    }
    .prompt {
      position: relative;
      box-sizing: border-box;
      width: min(360px, calc(100vw - 24px));
      min-height: 0;
      padding: var(--bew-space-3, 12px);
      color: var(--bew-text-1, #18191c);
      background: var(--bew-elevated-solid, rgb(255 255 255 / 96%));
      background: color-mix(in oklab, var(--bew-elevated-solid, white) 90%, transparent);
      border: 1px solid var(--bew-surface-border-color, rgb(0 0 0 / 10%));
      border-radius: var(--bew-panel-radius, var(--bew-radius, 12px));
      box-shadow: var(--bew-shadow-edge-glow-1, 0 0 0 transparent), var(--bew-shadow-3, 0 8px 30px rgb(0 0 0 / 18%));
      backdrop-filter: var(--bew-filter-glass-1, blur(12px));
      animation: prompt-in var(--bew-duration-moderate, 300ms) var(--bew-ease-emphasized, ease) both;
      overflow: hidden;
    }
    .content {
      min-width: 0;
    }
    .title {
      margin: 0;
      font-size: var(--bew-font-size-body, 14px);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-body, 20px);
      overflow-wrap: anywhere;
    }
    .description {
      margin: 2px 0 0;
      color: var(--bew-text-2, #61666d);
      font-size: var(--bew-font-size-control, 12px);
      font-weight: var(--bew-font-weight-regular, 400);
      line-height: var(--bew-line-height-control, 16px);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--bew-space-2, 8px);
      margin-top: var(--bew-space-3, 12px);
    }
    button {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      height: var(--bew-control-height, 36px);
      padding: 0 var(--bew-control-item-padding-x, 12px);
      color: var(--bew-text-1, #18191c);
      font: inherit;
      font-size: var(--bew-font-size-control, 12px);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-control, 16px);
      background: transparent;
      border: 0;
      border-radius: var(--bew-interactive-radius, 8px);
      cursor: pointer;
      transition:
        background-color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        transform var(--bew-duration-moderate, 300ms) var(--bew-ease-emphasized, ease);
    }
    button:hover {
      color: var(--bew-text-1, #18191c);
      background: var(--bew-fill-2, rgb(0 0 0 / 8%));
    }
    button:active {
      transform: scale(0.95);
    }
    button:focus-visible {
      outline: 2px solid var(--bew-theme-focus-ring, #00aeec);
      outline-offset: 2px;
    }
    button:disabled { opacity: 0.6; cursor: wait; }
    .primary {
      color: var(--bew-on-theme-color, white);
      background: var(--bew-theme-color, #00aeec);
    }
    .primary:hover {
      color: var(--bew-on-theme-color, white);
      background: var(--bew-theme-color, #00aeec);
    }
    :host([data-theme="dark"]) .prompt {
      color: var(--bew-text-1, #f1f2f3);
      background: var(--bew-elevated-solid, #2b2d31);
      background: color-mix(in oklab, var(--bew-elevated-solid, #2b2d31) 90%, transparent);
      border-color: var(--bew-border-color, rgb(255 255 255 / 12%));
      box-shadow: var(--bew-shadow-edge-glow-1, 0 0 0 transparent), var(--bew-shadow-3, 0 8px 30px rgb(0 0 0 / 38%));
    }
    :host([data-theme="dark"]) .description {
      color: var(--bew-text-2, #c9ccd0);
    }
    :host([data-theme="dark"]) button {
      color: var(--bew-text-2, #c9ccd0);
      border-color: var(--bew-border-color, rgb(255 255 255 / 14%));
    }
    :host([data-theme="dark"]) .primary,
    :host([data-theme="dark"]) .primary:hover {
      color: var(--bew-on-theme-color, white);
    }
    :host([data-theme="dark"]) .primary {
      background: var(--bew-theme-color, #00aeec);
    }
    :host([data-theme="dark"]) .primary:hover {
      background: var(--bew-theme-color, #00aeec);
    }
    @supports not (background: color-mix(in oklab, black, white)) {
      :host([data-theme="dark"]) .prompt {
        background: #2b2d31;
      }
    }
    @keyframes prompt-in {
      from {
        opacity: 0;
        filter: blur(3px);
        transform: translate3d(-18px, 4px, 0) scale(0.98);
      }
      to {
        opacity: 1;
        filter: blur(0);
        transform: translate3d(0, 0, 0) scale(1);
      }
    }
  `

  const prompt = document.createElement('aside')
  prompt.className = 'prompt'
  prompt.setAttribute('role', 'alert')

  const header = document.createElement('div')
  header.className = 'header'

  const content = document.createElement('div')
  content.className = 'content'

  const title = document.createElement('p')
  title.className = 'title'
  title.textContent = versionChanged ? copy.updatedTitle : copy.missingTitle

  const description = document.createElement('p')
  description.className = 'description'
  description.textContent = (copy.reasonDescription ?? (versionChanged ? copy.updatedDescription : copy.missingDescription))
    .replace('{version}', copy.currentVersion)

  const actions = document.createElement('div')
  actions.className = 'actions'

  const laterButton = document.createElement('button')
  laterButton.type = 'button'
  laterButton.textContent = copy.later
  laterButton.addEventListener('click', () => {
    host.dataset.dismissedVersion = host.dataset.promptVersion
    host.hidden = true
    host.style.setProperty('display', 'none', 'important')
  })

  const refreshButton = document.createElement('button')
  refreshButton.type = 'button'
  refreshButton.className = 'primary'
  refreshButton.textContent = copy.refresh
  refreshButton.addEventListener('click', () => location.reload())

  content.append(title, description)
  header.append(content)
  actions.append(laterButton, refreshButton)
  prompt.append(header, actions)
  shadow.append(style, prompt)
  document.documentElement.appendChild(host)
  bindRefreshAll(host)
}

async function getEligibleActiveTab(tabId: number, extensionApi: ContentScriptRefreshBrowser): Promise<Tabs.Tab | undefined> {
  try {
    const tab = await extensionApi.tabs.get(tabId)
    if (tab.active === true
      && tab.status === 'complete'
      && tab.discarded !== true
      && isContentScriptTargetUrl(tab.url)) {
      return tab
    }
  }
  catch {
    return undefined
  }
}

async function pingContentScript(tabId: number, extensionApi: ContentScriptRefreshBrowser) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const manifest = browser.runtime.getManifest()
    const expected = {
      commit: CONTENT_SCRIPT_COMMIT,
      name: manifest.name,
      version: manifest.version,
      runtimeUrl: browser.runtime.getURL(''),
    }
    const response = await Promise.race([
      extensionApi.tabs.sendMessage(tabId, { type: CONTENT_SCRIPT_PING, expectedIdentity: expected }, { frameId: 0 }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Content script ping timeout')), CONTENT_SCRIPT_PING_TIMEOUT_MS) }),
    ])
    if (isCurrentContentScriptPong(response, expected)) {
      const starting = 'phase' in response && response.phase === 'starting'
      return { reason: starting ? 'starting' as const : null, diagnostic: JSON.stringify({ expected, received: response }) }
    }
    if (response && typeof response === 'object' && 'type' in response && response.type === CONTENT_SCRIPT_PONG
      && 'name' in response && typeof response.name === 'string'
      && 'runtimeUrl' in response && typeof response.runtimeUrl === 'string'
      && 'version' in response && typeof response.version === 'string') {
      return { reason: response.name !== expected.name || response.runtimeUrl !== expected.runtimeUrl ? 'identity-mismatch' as const : 'version-mismatch' as const, diagnostic: JSON.stringify({ expected, received: response }) }
    }
    return { reason: 'unreachable' as const, diagnostic: 'Invalid content script response' }
  }
  catch (error) {
    return { reason: 'unreachable' as const, diagnostic: error instanceof Error ? error.message : String(error) }
  }
  finally {
    clearTimeout(timer)
  }
}

export async function promptContentScriptRefresh(
  tabId: number,
  extensionApi: ContentScriptRefreshBrowser = browser,
  isCurrentCheck: () => boolean = () => true,
): Promise<ContentScriptRefreshResult> {
  const checkStartedAt = Date.now()
  const initialTab = await getEligibleActiveTab(tabId, extensionApi)
  if (!initialTab || !isCurrentCheck())
    return 'ineligible'
  const initialUrl = initialTab.url
  const isCurrent = async () => {
    if (!isCurrentCheck())
      return false
    const tab = await getEligibleActiveTab(tabId, extensionApi)
    return isCurrentCheck() && Boolean(tab) && tab?.url === initialUrl
  }
  let result = await pingContentScript(tabId, extensionApi)
  for (const delay of CONTENT_SCRIPT_STARTUP_RETRY_DELAYS) {
    if (result.reason !== 'starting' && result.reason !== 'unreachable')
      break
    await new Promise(resolve => setTimeout(resolve, delay))
    if (!await isCurrent())
      return 'ineligible'
    result = await pingContentScript(tabId, extensionApi)
  }
  if (!await isCurrent())
    return 'ineligible'
  if (!result.reason)
    return 'already-injected'

  const locale = await getRefreshPromptLocale()
  const copy = getRefreshPromptCopy(locale, browser.runtime.getManifest().version)
  const descriptions = locale === LanguageType.Mandarin_CN || locale.startsWith('zh-CN')
    ? { starting: '页面脚本仍在初始化，请稍候或刷新重试。', unreachable: '暂时无法连接页面脚本，请稍后重试或刷新。', 'version-mismatch': '页面脚本版本与当前扩展不同，请刷新以更新。', 'identity-mismatch': '页面脚本与当前扩展安装身份不符，请刷新页面。' }
    : locale === LanguageType.Mandarin_TW || locale === LanguageType.Cantonese || locale.startsWith('zh')
      ? { starting: '頁面腳本仍在初始化，請稍候或重新整理。', unreachable: '暫時無法連接頁面腳本，請稍後重試或重新整理。', 'version-mismatch': '頁面腳本版本與目前擴充功能不同，請重新整理。', 'identity-mismatch': '頁面腳本與目前擴充功能的安裝身分不同，請重新整理。' }
      : { starting: 'The page script is still starting. Wait or refresh to retry.', unreachable: 'The page script is temporarily unreachable. Try later or refresh.', 'version-mismatch': 'The page script version differs from the extension. Refresh to update.', 'identity-mismatch': 'The page script belongs to a different extension installation. Refresh this page.' }
  copy.reason = result.reason
  copy.reasonDescription = descriptions[result.reason]
  copy.diagnostic = result.diagnostic
  copy.runtimeUrl = browser.runtime.getURL('')
  if (!await isCurrent())
    return 'ineligible'
  await extensionApi.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: showRefreshPrompt,
    args: [copy, initialUrl, checkStartedAt],
    world: 'ISOLATED',
    injectImmediately: true,
  })

  return 'refresh-prompted'
}

const pendingPrompts = new Map<number, { cancelled: boolean }>()

function cancelRefreshCheck(tabId: number) {
  const check = pendingPrompts.get(tabId)
  if (check)
    check.cancelled = true
  pendingPrompts.delete(tabId)
}

function queueContentScriptRefreshPrompt(tabId: number): void {
  if (pendingPrompts.has(tabId))
    return

  const check = { cancelled: false }
  pendingPrompts.set(tabId, check)
  void promptContentScriptRefresh(tabId, browser, () => !check.cancelled)
    .then((result) => {
      if (result === 'refresh-prompted')
        console.log(`[Bewly Nocturne] Asked tab ${tabId} to refresh after its content script became unavailable.`)
    })
    .catch((error) => {
      console.warn(`[Bewly Nocturne] Failed to show the refresh prompt in tab ${tabId}.`, error)
    })
    .finally(() => {
      if (pendingPrompts.get(tabId) === check)
        pendingPrompts.delete(tabId)
    })
}

async function queueActiveTabs(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true })
  tabs.forEach((tab) => {
    if (tab.id !== undefined)
      queueContentScriptRefreshPrompt(tab.id)
  })
}

let refreshPromptListenersInitialized = false

export function setupContentScriptRefreshPrompt(): void {
  // eslint-disable-next-line node/prefer-global/process
  if (refreshPromptListenersInitialized || process.env.SAFARI)
    return

  refreshPromptListenersInitialized = true

  browser.tabs.onActivated.addListener(({ tabId }) => {
    queueContentScriptRefreshPrompt(tabId)
  })

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' || changeInfo.url)
      cancelRefreshCheck(tabId)
    if (changeInfo.status === 'complete' && tab.active)
      queueContentScriptRefreshPrompt(tabId)
  })
  browser.tabs.onRemoved.addListener(cancelRefreshCheck)

  browser.runtime.onStartup.addListener(() => {
    void queueActiveTabs().catch((error) => {
      console.warn('[Bewly Nocturne] Failed to inspect active tabs on startup.', error)
    })
  })

  void queueActiveTabs().catch((error) => {
    console.warn('[Bewly Nocturne] Failed to inspect active tabs.', error)
  })
}
