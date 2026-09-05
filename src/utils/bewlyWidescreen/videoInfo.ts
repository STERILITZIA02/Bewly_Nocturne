import type { VideoInfo } from '~/models/video/videoInfo'
import api from '~/utils/api'
import { selectors } from '~/utils/bewlyWidescreen/constants'
import { t } from '~/utils/bewlyWidescreen/labels'
import { findFirst, findMovable, getTitleText } from '~/utils/bewlyWidescreen/nativeDom'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'
import { reportRuntimeFailure } from '~/utils/messaging'

export function syncSidebarTitle(currentState: BewlyWidescreenState) {
  const titleElement = currentState.sidebarTop.querySelector<HTMLElement>('.bewly-widescreen-title')
  const nextTitle = currentState.videoInfoData?.title?.trim() || getTitleText()
  if (titleElement && nextTitle && titleElement.textContent !== nextTitle)
    titleElement.textContent = nextTitle
}

export function syncVideoMetadata(currentState: BewlyWidescreenState) {
  const source = findMovable(selectors.metadata)
  const existing = currentState.metadataSlot.querySelector<HTMLElement>('.bewly-widescreen-metadata-clone')
  if (!source) {
    existing?.remove()
    return false
  }

  const signature = source.textContent?.replace(/\s+/g, ' ').trim() || ''
  if (existing?.dataset.sourceSignature === signature)
    return true

  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.classList.add('bewly-widescreen-metadata-clone')
  clone.dataset.sourceSignature = signature
  currentState.metadataSlot.replaceChildren(clone)
  return true
}

function getCurrentVideoInfoRequest() {
  const bvidMatch = location.pathname.match(/^\/video\/(BV[0-9A-Za-z]+)(?:\/|$)/)
  if (bvidMatch)
    return { identity: `bvid:${bvidMatch[1]}`, params: { bvid: bvidMatch[1] } }

  const aidMatch = location.pathname.match(/^\/video\/av(\d+)(?:\/|$)/i)
  if (aidMatch)
    return { identity: `aid:${aidMatch[1]}`, params: { aid: aidMatch[1] } }

  return null
}

function formatWidescreenStat(value: number) {
  const locale = document.documentElement.lang || navigator.language || 'zh-CN'
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(Math.max(0, value))
}

type WidescreenFallbackStatIcon = 'like' | 'coin' | 'favorite' | 'share'

const WIDESCREEN_FALLBACK_STAT_ICON_PATHS: Record<WidescreenFallbackStatIcon, string[]> = {
  like: [
    'M7.5 10.5v10h-4v-10h4Z',
    'M7.5 19.5h9.2a2 2 0 0 0 1.94-1.51l1.5-6A2 2 0 0 0 18.2 9.5h-4.7l.55-3.82A2.35 2.35 0 0 0 11.72 3.5L7.5 10.5v9Z',
  ],
  coin: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    'M9 7.5h4.2a2.3 2.3 0 0 1 0 4.6H9V7.5Zm0 4.6h4.8a2.4 2.4 0 0 1 0 4.8H9v-4.8Z',
  ],
  favorite: [
    'm12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 16.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z',
  ],
  share: [
    'M14 5 20 11 14 17',
    'M20 11H10a6 6 0 0 0-6 6v2',
  ],
}

function createFallbackStatIcon(icon: WidescreenFallbackStatIcon) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.classList.add('bewly-widescreen-fallback-stat-icon')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const pathData of WIDESCREEN_FALLBACK_STAT_ICON_PATHS[icon]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', pathData)
    svg.appendChild(path)
  }
  return svg
}

export function renderFallbackVideoInfo(currentState: BewlyWidescreenState) {
  const data = currentState.videoInfoData
  if (!data)
    return

  const nativeOwner = findFirst(selectors.upPanel, currentState.upSlot)
  const fallbackOwner = currentState.upSlot.querySelector<HTMLElement>('.bewly-widescreen-fallback-owner')
  if (nativeOwner) {
    fallbackOwner?.remove()
  }
  else {
    const ownerSignature = `${data.owner.mid}:${data.owner.name}:${data.owner.face}`
    if (fallbackOwner?.dataset.sourceSignature !== ownerSignature) {
      const owner = document.createElement('div')
      owner.className = 'bewly-widescreen-fallback-owner'
      owner.dataset.sourceSignature = ownerSignature

      const profileLink = document.createElement('a')
      profileLink.className = 'bewly-widescreen-fallback-owner-link'
      profileLink.href = `https://space.bilibili.com/${data.owner.mid}`
      profileLink.target = '_blank'
      profileLink.rel = 'noopener noreferrer'
      profileLink.title = data.owner.name

      const avatar = document.createElement('img')
      avatar.className = 'bewly-widescreen-fallback-owner-avatar'
      avatar.src = data.owner.face
      avatar.alt = data.owner.name
      avatar.loading = 'eager'
      avatar.decoding = 'async'

      const name = document.createElement('span')
      name.className = 'bewly-widescreen-fallback-owner-name'
      name.textContent = data.owner.name
      profileLink.append(avatar, name)
      owner.appendChild(profileLink)

      if (fallbackOwner)
        fallbackOwner.replaceWith(owner)
      else
        currentState.upSlot.appendChild(owner)
    }
  }

  const nativeToolbar = findFirst(selectors.toolbar, currentState.toolbarSlot)
  const fallbackStats = currentState.toolbarSlot.querySelector<HTMLElement>('.bewly-widescreen-fallback-stats')
  if (nativeToolbar) {
    fallbackStats?.remove()
  }
  else {
    const items: Array<[string, number, WidescreenFallbackStatIcon]> = [
      ['widescreen.stat_likes', data.stat.like, 'like'],
      ['widescreen.stat_coins', data.stat.coin, 'coin'],
      ['widescreen.stat_favorites', data.stat.favorite, 'favorite'],
      ['widescreen.stat_shares', data.stat.share, 'share'],
    ]
    const statsSignature = items.map(([labelKey, value]) => `${t(labelKey)}:${value}`).join('|')
    if (fallbackStats?.dataset.sourceSignature !== statsSignature) {
      const stats = document.createElement('div')
      stats.className = 'bewly-widescreen-fallback-stats'
      stats.dataset.sourceSignature = statsSignature
      for (const [labelKey, value, icon] of items) {
        const item = document.createElement('span')
        const label = t(labelKey)
        const text = document.createElement('span')
        text.className = 'bewly-widescreen-fallback-stat-label'
        text.textContent = `${label} ${formatWidescreenStat(value)}`
        item.className = 'bewly-widescreen-fallback-stat'
        item.title = `${label} ${new Intl.NumberFormat(document.documentElement.lang || navigator.language).format(value)}`
        item.append(createFallbackStatIcon(icon), text)
        stats.appendChild(item)
      }
      if (fallbackStats)
        fallbackStats.replaceWith(stats)
      else
        currentState.toolbarSlot.appendChild(stats)
    }
  }

  const nativeDescription = findFirst(selectors.description, currentState.descriptionSlot)
  const fallbackDescription = currentState.descriptionSlot.querySelector<HTMLElement>('.bewly-widescreen-fallback-description')
  if (nativeDescription) {
    fallbackDescription?.remove()
  }
  else {
    const descriptionText = data.desc?.trim() || data.dynamic?.trim()
    if (descriptionText) {
      const descriptionLabel = t('widescreen.video_description')
      const descriptionSignature = `${descriptionLabel}:${descriptionText}`
      if (fallbackDescription?.dataset.sourceSignature !== descriptionSignature) {
        const description = document.createElement('p')
        description.className = 'bewly-widescreen-fallback-description'
        description.dataset.sourceSignature = descriptionSignature
        description.textContent = descriptionText
        description.setAttribute('aria-label', descriptionLabel)
        if (fallbackDescription)
          fallbackDescription.replaceWith(description)
        else
          currentState.descriptionSlot.appendChild(description)
      }
      currentState.descriptionSlot.classList.remove('is-empty')
    }
    else {
      fallbackDescription?.remove()
    }
  }

  const nativeTags = findFirst(selectors.tags, currentState.tagsSlot)
  const fallbackCategory = currentState.tagsSlot.querySelector<HTMLElement>('.bewly-widescreen-fallback-category')
  if (nativeTags) {
    fallbackCategory?.remove()
  }
  else if (data.tname?.trim()) {
    const categoryLabel = t('widescreen.video_category')
    const categoryText = data.tname.trim()
    const categorySignature = `${categoryLabel}:${categoryText}`
    if (fallbackCategory?.dataset.sourceSignature !== categorySignature) {
      const category = document.createElement('span')
      category.className = 'bewly-widescreen-fallback-category'
      category.dataset.sourceSignature = categorySignature
      category.textContent = categoryText
      category.setAttribute('aria-label', categoryLabel)
      if (fallbackCategory)
        fallbackCategory.replaceWith(category)
      else
        currentState.tagsSlot.appendChild(category)
    }
  }
  else {
    fallbackCategory?.remove()
  }
}

export async function loadFallbackVideoInfo(
  currentState: BewlyWidescreenState,
  pendingRequest?: Promise<VideoInfo>,
) {
  const request = getCurrentVideoInfoRequest()
  if (!request)
    return

  currentState.videoInfoIdentity = request.identity
  try {
    const response = pendingRequest
      ? await pendingRequest
      : await api.video.getVideoInfo(request.params) as VideoInfo
    if (session.current !== currentState
      || !currentState.root.isConnected
      || currentState.videoInfoIdentity !== request.identity
      || getCurrentVideoInfoRequest()?.identity !== request.identity
      || response?.code !== 0
      || !response.data) {
      return
    }
    currentState.videoInfoData = response.data
    renderFallbackVideoInfo(currentState)
    currentState.refreshSidebar()
  }
  catch (error) {
    if (session.current !== currentState
      || !currentState.root.isConnected
      || currentState.videoInfoIdentity !== request.identity
      || getCurrentVideoInfoRequest()?.identity !== request.identity) {
      return
    }
    if (!isBilibiliRiskControl(error))
      reportRuntimeFailure('Failed to load Bewly Playback Page video information', error)
  }
}
