import { readFile } from 'node:fs/promises'

/** Retired radius names; the role tokens in variables.scss replace them. */
const RETIRED = ['radius', 'radius-half', 'radius-3xl', 'card-radius', 'panel-radius', 'popover-radius', 'video-cover-radius', 'moment-media-radius', 'badge-radius', 'top-bar-primary-control-radius', 'card-inset-radius', 'popover-inner-radius', 'popover-card-radius', 'popover-media-radius', 'composer-radius', 'native-comment-tag-radius', 'moment-card-radius']
const STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'full']

const rules: Array<[RegExp, string]> = [
  [new RegExp(`(?:--|\\$)bew-(?:${RETIRED.join('|')})(?![\\w-])`), 'retired radius token'],
  [new RegExp(`(?:--|\\$)bew-radius-(?:${STEPS.join('|')})(?![\\w-])`), 'radius step outside variables.scss; use a role token'],
  // A literal corner, outside a var() fallback. 0, 50% (circles) and inherit stay allowed.
  [/border(?:-[a-z]+)*-radius:(?:[^;{]*?[\s:])?(?<!, )[1-9]\d*(?:\.\d+)?(?:px|rem|em)/, 'literal radius'],
  [/\brounded(?:-[trblxyse]{1,2})?-(?:\d[\w/.%]*|full|sm|md|lg|xl|\[)|\brounded="(?:full|\d[^"]*)"/, 'raw UnoCSS radius'],
]

/** Reports `file:line rule` for every radius that bypasses the role tokens. */
export async function findRadiusViolations(files: string[]) {
  const violations: string[] = []
  for (const file of files) {
    if (file.replaceAll('\\', '/').endsWith('styles/variables.scss'))
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
