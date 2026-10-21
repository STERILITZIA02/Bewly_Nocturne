import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as sass from 'sass'

import { findAncestorClassAttributeSelectors, hasAncestorClassAttribute } from './cssInvalidation'
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

/** Tracked and new source files matching `pattern`, as absolute paths. */
function sourceFiles(pattern: string) {
  const list = (args: string[]) => execFileSync('git', ['ls-files', ...args, '--', pattern], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  return [...new Set([...list([]), ...list(['--others', '--exclude-standard'])])].map(path => `${root}${path}`)
}

function compileFile(file: string) {
  return sass.compile(file, { loadPaths: [styles, `${styles}adaptedStyles/pages`], silenceDeprecations: ['import', 'global-builtin', 'mixed-decls'] as never[], logger: sass.Logger.silent }).css
}

function report(source: string, css: string) {
  for (const selector of findAncestorClassAttributeSelectors(css))
    failures.push(`${source}: ${selector.replace(/\s+/g, ' ')}`)
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
  for (const file of globalScss)
    report(relative(root, file), compileFile(file))

  // Vue component styles are bundled into the same sheets.
  const components = sourceFiles('src/**/*.vue')
  for (const file of components) {
    const source = await readFile(file, 'utf8')
    for (const [, attributes, body] of source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
      const css = /lang="scss"/.test(attributes)
        ? sass.compileString(body, { url: pathToFileURL(file), loadPaths: [dirname(file), styles], silenceDeprecations: ['import', 'global-builtin', 'mixed-decls'] as never[], logger: sass.Logger.silent }).css
        : body
      report(relative(root, file), css)
    }
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

  // Auto-hide must not flip an inherited value on <body>.
  assert.doesNotMatch(playbackCss, /body\.bewly-widescreen-active\.bewly-widescreen-controls-hidden\s*\{/)

  if (failures.length) {
    console.error(failures.join('\n'))
    assert.fail(`${failures.length} always-loaded selectors keep class substrings above the subject`)
  }
  console.log(`style invalidation: ${globalScss.size} global sheets, ${components.length} components and the playback CSS are clean`)
}

void main()
