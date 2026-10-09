export const VIDEO_VISIT_HISTORY_MAX_ENTRIES = 10_000
export const VIDEO_VISIT_HISTORY_MESSAGE = 'videoVisitHistory:command'
export const VIDEO_VISIT_HISTORY_UPDATED = 'videoVisitHistory:updated'

export interface VideoIdentity {
  aid?: number | string
  bvid?: string
  roomid?: number
  cid?: number
  page?: number
  epid?: number
  pageCount?: number
}

export interface VideoVisitRecord extends VideoIdentity {
  visitedAt: number
  playedAt?: number
  progress?: number
  duration?: number
  completed?: boolean
}
export type VideoVisitHistory = Record<string, VideoVisitRecord>
export interface VideoHistorySnapshot {
  epoch: string
  revision: number
  records: VideoVisitHistory
  deleted: Record<string, number>
  migratedSources: string[]
  migrationClosed: boolean
  recentOperations: string[]
}
export interface VideoHistoryEdit { identity: VideoIdentity, record: VideoVisitRecord, baseRevision?: number }
export interface VideoHistoryWriteDelta { records: VideoVisitHistory, removed: string[], reset: boolean }
export type VideoHistoryCommand
  = | { type: 'read' }
    | { type: 'clear', epoch: string }
    | { type: 'remove', epoch: string, identity: VideoIdentity }
    | { type: 'migrate', epoch: string, source: string, records: Record<string, unknown> }
    | { type: 'record', epoch: string, baseRevision: number, operationId: string, edits: VideoHistoryEdit[] }
export type VideoHistoryUpdate
  = | { type: 'snapshot', snapshot: VideoHistorySnapshot, previousEpoch?: string }
    | { type: 'patch', epoch: string, baseRevision: number, revision: number, records: VideoVisitHistory, removed: string[], deleted: Record<string, number> }

function positiveInteger(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}

export function videoHistoryBaseKeys(identity: VideoIdentity): string[] {
  if (identity.roomid)
    return []
  const keys: string[] = []
  if (typeof identity.bvid === 'string' && /^BV[a-z0-9]{10}$/i.test(identity.bvid))
    keys.push(`bv:BV${identity.bvid.slice(2)}`)
  const aid = positiveInteger(identity.aid)
  if (aid)
    keys.push(`av:${aid}`)
  const epid = positiveInteger(identity.epid)
  if (epid)
    keys.push(`ep:${epid}`)
  return keys
}

export function videoHistoryPartKey(identity: VideoIdentity): string | undefined {
  if (positiveInteger(identity.epid))
    return `ep:${identity.epid}`
  if (positiveInteger(identity.cid))
    return `cid:${identity.cid}`
  if (positiveInteger(identity.page))
    return `p:${identity.page}`
}

export function normalizeVideoVisitRecord(value: unknown): VideoVisitRecord | undefined {
  // Legacy timestamps are browsing evidence only, never playback/completion.
  if (typeof value === 'number')
    return Number.isFinite(value) && value > 0 ? { visitedAt: value } : undefined
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return
  const record = value as VideoVisitRecord
  if (!Number.isFinite(record.visitedAt) || record.visitedAt <= 0)
    return
  const result: VideoVisitRecord = { visitedAt: record.visitedAt }
  for (const field of ['aid', 'cid', 'page', 'epid', 'pageCount'] as const) {
    const number = positiveInteger(record[field])
    if (number)
      result[field] = number
  }
  if (typeof record.bvid === 'string' && /^BV[a-z0-9]{10}$/i.test(record.bvid))
    result.bvid = record.bvid
  if (Number.isFinite(record.playedAt) && record.playedAt! > 0) {
    result.playedAt = record.playedAt
    if (Number.isFinite(record.duration) && record.duration! > 0 && Number.isFinite(record.progress) && record.progress! >= 0) {
      result.duration = record.duration
      result.progress = Math.min(record.progress!, record.duration!)
      result.completed = record.completed === true
    }
  }
  return result
}

export function pruneVideoVisitHistory(value: Record<string, unknown>): VideoVisitHistory {
  return limitVideoVisitHistory(Object.fromEntries(Object.entries(value)
    .filter(([key]) => /^(?:bv:bv[a-z0-9]{10}|(?:av|ep):[1-9]\d*)(?:\|(?:cid|p|ep):[1-9]\d*)?$/i.test(key))
    .flatMap(([key, record]) => {
      const normalized = normalizeVideoVisitRecord(record)
      return normalized ? [[key, normalized] as const] : []
    })))
}

export function limitVideoVisitHistory(records: VideoVisitHistory): VideoVisitHistory {
  return Object.fromEntries(Object.entries(records).sort(([, left], [, right]) => right.visitedAt - left.visitedAt)
    .slice(0, VIDEO_VISIT_HISTORY_MAX_ENTRIES))
}

export function mergeVideoVisitRecord(previous: VideoVisitRecord | undefined, incoming: VideoVisitRecord): VideoVisitRecord {
  if (!previous)
    return incoming
  const latestPlayback = (incoming.playedAt ?? 0) >= (previous.playedAt ?? 0) ? incoming : previous
  return { ...previous, ...incoming, visitedAt: Math.max(previous.visitedAt, incoming.visitedAt), playedAt: latestPlayback.playedAt, progress: latestPlayback.progress, duration: latestPlayback.duration, completed: latestPlayback.completed }
}

export function applyVideoHistoryEdits(records: VideoVisitHistory, edits: readonly VideoHistoryEdit[]): VideoVisitHistory {
  const next = { ...records }
  for (const edit of edits) {
    const normalized = normalizeVideoVisitRecord({ ...edit.record, ...edit.identity })
    if (!normalized)
      continue
    const part = videoHistoryPartKey(edit.identity)
    for (const key of videoHistoryBaseKeys(edit.identity)) {
      next[key] = mergeVideoVisitRecord(next[key], { visitedAt: normalized.visitedAt, aid: normalized.aid, bvid: normalized.bvid, epid: normalized.epid })
      if (part)
        next[`${key}|${part}`] = mergeVideoVisitRecord(next[`${key}|${part}`], normalized)
    }
  }
  return next
}

export type VideoWatchState
  = | { status: 'browsed' }
    | { status: 'played', progress?: number, duration?: number, completed: boolean }

/** Build once per delivered batch; card queries never scan the whole history. */
export function createVideoHistoryIndex(records: VideoVisitHistory) {
  const byPart = new Map<string, VideoVisitRecord>()
  const latest = new Map<string, VideoVisitRecord>()
  for (const [key, record] of Object.entries(records)) {
    const base = key.split('|')[0]
    byPart.set(key, record)
    if (record.page)
      byPart.set(`${base}|p:${record.page}`, record)
    if (record.playedAt && (record.playedAt > (latest.get(base)?.playedAt ?? 0)))
      latest.set(base, record)
  }
  return (identity: VideoIdentity): VideoWatchState | undefined => {
    const keys = videoHistoryBaseKeys(identity)
    const part = videoHistoryPartKey(identity)
    const candidates = keys.map((key) => {
      if (part)
        return byPart.get(`${key}|${part}`)
      const exact = latest.get(key) ?? records[key]
      if (exact)
        return exact
      // The old timestamp-only format lowercased BV payloads. Preserve only its
      // browsing hint; new playback identities retain case-sensitive BV data.
      const legacy = key.startsWith('bv:') ? records[key.toLowerCase()] : undefined
      return legacy && !legacy.playedAt ? legacy : undefined
    }).filter((record): record is VideoVisitRecord => !!record)
    const record = candidates.sort((a, b) => (b.playedAt ?? b.visitedAt) - (a.playedAt ?? a.visitedAt))[0]
    if (!record)
      return
    if (!record.playedAt)
      return { status: 'browsed' }
    const precise = Boolean(part || record.pageCount === 1 || identity.epid)
    return { status: 'played', completed: precise && record.completed === true, ...(precise && record.progress !== undefined ? { progress: record.progress, duration: record.duration } : {}) }
  }
}
