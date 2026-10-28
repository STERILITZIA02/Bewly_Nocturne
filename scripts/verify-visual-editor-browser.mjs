import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { build } from 'esbuild'
import { compileScript, compileStyleAsync, parse } from 'vue/compiler-sfc'

const directory = await mkdtemp(path.join(os.tmpdir(), 'bewly-visual-editor-'))
const project = path.resolve(import.meta.dirname, '..')
const chrome = process.env.BEWLY_TEST_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
let browser
let socket
try {
  await build({
    entryPoints: [path.join(import.meta.dirname, 'fixtures/visual-editor.browser.ts')],
    outfile: path.join(directory, 'fixture.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    define: { 'import.meta.env.DEV': 'false', '__VUE_OPTIONS_API__': 'true', '__VUE_PROD_DEVTOOLS__': 'false', '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false' },
    plugins: [{
      name: 'visual-editor-fixture',
      setup(builder) {
        builder.onResolve({ filter: /^(?:~\/logic\/storage|vue-i18n|\.\/recommendationMode)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
          contents: args.path === 'vue-i18n'
            ? 'export const useI18n = () => ({ t: key => key })'
            : args.path === './recommendationMode'
              ? 'export const getRecommendationModeOption = () => "web"; export const selectRecommendationMode = () => {}'
              : 'import {ref} from "vue"; export const settings = ref({dockPosition:"bottom",sidebarPosition:"left"}); export const gridLayout = ref({home:"adaptive"})',
          resolveDir: project,
        }))
        builder.onResolve({ filter: /^~\// }, args => ({ path: path.join(project, 'src', args.path.slice(2)) + (path.extname(args.path) ? '' : '.ts') }))
        builder.onLoad({ filter: /\.vue$/ }, async (args) => {
          const { descriptor } = parse(await readFile(args.path, 'utf8'))
          const id = `data-v-test-${path.basename(args.path, '.vue').toLowerCase()}`
          const script = compileScript(descriptor, { id, inlineTemplate: true, genDefaultAs: 'component' })
          const styles = []
          for (const style of descriptor.styles) {
            const result = await compileStyleAsync({ source: style.content, filename: args.path, id, scoped: style.scoped, preprocessLang: style.lang })
            assert.equal(result.errors.length, 0, String(result.errors))
            styles.push(result.code)
          }
          return { contents: `${script.content}\ncomponent.__scopeId = ${JSON.stringify(id)}; (globalThis.fixtureStyles ??= []).push(${JSON.stringify(styles.join('\n'))}); export default component`, loader: 'ts', resolveDir: path.dirname(args.path) }
        })
      },
    }],
  })
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><script defer src="fixture.js"></script></head><body></body></html>')
  browser = spawn(chrome, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    `--user-data-dir=${path.join(directory, 'profile')}`,
    '--window-size=1280,900',
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome did not start within 15s')), 15000)
    let output = ''
    browser.stderr.on('data', (chunk) => {
      output += chunk.toString()
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(output)
      if (match) {
        clearTimeout(timeout)
        resolve(match[1])
      }
    })
    browser.once('error', reject)
    browser.once('exit', () => {
      clearTimeout(timeout)
      reject(new Error(`Chrome exited before connection: ${output.slice(-2000)}`))
    })
  })
  socket = new WebSocket(endpoint)
  await once(socket, 'open')
  let sequence = 0
  const pending = new Map()
  const events = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      clearTimeout(request.timeout)
      if (message.error)
        request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result)
    }
    else {
      events.get(`${message.sessionId}:${message.method}`)?.(message.params)
    }
  })
  function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Timed out: ${method}`))
      }, 45000)
      pending.set(id, { resolve, reject, timeout })
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
  await call('Runtime.enable', {}, sessionId)
  await call('Runtime.addBinding', { name: 'fixtureInput' }, sessionId)
  const inputJobs = []
  events.set(`${sessionId}:Runtime.bindingCalled`, ({ name, payload }) => {
    if (name !== 'fixtureInput')
      return
    inputJobs.push((async () => {
      const { id, x, y, click, key, modifiers = 0, deltaY } = JSON.parse(payload)
      if (key) {
        const code = key === 'Tab' ? 9 : 27
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code }, sessionId)
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code }, sessionId)
      }
      else {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers }, sessionId)
        if (deltaY !== undefined)
          await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }, sessionId)
        if (click) {
          await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, modifiers }, sessionId)
          await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, modifiers }, sessionId)
        }
      }
      await call('Runtime.evaluate', { expression: `globalThis.resolveFixtureInput(${id})` }, sessionId)
    })())
  })
  await call('Page.enable', {}, sessionId)
  const loaded = new Promise(resolve => events.set(`${sessionId}:Page.loadEventFired`, resolve))
  await call('Page.navigate', { url: `file://${path.join(directory, 'index.html')}` }, sessionId)
  await loaded
  const evaluated = await call('Runtime.evaluate', { expression: 'globalThis.fixtureDone', awaitPromise: true, returnByValue: true }, sessionId)
  await Promise.all(inputJobs)
  assert.equal(evaluated.exceptionDetails, undefined, JSON.stringify(evaluated.exceptionDetails))
  const result = evaluated.result.value
  assert.ok(result, 'The browser fixture did not finish')
  for (const entry of result.checks)
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}${!entry.ok && entry.detail ? `: ${entry.detail}` : ''}`)
  assert.equal(result.error, undefined, result.error)
  assert.ok(result.checks.every(entry => entry.ok), 'Browser regressions failed')
  console.log(`Verified ${result.checks.length} browser checks`)
}
finally {
  socket?.close()
  if (browser && browser.exitCode === null) {
    const exited = once(browser, 'exit')
    browser.kill()
    await exited
  }
  await rm(directory, { recursive: true, force: true })
}
