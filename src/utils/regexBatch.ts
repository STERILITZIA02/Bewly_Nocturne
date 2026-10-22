export interface RegexBatch {
  rules: string[]
  values: string[][]
}

export interface RegexBatchRequest {
  id: number
  groups: RegexBatch[]
}

export type RegexBatchReply = { id: number, matches: boolean[][] } | { id: number, error: string }

export function matchRegexBatch(groups: RegexBatch[], patterns = groups.map(group => group.rules.map(source => new RegExp(source, 'i')))): boolean[][] {
  return groups.map(({ values }, index) => {
    return values.map(fields => fields.some(value => patterns[index].some(pattern => pattern.test(value))))
  })
}
