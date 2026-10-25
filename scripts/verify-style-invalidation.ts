import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as sass from 'sass'

import { createProgressiveBlurLayers, getProgressiveBlurAncestorIssue, PROGRESSIVE_BLUR_LAYER_COUNT } from '../src/utils/progressiveBlur'
import { findAncestorClassAttributeSelectors, hasAncestorClassAttribute } from './cssInvalidation'
import { findMaskedBackdropRules, findProgressiveBlurClippingAncestors, hasInlineMaskedBackdrop } from './maskedBlurPolicy'
import { loadSourceModule } from './sourceModuleHarness'

/**
 * Stylesheets that load on every page (the manifest sheets, Bewly's Shadow copy
 * and the playback CSS injected at runtime) must not hold class-substring
 * selectors above the subject: one such rule makes every class change restyle
 * whole subtrees (see scripts/cssInvalidation.ts). Page-specific CSS loads as
 * text on its own route or site only.
 */

const root = fileURLToPath(new URL('..', import.meta.url))
const styles = `${root}src/styles/`
const failures: string[] = []
const blurFailures: string[] = []

/** Tracked and new source files matching `pattern`, as absolute paths. */
function sourceFiles(pattern: string) {
  const list = (args: string[]) => execFileSync('git', ['ls-files', ...args, '--', pattern], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  // Tracked files deleted in the working tree are skipped until the deletion is committed.
  return [...new Set([...list([]), ...list(['--others', '--exclude-standard'])])].map(path => `${root}${path}`).filter(path => existsSync(path))
}

function compileFile(file: string) {
  return sass.compile(file, { loadPaths: [styles, `${styles}adaptedStyles/pages`], silenceDeprecations: ['import', 'global-builtin', 'mixed-decls'] as never[], logger: sass.Logger.silent }).css
}

function report(source: string, css: string) {
  for (const selector of findAncestorClassAttributeSelectors(css))
    failures.push(`${source}: ${selector.replace(/\s+/g, ' ')}`)
  reportBlur(source, css)
}

function reportBlur(source: string, css: string) {
  for (const selector of findMaskedBackdropRules(css))
    blurFailures.push(`${source}: ${selector}`)
}

async function main() {
  // The scanner itself.
  for (const [selector, expected] of [
    ['[class*="a"] .b', true],
    ['.a [class*="b"]', false],
    ['.a :is([class*="b"] .c)', true],
    ['.a:not(:where([class*="box"] *))', true],
    ['.a [class*="b"] svg', true],
    ['[class*="cover"] > picture > img', false],
    ['.x[class*="a"]:hover', false],
  ] as const)
    assert.equal(hasAncestorClassAttribute(selector), expected, selector)

  // Global SCSS of both content entries.
  const contentEntry = await readFile(`${styles}index.ts`, 'utf8')
  const nativeEntry = await readFile(`${root}src/contentScripts/nativeAppearance.ts`, 'utf8')
  const globalScss = new Set<string>()
  for (const [, path] of contentEntry.matchAll(/^import '\.\/([\w./-]+\.scss)'/gm))
    globalScss.add(`${styles}${path}`)
  for (const group of ['common', 'shadowDom', 'thirdParties']) {
    const index = await readFile(`${styles}adaptedStyles/${group}/index.ts`, 'utf8')
    for (const [, path] of index.matchAll(/^import '\.\/([\w./-]+\.scss)'/gm))
      globalScss.add(`${styles}adaptedStyles/${group}/${path}`)
  }
  for (const [, path] of nativeEntry.matchAll(/^import '~\/styles\/([\w./-]+\.scss)'/gm))
    globalScss.add(`${styles}${path}`)
  assert.ok(globalScss.size > 15, 'global stylesheet list was not found')
  const sharedCss: string[] = []
  for (const file of globalScss) {
    const css = compileFile(file)
    sharedCss.push(css)
    report(relative(root, file), css)
  }
  for (const file of sourceFiles('src/**/*.css')) {
    const css = await readFile(file, 'utf8')
    sharedCss.push(css)
    reportBlur(relative(root, file), css)
  }

  // Vue component styles are bundled into the same sheets.
  const components = sourceFiles('src/**/*.vue')
  for (const file of components) {
    const source = await readFile(file, 'utf8')
    const componentCss: string[] = []
    for (const [, attributes, body] of source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
      const css = /lang="scss"/.test(attributes)
        ? sass.compileString(body, { url: pathToFileURL(file), loadPaths: [dirname(file), styles], silenceDeprecations: ['import', 'global-builtin', 'mixed-decls'] as never[], logger: sass.Logger.silent }).css
        : body
      report(relative(root, file), css)
      componentCss.push(css)
    }
    for (const issue of findProgressiveBlurClippingAncestors(source, [...sharedCss, ...componentCss].join('\n')))
      blurFailures.push(`${relative(root, file)}: ${issue}`)
  }

  // Playback CSS injected at runtime on every video page.
  let playbackCss = ''
  const layout = await loadSourceModule('../src/utils/bewlyWidescreen/styles/layout.ts', {
    '~/constants/globalEvents': await import('../src/constants/globalEvents'),
    '~/styles/loadingRing.scss?inline': { default: compileFile(`${styles}loadingRing.scss`) },
    '~/styles/segmentControl.scss?inline': { default: compileFile(`${styles}segmentControl.scss`) },
    '~/styles/segmentLiquidIndicator.scss?inline': { default: compileFile(`${styles}segmentLiquidIndicator.scss`) },
    '~/styles/sendButton.scss?inline': { default: compileFile(`${styles}sendButton.scss`) },
    '~/styles/skeleton.scss?inline': { default: compileFile(`${styles}skeleton.scss`) },
    '~/utils/danmakuSenderOrder': await import('../src/utils/danmakuSenderOrder'),
    '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
    '~/utils/bewlyWidescreen/styles/cardLayout': await import('../src/utils/bewlyWidescreen/styles/cardLayout'),
    '~/utils/main': { injectCSS: (text: string) => { playbackCss = text } },
    '~/utils/photoViewer': await import('../src/utils/photoViewer'),
  })
  layout.injectLayoutStyle()
  assert.ok(playbackCss.length > 10_000, 'playback layout CSS was not captured')
  report('bewlyWidescreen/styles/layout.ts', playbackCss)

  // Route and native-site CSS stays out of the bundled sheets.
  const adapted = await readFile(`${styles}adaptedStyles/index.ts`, 'utf8')
  assert.doesNotMatch(adapted, /import\('\.\/pages\/[^']+\.scss'\)/, 'route CSS must load as ?inline text')
  assert.match(adapted, /document\.documentElement\.prepend\(routeStyle\)/)
  assert.match(nativeEntry, /import NATIVE_SITES_CSS from '~\/styles\/adaptedStyles\/pages\/nativeSites\.scss\?inline'/)
  assert.match(nativeEntry, /selectNativeSiteCss\(NATIVE_SITES_CSS, nativeSite\)/)
  for (const file of ['ts', 'vue', 'scss'].flatMap(extension => sourceFiles(`src/**/*.${extension}`))) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /(?:import|@use|@import)\s*(?:\(\s*)?['"][^'"]*adaptedStyles\/pages\/[^'"?]+\.scss['"]/, `${relative(root, file)} bundles route CSS`)
  }

  // Only the current native site's rules are kept.
  const { selectNativeSiteCss } = await import('../src/utils/nativeSiteCss')
  const sample = `
    @keyframes spin { to { rotate: 1turn } }
    html[data-bewly-native-site] .shared { color: red }
    html[data-bewly-native-site="live"] .a, html[data-bewly-native-site="manga"] .b { color: blue }
    @media (width > 1px) { html[data-bewly-native-site=manga] .c { color: green } }
  `
  const live = selectNativeSiteCss(sample, 'live')
  assert.match(live, /@keyframes spin/)
  assert.match(live, /\.shared/)
  assert.match(live, /site="live"\] \.a\{/)
  assert.doesNotMatch(live, /manga/)
  assert.match(selectNativeSiteCss(sample, 'manga'), /@media \(width > 1px\)\{html\[data-bewly-native-site=manga\] \.c/)

  // Gradient blur policy covers every stylesheet, route CSS included, and inline style objects.
  assert.deepEqual(findMaskedBackdropRules('.a{backdrop-filter:blur(4px);mask-image:linear-gradient(#000,transparent)}'), ['.a'])
  assert.deepEqual(findMaskedBackdropRules('.bew-progressive-blur__layer{backdrop-filter:blur(4px);mask-image:linear-gradient(#000,transparent)}'), ['.bew-progressive-blur__layer'], 'a class name cannot bypass the shared implementation')
  assert.deepEqual(findMaskedBackdropRules('.a{backdrop-filter:none;mask-image:linear-gradient(#000,transparent)}'), [])
  assert.deepEqual(findMaskedBackdropRules('.e{backdrop-filter:var(--bew-filter-glass-1)}.e--top{mask-image:linear-gradient(#000,transparent)}'), ['.e'], 'blur and mask split across BEM rules')
  assert.deepEqual(findMaskedBackdropRules('.d::before{backdrop-filter:blur(2px)}.d::before{mask:linear-gradient(#000,transparent)}'), ['.d::before'])
  assert.equal(hasInlineMaskedBackdrop('const s = { backdropFilter: f, maskImage: m }'), true)
  assert.equal(hasInlineMaskedBackdrop(`const s = { WebkitBackdropFilter: 'blur(4px)', other: '${'x'.repeat(250)}', WebkitMaskImage: 'linear-gradient(#000,transparent)' }`), true)
  assert.equal(hasInlineMaskedBackdrop('const a = { backdropFilter: f }; const b = { maskImage: m }'), false, 'different elements may keep their glass and mask separate')
  assert.equal(hasInlineMaskedBackdrop('<div style="backdrop-filter:blur(4px);mask-image:linear-gradient(#000,transparent)"></div>'), true)

  // Reproduce the rectangular-band integration mistake, including inherited
  // radius and rules split between a shared surface and the component.
  const blurHost = '<template><div class="surface panel"><ProgressiveBlur edge="top" /></div></template>'
  const roundedClip = '.surface{border-radius:12px;corner-shape:superellipse(1.7)}.panel{overflow:hidden}'
  assert.equal(findProgressiveBlurClippingAncestors(blurHost, roundedClip).length, 1)
  assert.deepEqual(findProgressiveBlurClippingAncestors(blurHost, roundedClip.replace('overflow:hidden', 'overflow:visible')), [])
  assert.deepEqual(findProgressiveBlurClippingAncestors(blurHost, roundedClip.replace('superellipse(1.7)', 'round')), [])
  assert.deepEqual(findProgressiveBlurClippingAncestors(blurHost, `${roundedClip.replace('overflow:hidden', 'overflow:visible')}.surface--clip{overflow:hidden}`), [], 'unused clip modifiers must not affect the host')
  assert.deepEqual(findProgressiveBlurClippingAncestors(blurHost, '.panel::before{border-radius:12px;corner-shape:superellipse(1.7);overflow:hidden}'), [], 'a sibling surface may clip itself')
  assert.deepEqual(findProgressiveBlurClippingAncestors(blurHost.replace('<ProgressiveBlur', '<Teleport to="body"><ProgressiveBlur').replace(' /></div>', ' /></Teleport></div>'), roundedClip), [])

  for (const [values, expected] of [
    [{ 'backdrop-filter': 'blur(4px)' }, 'backdrop-filter'],
    [{ 'filter': 'opacity(1)' }, 'filter'],
    [{ 'mask-image': 'linear-gradient(#000,transparent)' }, 'mask-image'],
    [{ 'clip-path': 'inset(0)' }, 'clip-path'],
    [{ 'opacity': '0.9' }, 'opacity'],
    [{ 'mix-blend-mode': 'multiply' }, 'mix-blend-mode'],
    [{ 'will-change': 'transform, opacity' }, 'will-change'],
    [{ 'corner-shape': 'superellipse(1.7)', 'overflow-y': 'hidden', 'border-top-left-radius': '12px' }, 'corner-shape + overflow clipping'],
    [{ 'corner-shape': 'round', 'overflow-y': 'hidden', 'border-top-left-radius': '12px' }, undefined],
    [{ 'corner-shape': 'superellipse(1)', 'overflow-y': 'hidden', 'border-top-left-radius': '12px' }, undefined],
    [{ 'corner-shape': 'superellipse(1.7)', 'overflow-y': 'visible', 'border-top-left-radius': '12px' }, undefined],
    [{ 'will-change': 'transform', 'opacity': '1' }, undefined],
  ] as const)
    assert.equal(getProgressiveBlurAncestorIssue({ getPropertyValue: property => (values as Record<string, string>)[property] ?? '' }), expected)
  for (const edge of ['top', 'bottom', 'left', 'right', 'center'] as const) {
    const layers = createProgressiveBlurLayers(edge)
    assert.equal(layers.length, PROGRESSIVE_BLUR_LAYER_COUNT)
    for (const [index, layer] of layers.entries()) {
      assert.match(layer.maskImage, /transparent \d+%\)$/)
      assert.equal(layer.maskImage, layer.WebkitMaskImage)
      assert.equal(layer.backdropFilter, layer.WebkitBackdropFilter)
      assert.match(layer.maskImage, new RegExp(`transparent ${(PROGRESSIVE_BLUR_LAYER_COUNT - index) * 100 / PROGRESSIVE_BLUR_LAYER_COUNT}%`))
    }
  }
  for (const file of sourceFiles('src/**/*.scss').filter(path => !/\/_[^/]+$/.test(path)))
    reportBlur(relative(root, file), compileFile(file))
  for (const file of ['ts', 'vue'].flatMap(extension => sourceFiles(`src/**/*.${extension}`))) {
    const source = await readFile(file, 'utf8')
    if (!file.endsWith('utils/progressiveBlur.ts') && hasInlineMaskedBackdrop(source))
      blurFailures.push(`${relative(root, file)}: inline backdropFilter beside maskImage`)
    if (!file.endsWith('utils/progressiveBlur.ts') && !file.endsWith('components/ProgressiveBlur.vue') && /\bcreateProgressiveBlurLayers\b/.test(source))
      blurFailures.push(`${relative(root, file)}: bypasses ProgressiveBlur's clipping guard and layer visibility`)
  }
  if (blurFailures.length) {
    console.error([...new Set(blurFailures)].join('\n'))
    assert.fail(`${new Set(blurFailures).size} gradient blur violations; use ProgressiveBlur without rounded overflow ancestors (see scripts/maskedBlurPolicy.ts)`)
  }

  // Auto-hide must not flip an inherited value on <body>.
  assert.doesNotMatch(playbackCss, /body\.bewly-widescreen-active\.bewly-widescreen-controls-hidden\s*\{/)

  if (failures.length) {
    console.error(failures.join('\n'))
    assert.fail(`${failures.length} always-loaded selectors keep class substrings above the subject`)
  }
  console.log(`style invalidation: ${globalScss.size} global sheets, ${components.length} components and the playback CSS are clean`)
}

void main()
