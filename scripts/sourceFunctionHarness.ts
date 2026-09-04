import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'

// Execute the actual functions with deterministic DOM/clock inputs, without
// booting the entire content script or introducing a second production policy.
export async function loadSourceFunctions(file: string, names: string[], globals: Record<string, unknown>) {
  const content = await readFile(new URL(file, import.meta.url), 'utf8')
  const script = file.endsWith('.vue') ? parse(content).descriptor.scriptSetup!.content : content
  const source = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true)
  const selected: string[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isEnumDeclaration(node)) && node.name && names.includes(node.name.text))
      selected.push(node.getText(source).replace(/^export\s+/, ''))
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text))
      selected.push(`var ${node.getText(source)};`)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(selected.length, names.length)
  const context = vm.createContext(globals)
  const code = ts.transpileModule(selected.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInContext(code, context)
  return context
}
