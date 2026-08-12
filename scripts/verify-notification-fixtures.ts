import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

import { nextTick, ref } from 'vue'

import type { NativeNotificationSection } from '../src/contentScripts/views/Notifications/notificationSections'

interface PageParams {
  id?: string
  reply_time?: number
  at_time?: number
  like_time?: number
}

interface ControllerModule {
  useNotificationFeeds?: (
    mid: ReturnType<typeof ref<string>>,
    options: {
      fetchPage: (section: NativeNotificationSection, params?: PageParams) => Promise<unknown>
    },
  ) => any
}

const assertions: Array<{
  name: string
  run: () => void | Promise<void>
}> = []

function verify(name: string, run: () => void | Promise<void>) {
  assertions.push({ name, run })
}

function replyPage(id: string, cursorId: string, cursorTime: number) {
  return {
    code: 0,
    data: {
      cursor: { id: cursorId, time: cursorTime, is_end: false },
      items: [{ id, reply_time: cursorTime, user: {}, item: {} }],
      last_view_at: 0,
    },
  }
}

verify('only the current Native Feed is rendered', async () => {
  const source = await readFile(
    new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url),
    'utf8',
  )
  assert.equal(source.match(/<NativeNotificationFeed\b/g)?.length, 1)
  assert.doesNotMatch(source, /v-for="section in NATIVE_NOTIFICATION_SECTIONS"/)
  assert.doesNotMatch(source, /v-show="currentView === section\.id"/)
  assert.match(source, /v-if="nativeView"/)
})

verify('controller preserves independent section state in memory', async () => {
  const module = await import('../src/contentScripts/views/Notifications/composables/useNotificationFeeds') as ControllerModule
  assert.equal(typeof module.useNotificationFeeds, 'function')

  const mid = ref('100')
  const controller = module.useNotificationFeeds!(mid, {
    fetchPage: async (section) => {
      if (section === 'reply')
        return replyPage('reply-1', 'reply-cursor', 100)
      if (section === 'at') {
        return {
          code: 0,
          data: {
            cursor: { id: 'at-cursor', time: 90, is_end: false },
            items: [{ id: 'at-1', at_time: 90, user: {}, item: {} }],
            last_view_at: 0,
          },
        }
      }
      return {
        code: 0,
        data: {
          latest: { items: [], last_view_at: 0 },
          total: { cursor: { id: '', time: 0, is_end: true }, items: [] },
        },
      }
    },
  })

  await controller.loadInitial('reply')
  controller.states.reply.scrollTop = 480
  await controller.loadInitial('at')

  assert.deepEqual(controller.states.reply.items.map((item: any) => item.id), ['reply-1'])
  assert.equal(controller.states.reply.cursorId, 'reply-cursor')
  assert.equal(controller.states.reply.scrollTop, 480)
  assert.deepEqual(controller.states.at.items.map((item: any) => item.id), ['at-1'])
  assert.equal(controller.states.love.loaded, false)
})

verify('MID change clears all states and rejects old account responses', async () => {
  const module = await import('../src/contentScripts/views/Notifications/composables/useNotificationFeeds') as ControllerModule
  const mid = ref('100')
  let resolveReply: ((value: unknown) => void) | undefined
  const controller = module.useNotificationFeeds!(mid, {
    fetchPage: section => section === 'reply'
      ? new Promise(resolve => resolveReply = resolve)
      : Promise.resolve({ code: 0, data: null }),
  })

  const oldRequest = controller.loadInitial('reply')
  mid.value = '200'
  await nextTick()
  resolveReply?.(replyPage('old-account', 'old-cursor', 100))
  await oldRequest

  for (const section of ['reply', 'at', 'love'] as const) {
    assert.equal(controller.states[section].loaded, false)
    assert.equal(controller.states[section].items.length, 0)
    assert.equal(controller.states[section].generation, 1)
  }
})

async function main() {
  const failed: string[] = []
  for (const assertion of assertions) {
    try {
      await assertion.run()
      console.log(`PASS ${assertion.name}`)
    }
    catch (error) {
      failed.push(assertion.name)
      console.error(`FAIL ${assertion.name}`)
      console.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (failed.length > 0) {
    console.error(`Notification verification failed: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

void main()
