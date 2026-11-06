// @unocss-include
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getVideoElement } from '~/utils/playerMedia'

import { observePlayerDom } from './playerDomLifecycle'

const PLAY_GLYPH = 'i-tabler:player-play-filled'
const PAUSE_GLYPH = 'i-tabler:player-pause-filled'
const EDITABLE = 'input, textarea, select, button, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="textbox"]'

/**
 * While listening, Bpx's own control bar drives the audio. Its native video is
 * suspended, so whatever would play or seek it (the play button, the progress
 * line, Space and ←/→) acts on the audio instead, and the audio's clock is
 * drawn into the bar's time and progress (per chapter segment). Speed and
 * volume stay Bpx's: they set the native element, whose changes the audio
 * follows. Listeners are delegated to the player root, so a re-rendered bar
 * keeps working; all of it ends with `signal`.
 */
export function bindListenNativeBar(root: HTMLElement, audio: HTMLAudioElement, signal: AbortSignal) {
  // Bpx's animated play icon follows the suspended video; a glyph that follows
  // the audio takes its place (videoPlayer.scss hides the native one).
  const glyph = document.createElement('i')
  glyph.className = `${PLAY_GLYPH} bewly-player-glyph`
  glyph.setAttribute('aria-hidden', 'true')
  let dragRatio: number | null = null
  let frame = 0
  let geometryDirty = true
  let progress: HTMLElement | null = null
  let playIcon: Element | null = null
  let current: Element | null = null
  let length: Element | null = null
  let thumb: HTMLElement | null = null
  let native: HTMLMediaElement | null = null
  let lineWidth = 0
  let segments: Array<{ element: HTMLElement, played: HTMLElement | null, buffered: HTMLElement | null, start: number, width: number }> = []
  const duration = () => Number.isFinite(audio.duration) ? audio.duration : 0
  const format = (seconds: number) => calcCurrentTime(Math.floor(Math.max(0, seconds)))
  function bufferedEnd() {
    for (let index = 0; index < audio.buffered.length; index++) {
      if (audio.buffered.start(index) <= audio.currentTime + 0.5 && audio.currentTime <= audio.buffered.end(index))
        return audio.buffered.end(index)
    }
    return 0
  }

  function measure(box = progress?.getBoundingClientRect()) {
    geometryDirty = false
    if (!progress || !box)
      return
    lineWidth = progress.offsetWidth
    for (const segment of segments) {
      const rect = segment.element.getBoundingClientRect()
      segment.start = box.width ? (rect.left - box.left) / box.width : 0
      segment.width = box.width ? rect.width / box.width : 0
    }
  }
  function paint() {
    frame = 0
    if (signal.aborted)
      return
    if (geometryDirty)
      measure()
    const total = duration()
    const time = dragRatio === null ? audio.currentTime : dragRatio * total
    if (playIcon && glyph.parentElement !== playIcon)
      playIcon.append(glyph)
    const glyphClass = `${audio.paused || audio.ended ? PLAY_GLYPH : PAUSE_GLYPH} bewly-player-glyph`
    if (glyph.className !== glyphClass)
      glyph.className = glyphClass
    if (current && current.textContent !== format(time))
      current.textContent = format(time)
    if (length && total && length.textContent !== format(total))
      length.textContent = format(total)

    if (!progress || !total)
      return
    const playedRatio = Math.min(1, time / total)
    const bufferedRatio = Math.min(1, bufferedEnd() / total)
    for (const { start, width, played, buffered } of segments) {
      const fill = (ratio: number) => `scaleX(${width ? Math.min(1, Math.max(0, (ratio - start) / width)) : 0})`
      played?.style.setProperty('transform', fill(playedRatio))
      buffered?.style.setProperty('transform', fill(bufferedRatio))
    }
    thumb?.style.setProperty('transform', `translateX(${playedRatio * lineWidth}px)`)
  }
  function schedulePaint() {
    if (!signal.aborted && !frame)
      frame = requestAnimationFrame(paint)
  }
  const resize = new ResizeObserver(() => {
    geometryDirty = true
    schedulePaint()
  })
  function readControls() {
    resize.disconnect()
    progress = root.querySelector<HTMLElement>('.bpx-player-progress')
    playIcon = root.querySelector('.bpx-player-ctrl-play .bpx-player-ctrl-btn-icon')
    current = root.querySelector('.bpx-player-ctrl-time-current')
    length = root.querySelector('.bpx-player-ctrl-time-duration')
    thumb = progress?.querySelector<HTMLElement>('.bpx-player-progress-thumb') ?? null
    segments = Array.from(progress?.querySelectorAll<HTMLElement>('.bpx-player-progress-schedule') ?? [], element => ({
      element,
      played: element.querySelector<HTMLElement>('.bpx-player-progress-schedule-current'),
      buffered: element.querySelector<HTMLElement>('.bpx-player-progress-schedule-buffer'),
      start: 0,
      width: 0,
    }))
    for (const element of [progress, ...segments.map(segment => segment.element)]) {
      if (element)
        resize.observe(element)
    }
    const nextNative = getVideoElement() as HTMLMediaElement | null
    if (nextNative !== native) {
      native = nextNative
      if (native && 'volume' in native) {
        native.playbackRate = audio.playbackRate
        native.volume = audio.volume
        native.muted = audio.muted
      }
    }
    geometryDirty = true
    schedulePaint()
  }

  function toggle() {
    if (audio.paused || audio.ended)
      void audio.play().catch(() => {})
    else
      audio.pause()
  }
  function seekBy(seconds: number) {
    const total = duration()
    if (total)
      audio.currentTime = Math.min(total, Math.max(0, audio.currentTime + seconds))
  }

  const options = { capture: true, signal }
  for (const name of ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'progress', 'seeked', 'emptied'])
    audio.addEventListener(name, schedulePaint, { signal })
  // Bpx redraws the line from its own clock when the bar resizes.
  const controlsSelector = '.bpx-player-progress, .bpx-player-progress-schedule, .bpx-player-progress-thumb, .bpx-player-ctrl-play, .bpx-player-ctrl-time-current, .bpx-player-ctrl-time-duration'
  const stopDom = observePlayerDom((records) => {
    if (!records || [progress, playIcon, current, length, native].some(element => element && !element.isConnected)
      || records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element
        && (node.matches(controlsSelector) || node.querySelector(controlsSelector))))) {
      readControls()
    }
  })
  signal.addEventListener('abort', () => {
    stopDom()
    resize.disconnect()
    cancelAnimationFrame(frame)
    glyph.remove()
  }, { once: true })

  root.addEventListener('click', (event) => {
    const target = event.target as Element
    if (target.closest('.bpx-player-progress-wrap')) {
      event.stopImmediatePropagation()
    }
    else if (target.closest('.bpx-player-ctrl-play')) {
      event.stopImmediatePropagation()
      toggle()
    }
  }, options)
  root.addEventListener('mousedown', (event) => {
    if ((event.target as Element).closest('.bpx-player-progress-wrap'))
      event.stopImmediatePropagation()
  }, options)
  root.addEventListener('pointerdown', (event) => {
    const area = (event.target as Element).closest<HTMLElement>('.bpx-player-progress-wrap')
    const line = root.querySelector<HTMLElement>('.bpx-player-progress')
    if (!area || !line || event.button !== 0)
      return
    event.stopImmediatePropagation()
    event.preventDefault()
    if (!duration())
      return
    const box = line.getBoundingClientRect()
    if (geometryDirty)
      measure(box)
    const ratioAt = (pointer: PointerEvent) => Math.min(1, Math.max(0, (pointer.clientX - box.left) / box.width))
    const drag = new AbortController()
    const end = (release: PointerEvent) => {
      if (release.type === 'pointerup')
        audio.currentTime = ratioAt(release) * duration()
      dragRatio = null
      drag.abort()
      schedulePaint()
    }
    signal.addEventListener('abort', () => drag.abort(), { signal: drag.signal })
    dragRatio = ratioAt(event)
    schedulePaint()
    window.addEventListener('pointermove', (move) => {
      dragRatio = ratioAt(move)
      schedulePaint()
    }, { signal: drag.signal })
    window.addEventListener('pointerup', end, { signal: drag.signal })
    window.addEventListener('pointercancel', end, { signal: drag.signal })
  }, options)

  // Bpx's document shortcuts would play or seek the suspended video; these
  // keys are taken for the audio only while the session lasts.
  const KEYS: Record<string, () => void> = { ' ': toggle, 'ArrowLeft': () => seekBy(-5), 'ArrowRight': () => seekBy(5) }
  for (const name of ['keydown', 'keyup'] as const) {
    window.addEventListener(name, (event) => {
      const target = event.composedPath()[0]
      if (!KEYS[event.key] || event.isComposing || event.altKey || event.ctrlKey || event.metaKey
        || (target instanceof Element && target.closest(EDITABLE))) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      if (name === 'keydown' && !event.repeat)
        KEYS[event.key]()
    }, options)
  }

  // Speed and volume: Bpx sets the native element and draws its own controls.
  root.addEventListener('ratechange', (event) => {
    const media = event.target as HTMLMediaElement
    if (media === native && media.playbackRate !== audio.playbackRate) {
      audio.defaultPlaybackRate = media.playbackRate
      audio.playbackRate = media.playbackRate
    }
  }, options)
  root.addEventListener('volumechange', (event) => {
    const media = event.target as HTMLMediaElement
    if (media === native) {
      audio.volume = media.volume
      audio.muted = media.muted
    }
  }, options)

  schedulePaint()
}
