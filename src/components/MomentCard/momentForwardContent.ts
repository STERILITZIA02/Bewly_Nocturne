export type MomentDisclosure = 'none' | 'comments' | 'forward'
export type MomentForwardState = 'idle' | 'editing' | 'submitting' | 'success' | 'error'

export type MomentForwardToken
  = | { type: 'text', text: string }
    | { type: 'emoji', text: string }

export interface SelectedMomentTopic {
  id: number | string
  name: string
}

export interface MomentForwardEmote {
  id: number | string
  text: string
  url: string
}

export interface MomentForwardEmotePackage {
  id: number | string
  name: string
  iconUrl: string
  emotes: MomentForwardEmote[]
}

export interface MomentForwardContentNode {
  raw_text: string
  type: 1 | 9
  biz_id: ''
}

export interface MomentForwardRequestPayload {
  dyn_req: {
    content: {
      contents: MomentForwardContentNode[]
    }
    scene: 4
    attach_card: null
    upload_id: string
    meta: {
      app_meta: {
        from: 'create.dynamic.web'
        mobi_app: 'web'
      }
    }
    option: {
      up_choose_comment: false
      close_comment: false
      aigc: 2
    }
    topic?: {
      id: number | string
      name: string
      from_source: 'dyn.web.list'
      from_topic_id: 0
    }
  }
  web_repost_src: {
    dyn_id_str: string
  }
}

export interface MomentForwardSubmitResult {
  applied: boolean
  success: boolean
  response?: unknown
  error?: string
}

interface BuildMomentForwardRequestOptions {
  momentId: string
  mid: number | string
  tokens: MomentForwardToken[]
  topic: SelectedMomentTopic | null
  now?: number
  random?: number
}

interface MomentForwardSubmissionContext {
  isCurrent: () => boolean
}

interface MomentForwardSubmissionControllerOptions {
  getIdentity: () => string
  submit: (
    tokens: MomentForwardToken[],
    topic: SelectedMomentTopic | null,
    context: MomentForwardSubmissionContext,
  ) => Promise<unknown>
  fallbackError?: string
  state?: MomentForwardSubmissionState
}

interface MomentTopicSearchControllerOptions {
  search: (query: string, content: string) => Promise<SelectedMomentTopic[]>
  state?: MomentTopicSearchState
}

export interface MomentForwardSubmissionState {
  status: MomentForwardState
  tokens: MomentForwardToken[]
  selectedTopic: SelectedMomentTopic | null
  error?: string
}

export interface MomentTopicSearchState {
  results: SelectedMomentTopic[]
  loading: boolean
  error?: string
}

export interface MomentTopicSearchController {
  state: MomentTopicSearchState
  search: (query: string, content: string) => Promise<void>
  invalidate: () => void
}

const momentDisclosureCache = new Map<string, MomentDisclosure>()

export function getCachedMomentDisclosure(key: string): MomentDisclosure {
  return momentDisclosureCache.get(key) ?? 'none'
}

export function setCachedMomentDisclosure(key: string, disclosure: MomentDisclosure) {
  if (disclosure === 'none')
    momentDisclosureCache.delete(key)
  else
    momentDisclosureCache.set(key, disclosure)
}

export interface MomentForwardSubmissionController {
  state: MomentForwardSubmissionState
  beginEditing: () => void
  setTokens: (tokens: MomentForwardToken[]) => void
  selectTopic: (topic: SelectedMomentTopic) => void
  clearTopic: () => void
  submit: () => Promise<MomentForwardSubmitResult>
  invalidate: (clearDraft?: boolean) => void
  dispose: () => void
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function normalizeHttpsUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    return ''
  const url = value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim().replace(/^http:/i, 'https:')
  return /^https:\/\//i.test(url) ? url : ''
}

export function normalizeForwardCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

export function toggleMomentDisclosure(
  current: MomentDisclosure,
  target: Exclude<MomentDisclosure, 'none'>,
): MomentDisclosure {
  return current === target ? 'none' : target
}

export function momentForwardTokensToText(tokens: MomentForwardToken[]): string {
  return tokens.map(token => token.text).join('')
}

export function parseMomentForwardTokens(
  value: string,
  knownEmojiTexts: Iterable<string>,
): MomentForwardToken[] {
  const emojiTexts = Array.from(new Set(knownEmojiTexts))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
  if (!value)
    return []
  if (!emojiTexts.length)
    return [{ type: 'text', text: value }]

  const tokens: MomentForwardToken[] = []
  let cursor = 0
  while (cursor < value.length) {
    let nextIndex = -1
    let nextEmoji = ''
    for (const emoji of emojiTexts) {
      const index = value.indexOf(emoji, cursor)
      if (index >= 0 && (nextIndex < 0 || index < nextIndex || (index === nextIndex && emoji.length > nextEmoji.length))) {
        nextIndex = index
        nextEmoji = emoji
      }
    }
    if (nextIndex < 0) {
      tokens.push({ type: 'text', text: value.slice(cursor) })
      break
    }
    if (nextIndex > cursor)
      tokens.push({ type: 'text', text: value.slice(cursor, nextIndex) })
    tokens.push({ type: 'emoji', text: nextEmoji })
    cursor = nextIndex + nextEmoji.length
  }
  return tokens.filter(token => token.text.length > 0)
}

export function insertMomentForwardEmoji(
  tokens: MomentForwardToken[],
  emojiText: string,
  selectionStart: number,
  selectionEnd: number,
  knownEmojiTexts: Iterable<string>,
) {
  const value = momentForwardTokensToText(tokens)
  const start = Math.max(0, Math.min(value.length, selectionStart))
  const end = Math.max(start, Math.min(value.length, selectionEnd))
  const nextValue = `${value.slice(0, start)}${emojiText}${value.slice(end)}`
  return {
    value: nextValue,
    tokens: parseMomentForwardTokens(nextValue, [...knownEmojiTexts, emojiText]),
    caret: start + emojiText.length,
  }
}

export function serializeMomentForwardContents(tokens: MomentForwardToken[]): MomentForwardContentNode[] {
  return tokens.flatMap((token) => {
    if (!token.text)
      return []
    return [{
      raw_text: token.text,
      type: token.type === 'emoji' ? 9 as const : 1 as const,
      // Verified against the current Web dynamic repost request: emoji nodes use an empty biz_id.
      biz_id: '' as const,
    }]
  })
}

export function buildMomentForwardRequest(
  options: BuildMomentForwardRequestOptions,
): MomentForwardRequestPayload {
  const now = Math.max(0, Math.floor(options.now ?? Date.now()))
  const random = Math.max(0, Math.min(0.999999, options.random ?? Math.random()))
  const uploadId = `${options.mid}_${now}_${Math.floor(random * 9000) + 1000}`
  return {
    dyn_req: {
      content: {
        contents: serializeMomentForwardContents(options.tokens),
      },
      scene: 4,
      attach_card: null,
      upload_id: uploadId,
      meta: {
        app_meta: {
          from: 'create.dynamic.web',
          mobi_app: 'web',
        },
      },
      option: {
        up_choose_comment: false,
        close_comment: false,
        aigc: 2,
      },
      ...(options.topic
        ? {
            topic: {
              id: options.topic.id,
              name: options.topic.name,
              from_source: 'dyn.web.list' as const,
              from_topic_id: 0 as const,
            },
          }
        : {}),
    },
    web_repost_src: {
      dyn_id_str: options.momentId,
    },
  }
}

export function buildMomentForwardSubmitCheck(tokens: MomentForwardToken[]) {
  return {
    content: {
      contents: serializeMomentForwardContents(tokens),
    },
    pics: [],
    attach_card: null,
    scene: 4,
    create_option: {
      aigc: 2,
    },
  }
}

export function getMomentForwardResponseCode(response: unknown): number {
  return Number(asRecord(response).code)
}

export function getMomentForwardResponseMessage(response: unknown): string {
  const message = asRecord(response).message
  return typeof message === 'string' ? message : ''
}

export function resolveForwardCountAfterSuccess(response: unknown, currentCount: number): number {
  const data = asRecord(asRecord(response).data)
  const candidates = [
    data.forward_count,
    asRecord(data.forward).count,
    data.count,
    asRecord(data.dyn).forward_count,
    asRecord(asRecord(asRecord(asRecord(data.dyn).modules).module_stat).forward).count,
  ]
  for (const candidate of candidates) {
    const count = Number(candidate)
    if (Number.isFinite(count) && count >= 0)
      return count
  }
  return normalizeForwardCount(currentCount) + 1
}

export function normalizeMomentForwardEmotePackages(response: unknown): MomentForwardEmotePackage[] {
  const packages = asRecord(asRecord(response).data).packages
  if (!Array.isArray(packages))
    return []
  return packages.flatMap((packageValue) => {
    const rawPackage = asRecord(packageValue)
    const emotes = Array.isArray(rawPackage.emote)
      ? rawPackage.emote.flatMap((emoteValue) => {
          const rawEmote = asRecord(emoteValue)
          const text = typeof rawEmote.text === 'string' ? rawEmote.text.trim() : ''
          const url = normalizeHttpsUrl(rawEmote.webp_url || rawEmote.gif_url || rawEmote.url)
          return text && url
            ? [{ id: rawEmote.id as number | string, text, url }]
            : []
        })
      : []
    if (!emotes.length)
      return []
    return [{
      id: rawPackage.id as number | string,
      name: typeof rawPackage.text === 'string' ? rawPackage.text : '',
      iconUrl: normalizeHttpsUrl(rawPackage.url),
      emotes,
    }]
  })
}

export function normalizeMomentTopics(response: unknown): SelectedMomentTopic[] {
  const topicItems = asRecord(asRecord(response).data).topic_items
  if (!Array.isArray(topicItems))
    return []
  const seenIds = new Set<string>()
  return topicItems.flatMap((value) => {
    const raw = asRecord(value)
    const id = raw.id as number | string
    const idKey = String(id ?? '').trim()
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!idKey || !name || seenIds.has(idKey))
      return []
    seenIds.add(idKey)
    return [{ id, name }]
  })
}

export function createMomentTopicSearchController(
  options: MomentTopicSearchControllerOptions,
): MomentTopicSearchController {
  const state: MomentTopicSearchState = options.state ?? {
    results: [],
    loading: false,
  }
  let generation = 0

  const search = async (query: string, content: string) => {
    const requestGeneration = ++generation
    state.loading = true
    state.error = undefined
    try {
      const results = await options.search(query, content)
      if (requestGeneration === generation)
        state.results = results
    }
    catch (error) {
      if (requestGeneration === generation) {
        state.results = []
        state.error = error instanceof Error && error.message ? error.message : String(error)
      }
    }
    finally {
      if (requestGeneration === generation)
        state.loading = false
    }
  }

  const invalidate = () => {
    generation += 1
    state.results = []
    state.loading = false
    state.error = undefined
  }

  return { state, search, invalidate }
}

export function createMomentForwardSubmissionController(
  options: MomentForwardSubmissionControllerOptions,
): MomentForwardSubmissionController {
  const state: MomentForwardSubmissionState = options.state ?? {
    status: 'idle',
    tokens: [],
    selectedTopic: null,
  }
  let generation = 0
  let disposed = false
  let pendingTask: Promise<MomentForwardSubmitResult> | null = null

  const beginEditing = () => {
    if (!disposed && state.status !== 'submitting') {
      state.status = 'editing'
      state.error = undefined
    }
  }

  const setTokens = (tokens: MomentForwardToken[]) => {
    if (!disposed && state.status !== 'submitting') {
      state.tokens = tokens.map(token => ({ ...token }))
      if (state.status === 'idle' || state.status === 'success' || state.status === 'error')
        state.status = 'editing'
      state.error = undefined
    }
  }

  const selectTopic = (topic: SelectedMomentTopic) => {
    if (!disposed && state.status !== 'submitting') {
      state.selectedTopic = { ...topic }
      state.status = 'editing'
      state.error = undefined
    }
  }

  const clearTopic = () => {
    if (!disposed && state.status !== 'submitting') {
      state.selectedTopic = null
      state.status = 'editing'
      state.error = undefined
    }
  }

  const submit = () => {
    if (pendingTask)
      return pendingTask
    if (disposed)
      return Promise.resolve({ applied: false, success: false })

    const requestGeneration = generation
    const requestIdentity = options.getIdentity()
    const tokens = state.tokens.map(token => ({ ...token }))
    const topic = state.selectedTopic ? { ...state.selectedTopic } : null
    state.status = 'submitting'
    state.error = undefined

    const isCurrent = () => !disposed
      && requestGeneration === generation
      && requestIdentity === options.getIdentity()
    const task = options.submit(tokens, topic, { isCurrent })
      .then((response): MomentForwardSubmitResult => {
        if (!isCurrent())
          return { applied: false, success: false, response }
        const code = getMomentForwardResponseCode(response)
        if (code !== 0) {
          const error = getMomentForwardResponseMessage(response) || options.fallbackError || 'Moment forward request failed'
          state.status = 'error'
          state.error = error
          return { applied: true, success: false, response, error }
        }
        state.tokens = []
        state.selectedTopic = null
        state.status = 'success'
        return { applied: true, success: true, response }
      })
      .catch((error: unknown): MomentForwardSubmitResult => {
        const message = error instanceof Error && error.message ? error.message : String(error)
        if (!isCurrent())
          return { applied: false, success: false, error: message }
        state.status = 'error'
        state.error = message
        return { applied: true, success: false, error: message }
      })
      .finally(() => {
        if (pendingTask === task)
          pendingTask = null
      })
    pendingTask = task
    return task
  }

  const invalidate = (clearDraft = true) => {
    generation += 1
    state.status = 'idle'
    state.error = undefined
    if (clearDraft) {
      state.tokens = []
      state.selectedTopic = null
    }
  }

  const dispose = () => {
    disposed = true
    generation += 1
  }

  return {
    state,
    beginEditing,
    setTokens,
    selectTopic,
    clearTopic,
    submit,
    invalidate,
    dispose,
  }
}
