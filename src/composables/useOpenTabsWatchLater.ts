import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import browser from 'webextension-polyfill'

import type { OpenTabsCommand, OpenTabsTask } from '~/constants/openTabsWatchLater'
import { OPEN_TABS_WATCH_LATER, OPEN_TABS_WATCH_LATER_UPDATED } from '~/constants/openTabsWatchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import { getUserID } from '~/utils/main'
import { sendMessage } from '~/utils/messaging'

/** A disposable projection; the background owns execution, stop and persistence. */
export function useOpenTabsWatchLater() {
  const account = useTopBarStore()
  const task = shallowRef<OpenTabsTask | null>(null)
  const busy = ref(false)
  const failed = ref(false)
  let generation = 0
  let disposed = false
  const accountId = () => account.isLogin && String(account.userInfo.mid) === getUserID() ? Number(account.userInfo.mid) : 0
  async function command(action: OpenTabsCommand['action']) {
    const version = ++generation
    const mid = accountId()
    failed.value = false
    busy.value = true
    try {
      if (!mid)
        throw new Error('Login required')
      const result = await sendMessage<OpenTabsCommand, OpenTabsTask | null>(OPEN_TABS_WATCH_LATER, { action, accountId: mid, taskId: task.value?.id })
      if (disposed || version !== generation || mid !== accountId())
        return
      if (result && result.accountId !== mid)
        throw new Error('Task account changed')
      task.value = result
      if (action === 'get' && (!result || result.status === 'ready'))
        await command('prepare')
    }
    catch {
      if (!disposed && version === generation)
        failed.value = true
    }
    finally {
      if (!disposed && version === generation)
        busy.value = false
    }
  }
  const receive = (value: unknown) => {
    const message = value as { type?: string, data?: OpenTabsTask } | null
    if (message?.type === OPEN_TABS_WATCH_LATER_UPDATED && message.data?.accountId === accountId())
      task.value = message.data
    return false
  }
  browser.runtime.onMessage.addListener(receive)
  watch(accountId, () => {
    task.value = null
    void command('get')
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    generation++
    browser.runtime.onMessage.removeListener(receive)
    void sendMessage(OPEN_TABS_WATCH_LATER, { action: 'unsubscribe', accountId: accountId() }).catch(() => {})
  })
  return { task, busy, failed, command }
}
