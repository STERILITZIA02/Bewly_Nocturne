import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

import ts from 'typescript'

/** Executes the complete production module; only its external dependencies are substituted. */
export async function loadSourceModule(file: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  if (source.includes('from \'~/utils/iframeDrawerHistory\''))
    imports = { '~/utils/iframeDrawerHistory': await import('../src/utils/iframeDrawerHistory'), ...imports }
  if (source.includes('from \'./privateConversationRoute\''))
    imports = { './privateConversationRoute': await import('../src/utils/privateConversationRoute'), ...imports }
  // Shared-state subscriptions: a page fixture has no background registry; a
  // broker fixture gets the real registry over the fixture's own `tabs`.
  if (source.includes('from \'~/utils/stateConsumer\''))
    imports = { '~/utils/stateConsumer': { followStateTopic() {}, reportStateTopicActive: async () => false }, ...imports }
  if (source.includes('from \'./stateConsumers\'') && !('./stateConsumers' in imports)) {
    imports = { './stateConsumers': await loadSourceModule('../src/background/stateConsumers.ts', {
      'webextension-polyfill': { default: {} },
      '~/constants/stateConsumers': await import('../src/constants/stateConsumers'),
      '~/utils/messaging': { onMessage() {} },
    }), ...imports }
  }
  if (source.includes('from \'~/constants/appClient\''))
    imports = { '~/constants/appClient': await import('../src/constants/appClient'), ...imports }
  // Dependency-free helpers; fixtures may still override them. They run in the
  // fixture's own sandbox so defaults such as `location.href` read its globals.
  for (const name of ['bilibiliLocale', 'bilibiliLiveContext', 'viewSnapshotBudget', 'fullscreenChange', 'pageBridgeChannel', 'videoMetadataBridge', 'playbackTab']) {
    for (const path of [`~/utils/${name}`, `../utils/${name}`, `./${name}`]) {
      if (source.includes(`from '${path}'`) && !(path in imports))
        imports = { [path]: await loadSourceModule(`../src/utils/${name}.ts`, {}, globals), ...imports }
    }
  }
  const exports: Record<string, any> = {}
  const browserWindow = Reflect.get(globalThis, 'window')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: false } }).outputText
  vm.runInNewContext(code, {
    ...Object.fromEntries(['window', 'location', 'document', 'Document', 'Node', 'Element', 'HTMLElement', 'HTMLVideoElement', 'HTMLMediaElement', 'HTMLImageElement', 'HTMLIFrameElement', 'ShadowRoot', 'ResizeObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'].map(name => [name, Reflect.get(globalThis, name) ?? (browserWindow ? Reflect.get(browserWindow, name) : undefined)])),
    exports,
    require(name: string) {
      if (!(name in imports))
        throw new Error(`Missing test dependency: ${name}`)
      return imports[name]
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    queueMicrotask,
    ...globals,
  }, { filename: file })
  return exports
}
