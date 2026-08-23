export interface FilterRule {
  keyword: string
  remark: string
}

export interface CompiledFilterRules {
  regExpValues: RegExp[]
  stringValues: string[]
}

export interface FilterRuleImportResult {
  duplicates: number
  ignored: number
  rules: FilterRule[]
  valid: boolean
}

export const FILTER_RULE_KEYWORD_MAX_LENGTH = 512
export const FILTER_RULE_REMARK_MAX_LENGTH = 1000
export const FILTER_RULE_IMPORT_MAX_ITEMS = 2000

const FILTER_RULE_KEYS = new Set(['keyword', 'remark'])
const BLOCKED_FILTER_RULE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]')
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function compileRegexKeyword(keyword: string): RegExp | null | undefined {
  const startsWithSlash = keyword.startsWith('/')
  const endsWithSlash = keyword.endsWith('/')
  if (!startsWithSlash && !endsWithSlash)
    return undefined
  if (!startsWithSlash || !endsWithSlash || keyword.length <= 2)
    return null

  try {
    return new RegExp(keyword.slice(1, -1), 'i')
  }
  catch {
    return null
  }
}

export function normalizeImportedFilterRules(value: unknown): FilterRuleImportResult {
  if (!Array.isArray(value))
    return { duplicates: 0, ignored: 0, rules: [], valid: false }

  const rules: FilterRule[] = []
  const seenKeywords = new Set<string>()
  let ignored = Math.max(0, value.length - FILTER_RULE_IMPORT_MAX_ITEMS)
  let duplicates = 0

  for (const item of value.slice(0, FILTER_RULE_IMPORT_MAX_ITEMS)) {
    if (!isPlainObject(item)) {
      ignored++
      continue
    }
    const keys = Object.keys(item)
    if (keys.some(key => BLOCKED_FILTER_RULE_KEYS.has(key))
      || keys.some(key => !FILTER_RULE_KEYS.has(key))
      || keys.length !== FILTER_RULE_KEYS.size
      || typeof item.keyword !== 'string'
      || typeof item.remark !== 'string') {
      ignored++
      continue
    }

    const keyword = item.keyword.trim()
    const remark = item.remark.trim()
    if (!keyword
      || keyword.length > FILTER_RULE_KEYWORD_MAX_LENGTH
      || remark.length > FILTER_RULE_REMARK_MAX_LENGTH
      || compileRegexKeyword(keyword) === null) {
      ignored++
      continue
    }

    const dedupeKey = keyword.toUpperCase()
    if (seenKeywords.has(dedupeKey)) {
      duplicates++
      continue
    }
    seenKeywords.add(dedupeKey)
    rules.push({ keyword, remark })
  }

  return { duplicates, ignored, rules, valid: true }
}

export function compileFilterRules(rules: unknown): CompiledFilterRules {
  const stringValues: string[] = []
  const regExpValues: RegExp[] = []

  if (!Array.isArray(rules))
    return { regExpValues, stringValues }

  for (const rule of rules) {
    if (!isPlainObject(rule) || typeof rule.keyword !== 'string')
      continue
    const keyword = rule.keyword.trim()
    if (!keyword)
      continue
    const regex = compileRegexKeyword(keyword)
    if (regex === null)
      continue
    if (regex)
      regExpValues.push(regex)
    else
      stringValues.push(keyword.toUpperCase())
  }

  return { regExpValues, stringValues }
}
