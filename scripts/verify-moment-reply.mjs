import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerMomentReplyChecks(check, { Vue, compileComponent, flush }) {
  check('moment reply: native form preserves string IDs, selected mentions, image metadata and atomic dynamic sync', async () => {
    const { buildMomentReplyForm, momentReplyTarget, isMomentReplyImage } = await import('../src/utils/momentReply')
    const draft = { oid: '123456789012345678', type: 17, message: '@名字 你好', mentions: { 名字: '123', 已删除: '456' }, pictures: [], syncToDynamic: true }
    const form = buildMomentReplyForm(draft, 'csrf')
    assert.equal(form.get('oid'), draft.oid)
    assert.equal(form.get('sync_to_dynamic'), '1')
    assert.equal(form.get('at_name_to_mid'), '{"名字":"123"}')
    assert.equal(buildMomentReplyForm({ ...draft, message: '@名字' }, 'csrf').get('at_name_to_mid'), '{"名字":"123"}')
    assert.equal(buildMomentReplyForm({ ...draft, message: '@名字已改' }, 'csrf').get('at_name_to_mid'), '{}')
    assert.equal(form.has('root'), false)
    const direct = momentReplyTarget({ rpid: '900000000000000001', rootRpid: '', author: { name: 'A' } })
    assert.equal(direct.root, direct.parent)
    assert.equal(direct.prefix, '')
    assert.equal(momentReplyTarget({ rpid: direct.root, rootRpid: direct.root, author: { name: 'A' } }).prefix, '', 'normalized root comments refer to themselves')
    const nested = momentReplyTarget({ rpid: '900000000000000002', rootRpid: direct.root, author: { name: 'B' } })
    assert.equal(nested.root, direct.root)
    assert.equal(nested.prefix, '回复 @B :')
    assert.equal(buildMomentReplyForm({ ...draft, ...nested }, 'csrf').get('parent'), nested.parent)
    assert.throws(() => buildMomentReplyForm({ ...draft, root: '1' }, 'csrf'))
    assert.throws(() => buildMomentReplyForm({ ...draft, message: '  ' }, 'csrf'))
    assert.equal(isMomentReplyImage({ type: 'image/gif', size: 20 }), false)
    assert.equal(isMomentReplyImage({ type: 'image/png', size: 20 * 1024 * 1024 }), false)
    const picture = { img_src: 'https://i0.hdslb.com/bfs/test.png', img_width: 32, img_height: 32, img_size: 1 }
    assert.deepEqual(JSON.parse(buildMomentReplyForm({ ...draft, pictures: [picture] }, 'csrf').get('pictures')), [picture])
    assert.throws(() => buildMomentReplyForm({ ...draft, pictures: Array.from({ length: 10 }).fill(picture) }, 'csrf'))
  })

  check('moment reply: background checks account again after signing and never retries an ambiguous public write', async () => {
    const protocol = await import('../src/utils/momentReply')
    let mid = '1'
    let requests = 0
    let changeDuringSign = false
    let fail = false
    const { submitMomentReply } = await loadSourceModule('../src/background/momentReply.ts', {
      'webextension-polyfill': { default: { cookies: { getAll: async () => [{ name: 'DedeUserID', value: mid }, { name: 'bili_jct', value: 'csrf' }] } } },
      '~/utils/momentReply': protocol,
      './wbiSign': { initWbiKeys: async () => {
        if (changeDuringSign)
          mid = '2'
        return true
      }, addWbiSign: () => ({ wts: 1, w_rid: 'fixture-signature' }) },
    }, { URL, URLSearchParams, AbortSignal, fetch: async (url, options) => {
      requests++
      assert.equal(url.pathname, '/x/v2/reply/add')
      assert.equal(url.searchParams.get('w_rid'), 'fixture-signature')
      assert.equal(options.body.get('csrf'), 'csrf')
      if (fail)
        throw new Error('Connection lost')
      return { ok: true, json: async () => ({ code: 0, data: { reply: { rpid_str: '999' } } }) }
    } })
    const payload = { accountId: '1', csrf: 'csrf', oid: '123', type: 17, message: 'hello', pictures: [], mentions: {}, syncToDynamic: false }
    changeDuringSign = true
    assert.notEqual((await submitMomentReply(payload)).code, 0)
    assert.equal(requests, 0)
    changeDuringSign = false
    mid = '1'
    assert.equal((await submitMomentReply(payload)).code, 0)
    assert.equal(requests, 1)
    fail = true
    assert.equal((await submitMomentReply(payload)).bewlyReplyUncertain, true)
    assert.equal(requests, 2)
    await submitMomentReply({ ...payload, csrf: 'stale' })
    assert.equal(requests, 2)
  })

  check('moment reply: real composer gates IME, duplicate sends and uncertain outcomes while retaining the draft', async () => {
    const store = Vue.reactive({ isLogin: true, userInfo: { mid: '1' } })
    const host = document.body.appendChild(document.createElement('div'))
    const anchor = document.body.appendChild(document.createElement('button'))
    let sent = 0
    let submitted
    let settle
    const Composer = await compileComponent('../src/components/MomentCard/MomentReplyComposer.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/composables/useAnchoredPopoverPosition': { useAnchoredPopoverPosition: () => ({ scheduleUpdate() {} }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/api': { default: { moment: { submitMomentReply: (payload) => {
        sent++
        submitted = payload
        return new Promise(resolve => settle = resolve)
      } } } },
      '~/utils/floatingMenu': await import('../src/utils/floatingMenu'),
      '~/utils/main': { getCSRF: () => 'csrf', getUserID: () => store.userInfo.mid },
      '~/utils/momentReply': await import('../src/utils/momentReply'),
      './commentUtils': await import('../src/components/MomentCard/commentUtils'),
      './momentForwardContent': await import('../src/components/MomentCard/momentForwardContent'),
      './MomentForwardEmojiPicker.vue': { default: { render: () => null } },
      './MomentForwardTopicPicker.vue': { default: { render: () => null } },
    }, { globals: { URL, FileReader: window.FileReader } })
    const app = Vue.createApp(Composer, { anchor, oid: '123', type: 17, reply: null, accountId: '1', sourceUrl: 'https://t.bilibili.com/123' })
    app.mount(host.appendChild(document.createElement('div')))
    try {
      await flush()
      const input = host.querySelector('textarea')
      const toggle = host.querySelector('.moment-reply__sync')
      assert.equal(toggle.getAttribute('aria-pressed'), 'false')
      toggle.click()
      await flush()
      assert.equal(toggle.getAttribute('aria-pressed'), 'true')
      toggle.click()
      await flush()
      assert.equal(toggle.getAttribute('aria-pressed'), 'false')
      toggle.click()
      await flush()
      input.value = '中文草稿'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true }))
      assert.equal(sent, 0)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      await flush()
      host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      assert.equal(sent, 1)
      assert.equal(submitted.syncToDynamic, true)
      settle({ code: -1, bewlyReplyUncertain: true })
      await flush()
      assert.equal(input.value, '中文草稿')
      assert.equal(input.readOnly, true)
      host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      assert.equal(sent, 1)
      assert.ok(host.querySelector('[role="alert"]'))
      assert.ok(host.querySelector('input[type="file"]'))
      assert.ok(host.querySelector('.moment-reply__sync'))
    }
    finally {
      app.unmount()
      host.remove()
      anchor.remove()
    }
  })

  check('moment reply: upload transport uses native multipart fields and rejects a stale account before sending', async () => {
    let mid = '1'
    let calls = 0
    const { uploadMomentReplyImage } = await loadSourceModule('../src/background/momentReply.ts', {
      'webextension-polyfill': { default: { cookies: { getAll: async () => [{ name: 'DedeUserID', value: mid }, { name: 'bili_jct', value: 'csrf' }] } } },
      '~/utils/momentReply': await import('../src/utils/momentReply'),
      './wbiSign': {},
    }, { atob, Uint8Array, FormData, Blob, AbortSignal, fetch: async (url, options) => {
      calls++
      assert.equal(url, 'https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs')
      assert.equal(options.body.get('biz'), 'new_dyn')
      assert.equal(options.body.get('category'), 'daily')
      assert.equal(options.body.get('csrf'), 'csrf')
      assert.equal(options.body.get('file_up').type, 'image/png')
      return { ok: true, json: async () => ({ code: 0, data: { image_url: 'https://i0.hdslb.com/test.png' } }) }
    } })
    const request = { accountId: '1', csrf: 'csrf', mimeType: 'image/png', base64: 'YWJj', fileName: 'fixture.png' }
    assert.equal((await uploadMomentReplyImage(request)).code, 0)
    assert.equal(calls, 1)
    mid = '2'
    assert.notEqual((await uploadMomentReplyImage(request)).code, 0)
    assert.equal(calls, 1)
  })

  check('moment reply: persistent editor preserves drafts across targets, excludes hidden attachments and resets only after confirmed success', async () => {
    const store = Vue.reactive({ isLogin: true, userInfo: { mid: '1' } })
    const host = document.body.appendChild(document.createElement('div'))
    const reply = Vue.ref(null)
    const sent = []
    const released = []
    const interactions = []
    let uploads = 0
    let accepted = false
    const Composer = await compileComponent('../src/components/MomentCard/MomentReplyComposer.vue', {
      'vue-i18n': { useI18n: () => ({ t: (key, values) => values?.name || key }) },
      '~/composables/useAnchoredPopoverPosition': { useAnchoredPopoverPosition: () => ({ scheduleUpdate() {} }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(document.body) }) },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/api': { default: { moment: {
        uploadMomentReplyImage: () => { uploads++ },
        submitMomentReply: async (payload) => {
          sent.push(payload)
          return accepted ? { code: 0, data: { reply: { rpid_str: '999', root_str: payload.root, parent_str: payload.parent, member: { mid: '1', uname: 'fixture' }, content: { message: payload.message } } } } : { code: -1, message: 'rejected' }
        },
      } } },
      '~/utils/floatingMenu': await import('../src/utils/floatingMenu'),
      '~/utils/main': { getCSRF: () => 'csrf', getUserID: () => '1' },
      '~/utils/momentReply': await import('../src/utils/momentReply'),
      './commentUtils': await import('../src/components/MomentCard/commentUtils'),
      './momentForwardContent': await import('../src/components/MomentCard/momentForwardContent'),
      './MomentForwardEmojiPicker.vue': { default: { render: () => Vue.h('div', { class: 'picker-fixture' }) } },
      './MomentForwardTopicPicker.vue': { default: { render: () => null } },
    }, { globals: { URL: { createObjectURL: () => 'blob:kept', revokeObjectURL: url => released.push(url) }, createImageBitmap: async () => ({ width: 32, height: 32, close() {} }) } })
    const app = Vue.createApp({ setup: () => () => Vue.h(Composer, {
      oid: '123',
      type: 17,
      accountId: '1',
      sourceUrl: 'https://t.bilibili.com/123',
      reply: reply.value,
      onClose: () => reply.value = null,
      onInteraction: value => interactions.push(value),
    }) })
    app.mount(host)
    try {
      await flush()
      const input = host.querySelector('textarea')
      assert.notEqual(document.activeElement, input, 'opening comments does not steal keyboard focus')
      assert.ok(host.querySelector('.moment-reply'), 'editor remains inside the card host')
      host.querySelector('[aria-label="moment_card.reply_emoji"]').click()
      await flush()
      assert.ok(document.body.querySelector('.moment-reply__picker'))
      assert.equal(host.querySelector('.moment-reply__picker'), null, 'only the picker escapes the clipped card')
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
      await flush()
      assert.equal(document.body.querySelector('.moment-reply__picker'), null, 'outside press dismisses the picker')
      input.value = '保留草稿'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      const chooser = host.querySelector('input[type="file"]')
      Object.defineProperty(chooser, 'files', { value: [new window.File(['x'], 'fixture.png', { type: 'image/png' })] })
      chooser.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
      assert.equal(interactions.at(-1), true)
      reply.value = { rpid: '102', rootRpid: '100', author: { name: '测试用户' } }
      await flush()
      assert.equal(host.querySelector('textarea'), input)
      assert.equal(input.placeholder, '', 'reply target is shown once in the header, not repeated in the placeholder')
      assert.equal(host.querySelector('.moment-reply__header span').textContent.trim(), '测试用户')
      assert.equal(input.value, '保留草稿')
      assert.equal(host.querySelector('.moment-reply__sync'), null)
      assert.equal(host.querySelector('.moment-reply__pictures'), null)
      host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
      assert.equal(uploads, 0, 'hidden top-level images never upload for a child reply')
      assert.equal(sent[0].parent, '102')
      assert.equal(sent[0].root, '100')
      assert.equal(sent[0].message, '回复 @测试用户 :保留草稿')
      assert.equal(sent[0].pictures.length, 0)
      assert.equal(sent[0].syncToDynamic, false)
      assert.equal(input.value, '保留草稿', 'known rejection retains the draft')
      host.querySelector('.moment-reply__header button').click()
      await flush()
      assert.ok(host.querySelector('img[src="blob:kept"]'), 'cancel reply restores the top-level attachment')
      reply.value = { rpid: '200', rootRpid: '200', author: { name: '另一个用户' } }
      await flush()
      accepted = true
      host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
      assert.equal(sent[1].parent, '200')
      assert.equal(sent[1].message, '保留草稿', 'new target is used instead of the first selected reply')
      assert.equal(host.querySelector('textarea'), input, 'success keeps the editor mounted')
      assert.equal(input.value, '')
      assert.ok(host.querySelector('.moment-reply__sync'))
      assert.deepEqual(released, ['blob:kept'])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('moment reply: account change during image upload stops the public write and releases local previews', async () => {
    const store = Vue.reactive({ isLogin: true, userInfo: { mid: '1' } })
    const host = document.body.appendChild(document.createElement('div'))
    const anchor = document.body.appendChild(document.createElement('button'))
    let resolveUpload
    let sends = 0
    const released = []
    const Composer = await compileComponent('../src/components/MomentCard/MomentReplyComposer.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/composables/useAnchoredPopoverPosition': { useAnchoredPopoverPosition: () => ({ scheduleUpdate() {} }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/api': { default: { moment: {
        uploadMomentReplyImage: () => new Promise(resolve => resolveUpload = resolve),
        submitMomentReply: async () => { sends++ },
      } } },
      '~/utils/floatingMenu': await import('../src/utils/floatingMenu'),
      '~/utils/main': { getCSRF: () => 'csrf', getUserID: () => store.userInfo.mid },
      '~/utils/momentReply': await import('../src/utils/momentReply'),
      './commentUtils': await import('../src/components/MomentCard/commentUtils'),
      './momentForwardContent': await import('../src/components/MomentCard/momentForwardContent'),
      './MomentForwardEmojiPicker.vue': { default: { render: () => null } },
      './MomentForwardTopicPicker.vue': { default: { render: () => null } },
    }, { globals: { URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL: url => released.push(url) }, FileReader: window.FileReader, createImageBitmap: async () => ({ width: 32, height: 32, close() {} }) } })
    const app = Vue.createApp(Composer, { anchor, oid: '123', type: 17, reply: null, accountId: '1', sourceUrl: 'https://t.bilibili.com/123' })
    app.mount(host.appendChild(document.createElement('div')))
    try {
      await flush()
      const file = new window.File(['fixture'], 'test.png', { type: 'image/png' })
      const chooser = host.querySelector('input[type="file"]')
      Object.defineProperty(chooser, 'files', { configurable: true, value: [file] })
      chooser.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
      assert.ok(host.querySelector('img[src="blob:fixture"]'))
      const input = host.querySelector('textarea')
      input.value = 'with picture'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 5))
        await flush()
        if (resolveUpload)
          break
      }
      assert.ok(resolveUpload)
      store.userInfo.mid = '2'
      resolveUpload({ code: 0, data: { image_url: 'https://i0.hdslb.com/test.png', image_width: 32, image_height: 32, img_size: 1 } })
      await flush()
      assert.equal(sends, 0)
    }
    finally {
      app.unmount()
      host.remove()
      anchor.remove()
    }
    assert.deepEqual(released, ['blob:fixture'])
  })
}
