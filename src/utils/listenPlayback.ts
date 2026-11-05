import { isAudioCdnHost } from '~/constants/audioCdn'

import { getBilibiliLogicalPathname } from './bilibiliLocale'
import type { NativePlaybackUnit } from './videoMetadataBridge'
import { isPgcPlaybackPage, matchesPlaybackUnit } from './videoMetadataBridge'

export const LISTEN_GATE = 'bewly:listen:gate'
export const LISTEN_RELEASE = 'bewly:listen:release'
export { LISTEN_ATTRIBUTE } from '~/constants/globalEvents'
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
