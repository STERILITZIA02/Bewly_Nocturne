import type { List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import type { VideoIdentity } from '~/utils/videoVisitRecord'

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function parseUri(uri: string): URL | undefined {
  if (!uri)
    return
  try {
    const url = new URL(uri, 'https://www.bilibili.com')
    return /^https?:$/.test(url.protocol) ? url : undefined
  }
  catch { return undefined }
}

/** Only verified identity matches may inherit historical part/progress metadata. */
function resolveHistoryTarget(item: HistoryItem): { url: URL, resumable: boolean } | undefined {
  const history = item.history
  const uri = parseUri(item.uri)
  const ownHost = uri?.hostname === 'www.bilibili.com' || uri?.hostname === 'bilibili.com'
  let fallback = ''
  let matches = false
  if (history.business === Business.ARCHIVE) {
    const bvid = /^BV[a-z0-9]{10}$/i.test(history.bvid) ? history.bvid : undefined
    const aid = positiveInteger(history.oid)
    const pathId = ownHost ? uri?.pathname.match(/^\/video\/(BV[a-z0-9]{10}|av\d+)\/?$/i)?.[1] : undefined
    matches = Boolean(pathId && (pathId === bvid || (aid && pathId.toLowerCase() === `av${aid}`)))
    fallback = bvid ? `https://www.bilibili.com/video/${bvid}` : aid ? `https://www.bilibili.com/video/av${aid}` : ''
    const url = uri ?? parseUri(fallback)
    if (!url)
      return
    const trusted = matches || !uri
    const page = positiveInteger(history.page)
    if (trusted && page && !url.searchParams.has('p'))
      url.searchParams.set('p', String(page))
    const targetPage = Number(url.searchParams.get('p') || 1)
    return { url, resumable: trusted && targetPage === (page ?? 1) }
  }
  if (history.business === Business.PGC) {
    const epid = positiveInteger(history.epid)
    matches = Boolean(epid && ownHost && uri?.pathname.match(/^\/bangumi\/play\/ep(\d+)\/?$/)?.[1] === String(epid))
    fallback = epid ? `https://www.bilibili.com/bangumi/play/ep${epid}` : ''
    const url = uri ?? parseUri(fallback)
    return url ? { url, resumable: matches || (!uri && Boolean(epid)) } : undefined
  }
  const oid = positiveInteger(history.oid)
  if (history.business === Business.LIVE && oid) {
    fallback = `https://live.bilibili.com/${oid}`
  }
  else if (history.business === Business.ARTICLE || history.business === Business.ARTICLE_LIST) {
    const article = positiveInteger(history.cid) ?? oid
    if (article)
      fallback = `https://www.bilibili.com/read/cv${article}`
  }
  const url = uri ?? parseUri(fallback)
  return url ? { url, resumable: false } : undefined
}

export function getHistoryUrl(item: HistoryItem): string {
  return resolveHistoryTarget(item)?.url.toString() ?? ''
}

export function getHistoryVideoIdentity(item: HistoryItem): VideoIdentity {
  return item.history.business === Business.ARCHIVE
    ? { aid: item.history.oid, bvid: item.history.bvid, cid: item.history.cid, page: item.history.page }
    : item.history.business === Business.PGC ? { epid: item.history.epid, bvid: item.history.bvid, cid: item.history.cid } : {}
}

export function getHistoryResumeUrl(item: HistoryItem): string | undefined {
  if (!Number.isFinite(item.progress) || !Number.isFinite(item.duration)
    || item.progress <= 0 || item.progress >= item.duration) {
    return
  }
  const target = resolveHistoryTarget(item)
  if (!target?.resumable)
    return
  target.url.searchParams.set('t', String(Math.floor(item.progress)))
  return target.url.toString()
}
