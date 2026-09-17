import { ref } from 'vue'

import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'
import { showState } from '~/utils/player'
import { getVideoElement } from '~/utils/playerMedia'
import { screenshotKey } from '~/utils/videoScreenshotShortcut'

export const videoScreenshotBusy = ref(false)
const DOWNLOAD_URL_LIFETIME_MS = 1_000

function filename(title: string, time: number) {
  const safeTitle = Array.from(title, character => character.charCodeAt(0) < 32 ? '_' : character).join('').replace(/_哔哩哔哩_bilibili$/, '').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').replace(/[.\s]+$/g, '').slice(0, 120) || 'bilibili-video'
  const ms = Math.max(0, Math.floor((Number.isFinite(time) ? time : 0) * 1000))
  const seconds = Math.floor(ms / 1000)
  const stamp = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join('-')
  return `${safeTitle}_${stamp}-${String(ms % 1000).padStart(3, '0')}.png`
}

/** Sampling is synchronous; only PNG encoding/download continue across navigation. */
export async function captureVideoScreenshot() {
  if (videoScreenshotBusy.value)
    return
  const video = getVideoElement()
  const notify = (key: string) => showState(String(i18n.global.t(`player_screenshot.${key}`, settings.value.language)))
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    notify('video_unavailable')
    return
  }
  const url = location.href
  const mediaSource = video.currentSrc
  const titleNode = document.querySelector<HTMLElement>('h1.video-title, .video-title, #player-title, .season-info .title, [class*="mediainfo_mediaTitle"]')
  const title = titleNode?.getAttribute('title') || titleNode?.textContent || document.querySelector<HTMLMetaElement>('meta[itemprop="name"], meta[property="og:title"]')?.content || document.title
  const downloadName = filename(title, video.currentTime)
  const isCurrent = () => location.href === url && getVideoElement() === video && video.currentSrc === mediaSource
  videoScreenshotBusy.value = true
  let objectUrl: string | undefined
  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Canvas 2D context is unavailable')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Empty screenshot')), 'image/png'))
    objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = downloadName
    link.hidden = true
    document.body.appendChild(link)
    try {
      link.click()
    }
    finally { link.remove() }
    if (isCurrent())
      notify('saved')
  }
  catch (error) {
    console.error('[Bewly Nocturne] 视频帧截图失败', error)
    if (isCurrent())
      notify('failed')
  }
  finally {
    if (objectUrl) {
      const capturedUrl = objectUrl
      setTimeout(() => URL.revokeObjectURL(capturedUrl), DOWNLOAD_URL_LIFETIME_MS)
    }
    videoScreenshotBusy.value = false
  }
}

export function handleVideoScreenshotShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || !settings.value.videoScreenshotShortcut
    || screenshotKey(event) !== settings.value.videoScreenshotShortcut) {
    return
  }
  if (event.composedPath().some(target => target instanceof HTMLElement && (target.matches('input, textarea, select, [role="textbox"]') || target.isContentEditable)))
    return
  event.preventDefault()
  void captureVideoScreenshot()
}
