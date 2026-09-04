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
  const renderer = vue.createRenderer<HostNode, HostNode>({
    createElement: type => node(type),
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
  const momentApi = {
    getMomentDetail: async () => {
      detailRequests += 1
      return { code: 0, data: { item: { basic: { comment_id_str: '999', comment_type: 17 } } } }
    },
    getMomentComments: async ({ pn }: { pn: number }) => {
      rootRequests += 1
      return { code: 0, data: { page: { num: pn, count: 40, size: 8 }, replies: [fixtureComment(pn === 1 ? '100' : '200')] } }
    },
    getMomentCommentReplies: async () => {
      replyRequests += 1
      return { code: 0, data: { page: { num: 1, size: 20, count: 30 }, replies: [fixtureComment('101', '100')] } }
    },
    setMomentCommentLike: async () => delayedLike ? new Promise(resolve => resolveLike = resolve) : { code: 0 },
  }
  const store = vue.reactive({ userInfo: { mid: 1 } })
  const mockModules: Record<string, unknown> = {
    'vue': vue,
    'vue-i18n': { useI18n: () => ({ locale: vue.ref('en'), t: (key: string) => key }) },
    'vue-toastification': { useToast: () => ({ error: () => {} }) },
    '~/stores/topBarStore': { useTopBarStore: () => store },
    '~/utils/api': { default: { moment: momentApi } },
    '~/utils/main': { getUserID: () => String(store.userInfo.mid), getCSRF: () => 'fixture' },
    '~/utils/commentPermalink': {},
    '~/utils/commentTree': commentTree,
    '~/utils/locale': { normalizeIntlLocale: (locale: string) => locale },
    '~/utils/momentCommentSession': sessions,
    '~/utils/momentCommentTarget': targets,
    '~/utils/momentCommentThread': threads,
    './commentUtils': commentUtils,
    './utils': { getAvatarThumbnailUrl: (url: string) => url },
    './MomentCommentMedia.vue': { default: { render: () => vue.h('span') } },
    './MomentCommentRichText.vue': { default: { render: () => vue.h('span') } },
    './MomentCommentTreeGuides.vue': { default: { render: () => vue.h('svg') } },
  }
  const evaluate = (source: string) => {
    const exports: Record<string, any> = {}
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    vm.runInNewContext(code, { exports, Error, require: (name: string) => {
      assert.ok(name in mockModules, `Unexpected module: ${name}`)
      return mockModules[name]
    } })
    return exports
  }
  mockModules['./useMomentCommentThread'] = evaluate(await readFile(new URL('../src/components/MomentCard/useMomentCommentThread.ts', import.meta.url), 'utf8'))
  const file = await readFile(new URL('../src/components/MomentCard/MomentCommentSection.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(file)
  const component = evaluate(compileScript(descriptor, { id: 'comment-lifecycle', inlineTemplate: true }).content).default
  const cache = sessions.createMomentCommentSessionCache('1:1')
  const moment = vue.ref({ id: '123', commentCount: 40, commentId: '999', commentType: 17 } as DisplayMoment)
  const mount = () => {
    const app = renderer.createApp({ setup: () => () => vue.h(component, { moment: moment.value }) })
    app.provide(sessions.MOMENT_COMMENT_SESSIONS, cache)
    app.mount(host)
    return app
  }
  let app = mount()
  await flush()
  assert.equal(detailRequests, 0)
  assert.equal(rootRequests, 1)
  await clickText('comments_expand_replies')
  await findClass('moment-comments__load-more').props.onClick()
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
  moment.value = { ...moment.value, id: '456', commentId: undefined, commentType: undefined }
  await flush()
  assert.equal(detailRequests, 1, 'missing target resolves through detail before loading comments')
  app.unmount()
}
