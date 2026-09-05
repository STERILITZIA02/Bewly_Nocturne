import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import ts from 'typescript'

export const playbackSourceFiles = [
  '../src/utils/bewlyWidescreen.ts',
  ...[
    'types',
    'constants',
    'session',
    'nativeDom',
    'labels',
    'shell',
    'nativeControls',
    'actionEffects',
    'geometry',
    'interactions',
    'description',
    'playlist',
    'videoInfo',
    'danmaku',
    'sidebar',
    'loading',
    'loadingView',
    'styles/layout',
    'styles/loading',
  ].map(name => `../src/utils/bewlyWidescreen/${name}.ts`),
] as const

export async function readPlaybackSource() {
  return (await Promise.all(playbackSourceFiles.map(file => readFile(new URL(file, import.meta.url), 'utf8')))).join('\n')
}

export function playbackFunctions(content: string, ...names: string[]) {
  const source = ts.createSourceFile('playback-fixture.ts', content, ts.ScriptTarget.Latest, true)
  const selected = new Map<string, string>()
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text))
      selected.set(node.name.text, node.getText(source))
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(selected.size, names.length, `Playback functions missing: ${names.filter(name => !selected.has(name)).join(', ')}`)
  return names.map(name => selected.get(name)).join('\n')
}
