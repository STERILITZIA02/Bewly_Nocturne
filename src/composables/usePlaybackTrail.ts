import { shallowRef } from 'vue'

import { onRouteChange, useRouteState } from '~/composables/useRouteState'
import { getPlaybackNavigationKey } from '~/utils/playbackTab'
import { getPlaybackPart, getPlaybackVideoInfo } from '~/utils/playbackVideoInfo'
import { getVideoElement } from '~/utils/playerMedia'
import type { NativePlaybackUnit } from '~/utils/videoMetadataBridge'
import { matchesPlaybackUnit, parseVideoPageIdentity, readNativeMediaSnapshot, switchNativePlaybackVisit } from '~/utils/videoMetadataBridge'

interface PlaybackVisit { href: string, entryKey?: string, unit?: NativePlaybackUnit }
interface PlaybackTrail { visits: PlaybackVisit[], index: number }

const storageKey = 'bewly:playback-trail'
const historyKey = '__bewlyPlaybackIndex'
export const playbackTrail = shallowRef<PlaybackTrail>({ visits: [], index: -1 })
let request: { index: number, unit?: NativePlaybackUnit, controller: AbortController } | undefined
let navigationTimer: ReturnType<typeof setTimeout> | undefined

function finishNavigation() {
  request?.controller.abort()
  request = undefined
  clearTimeout(navigationTimer)
  navigationTimer = undefined
}

function save(trail: PlaybackTrail) {
  playbackTrail.value = trail
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(trail))
  }
  catch { /* Session storage can be disabled. In-page navigation still works. */ }
}

export function setupPlaybackTrail() {
  const route = useRouteState()
  let needsRestore = true
  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      if (saved && Array.isArray(saved.visits) && Number.isInteger(saved.index)
        && saved.index >= 0 && saved.index < saved.visits.length
        && saved.visits.every((v: PlaybackVisit) => typeof v?.href === 'string' && getPlaybackNavigationKey(v.href))) {
        playbackTrail.value = saved
      }
    }
    catch { /* Start fresh if the tab has no readable trail. */ }
  }

  function record() {
    const href = route.href
    if (href !== route.applicationHref) {
      finishNavigation()
      return
    }
    const key = getPlaybackNavigationKey(href)
    if (!key) {
      finishNavigation()
      return
    }
    if (needsRestore) {
      restore()
      needsRestore = false
    }
    const { visits, index } = playbackTrail.value
    const marked = history.state?.[historyKey]
    const matches = (i: number) => visits[i] && (getPlaybackNavigationKey(visits[i].href) === key
      || (visits[i].unit && matchesPlaybackUnit(href, visits[i].unit)))
    // Back/forward restores a visit. A new video branches from the current one.
    const destination = request && (matches(request.index) || (request.unit && matchesPlaybackUnit(href, request.unit))) ? request.index : undefined
    const confirmedUnit = destination === undefined ? undefined : request?.unit
    if (destination !== undefined || !matches(index))
      finishNavigation()
    const existing = destination ?? (Number.isInteger(marked) && matches(marked) ? marked : index)
    const entryKey = window.navigation?.currentEntry?.key
    let cursor = existing
    if (destination === undefined && !matches(existing)) {
      cursor = index + 1
      save({ visits: [...visits.slice(0, cursor), { href, entryKey }], index: cursor })
    }
    else if (cursor !== index || visits[cursor].href !== href || visits[cursor].entryKey !== entryKey) {
      const updated = visits.slice()
      updated[cursor] = { ...visits[cursor], href, entryKey, unit: confirmedUnit ?? visits[cursor].unit }
      save({ visits: updated, index: cursor })
    }
    if (marked !== cursor)
      history.replaceState({ ...history.state, [historyKey]: cursor }, '')
    rememberUnit()
  }

  function rememberUnit(event?: Event) {
    const { visits, index } = playbackTrail.value
    const visit = visits[index]
    if (!visit || visit.unit || visit.href !== route.href || !parseVideoPageIdentity(route.href))
      return
    const video = getVideoElement()
    if (!video || (event && event.target !== video))
      return
    const unit = readNativeMediaSnapshot(video)?.unit
    if (unit?.bvid && matchesPlaybackUnit(visit.href, unit)) {
      const updated = visits.slice()
      updated[index] = { ...visit, unit }
      save({ visits: updated, index })
    }
  }

  function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) {
      needsRestore = true
      record()
    }
  }

  const stop = onRouteChange(record, true)
  document.addEventListener('loadedmetadata', rememberUnit, true)
  window.addEventListener('pagehide', finishNavigation)
  window.addEventListener('pageshow', onPageShow)
  return () => {
    stop()
    finishNavigation()
    document.removeEventListener('loadedmetadata', rememberUnit, true)
    window.removeEventListener('pagehide', finishNavigation)
    window.removeEventListener('pageshow', onPageShow)
  }
}

export async function goToPlaybackVisit(direction: -1 | 1) {
  const { visits, index } = playbackTrail.value
  const targetIndex = index + direction
  const visit = visits[targetIndex]
  if (!visit || request)
    return
  const controller = new AbortController()
  request = { index: targetIndex, unit: visit.unit, controller }
  const entry = window.navigation?.entries().find(entry => entry.key === visit.entryKey)
  const canTraverse = entry && entry.key !== window.navigation.currentEntry?.key
    && (!entry.url || getPlaybackNavigationKey(entry.url) === getPlaybackNavigationKey(visit.href))
  function openDocument() {
    finishNavigation()
    save({ visits, index: targetIndex })
    window.location.assign(visit.href)
  }
  function traverseOrOpen() {
    if (entry && canTraverse) {
      const navigation = window.navigation.traverseTo(entry.key)
      void navigation.committed?.catch(() => {
        if (!controller.signal.aborted)
          openDocument()
      })
    }
    else {
      openDocument()
    }
  }

  if (entry?.sameDocument && canTraverse) {
    traverseOrOpen()
    return
  }
  const video = getVideoElement()
  let accepted = video && switchNativePlaybackVisit(video, visit.href, visit.unit)
  if (accepted === 'needs-unit' && video) {
    // Old visits may predate capture of playback IDs. Resolve their part only
    // after the current native player confirms it supports an in-place switch.
    const identity = parseVideoPageIdentity(visit.href)!
    try {
      const info = await getPlaybackVideoInfo(identity.bvid ? { bvid: identity.bvid } : { aid: String(identity.aid) }, controller.signal)
      if (controller.signal.aborted)
        return
      const part = info.code === 0 && Array.isArray(info.data?.pages) && getPlaybackPart(new URL(visit.href), info.data.pages)
      if (part) {
        const unit = { aid: info.data.aid, bvid: info.data.bvid, cid: part.cid, page: part.page }
        request.unit = unit
        accepted = switchNativePlaybackVisit(video, visit.href, unit)
      }
    }
    catch { /* Browser navigation remains available if the manuscript read fails. */ }
  }
  if (controller.signal.aborted)
    return
  if (accepted && accepted !== 'needs-unit') {
    // A native switch commits its route after the new manifest arrives.
    request.unit = accepted
    navigationTimer = setTimeout(traverseOrOpen, 10_000)
    return
  }
  traverseOrOpen()
}
