import { isAudioCdnHost } from '~/constants/audioCdn'
import type { NativeAudioSettings } from '~/utils/nativeLoudness'

import { getBilibiliLogicalPathname } from './bilibiliLocale'
import type { NativePlaybackUnit } from './videoMetadataBridge'
import { isPgcPlaybackPage, matchesPlaybackUnit } from './videoMetadataBridge'

export const LISTEN_GATE = 'bewly:listen:gate'
export const LISTEN_RELEASE = 'bewly:listen:release'
export { LISTEN_ATTRIBUTE, LISTEN_LEAVING_ATTRIBUTE, LISTEN_TONED_ATTRIBUTE } from '~/constants/globalEvents'
export const LISTEN_SAVE = 'bewly:listen:save'
export const LISTEN_RECOVER = 'bewly:listen:recover'

export interface ListenSession {
  unit: NativePlaybackUnit
  time: number
  playing: boolean
  volume: number
  muted: boolean
  rate: number
  href: string
  gate: number
  /** Preserve a paused external owner instead of blocking its media requests. */
  retainNative?: boolean
}

export function matchesListenUnit(href: string, unit: NativePlaybackUnit) {
  if (!unit?.episodeId)
    return matchesPlaybackUnit(href, unit)
  if (!Number.isSafeInteger(unit.episodeId) || unit.episodeId <= 0 || !isPgcPlaybackPage(href))
    return false
  const path = getBilibiliLogicalPathname(href).replace(/\/$/, '')
  return path === `/bangumi/play/ep${unit.episodeId}` || path === `/bangumi/play/ss${unit.seasonId}`
}

export function isListenSession(value: unknown, href: string): value is ListenSession {
  if (!value || typeof value !== 'object')
    return false
  const state = value as ListenSession
  return matchesListenUnit(href, state.unit) && Number.isSafeInteger(state.unit.cid) && state.unit.cid > 0
    && typeof state.href === 'string' && typeof state.playing === 'boolean' && typeof state.muted === 'boolean'
    && Number.isFinite(state.time) && state.time >= 0 && Number.isFinite(state.rate) && state.rate > 0
    && Number.isFinite(state.volume) && state.volume >= 0 && state.volume <= 1
    && Number.isSafeInteger(state.gate) && state.gate > 0
    && (state.retainNative === undefined || typeof state.retainNative === 'boolean')
}

export function returnVideoUrl({ unit, time, href }: ListenSession) {
  const path = unit.episodeId ? `/bangumi/play/ep${unit.episodeId}` : `/video/${unit.bvid || `av${unit.aid}`}/`
  const url = new URL(path, 'https://www.bilibili.com')
  if (href && matchesListenUnit(href, unit)) {
    const source = new URL(href)
    url.pathname = source.pathname
    url.search = source.search
    url.hash = source.hash
  }
  if (unit.episodeId)
    url.pathname = url.pathname.replace(/\/ss\d+\/?$/, `/ep${unit.episodeId}`)
  if (!unit.episodeId && unit.page > 1)
    url.searchParams.set('p', String(unit.page))
  url.searchParams.set('t', String(Math.floor(time)))
  return url.href
}

interface AudioTrack {
  baseUrl?: string
  base_url?: string
  backupUrl?: string[]
  backup_url?: string[]
  mimeType?: string
  mime_type?: string
  codecs?: string
  bandwidth?: number
}

interface PlayInfo {
  dash?: { audio?: AudioTrack[] }
  is_drm?: boolean | number
  volume?: {
    measured_i?: number | string
    multi_scene_args?: { normal_target_i?: number | string, high_dynamic_target_i?: number | string, undersized_target_i?: number | string }
  }
}

/**
 * The stream's measured loudness and the targets Bilibili's player normalizes
 * it to (its parseLoudnessParams): none when unmeasured, or quieter than the
 * floor the player leaves alone.
 */
export interface ListenLoudness { measured: number, normal: number, dynamic: number }

/** The player's 音量均衡 option: off, standard or dynamic. */
export type NativeLoudnessOption = 0 | 1 | 2

export function getListenLoudness(response: { data?: PlayInfo, result?: PlayInfo }): ListenLoudness | undefined {
  const volume = (response.data ?? response.result)?.volume
  const args = volume?.multi_scene_args
  if (!volume?.measured_i || !args)
    return
  const loudness = { measured: Number(volume.measured_i), normal: Number(args.normal_target_i), dynamic: Number(args.high_dynamic_target_i) }
  if (Object.values(loudness).every(Number.isFinite) && loudness.measured >= Number(args.undersized_target_i))
    return loudness
}

/** The gain the player puts on the picture for this stream, in dB. */
export function listenGainDb(loudness: ListenLoudness | undefined, settings: NativeAudioSettings) {
  // Native sound enhancement suspends normalization while its manual gain is set.
  return settings.gain || (loudness && settings.loudness ? (settings.loudness === 2 ? loudness.dynamic : loudness.normal) - loudness.measured : 0)
}

/** Only separate audio representations are eligible, including on CDN failover. */
export function getListenSources(response: { code: number, data?: PlayInfo, result?: PlayInfo }, canPlay: (type: string) => string) {
  const info = response.data ?? response.result
  if (response.code !== 0 || info?.is_drm || !Array.isArray(info?.dash?.audio))
    return []
  const sources = new Set<string>()
  const tracks = info.dash.audio.filter(track => track && typeof track === 'object')
  for (const track of tracks.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0))) {
    const mime = track.mimeType ?? track.mime_type ?? 'audio/mp4'
    if (typeof mime !== 'string' || !mime.startsWith('audio/') || !canPlay(track.codecs ? `${mime}; codecs="${track.codecs}"` : mime))
      continue
    const backups = track.backupUrl ?? track.backup_url
    for (const raw of [track.baseUrl || track.base_url, ...(Array.isArray(backups) ? backups : [])]) {
      if (typeof raw !== 'string' || !raw)
        continue
      const absolute = raw.startsWith('//') ? `https:${raw}` : raw
      if (!URL.canParse(absolute))
        continue
      const url = new URL(absolute)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !isAudioCdnHost(url.hostname))
        continue
      url.protocol = 'https:'
      sources.add(url.href)
    }
  }
  return [...sources]
}
