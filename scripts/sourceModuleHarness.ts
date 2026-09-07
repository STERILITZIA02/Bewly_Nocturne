import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

import ts from 'typescript'

/** Executes the complete production module; only its external dependencies are substituted. */
export async function loadSourceModule(file: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const exports: Record<string, any> = {}
  const browserWindow = Reflect.get(globalThis, 'window')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, {
    ...Object.fromEntries(['window', 'document', 'Document', 'Node', 'Element', 'HTMLElement', 'HTMLVideoElement', 'HTMLMediaElement', 'HTMLImageElement', 'HTMLIFrameElement', 'ShadowRoot', 'ResizeObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'].map(name => [name, Reflect.get(globalThis, name) ?? (browserWindow ? Reflect.get(browserWindow, name) : undefined)])),
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
