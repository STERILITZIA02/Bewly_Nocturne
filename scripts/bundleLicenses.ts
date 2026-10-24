import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import type { Options } from 'tsup'
import type { Plugin, ResolvedConfig } from 'vite'

import type { BundleLicensePackage } from '../src/utils/bundleLicenseTypes.ts'
import { getBackgroundEntries, VITE_SCRIPT_ENTRIES } from './buildEntries.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number]
interface Metafile {
  outputs: Record<string, {
    entryPoint?: string
    inputs: Record<string, { bytesInOutput: number }>
    imports: { path: string, external?: boolean }[]
    cssBundle?: string
  }>
}
const digest = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex')

export function licenseBuildEntries(dev: boolean) {
  return [...Object.keys(VITE_SCRIPT_ENTRIES), ...Object.keys(getBackgroundEntries(dev))]
}

/** Read only source indices referenced by final mappings, never every map source. */
export function mappedSources(map: { mappings: string, sources: string[], sourceRoot?: string }): string[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const indices = new Set<number>()
  let source = 0
  for (const line of map.mappings.split(';')) {
    for (const segment of line.split(',')) {
      let fields = 0
      let value = 0
      let shift = 0
      for (const character of segment) {
        const digit = alphabet.indexOf(character)
        if (digit < 0)
          throw new Error('Invalid source map VLQ')
        value += (digit & 31) * 2 ** shift
        if (digit & 32) {
          shift += 5
          continue
        }
        const decoded = value & 1 ? -(value >> 1) : value >> 1
        if (fields === 1)
          source += decoded
        fields++
        value = shift = 0
      }
      if (fields >= 4) {
        if (source < 0 || source >= map.sources.length)
          throw new Error('Invalid source map source index')
        indices.add(source)
      }
    }
  }
  return [...indices].map(index => `${map.sourceRoot || ''}${map.sources[index]}`)
}

function sourcePath(id: string, base: string) {
  const clean = id.replace(/[?#].*$/, '')
  if (clean.startsWith('file:'))
    return fileURLToPath(clean)
  if (clean.includes('\0') || /^[\w-]+:/.test(clean))
    return null
  return isAbsolute(clean) ? clean : resolve(base, clean)
}

function packageRoot(path: string) {
  if (!existsSync(path))
    return null
  const actual = realpathSync(path)
  if (!actual.split(sep).includes('node_modules'))
    return null
  let directory = dirname(actual)
  while (directory !== dirname(directory)) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest)) {
      const json = JSON.parse(readFileSync(manifest, 'utf8'))
      if (json.name)
        return { directory, json }
    }
    directory = dirname(directory)
  }
  return null
}

function atomicWrite(path: string, text: string) {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, text)
  renameSync(temporary, path)
}

function appendLicenseText(directory: string, entry: BundleLicensePackage, name: string, text: string) {
  const asset = `${digest(text)}.txt`
  if (!entry.files.some(file => file.asset === asset)) {
    atomicWrite(join(directory, asset), text)
    entry.files.push({ name, asset })
  }
}

function licenseDirectory(outDir: string) {
  let directory = resolve(outDir)
  while (directory !== dirname(directory) && !['dist', 'dist-native'].includes(directory.split(sep).at(-1)!))
    directory = dirname(directory)
  if (directory === dirname(directory))
    throw new Error('License output must be inside an extension dist directory')
  return join(dirname(directory), 'assets/licenses')
}

/** Each report is replaced as a unit; concurrent entry builds share only immutable text assets. */
export function writeLicenseReport(input: {
  outDir: string
  entry: string
  entries: string[]
  sources: Map<string, Set<string>>
  outputs: { file: string, hash: string }[]
  issues: string[]
}) {
  const directory = licenseDirectory(input.outDir)
  mkdirSync(directory, { recursive: true })
  const packages = new Map<string, BundleLicensePackage>()
  const readRoots = new Set<string>()
  for (const [path, outputs] of input.sources) {
    const root = packageRoot(path)
    if (!root) {
      if (path.split(sep).includes('node_modules'))
        input.issues.push(`Package metadata unavailable: ${path.split('node_modules/').at(-1)}`)
      continue
    }
    const { directory: rootDirectory, json } = root
    const key = `${json.name}@${json.version ?? 'unknown'}`
    let entry = packages.get(key)
    if (!entry) {
      const license = typeof json.license === 'string'
        ? json.license
        : json.license?.type
          || (Array.isArray(json.licenses) ? json.licenses.map((item: { type: string }) => item.type).join(' OR ') : null)
      entry = { id: digest(key).slice(0, 20), name: json.name, version: json.version || null, license: license || null, files: [], outputs: [], issues: [] }
      if (!entry.version)
        entry.issues.push('Package version unavailable')
      if (!entry.license)
        entry.issues.push('License identifier unavailable')
      packages.set(key, entry)
    }
    // Include notices and multi-license directories, retaining original text.
    if (!readRoots.has(rootDirectory)) {
      readRoots.add(rootDirectory)
      const files = readdirSync(rootDirectory, { withFileTypes: true }).flatMap((file) => {
        const namedLicense = /^(?:licen[sc]es?|copying|notice)(?:[.-]|$)/i.test(file.name)
        if (file.isFile())
          return namedLicense ? [file.name] : []
        if (file.isDirectory() && (namedLicense || /^(?:lib|dist|legal|docs)$/i.test(file.name)))
          return readdirSync(join(rootDirectory, file.name), { withFileTypes: true }).filter(child => child.isFile() && (namedLicense || /^(?:licen[sc]e|copying|notice)(?:[.-]|$)/i.test(child.name))).map(child => `${file.name}/${child.name}`)
        return []
      })
      const referenced = typeof json.license === 'string' ? /^SEE LICENSE IN (.+)$/i.exec(json.license)?.[1] : null
      if (referenced && !relative(rootDirectory, resolve(rootDirectory, referenced)).startsWith('..') && existsSync(resolve(rootDirectory, referenced)))
        files.push(referenced)
      for (const file of new Set(files)) {
        appendLicenseText(directory, entry, file, readFileSync(join(rootDirectory, file), 'utf8'))
      }
      const original = join(projectRoot, 'scripts/licenses', `${json.name.replaceAll('/', '-')}-${json.version}.txt`)
      if (!entry.files.length && existsSync(original))
        appendLicenseText(directory, entry, 'LICENSE (versioned source original)', readFileSync(original, 'utf8'))
    }
    if (json.name === '@iconify/json' && /[/\\]json[/\\][\w-]+\.json$/.test(path)) {
      const collection = JSON.parse(readFileSync(path, 'utf8'))
      const original = join(projectRoot, 'scripts/licenses', `${collection.prefix}-${collection.info?.version}.txt`)
      if (existsSync(original)) {
        appendLicenseText(directory, entry, `${collection.info.name} ${collection.info.version} LICENSE`, readFileSync(original, 'utf8'))
      }
      else {
        entry.issues.push(`Icon artwork license text unavailable: ${collection.prefix} ${collection.info?.version || 'unknown'} ${collection.info?.license?.url || ''}`)
      }
    }
    entry.outputs = [...new Set([...entry.outputs, ...outputs])].sort()
  }
  for (const entry of packages.values()) {
    if (!entry.files.length)
      entry.issues.push('License text unavailable')
  }
  const projectLicense = join(projectRoot, 'LICENSE')
  const project = existsSync(projectLicense) ? 'project.txt' : null
  if (project)
    atomicWrite(join(directory, project), readFileSync(projectLicense, 'utf8'))
  const report = { schema: 1, entry: input.entry, outputs: input.outputs, packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || `${a.version}`.localeCompare(`${b.version}`)), issues: [...new Set(input.issues)] }
  const reportFile = (entry: string) => `${entry.replaceAll('/', '-')}.json`
  atomicWrite(join(directory, reportFile(input.entry)), JSON.stringify(report))
  atomicWrite(join(directory, 'index.json'), JSON.stringify({ schema: 1, project, entries: input.entries.map(entry => ({ entry, asset: reportFile(entry) })) }))
  return report
}

export function bundleLicenses(entry: string, entries: string[]): Plugin[] {
  let config: ResolvedConfig
  const cssSources = new Map<string, string[]>()
  const cssChunks: { chunk: { viteMetadata?: { importedCss: Set<string> } }, ids: string[] }[] = []
  const sources = new Map<string, Set<string>>()
  const issues: string[] = []
  const add = (path: string, output: string) => sources.set(path, new Set([...(sources.get(path) ?? []), output]))
  return [{
    name: 'bewly-license-css-contributions',
    configResolved(value) { config = value },
    buildStart() {
      cssSources.clear()
      cssChunks.length = 0
      sources.clear()
      issues.length = 0
    },
    transform: {
      filter: { id: /\.(?:css|scss|sass|less|styl)(?:\?|$)/ },
      handler(code, id) {
        if (!code.trim())
          return
        const map = this.getCombinedSourcemap()
        const icons = [...code.matchAll(/(?:\.i-|\[i-)([a-z0-9]+)(?:\\?:|-)[^{}]+\{[^{}]*data:image\/svg\+xml/g)]
          .map(match => join(projectRoot, 'node_modules/@iconify/json/json', `${match[1]}.json`))
        cssSources.set(id, [id, ...mappedSources(map).map(source => sourcePath(source, dirname(id))!).filter(Boolean), ...new Set(icons)])
      },
    },
    renderChunk(_code, chunk, _options, meta) {
      const css = Object.keys(chunk.modules).filter(id => cssSources.has(id) && !/[?&](?:inline|transform-only)(?:&|$)/.test(id))
      cssChunks.push({ chunk, ids: css.filter((id) => {
        const scope = this.getModuleInfo(id)?.meta?.vite?.cssScopeTo as [string, string?] | undefined
        return !scope || Object.values(meta.chunks).some(output => output.modules[scope[0]] && (scope[1] === undefined || output.modules[scope[0]].renderedExports.includes(scope[1])))
      }) })
    },
  }, {
    name: 'bewly-final-output-licenses',
    enforce: 'post',
    config() { return { build: { sourcemap: 'hidden' } } },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const cssOutputs = Object.values(bundle).filter(output => output.type === 'asset' && output.fileName.endsWith('.css'))
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk') {
            if (output.map) {
              for (const id of mappedSources(output.map)) {
                const path = sourcePath(id, resolve(config.build.outDir, dirname(output.fileName)))
                if (path)
                  add(path, output.fileName)
              }
            }
            else if (Object.entries(output.modules).some(([id, module]) => module.renderedLength > 0 && sourcePath(id, config.root))) {
              // Entry facades and bundler helpers have no original source map.
              // Only emitted source modules can be missing attribution here.
              issues.push(`Final source map unavailable: ${output.fileName}`)
            }
            for (const id of Object.keys(output.modules)) {
              // Only modules with emitted code contribute here. CSS has a
              // separate output path even when its JavaScript body is empty.
              if (output.modules[id].renderedLength > 0) {
                const path = sourcePath(id, config.root)
                if (path)
                  add(path, output.fileName)
              }
              if (/[?&]inline(?:&|$)/.test(id) && output.modules[id].renderedLength > 0) {
                for (const path of cssSources.get(id) ?? [])
                  add(path, output.fileName)
              }
            }
          }
          else if (!output.fileName.endsWith('.map')) {
            for (const id of output.originalFileNames) {
              const path = sourcePath(id, config.root)
              if (path)
                add(path, output.fileName)
            }
          }
        }
        if (cssOutputs.length) {
          for (const { chunk, ids } of cssChunks) {
            const files = config.build.cssCodeSplit ? [...(chunk.viteMetadata?.importedCss ?? [])].filter(name => bundle[name]?.type === 'asset') : cssOutputs.map(output => output.fileName)
            for (const id of ids) {
              for (const path of cssSources.get(id) ?? []) {
                for (const file of files)
                  add(path, file)
              }
            }
          }
        }
        // Rolldown can erase an entire constant-only module while inlining its
        // value into a caller, without retaining a source-map origin. Such a
        // package is unconfirmed, never promoted from the loaded graph into
        // the final dependency list or silently treated as complete.
        const attributed = new Set([...sources.keys()].map(path => packageRoot(path)).filter(Boolean).map(root => `${root!.json.name}@${root!.json.version}`))
        const unknown = new Set<string>()
        for (const id of this.getModuleIds()) {
          if (!id.includes('node_modules') || !/\b(?:export\s+)?(?:const|var)\s+\w+\s*=\s*["'`\d]/.test(this.getModuleInfo(id)?.code || ''))
            continue
          const path = sourcePath(id, config.root)
          const root = path && packageRoot(path)
          const key = root ? `${root.json.name}@${root.json.version ?? 'unknown'}` : undefined
          if (key && !attributed.has(key))
            unknown.add(key)
        }
        for (const key of unknown)
          issues.push(`Output attribution unavailable (inlined or removed): ${key}`)
        // Analysis maps never become extension assets or a daily script payload.
        for (const name of Object.keys(bundle)) {
          if (name.endsWith('.map'))
            delete bundle[name]
        }
      },
    },
    writeBundle(options, bundle) {
      const outputs = Object.values(bundle).map(output => ({ file: output.fileName, hash: digest(output.type === 'chunk' ? output.code : output.source) }))
      writeLicenseReport({ outDir: options.dir!, entry, entries, sources, outputs, issues })
    },
  }]
}

export function tsupLicenses(entries: string[]): { esbuildPlugin: EsbuildPlugin, plugin: NonNullable<Options['plugins']>[number] } {
  let metadata: Metafile | undefined
  let cwd = projectRoot
  let outDir = ''
  return { esbuildPlugin: {
    name: 'bewly-final-output-licenses',
    setup(build) {
      build.initialOptions.metafile = true
      cwd = build.initialOptions.absWorkingDir || projectRoot
      outDir = build.initialOptions.outdir!
      build.onStart(() => {
        metadata = undefined
      })
      build.onEnd((result) => {
        metadata = result.errors.length ? undefined : result.metafile
      })
    },
  }, plugin: {
    name: 'bewly-written-output-licenses',
    buildEnd() {
      if (!metadata)
        throw new Error('Final esbuild contribution metadata unavailable')
      writeEsbuildLicenses(metadata, cwd, outDir, entries)
    },
  } }
}

export function writeEsbuildLicenses(metafile: Metafile, cwd: string, outDir: string, entries: string[]) {
  for (const [outputPath, output] of Object.entries(metafile.outputs)) {
    if (!output.entryPoint || !/\.(?:m?js|cjs)$/.test(outputPath))
      continue
    const file = relative(resolve(cwd, outDir), resolve(cwd, outputPath))
    const entry = file.replace(/\.(?:m?js|cjs)$/, '')
    const sources = new Map<string, Set<string>>()
    const visited = new Set<string>()
    const outputs: { file: string, hash: string }[] = []
    const issues: string[] = []
    const collect = (path: string) => {
      if (visited.has(path))
        return
      visited.add(path)
      const item = metafile.outputs[path]
      if (!item) {
        issues.push(`Split output unavailable: ${path}`)
        return
      }
      const name = relative(resolve(cwd, outDir), resolve(cwd, path))
      outputs.push({ file: name, hash: digest(readFileSync(resolve(cwd, path))) })
      for (const [source, contribution] of Object.entries(item.inputs)) {
        if (contribution.bytesInOutput > 0) {
          const absolute = sourcePath(source, cwd)
          if (absolute)
            sources.set(absolute, new Set([...(sources.get(absolute) ?? []), name]))
        }
      }
      for (const imported of item.imports) {
        if (!imported.external)
          collect(imported.path)
      }
      if (item.cssBundle)
        collect(item.cssBundle)
    }
    collect(outputPath)
    writeLicenseReport({ outDir: resolve(cwd, outDir), entry, entries, sources, outputs, issues })
  }
}
