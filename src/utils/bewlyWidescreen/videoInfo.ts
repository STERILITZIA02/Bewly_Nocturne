import type { VideoInfo } from '~/models/video/videoInfo'
import api from '~/utils/api'
import { selectors, VIEWER_COUNT_MIRRORED_ATTRIBUTE } from '~/utils/bewlyWidescreen/constants'
import { t } from '~/utils/bewlyWidescreen/labels'
import { findFirst, findMovable, getTitleText, moveOrReplaceNode } from '~/utils/bewlyWidescreen/nativeDom'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'
import { getBilibiliLogicalPathname } from '~/utils/bilibiliLocale'
import { normalizeBilibiliImageUrl } from '~/utils/bilibiliUrl'
import { reportRuntimeFailure } from '~/utils/messaging'
import { isPgcPlaybackPage } from '~/utils/videoMetadataBridge'

export function syncSidebarTitle(currentState: BewlyWidescreenState) {
  const titleElement = currentState.sidebarTop.querySelector<HTMLElement>('.bewly-widescreen-title')
  const nextTitle = currentState.videoInfoData?.title?.trim() || getTitleText()
  if (titleElement && nextTitle && titleElement.textContent !== nextTitle)
    titleElement.textContent = nextTitle
}

// @unocss-include: `.ts` is outside UnoCSS's watch pipeline, so without it a
// running `pnpm dev` never generates icons named only here.
const VIEWER_COUNT_ICON_CLASS = 'i-tabler:users'
const PUBLISH_DATE_ICON_CLASS = 'i-tabler:clock'
const DECLARATION_ICON_CLASS = 'i-tabler:info-circle'
const METADATA_ICON_CLASS = 'bewly-widescreen-metadata-icon'

/**
 * Prepares the cloned meta line: the reprint notice is boilerplate on every
 * original upload and leaves; every other item leads with an icon. Bilibili
 * draws none for the date (and may omit one on a declaration), so those get a
 * Tabler glyph in the same size as the native ones.
 */
function prepareMetadataClone(clone: HTMLElement) {
  clone.querySelectorAll('.copyright').forEach(item => item.remove())
  clone.querySelectorAll<HTMLElement>('.item').forEach((item) => {
    if (item.querySelector('svg, img'))
      return
    const icon = document.createElement('span')
    icon.className = `${item.classList.contains('pubdate-ip') ? PUBLISH_DATE_ICON_CLASS : DECLARATION_ICON_CLASS} ${METADATA_ICON_CLASS}`
    icon.setAttribute('aria-hidden', 'true')
    item.prepend(icon)
  })
}

export function clearViewerCount(currentState: BewlyWidescreenState) {
  currentState.viewerCountObserver?.disconnect()
  currentState.viewerCountObserver = undefined
  currentState.viewerCountSource?.parentElement?.removeAttribute(VIEWER_COUNT_MIRRORED_ATTRIBUTE)
  currentState.viewerCountSource = undefined
  currentState.metadataSlot.querySelector('.bewly-widescreen-viewers')?.remove()
}

/**
 * The live viewer count is status, not a control. While the card shows it
 * reads at the end of the meta line under the title instead of as a pill in
 * the control bar; filling the window shows the pill again. Only its text is
 * mirrored: the native node stays in the player and keeps updating it.
 */
export function syncViewerCount(currentState: BewlyWidescreenState) {
  const source = isPgcPlaybackPage()
    ? null
    : currentState.danmakuSemanticsSource?.querySelector<HTMLElement>('.bpx-player-video-info > .bpx-player-video-info-online') ?? null
  if (source !== (currentState.viewerCountSource ?? null)) {
    clearViewerCount(currentState)
    if (source) {
      currentState.viewerCountSource = source
      currentState.viewerCountObserver = new MutationObserver(() => {
        if (session.current === currentState)
          syncViewerCount(currentState)
      })
      currentState.viewerCountObserver.observe(source, { characterData: true, childList: true, subtree: true })
    }
  }

  const text = source?.textContent?.replace(/\s+/g, ' ').trim()
  let item = currentState.metadataSlot.querySelector<HTMLElement>('.bewly-widescreen-viewers')
  if (!source || !text) {
    item?.remove()
    source?.parentElement?.removeAttribute(VIEWER_COUNT_MIRRORED_ATTRIBUTE)
    return
  }
  if (!item) {
    item = document.createElement('span')
    item.className = 'bewly-widescreen-viewers item'
    const icon = document.createElement('span')
    icon.className = `${VIEWER_COUNT_ICON_CLASS} ${METADATA_ICON_CLASS}`
    icon.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    label.className = 'bewly-widescreen-viewers__label'
    item.append(icon, label)
  }
  // The metadata clone is replaced whenever its source changes; keep this last.
  if (currentState.metadataSlot.lastElementChild !== item)
    currentState.metadataSlot.append(item)
  const label = item.querySelector<HTMLElement>('.bewly-widescreen-viewers__label')!
  if (label.textContent !== text)
    label.textContent = text
  source.parentElement?.setAttribute(VIEWER_COUNT_MIRRORED_ATTRIBUTE, '')
}

export function clearVideoMetadataObserver(currentState: BewlyWidescreenState) {
  currentState.metadataObserver?.disconnect()
  currentState.metadataObserver = undefined
  currentState.metadataSource = undefined
}

/**
 * The meta line is cloned, not moved, so nothing else watches the native one
 * after the first pass. Bilibili fills its icon paths (and later counts) in
 * after the text, so the clone follows the source's own changes.
 */
function observeMetadataSource(currentState: BewlyWidescreenState, source: HTMLElement | null) {
  if (currentState.metadataSource === (source ?? undefined))
    return
  clearVideoMetadataObserver(currentState)
  if (!source)
    return
  currentState.metadataSource = source
  currentState.metadataObserver = new MutationObserver(() => {
    // Mid-navigation the native line still shows the old video.
    if (session.current === currentState && !currentState.navigationPending)
      syncVideoMetadata(currentState)
  })
  currentState.metadataObserver.observe(source, { characterData: true, childList: true, subtree: true })
}

/** Text plus the drawn icon shapes: a late-filled icon changes the clone too. */
function getMetadataSignature(source: HTMLElement) {
  const text = source.textContent?.replace(/\s+/g, ' ').trim() || ''
  return `${text}|${source.querySelectorAll('svg :is(path, circle, rect, use, g)').length}`
}

export function syncVideoMetadata(currentState: BewlyWidescreenState) {
  if (isPgcPlaybackPage())
    return moveOrReplaceNode(selectors.mediaInfo, currentState.metadataSlot, currentState.movedNodes).found
  const source = findMovable(selectors.metadata)
  observeMetadataSource(currentState, source)
  const existing = currentState.metadataSlot.querySelector<HTMLElement>('.bewly-widescreen-metadata-clone')
  if (!source) {
    existing?.remove()
    return false
  }

  const signature = getMetadataSignature(source)
  if (existing?.dataset.sourceSignature === signature)
    return true

  const clone = source.cloneNode(true) as HTMLElement
  // Cloning native metadata recreates its image requests. Normalize the copied
  // resource before insertion, without changing Vue-owned original nodes.
  clone.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    const src = image.getAttribute('src')!
    const normalized = normalizeBilibiliImageUrl(src)
    if (normalized !== src)
      image.setAttribute('src', normalized)
  })
  clone.removeAttribute('id')
  prepareMetadataClone(clone)
  clone.classList.add('bewly-widescreen-metadata-clone')
  clone.dataset.sourceSignature = signature
  // The mirrored viewer count stays last across clone replacements.
  const viewers = currentState.metadataSlot.querySelector<HTMLElement>('.bewly-widescreen-viewers')
  currentState.metadataSlot.replaceChildren(...(viewers ? [clone, viewers] : [clone]))
  return true
}

function getCurrentVideoInfoRequest() {
  const pathname = getBilibiliLogicalPathname()
  const bvidMatch = pathname.match(/^\/video\/(BV[0-9A-Za-z]+)(?:\/|$)/)
  if (bvidMatch)
    return { identity: `bvid:${bvidMatch[1]}`, params: { bvid: bvidMatch[1] } }

  const aidMatch = pathname.match(/^\/video\/av(\d+)(?:\/|$)/i)
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
    const avatarUrl = normalizeBilibiliImageUrl(data.owner.face)
    const ownerSignature = `${data.owner.mid}:${data.owner.name}:${avatarUrl}`
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
      avatar.src = avatarUrl
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
        item.setAttribute('aria-disabled', 'true')
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
