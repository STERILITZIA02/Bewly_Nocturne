/**
 * 拦截 B 站原生空间页「订阅合集」的播放全部
 * 例：https://space.bilibili.com/{mid}/favlist?fid={seasonId}&ftype=collect&ctype=21
 */

import { useToast } from 'vue-toastification'

import { useRouteState } from '~/composables/useRouteState'
import { settings } from '~/logic'
import type { FavoriteSource } from '~/models/video/favoriteSeason'
import api from '~/utils/api'
import { getFavoriteSourceKey } from '~/utils/favoriteResource'
import { resolveFavoriteSeasonPlayAllUrl } from '~/utils/favoriteSeason'
import { i18n } from '~/utils/i18n'
import { getUserID, openLinkToNewTab } from '~/utils/main'

const PLAY_ALL_TEXT = /播放全部/

let interceptInstalled = false
let lifecycle = 0
let resolving: { token: symbol, navigationId: number } | null = null

export function parseNativeFavoriteSource(url: string = location.href): { source: FavoriteSource, spaceMid: number } | null {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.match(/^\/(\d+)\/favlist\/?$/)
    if (parsed.hostname !== 'space.bilibili.com' || !path || parsed.searchParams.get('ftype') !== 'collect')
      return null
    const id = Number(parsed.searchParams.get('fid'))
    const type = Number(parsed.searchParams.get('ctype'))
    const spaceMid = Number(path[1])
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(spaceMid) || spaceMid <= 0 || (type !== 11 && type !== 21))
      return null
    return { source: { id, type }, spaceMid }
  }
  catch {
    return null
  }
}

export function isNativeSeasonPlayAllTarget(el: Element): boolean {
  // 文本兜底：合集详情区内的「播放全部」
  const inSeasonDetail = el.closest(
    '.favlist-info-detail__actions, .favlist-info-detail, .favInfo-box .collection-details',
  )
  if (!inSeasonDetail)
    return false

  const clickable = el.closest('a,button,[role="button"],.collection-btn,.playall-btn,.action-btn')
  if (!(clickable instanceof HTMLElement) || clickable.matches(':disabled,[aria-disabled="true"]'))
    return false

  return clickable.matches('.playall-btn,.collection-btn') || PLAY_ALL_TEXT.test(clickable.textContent || '')
}

function extractEntryFromClickTarget(el: Element): { link?: string, bvid?: string } {
  const anchor = el.closest('a[href]')
  if (anchor instanceof HTMLAnchorElement) {
    const fromHref = extractVideoIdsFromHref(anchor.href)
    if (fromHref.bvid || fromHref.link)
      return fromHref
  }

  // 新按钮是 <button> 无 href；尽量从列表首卡取入口
  const firstCard = document.querySelector<HTMLAnchorElement>([
    '#page-fav .fav-main a[href*="/video/"]',
    '.favlist-main a[href*="/video/"]',
    '.favlist-content a[href*="/video/"]',
    '.favInfo-box ~ * a[href*="/video/"]',
  ].join(', '))
  if (firstCard)
    return extractVideoIdsFromHref(firstCard.href)

  return {}
}

function extractVideoIdsFromHref(href: string): { link?: string, bvid?: string } {
  try {
    const url = new URL(href, location.origin)
    const bvidMatch = url.pathname.match(/\/video\/(BV[a-z0-9]+)/i)
    if (bvidMatch)
      return { bvid: bvidMatch[1] }

    const avidMatch = url.pathname.match(/\/video\/av(\d+)/i)
    if (avidMatch)
      return { link: `bilibili://video/${avidMatch[1]}` }
  }
  catch {
    // ignore
  }
  return {}
}

async function handleNativeSeasonPlayAll(event: MouseEvent) {
  if (!interceptInstalled || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return
  const locationSource = parseNativeFavoriteSource()
  if (!locationSource || settings.value.collectedSeasonPlayAllMode === 'beginning')
    return

  const target = event.target
  if (!(target instanceof Element))
    return

  if (!isNativeSeasonPlayAllTarget(target))
    return

  // 新 UI 是 button + 捕获阶段拦截，需 stopImmediatePropagation 阻止原生起播
  event.preventDefault()
  event.stopImmediatePropagation()
  event.stopPropagation()

  const route = useRouteState()
  const navigationId = route.navigationId
  if (resolving?.navigationId === navigationId)
    return
  const accountId = getUserID()
  const generation = lifecycle
  const token = Symbol('favorite-play-all')
  resolving = { token, navigationId }
  const isCurrent = () => {
    const current = parseNativeFavoriteSource()
    return interceptInstalled && generation === lifecycle && navigationId === route.navigationId
      && getUserID() === accountId && current?.spaceMid === locationSource.spaceMid
      && getFavoriteSourceKey(current.source) === getFavoriteSourceKey(locationSource.source)
  }
  try {
    const entry = extractEntryFromClickTarget(target)
    const result = await resolveFavoriteSeasonPlayAllUrl({
      source: locationSource.source,
      spaceMid: locationSource.spaceMid,
      link: entry.link,
      bvid: entry.bvid,
      mode: settings.value.collectedSeasonPlayAllMode,
    }, { api, isCurrent })

    // SPA 可能已切走：打开前再确认仍是同一合集
    if (!isCurrent())
      return
    if (result.usedFallback)
      useToast().warning(String(i18n.global.t('favorites.season_play_all_fallback')))
    openLinkToNewTab(result.url)
  }
  finally {
    if (resolving?.token === token)
      resolving = null
  }
}

export function initNativeFavoriteSeasonPlayAllIntercept(): void {
  if (interceptInstalled)
    return
  interceptInstalled = true
  document.addEventListener('click', handleNativeSeasonPlayAll, true)
}

export function stopNativeFavoriteSeasonPlayAllIntercept(): void {
  lifecycle++
  resolving = null
  if (!interceptInstalled)
    return
  interceptInstalled = false
  document.removeEventListener('click', handleNativeSeasonPlayAll, true)
}
