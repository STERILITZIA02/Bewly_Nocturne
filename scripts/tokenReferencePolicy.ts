import { readFile } from 'node:fs/promises'

/** Sass pigments and the settings preview generate these names from prefixes. */
const generated = [
  '--bew-neutral-bg',
  ...['light', 'dark'].flatMap(mode => ['bg', 'fg', 'accent'].map(role => `--bew-appearance-preview-${mode}-${role}`)),
]

/** Check required literal references; optional var() fallbacks stay optional. */
export async function findTokenReferenceViolations(files: string[]) {
  const sources = await Promise.all(files.map(async file => ({ file, source: await readFile(file, 'utf8') })))
  const definitions = new Set(generated)
  for (const { source } of sources) {
    for (const match of source.matchAll(/['"]?(--bew-[\w-]+)['"]?\s*:|setProperty\(['"](--bew-[\w-]+)['"]/g))
      definitions.add(match[1] || match[2])
  }
  const violations: string[] = []
  for (const { file, source } of sources) {
    source.split('\n').forEach((line, index) => {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line))
        return
      for (const match of line.matchAll(/var\(\s*(--bew-[\w-]+)\s*\)|\$bew-([\w-]+)/g)) {
        const token = match[1] || `--bew-${match[2]}`
        if (!definitions.has(token))
          violations.push(`${file}:${index + 1} undefined token ${token}`)
      }
    })
  }
  return violations
}
