import { waitWithSignal } from './abort'
import api from './api'
import type { NativePlaybackUnit } from './videoMetadataBridge'
import { getNativePlaybackUnitKey } from './videoMetadataBridge'

/**
 * A video's CC subtitles as the listening stage's lyrics: the tracks the
 * player info lists, the one to show first, and a track's timed lines.
 */
export interface LyricTrack {
  id: string
  /** Bilibili's language code: `zh-CN`, `en-US`, `ai-zh`… */
  language: string
  label: string
  url: string
  /** Machine transcription, used when nobody wrote a subtitle (user-specified). */
  generated: boolean
}

export interface LyricLine {
  /** Seconds. */
  from: number
  to: number
  text: string
}

interface SubtitleItem { id?: number | string, id_str?: string, lan?: string, lan_doc?: string, subtitle_url?: string, type?: number, ai_type?: number }
interface PlayerInfoResponse { code?: number, data?: { subtitle?: { subtitles?: SubtitleItem[] } } }
interface SubtitleBody { body?: { from?: number, to?: number, content?: string }[] }

export function parseLyricTracks(response: unknown): LyricTrack[] {
  const info = response as PlayerInfoResponse | undefined
  if (info?.code !== 0)
    return []
  return (info.data?.subtitle?.subtitles ?? []).flatMap((item) => {
    const language = item.lan ?? ''
    if (!item.subtitle_url)
      return []
    return [{
      id: String(item.id_str ?? item.id ?? item.subtitle_url),
      language,
      label: item.lan_doc || language,
      url: item.subtitle_url,
      generated: item.type === 1 || language.startsWith('ai-'),
    }]
  })
}

// Subtitle languages each interface language reads, best first.
const PREFERRED_LANGUAGES: Record<string, string[]> = {
  'cmn-CN': ['zh-cn', 'zh-hans', 'zh'],
  'cmn-TW': ['zh-tw', 'zh-hant', 'zh-hk', 'zh'],
  'jyut': ['zh-hk', 'yue', 'zh-hant', 'zh-tw', 'zh'],
  'en': ['en'],
}

/**
 * The track shown first (user-specified): a written subtitle before a machine
 * one; within either, the interface language, then Chinese, then the first.
 */
export function pickLyricTrack(tracks: LyricTrack[], interfaceLanguage: string): LyricTrack | undefined {
  const preferred = [...PREFERRED_LANGUAGES[interfaceLanguage] ?? [], 'zh']
  const code = (track: LyricTrack) => track.language.toLowerCase().replace(/^ai-/, '')
  for (const group of [tracks.filter(track => !track.generated), tracks.filter(track => track.generated)]) {
    for (const language of preferred) {
      const match = group.find(track => code(track) === language) ?? group.find(track => code(track).startsWith(language))
      if (match)
        return match
    }
    if (group.length)
      return group[0]
  }
}

export function parseLyricLines(response: unknown): LyricLine[] {
  const lines = ((response as SubtitleBody | undefined)?.body ?? []).flatMap((item) => {
    const text = item.content?.trim()
    const from = Number(item.from)
    const to = Number(item.to)
    return text && Number.isFinite(from) && Number.isFinite(to) ? [{ from, to, text }] : []
  })
  return lines.sort((a, b) => a.from - b.from)
}

/**
 * The line being sung at `time`: the last one that has begun, which stays
 * current through the gap before the next (as lyrics do), or -1 before the first.
 */
export function findLyricLine(lines: LyricLine[], time: number) {
  let low = 0
  let high = lines.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (lines[middle].from <= time)
      low = middle + 1
    else
      high = middle
  }
  return low - 1
}

// ---- Reads: one in flight per account and key, shared and kept ---------------

interface Flight<T> { promise: Promise<T>, controller: AbortController, consumers: number, settled: boolean }
const CACHE_LIMIT = 16
const flights = new Map<string, Flight<unknown>>()

/**
 * One request per key however many readers ask; a reader that leaves only
 * cancels the request when it was the last one waiting. Answers stay for the
 * session (bounded); failures do not.
 */
async function share<T>(key: string, run: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  let flight = flights.get(key) as Flight<T> | undefined
  if (!flight) {
    const controller = new AbortController()
    const created: Flight<T> = { promise: run(controller.signal), controller, consumers: 0, settled: false }
    created.promise.then(() => created.settled = true, () => {
      if (flights.get(key) === created)
        flights.delete(key)
    })
    flights.set(key, created)
    if (flights.size > CACHE_LIMIT)
      flights.delete(flights.keys().next().value!)
    flight = created
  }
  const current = flight
  current.consumers++
  try {
    return await waitWithSignal(current.promise, signal)
  }
  finally {
    current.consumers--
    if (!current.consumers && !current.settled) {
      current.controller.abort()
      if (flights.get(key) === current)
        flights.delete(key)
    }
  }
}

/** The subtitle tracks of a part or an episode, for the signed-in `account`. */
export function readLyricTracks(unit: NativePlaybackUnit, account: string, signal: AbortSignal) {
  return share(`tracks:${account}:${getNativePlaybackUnitKey(unit)}`, async (owner) => {
    const response = await api.video.getPlayerInfo({
      aid: unit.aid,
      bvid: unit.bvid,
      cid: unit.cid,
      ep_id: unit.episodeId,
      season_id: unit.seasonId,
    }, { signal: owner })
    if (response?.code !== 0)
      throw new Error('Player info unavailable')
    return parseLyricTracks(response)
  }, signal)
}

export function readLyricLines(track: LyricTrack, account: string, signal: AbortSignal) {
  return share(`lines:${account}:${track.url}`, async owner => parseLyricLines(await api.video.getSubtitleBody({ url: track.url }, { signal: owner })), signal)
}
