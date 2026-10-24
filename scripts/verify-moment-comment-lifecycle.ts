import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

import ts from 'typescript'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'

import * as commentUtils from '../src/components/MomentCard/commentUtils'
import type { DisplayMoment } from '../src/components/MomentCard/types'
import * as commentTree from '../src/utils/commentTree'
import * as sessions from '../src/utils/momentCommentSession'
import * as targets from '../src/utils/momentCommentTarget'
import * as threads from '../src/utils/momentCommentThread'
import { globalComponentFixture } from './sourceModuleHarness'

interface HostNode {
  type: string
  text: string
  props: Record<string, any>
  children: HostNode[]
  parent: HostNode | null
  scrollTop: number
}

function node(type: string, text = ''): HostNode {
  return { type, text, props: {}, children: [], parent: null, scrollTop: 0 }
}

// Vue's real setup/watch/unmount lifecycle, with an in-memory renderer. This
// verifies state retention without claiming browser layout or visual coverage.
export async function verifyMomentCommentLifecycle() {
  let measureCommentList = false
  const renderer = vue.createRenderer<HostNode, HostNode>({
    createElement: (type) => {
      const element = node(type)
      Object.defineProperties(element, {
        clientHeight: { get: () => measureCommentList && element.props.class === 'moment-comments__list' ? 500 : 0 },
        scrollHeight: { get: () => 200 },
      })
      return element
    },
    createText: text => node('#text', text),
    createComment: text => node('#comment', text),
    setText: (element, text) => element.text = text,
    setElementText: (element, text) => {
      element.text = text
      element.children = []
    },
    parentNode: element => element.parent,
    nextSibling: element => element.parent?.children[element.parent.children.indexOf(element) + 1] ?? null,
    patchProp: (element, key, _previous, value) => element.props[key] = value,
    insert: (element, parent, anchor) => {
      if (element.parent)
        element.parent.children.splice(element.parent.children.indexOf(element), 1)
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, element)
      element.parent = parent
    },
    remove: (element) => {
      element.parent?.children.splice(element.parent.children.indexOf(element), 1)
      element.parent = null
    },
  })
  const flush = async () => {
    for (let turn = 0; turn < 5; turn++)
      await vue.nextTick()
  }
  const descendants = (root: HostNode): HostNode[] => [root, ...root.children.flatMap(descendants)]
  const textOf = (root: HostNode): string => root.type === '#comment' ? '' : root.text + root.children.map(textOf).join('')
  const host = node('root')
  const findClass = (name: string) => descendants(host).find(item => String(item.props.class || '').split(' ').includes(name))!
  const scrollComments = async () => {
    measureCommentList = true
    findClass('moment-comments__list').props.onScrollPassive()
    measureCommentList = false
    await flush()
  }
  const clickText = (text: string) => {
    const button = descendants(host).find(item => item.type === 'button' && textOf(item).includes(text))
    assert.ok(button, `Missing button: ${text}`)
    return button.props.onClick()
  }
  const fixtureComment = (id: string, root = '') => ({
    rpid_str: id,
    root_str: root,
    parent_str: root,
    rcount: root ? 0 : 30,
    member: { mid: '1', uname: root ? 'Reply author' : 'Root author' },
    content: { message: id },
  })
  let rootRequests = 0
  let detailRequests = 0
  let replyRequests = 0
  let resolveLike: ((value: unknown) => void) | null = null
  let delayedLike = false
  let likeRequests = 0
  const delayedPages: Array<{ sort: number, resolve: (value: unknown) => void }> = []
  let delayPages = false
  let emptyTail = false
  let failedPage = false
  const requestedPages: number[] = []
  const requestedSorts: number[] = []
  const momentApi = {
    getMomentDetail: async () => {
      detailRequests += 1
      return { code: 0, data: { item: { basic: { comment_id_str: '999', comment_type: 17 } } } }
    },
    getMomentComments: async ({ pn, sort }: { pn: number, sort: number }) => {
      rootRequests += 1
      requestedPages.push(pn)
      requestedSorts.push(sort)
      if (delayPages)
        return new Promise(resolve => delayedPages.push({ sort, resolve }))
      if (failedPage && pn === 2)
        return { code: -500, message: 'fixture page failure' }
      if (emptyTail && pn >= 4)
        return { code: 0, data: { page: { num: pn, count: 40, size: 8 }, replies: null } }
      return { code: 0, data: { page: { num: pn, count: 40, size: 8 }, replies: [fixtureComment(pn === 1 ? '100' : '200')] } }
    },
    getMomentCommentReplies: async () => {
      replyRequests += 1
      return { code: 0, data: { page: { num: 1, size: 20, count: 30 }, replies: [fixtureComment('101', '100')] } }
    },
    setMomentCommentLike: async () => {
      likeRequests++
      return delayedLike ? new Promise(resolve => resolveLike = resolve) : { code: 0 }
    },
  }
  const store = vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
  const mockModules: Record<string, unknown> = {
    'vue': vue,
    '@vueuse/core': { useElementSize: () => ({ height: vue.ref(0) }) },
    'vue-i18n': { useI18n: () => ({ locale: vue.ref('en'), t: (key: string) => key }) },
    'vue-toastification': { useToast: () => ({ error: () => {}, success: () => {} }) },
    '~/stores/topBarStore': { useTopBarStore: () => store },
    '~/utils/api': { default: { moment: momentApi } },
    '~/utils/main': { getUserID: () => String(store.userInfo.mid), getCSRF: () => 'fixture' },
    '~/utils/commentPermalink': await import('../src/utils/commentPermalink'),
    // This in-memory renderer has no layout. Geometry has its own DOM module test.
    '~/utils/commentReadingAnchor': { captureCommentReadingAnchor: () => ({ cancel() {}, restore: async () => {} }) },
    '~/utils/skeletonVisibility': { observeSkeletonGroup: () => () => {} },
    '~/utils/commentTree': commentTree,
    '~/utils/locale': { normalizeIntlLocale: (locale: string) => locale },
    '~/utils/momentCommentSession': sessions,
    '~/utils/momentCommentTarget': targets,
    '~/utils/momentCommentThread': threads,
    './commentUtils': commentUtils,
    './commentThreadLayout': await import('../src/components/MomentCard/commentThreadLayout'),
    './utils': { getAvatarThumbnailUrl: (url: string) => url },
    // The ring wraps icon slots; the lifecycle fixture only needs the slotted content.
    // Deleting is outside this fixture; the section injects the confirm service optionally.
    '~/composables/useConfirmDialog': { confirmDialogKey: Symbol('CONFIRM_DIALOG') },
    '~/components/LoadingRing.vue': { default: vue.defineComponent({ props: ['loading', 'size'], setup: (_props, { slots }) => () => vue.h('span', slots.default?.()) }) },
    './MomentCommentMedia.vue': { default: { render: () => vue.h('span') } },
    './MomentCommentSkeleton.vue': { default: { render: () => vue.h('span') } },
    './MomentCommentRichText.vue': { default: { render: () => vue.h('span') } },
    './MomentCommentTreeGuides.vue': { default: { render: () => vue.h('svg') } },
    './MomentReplyComposer.vue': { default: vue.defineComponent({
      props: ['reply'],
      emits: ['posted', 'close'],
      setup: (props, { emit, expose }) => {
        expose({ focus: () => true })
        return () => vue.h('button', {
          class: 'reply-composer-fixture',
          onClick: () => {
            emit('posted', fixtureComment(props.reply ? '100100' : '100200', props.reply ? '100' : ''))
            emit('close')
          },
        }, 'fixture-submit')
      },
    }) },
  }
  const evaluate = (source: string) => {
    const exports: Record<string, any> = {}
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: false } }).outputText
    vm.runInNewContext(code, { exports, Error, AbortController, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, require: (name: string) => {
      if (!(name in mockModules)) {
        const fixture = globalComponentFixture(name, vue)
        if (fixture)
          return fixture
      }
      assert.ok(name in mockModules, `Unexpected module: ${name}`)
      return mockModules[name]
    } })
    return exports
  }
  mockModules['./useMomentCommentThread'] = evaluate(await readFile(new URL('../src/components/MomentCard/useMomentCommentThread.ts', import.meta.url), 'utf8'))
  const file = await readFile(new URL('../src/components/MomentCard/MomentCommentSection.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(file)
  const component = evaluate(compileScript(descriptor, { id: 'comment-lifecycle', inlineTemplate: true }).content).default
  const skeleton = parse(await readFile(new URL('../src/components/SkeletonBlock.vue', import.meta.url), 'utf8')).descriptor
  const SkeletonBlock = evaluate(compileScript(skeleton, { id: 'comment-skeleton', inlineTemplate: true }).content).default
  const cache = sessions.createMomentCommentSessionCache('1:1')
  const moment = vue.ref({ id: '123', commentCount: 40, commentId: '999', commentType: 17 } as DisplayMoment)
  const active = vue.ref(true)
  const mount = () => {
    const app = renderer.createApp({ setup: () => () => vue.h(component, { moment: moment.value, active: active.value }) })
    app.component('SkeletonBlock', SkeletonBlock)
    app.component('IconButton', vue.defineComponent({ setup: (_props, { attrs, slots }) => () => vue.h('button', attrs, slots.default?.()) }))
    app.provide(sessions.MOMENT_COMMENT_SESSIONS, cache)
    app.mount(host)
    return app
  }
  let app = mount()
  await flush()
  assert.equal(detailRequests, 0)
  assert.equal(rootRequests, 1)
  assert.equal(requestedSorts[0], 1, 'first opening requests the hottest comments')
  assert.ok(descendants(host).some(item => item.props['aria-pressed'] === true && textOf(item).includes('comments_sort_hot')))
  await clickText('comments_expand_replies')
  assert.equal(findClass('moment-comments__load-more'), undefined, 'pagination is scroll driven, without a manual load-more control')
  await scrollComments()
  await flush()
  const likeButton = descendants(host).find(item => item.props['aria-label'] === 'moment_card.comment_like')!
  await likeButton.props.onClick()
  await flush()
  assert.equal(likeButton.props['aria-pressed'], true)
  findClass('moment-comments__list').scrollTop = 144
  app.unmount()
  app = mount()
  await flush()
  assert.equal(rootRequests, 2, 'remount does not request page one')
  assert.equal(replyRequests, 1, 'remount does not request loaded replies')
  assert.equal(findClass('moment-comments__list').scrollTop, 144)
  assert.ok(textOf(host).includes('Reply author'), 'expanded reply pages survive actual unmount')
  const restoredLike = descendants(host).find(item => item.props['aria-label'] === 'moment_card.comment_unlike')!
  assert.equal(restoredLike.props['aria-pressed'], true)
  delayedLike = true
  const pendingUnlike = restoredLike.props.onClick()
  await flush()
  app.unmount()
  app = mount()
  await flush()
  assert.ok(descendants(host).some(item => item.props['aria-label'] === 'moment_card.comment_unlike'), 'unconfirmed unlike is excluded from snapshot')
  assert.ok(resolveLike)
  ;(resolveLike as (value: unknown) => void)({ code: 0 })
  await pendingUnlike
  await flush()
  assert.ok(descendants(host).some(item => item.props['aria-label'] === 'moment_card.comment_like'), 'submitted unlike reconciles the remounted view')
  await clickText('comments_sort_latest')
  await flush()
  assert.equal(requestedSorts.at(-1), 0)
  const beforeLatestRestore = rootRequests
  app.unmount()
  app = mount()
  await flush()
  assert.equal(rootRequests, beforeLatestRestore, 'reopening preserves an explicitly chosen latest sort and its loaded data')
  assert.ok(descendants(host).some(item => item.props['aria-pressed'] === true && textOf(item).includes('comments_sort_latest')))
  delayPages = true
  await clickText('comments_sort_hot')
  await flush()
  await clickText('comments_sort_latest')
  await flush()
  assert.deepEqual(delayedPages.map(page => page.sort), [1, 0])
  delayedPages[1].resolve({ code: 0, data: { replies: [fixtureComment('300')] } })
  await flush()
  delayedPages[0].resolve({ code: 0, data: { replies: [fixtureComment('400')] } })
  await flush()
  assert.ok(descendants(host).some(item => item.props['data-comment-id'] === '300'))
  assert.ok(!descendants(host).some(item => item.props['data-comment-id'] === '400'))
  await clickText('comments_sort_hot')
  await flush()
  delayedPages[2].resolve({ code: 0, data: { replies: [fixtureComment('300')] } })
  await flush()
  const inFlightLike = descendants(host).find(item => item.props['aria-label'] === 'moment_card.comment_like')!.props.onClick()
  await clickText('comments_sort_latest')
  await flush()
  delayedPages[3].resolve({ code: 0, data: { replies: [fixtureComment('300')] } })
  await flush()
  const pendingLikeButton = descendants(host).find(item => item.props['aria-label'] === 'moment_card.comment_like')!
  assert.equal(pendingLikeButton.props.disabled, true, 'sorting restores the confirmed value but cannot resubmit an in-flight like')
  const beforeDuplicate = likeRequests
  await pendingLikeButton.props.onClick()
  assert.equal(likeRequests, beforeDuplicate)
  ;(resolveLike as unknown as (value: unknown) => void)({ code: 0 })
  await inFlightLike
  await flush()
  assert.ok(descendants(host).some(item => item.props['aria-label'] === 'moment_card.comment_unlike'), 'a read started before the write settled cannot overwrite its result')
  await clickText('comments_sort_hot')
  await flush()
  delayedPages[4].resolve({ code: 0, data: { replies: [fixtureComment('300')] } })
  await flush()
  assert.ok(descendants(host).some(item => item.props['aria-label'] === 'moment_card.comment_like'), 'a new authoritative read after settlement replaces the local override')
  findClass('moment-comments__list').scrollTop = 80
  app.unmount()
  const requestsBeforeRestore = rootRequests
  app = mount()
  await flush()
  assert.equal(rootRequests, requestsBeforeRestore)
  assert.equal(findClass('moment-comments__list').scrollTop, 80)
  assert.ok(descendants(host).some(item => item.props['aria-pressed'] === true && textOf(item).includes('comments_sort_hot')))
  await clickText('comments_sort_latest')
  await flush()
  store.userInfo.mid = 2
  cache.setAccount('2:2')
  await flush()
  delayedPages[5].resolve({ code: 0, data: { replies: [fixtureComment('old-account')] } })
  await flush()
  assert.ok(!descendants(host).some(item => item.props['data-comment-id'] === 'old-account'))
  delayPages = false
  moment.value = { ...moment.value, id: '456', commentId: undefined, commentType: undefined }
  await flush()
  assert.equal(detailRequests, 1, 'missing target resolves through detail before loading comments')
  assert.equal(requestedSorts.at(-1), 1, 'a different dynamic starts with hottest comments independently of the previous choice')
  measureCommentList = true
  emptyTail = true
  const beforeFill = rootRequests
  moment.value = { ...moment.value, id: '789', commentId: '1000', commentType: 17 }
  await flush()
  await flush()
  for (let turn = 0; turn < 10; turn++)
    await flush()
  assert.equal(rootRequests - beforeFill, 4, 'hot-comment duplicates do not fail; the successful empty tail ends loading despite stale count')
  assert.equal(findClass('moment-comments__pagination-error'), undefined)
  assert.equal(findClass('moment-comments__load-more'), undefined)
  await findClass('moment-comments__list').props.onScrollPassive()
  await flush()
  assert.equal(rootRequests - beforeFill, 4, 'scrolling a completed thread cannot keep requesting pages')
  measureCommentList = false
  failedPage = true
  moment.value = { ...moment.value, id: 'pagination-failure', commentId: '998' }
  await flush()
  await scrollComments()
  await flush()
  assert.ok(findClass('moment-comments__pagination-error'))
  assert.equal(findClass('moment-comments__load-more'), undefined, 'a real failure exposes one retry, not a second load-more action')
  failedPage = false
  await findClass('moment-comments__pagination-error').children.find(child => child.type === 'button')!.props.onClick()
  await flush()
  assert.equal(requestedPages.at(-1), 2, 'manual retry uses the failed page, not a skipped page')
  delayPages = true
  moment.value = { ...moment.value, id: 'A11-pending', commentId: '1001' }
  await flush()
  assert.ok(findClass('moment-comments__skeleton'))
  const oldPage = delayedPages.at(-1)!
  active.value = false
  await flush()
  oldPage.resolve({ code: 0, data: { page: { num: 1, count: 1, size: 8 }, replies: [fixtureComment('old-document')] } })
  await flush()
  const beforeReopen = rootRequests
  active.value = true
  await flush()
  assert.equal(rootRequests, beforeReopen + 1)
  delayedPages.at(-1)!.resolve({ code: 0, data: { page: { num: 1, count: 0, size: 8 }, replies: [] } })
  await flush()
  assert.equal(Boolean(findClass('moment-comments__skeleton')), false, 'authoritative empty ends initial waiting')
  const afterEmpty = rootRequests
  active.value = false
  await flush()
  active.value = true
  await flush()
  assert.equal(rootRequests, afterEmpty, 'quick reopen of ready empty content does not await another ready event')
  moment.value = { ...moment.value, id: 'A11-failure', commentId: '1002' }
  await flush()
  delayedPages.at(-1)!.resolve({ code: -1, message: 'fixture failure' })
  await flush()
  assert.equal(Boolean(findClass('moment-comments__skeleton')), false, 'error also ends waiting')
  delayPages = false
  emptyTail = false
  moment.value = { ...moment.value, id: 'reply-composer', commentId: '1003' }
  await flush()
  assert.ok(findClass('reply-composer-fixture'), 'composer is present as soon as comments open')
  const initialComposer = findClass('reply-composer-fixture')
  findClass('moment-comments__action--permalink').props.onClick()
  await flush()
  assert.equal(findClass('reply-composer-fixture'), initialComposer, 'reply changes the target without replacing the persistent editor')
  findClass('reply-composer-fixture').props.onClick()
  await flush()
  assert.ok(descendants(host).some(item => item.props['data-comment-id'] === '100100'), 'confirmed child is inserted into the current thread')
  assert.equal(findClass('reply-composer-fixture'), initialComposer, 'successful reply returns the same editor to top-level comments')
  findClass('reply-composer-fixture').props.onClick()
  await flush()
  assert.ok(descendants(host).some(item => item.props['data-comment-id'] === '100200'), 'confirmed top-level comment appears immediately')
  app.unmount()
  app = mount()
  await flush()
  assert.ok(descendants(host).some(item => item.props['data-comment-id'] === '100100'), 'confirmed reply survives the existing data-cache remount')
  app.unmount()
}
