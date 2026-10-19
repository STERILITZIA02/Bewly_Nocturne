import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const collection = require('@iconify/json/json/tabler.json')

const root = process.cwd()
const icons = new Set()
let occurrences = 0
// `@iconify/vue` draws raw stroke-2 Tabler from the network; only the protected
// Dock/SideBar theme toggles keep it, plus the opus iframe gallery, which has no
// UnoCSS and normalises the stroke to 1.75 in its own stylesheet.
const ICONIFY_VUE_ALLOWED = new Set([
  'src/components/Dock/Dock.vue',
  'src/components/SideBar/SideBar.vue',
  'src/contentScripts/features/opusDetailDrawerLayout.ts',
])
async function inspect(path) {
  const text = await readFile(path, 'utf8')
  if (text.includes('from \'@iconify/vue\''))
    assert.ok(ICONIFY_VUE_ALLOWED.has(relative(root, path)), `${path}: use an UnoCSS i-tabler:* class instead of @iconify/vue`)
  assert.doesNotMatch(text, /(?:mingcute|solar|line-md|ph|mdi|fluent):[a-z0-9-]+/, `${path}: mixed functional icon family`)
  for (const match of text.matchAll(/\btabler:([a-z0-9-]+)/g)) {
    assert.ok(collection.icons[match[1]] || collection.aliases?.[match[1]], `${path}: missing Tabler icon ${match[1]}`)
    icons.add(match[1])
    occurrences++
  }
}
async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name)
    if (entry.isDirectory())
      await scan(child)
    else if (/\.(?:vue|ts|scss)$/.test(entry.name))
      await inspect(child)
  }
}
await scan(resolve(root, 'src'))
await inspect(resolve(root, 'unocss.config.ts'))
console.log(`PASS UI icons: ${occurrences} Tabler references, ${icons.size} verified icon names, no remaining mixed functional families.`)
