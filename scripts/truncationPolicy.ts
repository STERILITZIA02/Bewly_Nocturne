import { readFile } from 'node:fs/promises'

/**
 * Native pages keep their own truncation (adapted styles restyle B站 nodes);
 * every Bewly surface fades truncated text through `styles/truncateFade.scss`.
 */
const EXEMPT = /styles\/adaptedStyles\/|utils\/bewlyWidescreen\/|styles\/truncateFade\.scss$/

const rules: Array<[RegExp, string]> = [
  [/text-overflow:\s*ellipsis/, 'ellipsis; use truncateFade.line or .keep-one-line'],
  [/-webkit-line-clamp:\s*(?!\s|unset)|(?<![-\w])line-clamp:/, 'line clamp; use truncateFade.lines or .keep-two-lines'],
  [/(?:^|[\s"'])(?:truncate|line-clamp-\d+|text-ellipsis|overflow-ellipsis)(?=[\s"'>]|$)|\btext="ellipsis"/, 'UnoCSS truncation; use .keep-one-line / .keep-two-lines'],
]

/** Reports `file:line rule` for every truncation that bypasses the fade. */
export async function findTruncationViolations(files: string[]) {
  const violations: string[] = []
  for (const file of files) {
    if (EXEMPT.test(file.replaceAll('\\', '/')))
      continue
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
