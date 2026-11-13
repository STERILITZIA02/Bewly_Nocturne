import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'

interface TargetDeclaration {
  ids: Set<string>
  imports: string[]
  pages: Array<{ value: string, file: string }>
}

/**
 * Settings IDs and page routes are a declarative interface, not component names
 * or template whitespace. Read that interface through the Vue/TS parsers.
 */
export async function readSettingsTargetDeclarations() {
  const base = fileURLToPath(new URL('../src/components/Settings/', import.meta.url))
  const cache = new Map<string, TargetDeclaration>()
  const read = async (file: string): Promise<TargetDeclaration> => {
    const cached = cache.get(file)
    if (cached)
      return cached
    // compileScript mutates the cached template AST. Keep the inventory's
    // parser context separate from mounted component fixtures in this process.
    const { descriptor } = parse(await readFile(file, 'utf8'), { filename: `${file}?settings-targets` })
    const result: TargetDeclaration = { ids: new Set(), imports: [], pages: [] }
    cache.set(file, result)
    const tags = new Set<string>()
    const dynamicFields = new Set<string>()
    const loopSources = new Set<string>()
    let dynamicId = false
    const template = (node: any) => {
      if (node.type === 1) {
        tags.add(node.tag)
        for (const prop of node.props) {
          if (prop.type === 7 && prop.name === 'for' && prop.exp) {
            const loop = ts.createSourceFile('loop.ts', `for (const ${prop.exp.content}) {}`, ts.ScriptTarget.Latest, true).statements[0]
            if ((ts.isForInStatement(loop) || ts.isForOfStatement(loop)) && ts.isIdentifier(loop.expression))
              loopSources.add(loop.expression.text)
          }
          if (prop.type === 6 && ['setting-id', 'data-setting-id'].includes(prop.name) && prop.value)
            result.ids.add(prop.value.content)
          if (prop.type === 7 && prop.name === 'bind' && ['setting-id', 'data-setting-id'].includes(prop.arg?.content)) {
            const expression = ts.createSourceFile('id.ts', `(${prop.exp?.content ?? ''})`, ts.ScriptTarget.Latest, true)
            const literal = (value: ts.Node) => {
              if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
                result.ids.add(value.text)
              if (ts.isPropertyAccessExpression(value))
                dynamicFields.add(value.name.text)
              ts.forEachChild(value, literal)
            }
            literal(expression)
            dynamicId = true
          }
        }
      }
      node.children?.forEach(template)
    }
    if (descriptor.template?.ast)
      template(descriptor.template.ast)
    const script = ts.createSourceFile(file, `${descriptor.script?.content ?? ''}\n${descriptor.scriptSetup?.content ?? ''}`, ts.ScriptTarget.Latest, true)
    const fileOf = (path: string) => path.startsWith('~/') ? resolve(base, '../..', path.slice(2)) : resolve(dirname(file), path)
    const configs: Array<{ file: string, name: string }> = []
    const importedComponent = (node: ts.Node): string | undefined => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0]))
        return node.arguments[0].text
      return ts.forEachChild(node, importedComponent)
    }
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith('.vue')) {
        if (node.importClause?.name && tags.has(node.importClause.name.text))
          result.imports.push(fileOf(node.moduleSpecifier.text))
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && (node.moduleSpecifier.text.startsWith('~/') || node.moduleSpecifier.text.startsWith('.'))
        && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const binding of node.importClause.namedBindings.elements) {
          if (loopSources.has(binding.name.text))
            configs.push({ file: `${fileOf(node.moduleSpecifier.text)}.ts`, name: binding.propertyName?.text ?? binding.name.text })
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && tags.has(node.name.text) && node.initializer) {
        const imported = importedComponent(node.initializer)
        if (imported)
          result.imports.push(fileOf(imported))
      }
      if (ts.isObjectLiteralExpression(node)) {
        const fields = new Map(node.properties.filter(ts.isPropertyAssignment).map(prop => [prop.name.getText(script).replace(/^['"]|['"]$/g, ''), prop.initializer]))
        const value = fields.get('value')
        const component = fields.get('component')
        const target = component && importedComponent(component)
        if (value && ts.isStringLiteral(value) && target)
          result.pages.push({ value: value.text, file: fileOf(target) })
      }
      if (dynamicId && ts.isPropertyAssignment(node) && dynamicFields.has(node.name.getText(script).replace(/^['"]|['"]$/g, ''))
        && ts.isStringLiteral(node.initializer)) {
        result.ids.add(node.initializer.text)
      }
      // Tuple-backed rows bind their ID through the destructured label value.
      if (dynamicId && ts.isArrayLiteralExpression(node) && node.elements.every(ts.isStringLiteral))
        node.elements.forEach(value => result.ids.add((value as ts.StringLiteral).text))
      ts.forEachChild(node, visit)
    }
    visit(script)
    for (const config of configs) {
      const source = ts.createSourceFile(config.file, await readFile(config.file, 'utf8'), ts.ScriptTarget.Latest, true)
      const collect = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && dynamicFields.has(node.name.getText(source).replace(/^['"]|['"]$/g, '')) && ts.isStringLiteral(node.initializer))
          result.ids.add(node.initializer.text)
        ts.forEachChild(node, collect)
      }
      const find = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === config.name && node.initializer)
          collect(node.initializer)
        else ts.forEachChild(node, find)
      }
      find(source)
    }
    return result
  }
  const shellFile = resolve(base, 'Settings.vue')
  const shell = parse(await readFile(shellFile, 'utf8'), { filename: `${shellFile}?settings-targets` }).descriptor.scriptSetup!.content
  const script = ts.createSourceFile(shellFile, shell, ts.ScriptTarget.Latest, true)
  const roots = new Map<string, string>()
  const findRoots = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ts.isComputedPropertyName(node.name) && ts.isPropertyAccessExpression(node.name.expression)
      && node.name.expression.expression.getText(script) === 'MenuType') {
      const findImport = (child: ts.Node) => {
        if (ts.isCallExpression(child) && child.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(child.arguments[0]))
          roots.set((node.name as ts.ComputedPropertyName).expression.getText(script).split('.').at(-1)!, resolve(base, child.arguments[0].text))
        ts.forEachChild(child, findImport)
      }
      findImport(node.initializer)
    }
    ts.forEachChild(node, findRoots)
  }
  findRoots(script)
  return async (menu: string, routeValues: string[]) => {
    const root = roots.get(menu)
    if (!root)
      throw new Error(`Missing Settings category ${menu}`)
    const ids = new Set<string>()
    const seen = new Set<string>()
    const visit = async (file: string) => {
      if (seen.has(file))
        return
      seen.add(file)
      const declaration = await read(file)
      declaration.ids.forEach(id => ids.add(id))
      const selected = declaration.pages.filter(page => routeValues.includes(page.value))
      for (const child of [...declaration.imports, ...selected.map(page => page.file)])
        await visit(child)
    }
    await visit(root)
    return ids
  }
}
