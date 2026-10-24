import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { build as tsupBuild } from 'tsup'
import { build as viteBuild } from 'vite'

import { bundleLicenses, mappedSources, tsupLicenses } from './bundleLicenses.ts'

const root = await mkdtemp(join(tmpdir(), 'bewly-license-fixture-'))
async function put(file: string, text: string) {
  await mkdir(dirname(join(root, file)), { recursive: true })
  await writeFile(join(root, file), text)
}
async function report(engine: string) {
  return JSON.parse(await readFile(join(root, engine, 'extension/assets/licenses/fixture.json'), 'utf8'))
}
try {
  for (const [folder, name, version] of [['one', 'same-package', '1.0.0'], ['two', 'same-package', '2.0.0'], ['lazy', 'lazy-package', '3.0.0'], ['dead', 'unused-package', '4.0.0'], ['unknown', 'unknown-license', '5.0.0']]) {
    await put(`node_modules/${folder}/package.json`, JSON.stringify({ name, version, type: 'module', sideEffects: folder === 'lazy', exports: './index.js', license: 'MIT' }))
    await put(`node_modules/${folder}/index.js`, `export function value(input){ return input + ${JSON.stringify(folder)}; } export function unused(){ globalThis.never = 1; }`)
    if (folder !== 'unknown')
      await put(`node_modules/${folder}/LICENSE`, `Fixture license for ${name} ${version}\n`)
  }
  await put('node_modules/lazy/index.js', 'import "./lazy.css"; export function value(input){ return input + "lazy"; }')
  await put('node_modules/lazy/lazy.css', '.fixture-lazy-license-style { background-color: blue }')
  await put('node_modules/style-only/package.json', JSON.stringify({ name: 'style-only-package', version: '1.2.3', license: 'MIT', sideEffects: true, exports: './style.css' }))
  await put('node_modules/style-only/style.css', '.fixture-license-style { color: red }')
  await put('node_modules/style-only/LICENSE', 'Style-only fixture license\n')
  await put('node_modules/inlined/package.json', JSON.stringify({ name: 'inlined-or-removed', version: '1.0.0', sideEffects: false, type: 'module', exports: './index.js' }))
  await put('node_modules/inlined/index.js', 'export const literal = "inlined-value";')
  await put('entry.js', `import {value as one} from 'one'; import {value as two} from 'two'; import {unused} from 'dead'; import {value as unknown} from 'unknown'; import {literal} from 'inlined'; import 'style-only'; globalThis.licenseFixture = [one, two, unknown, literal]; globalThis.loadLicenseFixture = () => import('lazy');`)

  assert.deepEqual(mappedSources({ sources: ['used.js', 'loaded-but-unused.js'], mappings: 'AAAA' }), ['used.js'])
  console.log('PASS license final mappings ignore unreferenced source-map sources')

  const viteOut = join(root, 'vite/extension/dist')
  await viteBuild({ configFile: false, root, logLevel: 'error', plugins: bundleLicenses('fixture', ['fixture']), build: { outDir: viteOut, minify: true, cssCodeSplit: true, rolldownOptions: { input: join(root, 'entry.js'), output: { format: 'es', entryFileNames: 'fixture.js' } } } })
  const viteReport = await report('vite')
  assert.deepEqual(viteReport.packages.filter((item: { name: string }) => item.name === 'same-package').map((item: { version: string }) => item.version), ['1.0.0', '2.0.0'])
  assert.equal(viteReport.packages.some((item: { name: string }) => item.name === 'unused-package'), false)
  assert.ok(viteReport.packages.some((item: { name: string }) => item.name === 'lazy-package'))
  assert.ok(viteReport.packages.some((item: { name: string }) => item.name === 'style-only-package'))
  const mainCss = viteReport.packages.find((item: { name: string }) => item.name === 'style-only-package').outputs.filter((file: string) => file.endsWith('.css'))
  const lazyCss = viteReport.packages.find((item: { name: string }) => item.name === 'lazy-package').outputs.filter((file: string) => file.endsWith('.css'))
  assert.equal(mainCss.length, 1)
  assert.equal(lazyCss.length, 1)
  assert.notEqual(mainCss[0], lazyCss[0], 'split styles retain their actual chunk contribution')
  assert.ok(viteReport.outputs.length >= 3, 'split JS and CSS are included')
  assert.ok(viteReport.packages.find((item: { name: string }) => item.name === 'unknown-license').issues.includes('License text unavailable'))
  assert.ok(viteReport.packages.some((item: { name: string }) => item.name === 'inlined-or-removed') || viteReport.issues.some((issue: string) => issue.includes('inlined-or-removed')), 'lost constant origins must remain explicit rather than silently reported complete')
  assert.equal((await readdir(viteOut)).some(file => file.endsWith('.map')), false)
  console.log('PASS Vite final contributions handle tree-shaking, multiple versions, split JS/CSS, absent license text and analysis-map removal')

  const esbuildOut = join(root, 'esbuild/extension/dist')
  const collector = tsupLicenses(['fixture'])
  await tsupBuild({ config: false, entry: { fixture: join(root, 'entry.js') }, outDir: esbuildOut, format: ['esm'], splitting: true, minify: true, silent: true, noExternal: [/./], esbuildPlugins: [collector.esbuildPlugin], plugins: [collector.plugin] })
  const esbuildReport = await report('esbuild')
  assert.equal(esbuildReport.packages.some((item: { name: string }) => item.name === 'unused-package'), false)
  assert.ok(esbuildReport.packages.some((item: { name: string }) => item.name === 'lazy-package'))
  assert.deepEqual(esbuildReport.packages.filter((item: { name: string }) => item.name === 'same-package').map((item: { version: string }) => item.version), ['1.0.0', '2.0.0'])
  assert.ok(esbuildReport.packages.some((item: { name: string }) => item.name === 'style-only-package'))
  assert.ok(esbuildReport.outputs.length >= 3)
  console.log('PASS tsup reports written outputs and final esbuild byte contributions, including split assets')

  const licenseDir = join(root, 'vite/extension/assets/licenses')
  assert.equal(await readFile(join(licenseDir, 'project.txt'), 'utf8'), await readFile(new URL('../LICENSE', import.meta.url), 'utf8'))
  for (const item of viteReport.packages) {
    for (const file of item.files)
      assert.ok((await readFile(join(licenseDir, file.asset), 'utf8')).startsWith(item.name === 'style-only-package' ? 'Style-only fixture' : 'Fixture license'))
  }
  console.log('PASS project license and third-party originals are independent, exact text assets')
}
finally {
  await rm(root, { recursive: true, force: true })
}
