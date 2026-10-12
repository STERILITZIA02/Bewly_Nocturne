import { normalizeMomentRemoteUrl } from './momentUrl'

const MAX_LIVE_PREVIEW_SOURCES = 3
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []

/** v2 includes HLS/fMP4-only rooms which the legacy FLV endpoint cannot serve. */
export function getLivePreviewSources(response: unknown): string[] {
  const result = record(response)
  if (result.code !== 0)
    return []
  const data = record(result.data)
  if (data.is_locked === true || (data.encrypted === true && data.pwd_verified !== true))
    return []
  const streams = list(record(record(data.playurl_info).playurl).stream)
  const sources: { url: string, quality: number, rank: number }[] = []
  for (const rawStream of streams) {
    const stream = record(rawStream)
    for (const rawFormat of list(stream.format)) {
      const format = record(rawFormat)
      const hls = stream.protocol_name === 'http_hls' && ['fmp4', 'ts'].includes(String(format.format_name))
      const flv = stream.protocol_name === 'http_stream' && format.format_name === 'flv'
      if (!hls && !flv)
        continue
      for (const rawCodec of list(format.codec)) {
        const codec = record(rawCodec)
        if (codec.codec_name !== 'avc' || typeof codec.base_url !== 'string')
          continue
        for (const rawInfo of list(codec.url_info)) {
          const info = record(rawInfo)
          if (typeof info.host !== 'string' || typeof info.extra !== 'string')
            continue
          const url = normalizeMomentRemoteUrl(`${info.host}${codec.base_url}${info.extra}`)
          if (url)
            sources.push({ url, quality: typeof codec.current_qn === 'number' ? codec.current_qn : Number.MAX_SAFE_INTEGER, rank: hls ? 0 : 1 })
        }
      }
    }
  }
  sources.sort((a, b) => a.quality - b.quality || a.rank - b.rank)
  return [...new Set(sources.map(source => source.url))].slice(0, MAX_LIVE_PREVIEW_SOURCES)
}
