import { readFile } from 'node:fs/promises'

/**
 * All text is regular (user-specified): emphasis comes from the text tone
 * (text-1 … text-4) and size, never from weight.
 */
const rules: Array<[RegExp, string]> = [
  [/(?:--|\$)bew-(?:font-weight-(?:medium|semibold|bold)|heading-weight|subheading-weight)(?![\w-])/, 'retired weight token'],
  [/font-weight:\s*(?:bold|bolder|[5-9]00)\b|fontWeight\s*[:=]\s*['"]?(?:bold|[5-9]00)/, 'heavy weight literal'],
  [/(?:^|[\s"'`:])(?:font-(?:medium|semibold|bold|extrabold|black)|fw-(?:medium|semibold|bold|[5-9]00))(?=[\s"'`>;]|$)|\bfont="(?:medium|semibold|bold)"/, 'UnoCSS heavy weight'],
]

/** Reports `file:line rule` for every weight above regular. */
export async function findFontWeightViolations(files: string[]) {
  const violations: string[] = []
  for (const file of files) {
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
