/**
 * 订阅合集：单一数据层
 * - 分页语义（含「接口一次返回全量」）
 * - 播放全部起播解析
 * Dock 收藏页与顶栏弹层共用，UI 只负责触发加载/展示。
 */

import type { CollectedSeasonPlayAllMode } from '~/logic/storage'
import type { List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import type { FavoritesResult, Media as FavoriteItem } from '~/models/video/favorite'
import type { FavoriteSeasonResourcesResult, FavoriteSource } from '~/models/video/favoriteSeason'
import type api from '~/utils/api'
import { getFavoriteResourceKey, getFavoriteSourceKey, isPlayableFavoriteVideo, normalizeFavoriteSourceMedia } from '~/utils/favoriteResource'

/** 与 B 站 fav/season/list 默认 ps、以及收藏页「一屏约 40」展示一致 */
export const FAVORITE_SEASON_PAGE_SIZE = 40
export const FAVORITE_FOLDER_PAGE_SIZE = 20
export const FAVORITE_SUBSCRIPTIONS_PAGE_SIZE = 50
/** 防止异常接口一直返回满页时死循环 */
const MAX_SEASON_PAGES = 100
const HISTORY_PAGE_SIZE = 20
/** 在最近历史中查找合集内上次观看（约 300 条） */
const MAX_HISTORY_PAGES = 15

export type { CollectedSeasonPlayAllMode }

export interface FavoriteSeasonPlayTarget {
  source: FavoriteSource
  spaceMid: number
  link?: string
  /** beginning 模式入口补充（无 link 时用） */
  bvid?: string
  mode?: CollectedSeasonPlayAllMode
  /**
   * UI 已通过同一套分页语义加载过的列表。
   * complete=true 时可跳过再次全量请求。
   * 来源身份与完整状态必须同时匹配；累计长度不能替代完整验证。
   */
  preloaded?: {
    sourceKey: string
    medias: FavoriteItem[]
    complete: boolean
  }
}

export interface FavoriteSeasonPlayAllResult {
  url: string
  /** 是否回退到合集入口（开头 / 数据不完整 / 无历史等） */
  usedFallback: boolean
  reason: 'beginning' | 'resolved' | 'incomplete' | 'empty' | 'missing-bvid' | 'no-history' | 'unverified-order' | 'cancelled'
}

export interface FavoriteSeasonPageFetchResult {
  ok: boolean
  pageMedias: FavoriteItem[]
  mediaCount?: number
  cover?: string
  hasMore?: boolean
}

export interface FavoriteSeasonPageMergeResult {
  medias: FavoriteItem[]
  hasMore: boolean
  complete: boolean
  stalled: boolean
  /** Changes only; callers need not replace or reconvert the accumulated list. */
  changed: Array<{ index: number, item: FavoriteItem }>
  replace: boolean
}

interface FetchAllSeasonMediasResult {
  medias: FavoriteItem[]
  complete: boolean
}

/**
 * 合集入口 URL（B 站默认「从开头播放」）
 * 优先 collected season 的 bilibili://video/{aid} link，否则封面/入口 bvid
 */
export function buildFavoriteSeasonEntryUrl(source: FavoriteSource, spaceMid: number, link?: string, bvid?: string): string {
  if (source.type === 11)
    return `https://www.bilibili.com/medialist/play/ml${source.id}`
  const matchedVideoLink = link?.match(/^bilibili:\/\/video\/(\d+)(\?.*)?$/)

  if (matchedVideoLink)
    return `https://www.bilibili.com/video/av${matchedVideoLink[1]}${matchedVideoLink[2] || ''}`

  if (bvid)
    return `https://www.bilibili.com/video/${bvid}/`

  return `https://space.bilibili.com/${spaceMid}/favlist?ftype=collect&ctype=${source.type}&fid=${source.id}`
}

/**
 * 打开合集内指定稿件（普通视频页，仍可带合集侧栏）
 * 实测 /list/season/{id}?bvid= 对订阅合集会 404
 */
export function buildFavoriteSeasonVideoUrl(bvid: string, source: FavoriteSource): string {
  if (source.type === 11)
    return `https://www.bilibili.com/medialist/play/ml${source.id}?bvid=${encodeURIComponent(bvid)}`
  return `https://www.bilibili.com/video/${bvid}/`
}

/**
 * 合并一页合集稿件，并给出是否还有更多。
 * 顶栏滚动加载 / 收藏页列表 / 播放全部全量拉取 共用此语义。
 */
export function mergeFavoriteSeasonPage(input: {
  sourceType: FavoriteSource['type']
  pn: number
  pageMedias: FavoriteItem[]
  mediaCount?: number
  hasMore?: boolean
  previousMedias: FavoriteItem[]
  /** An explicit retry may already display part of this uncommitted page. */
  pageStartLength?: number
  pageSize?: number
}): FavoriteSeasonPageMergeResult {
  const pageSize = input.pageSize ?? (input.sourceType === 11 ? FAVORITE_FOLDER_PAGE_SIZE : FAVORITE_SEASON_PAGE_SIZE)
  const count = typeof input.mediaCount === 'number' && input.mediaCount >= 0
    ? input.mediaCount
    : undefined
  const pageMedias = [...new Map(input.pageMedias.map(item => [getFavoriteResourceKey(item), item])).values()]
  const replace = input.sourceType === 21 && count !== undefined && pageMedias.length === count
    && input.hasMore !== true
  const previous = input.previousMedias
  const previousByKey = new Map(previous.map((item, index) => [getFavoriteResourceKey(item), { item, index }]))
  const medias = replace || input.pn === 1 ? [] : [...previous]
  const changed: FavoriteSeasonPageMergeResult['changed'] = []
  let added = 0
  for (const item of pageMedias) {
    const existing = previousByKey.get(getFavoriteResourceKey(item))
    const candidate = !item.upper?.face && existing?.item.upper?.face
      ? { ...item, upper: { ...item.upper, face: existing.item.upper.face } }
      : item
    const next = existing && JSON.stringify(existing.item) === JSON.stringify(candidate) ? existing.item : candidate
    const index = replace || input.pn === 1 ? medias.length : existing?.index ?? medias.length
    medias[index] = next
    if (!existing || existing.index >= (input.pageStartLength ?? previous.length))
      added++
    if (previous[index] !== next)
      changed.push({ index, item: next })
  }
  const noProgress = input.pn > 1 && added === 0 && !replace
  const countMismatch = count !== undefined && medias.length !== count
  const end = input.hasMore === false || (input.hasMore === undefined
    && (replace || (count !== undefined && medias.length >= count) || input.pageMedias.length < pageSize))
  const stalled = (end && countMismatch)
    || (input.hasMore === true && (noProgress || (count !== undefined && medias.length >= count)))
    || (!end && (noProgress || input.pageMedias.length === 0))
    || (count === undefined && input.hasMore === undefined && input.pageMedias.length > pageSize)
  return { medias, changed, replace, complete: end && !stalled, hasMore: !end && !stalled, stalled }
}

/** 拉取合集单页原始数据 */
export async function fetchFavoriteSeasonPage(
  source: FavoriteSource,
  pn: number,
  api: typeof import('~/utils/api').default.favorite,
  pageSize = source.type === 11 ? FAVORITE_FOLDER_PAGE_SIZE : FAVORITE_SEASON_PAGE_SIZE,
): Promise<FavoriteSeasonPageFetchResult> {
  try {
    const res: FavoritesResult | FavoriteSeasonResourcesResult | undefined = source.type === 11
      ? await api.getFavoriteResources({ media_id: source.id, pn, ps: Math.min(FAVORITE_FOLDER_PAGE_SIZE, pageSize), order: 'mtime' })
      : source.type === 21
        ? await api.getFavoriteSeasonResources({ season_id: source.id, pn, ps: pageSize })
        : undefined

    if (res?.code !== 0 || !res.data) {
      return { ok: false, pageMedias: [] }
    }

    const pageMedias = Array.isArray(res.data.medias)
      ? res.data.medias.filter(item => item != null).map(item => normalizeFavoriteSourceMedia(item, source.type))
      : []

    const mediaCount = typeof res.data.info?.media_count === 'number' && res.data.info.media_count >= 0
      ? res.data.info.media_count
      : undefined

    return {
      ok: true,
      pageMedias,
      mediaCount,
      cover: res.data.info?.cover,
      hasMore: 'has_more' in res.data && typeof res.data.has_more === 'boolean' ? res.data.has_more : undefined,
    }
  }
  catch {
    return { ok: false, pageMedias: [] }
  }
}

/**
 * 拉取订阅合集全部稿件
 * complete=false 表示中途失败或异常截断，不得把末项当「最新」
 */
export async function fetchAllFavoriteSeasonMedias(
  source: FavoriteSource,
  api: typeof import('~/utils/api').default.favorite,
  isCurrent: () => boolean,
): Promise<FetchAllSeasonMediasResult> {
  let medias: FavoriteItem[] = []
  let pn = 1

  while (pn <= MAX_SEASON_PAGES) {
    if (!isCurrent())
      return { medias, complete: false }
    const page = await fetchFavoriteSeasonPage(source, pn, api)
    if (!isCurrent() || !page.ok)
      return { medias, complete: false }

    const merged = mergeFavoriteSeasonPage({
      sourceType: source.type,
      pn,
      pageMedias: page.pageMedias,
      mediaCount: page.mediaCount,
      hasMore: page.hasMore,
      previousMedias: medias,
    })
    medias = merged.medias

    if (!merged.hasMore)
      return { medias, complete: merged.complete }

    pn += 1
  }

  return { medias, complete: false }
}

function matchSeasonMediaFromHistory(
  medias: FavoriteItem[],
  historyItems: HistoryItem[],
): FavoriteItem | undefined {
  const playable = medias.filter(isPlayableFavoriteVideo)
  const byBvid = new Map(
    playable
      .filter(item => typeof item.bvid === 'string' && item.bvid.length > 0)
      .map(item => [item.bvid, item]),
  )
  const byAid = new Map(playable.map(item => [item.id, item]))

  for (const item of historyItems) {
    if (item.history?.business && item.history.business !== Business.ARCHIVE)
      continue

    const byVid = item.history?.bvid ? byBvid.get(item.history.bvid) : undefined
    if (byVid)
      return byVid

    const oid = item.history?.oid
    if (typeof oid === 'number' && byAid.has(oid))
      return byAid.get(oid)
  }

  return undefined
}

/**
 * 在最近观看历史中找合集内最近一次看过的稿件（历史按时间倒序）
 */
export async function findLastWatchedSeasonMedia(
  medias: FavoriteItem[],
  fetchHistory: typeof api.history.getHistoryList,
  isCurrent: () => boolean,
): Promise<FavoriteItem | undefined> {
  if (medias.length === 0)
    return undefined

  let viewAt = 0

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    if (!isCurrent())
      return undefined
    let res: Awaited<ReturnType<typeof fetchHistory>>
    try {
      res = await fetchHistory({
        type: 'archive',
        view_at: viewAt,
        ps: HISTORY_PAGE_SIZE,
      })
    }
    catch {
      return undefined
    }

    if (!isCurrent() || res.code !== 0 || !res.data)
      return undefined

    const list = Array.isArray(res.data.list) ? res.data.list as HistoryItem[] : []
    if (list.length === 0)
      return undefined

    const matched = matchSeasonMediaFromHistory(medias, list)
    if (matched)
      return matched

    viewAt = list[list.length - 1]?.view_at ?? 0
    if (!viewAt || list.length < HISTORY_PAGE_SIZE)
      return undefined
  }

  return undefined
}

async function resolveSeasonMedias(
  source: FavoriteSource,
  preloaded: FavoriteSeasonPlayTarget['preloaded'],
  api: typeof import('~/utils/api').default.favorite,
  isCurrent: () => boolean,
): Promise<FetchAllSeasonMediasResult> {
  if (!isCurrent())
    return { medias: [], complete: false }
  if (preloaded?.complete && preloaded.sourceKey === getFavoriteSourceKey(source)
    && new Set(preloaded.medias.map(getFavoriteResourceKey)).size === preloaded.medias.length) {
    return { medias: preloaded.medias, complete: true }
  }
  return fetchAllFavoriteSeasonMedias(source, api, isCurrent)
}

/**
 * 解析「播放全部」目标地址
 * - beginning：合集入口
 * - latest：UGC 保留完整原生顺序的末项；公开夹为最近收藏的可播放稿件
 * - lastWatched：观看历史中该合集最近一次；找不到则回退入口
 */
export async function resolveFavoriteSeasonPlayAllUrl(
  target: FavoriteSeasonPlayTarget,
  context: { api: Pick<typeof api, 'favorite' | 'history'>, isCurrent: () => boolean },
): Promise<FavoriteSeasonPlayAllResult> {
  const { source, spaceMid, link, bvid, mode = 'beginning', preloaded } = target
  const entryUrl = buildFavoriteSeasonEntryUrl(source, spaceMid, link, bvid)
  if (!context.isCurrent())
    return { url: entryUrl, usedFallback: true, reason: 'cancelled' }

  if (mode === 'beginning') {
    return { url: entryUrl, usedFallback: false, reason: 'beginning' }
  }

  const { medias, complete } = await resolveSeasonMedias(source, preloaded, context.api.favorite, context.isCurrent)
  if (!context.isCurrent())
    return { url: entryUrl, usedFallback: true, reason: 'cancelled' }
  if (!complete)
    return { url: entryUrl, usedFallback: true, reason: 'incomplete' }
  if (medias.length === 0)
    return { url: entryUrl, usedFallback: true, reason: 'empty' }

  if (mode === 'latest') {
    let latest = medias.at(-1)
    if (source.type === 11) {
      const playable = medias.filter(isPlayableFavoriteVideo)
      if (playable.some(item => !Number.isFinite(item.fav_time) || item.fav_time <= 0))
        return { url: entryUrl, usedFallback: true, reason: 'unverified-order' }
      latest = playable.reduce<FavoriteItem | undefined>((recent, item) => !recent || item.fav_time > recent.fav_time ? item : recent, undefined)
    }
    if (!latest || !isPlayableFavoriteVideo(latest))
      return { url: entryUrl, usedFallback: true, reason: 'missing-bvid' }
    return { url: buildFavoriteSeasonVideoUrl(latest.bvid, source), usedFallback: false, reason: 'resolved' }
  }

  const lastWatched = await findLastWatchedSeasonMedia(medias, context.api.history.getHistoryList, context.isCurrent)
  if (!context.isCurrent())
    return { url: entryUrl, usedFallback: true, reason: 'cancelled' }
  if (!lastWatched?.bvid)
    return { url: entryUrl, usedFallback: true, reason: 'no-history' }

  return { url: buildFavoriteSeasonVideoUrl(lastWatched.bvid, source), usedFallback: false, reason: 'resolved' }
}
