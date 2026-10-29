import { readFile } from 'node:fs/promises'

/**
 * Lines have three roles (user-approved): separators and surface edges are
 * hairlines in their role colour, fields keep 1px. Native-page restyles may keep
 * native widths but use the same tokens.
 */
const RETIRED = ['border-color', 'surface-border-color', 'glass-border-color', 'message-card-border', 'notifications-card-border', 'input-border-color', 'input-border-color-hover', 'comment-tree-line-color', 'media-edge-width']
const NATIVE = /styles\/adaptedStyles\/|utils\/bewlyWidescreen\/|src\/inject\//

const everywhere: Array<[RegExp, string]> = [
  [new RegExp(`(?:--|\\$)bew-(?:${RETIRED.join('|')})(?![\\w-])`), 'retired border token'],
]
const bewly: Array<[RegExp, string]> = [
  // Component width parameters (switch, segment control) and the rail tree's
  // branch lines (user-specified, a little thicker) stay allowed.
  [/border(?:-[a-z]+)*:\s*(?!var\(--(?:bew-hairline|b-[\w-]+|bew-control-border-width|bew-tree-line-width)\b)[^\s;]+\s+solid\s+var\(--bew-(?:separator|edge)-color/, 'separator / edge width must be var(--bew-hairline)'],
  [/border(?:-[a-z]+)*:\s*(?!var\(--bew-glass-edge-width)[^\s;]+\s+solid\s+var\(--bew-glass-edge-color/, 'the glass rim pairs var(--bew-glass-edge-width) with its colour'],
  [/\b(?:un-)?border(?:-[trblxy])?="(?:[^"]*\s)?(?:[trblxy]-)?\d[^"]*\$bew-(?:separator|edge)-color|\bborder-(?:[trblxy]-)?\d+\s+border-\$bew-(?:separator|edge)-color/, 'UnoCSS separator / edge must use hairline'],
]
const styleOnly: Array<[RegExp, string]> = [
  [/border(?:-[a-z]+)*:[^;#(]*(?:#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\()/i, 'literal border colour; use a line role token'],
]

/** Reports `file:line rule` for every line that bypasses the border roles. */
export async function findBorderViolations(files: string[]) {
  const violations: string[] = []
  for (const file of files) {
    const native = NATIVE.test(file.replaceAll('\\', '/'))
    const rules = [
      ...everywhere,
      ...(native ? [] : bewly),
      ...(native || !/\.(?:vue|scss|css)$/.test(file) ? [] : styleOnly),
    ]
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((line, index) => {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line))
        return
      for (const [pattern, rule] of rules) {
        if (pattern.test(line))
          violations.push(`${file}:${index + 1} ${rule}`)
      }
    })
  }
  return violations
}
