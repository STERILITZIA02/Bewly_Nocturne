import type { RegexBatchRequest } from '~/utils/regexBatch'
import { matchRegexBatch } from '~/utils/regexBatch'

let sources: string[][] = []
let patterns: RegExp[][] = []

globalThis.onmessage = ({ data }: MessageEvent<RegexBatchRequest>) => {
  try {
    if (sources.length !== data.groups.length || data.groups.some((group, index) => group.rules.length !== sources[index].length || group.rules.some((source, rule) => source !== sources[index][rule]))) {
      sources = data.groups.map(group => group.rules)
      patterns = sources.map(group => group.map(source => new RegExp(source, 'i')))
    }
    globalThis.postMessage({ id: data.id, matches: matchRegexBatch(data.groups, patterns) })
  }
  catch (error) {
    globalThis.postMessage({ id: data.id, error: String(error) })
  }
}
globalThis.postMessage({ ready: true })
