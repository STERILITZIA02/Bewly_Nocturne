import { getMotionDuration, MAX_MOTION_MS } from '~/utils/motionTiming'
import { getVideoElement } from '~/utils/playerMedia'
import { prefersReducedMotion } from '~/utils/reducedMotion'

/** How long a leaving stage waits for the returning picture's first frame. */
const PICTURE_WAIT_MS = 600
const FRAME_MAX_WIDTH = 1280

/**
 * The picture as it is now, laid out over the video inside `root` (the stage
 * host's containing block): entering listening, it stays under the arriving
 * stage while the native stream lets go of its frame. Null where there is
 * nothing to draw (no decoded frame, a player that is not a <video>, a
 * protected stream) or motion is reduced; the stage then arrives on its own.
 */
export function captureListenFrame(video: HTMLElement, root: HTMLElement) {
  if (!(video instanceof HTMLVideoElement) || !video.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || prefersReducedMotion())
    return
  const box = video.getBoundingClientRect()
  const frame = root.getBoundingClientRect()
  if (!box.width || !box.height || !frame.width || !frame.height)
    return
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth)
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  try {
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  }
  catch {
    return
  }
  // Percentages of the player box, so a resize mid-way keeps it on the video.
  Object.assign(canvas.style, {
    position: 'absolute',
    left: `${(box.left - frame.left) / frame.width * 100}%`,
    top: `${(box.top - frame.top) / frame.height * 100}%`,
    width: `${box.width / frame.width * 100}%`,
    height: `${box.height / frame.height * 100}%`,
    objectFit: getComputedStyle(video).objectFit,
    pointerEvents: 'none',
  })
  canvas.setAttribute('aria-hidden', 'true')
  return canvas
}

/**
 * A leaving stage dissolves over the picture: once the returning video shows
 * a frame at its new position (`awaitPicture`, bounded) the host fades out.
 * Resolves when the host may be removed; at once where nothing can animate.
 * Only opacity moves, and the stage's glass samples inside the host.
 */
export async function dissolveListenStage(host: HTMLElement, awaitPicture: boolean, signal: AbortSignal) {
  if (prefersReducedMotion() || !host.isConnected || typeof host.animate !== 'function')
    return
  if (awaitPicture) {
    await new Promise<void>((resolve) => {
      const wait = new AbortController()
      const done = () => {
        wait.abort()
        resolve()
      }
      const timer = setTimeout(done, PICTURE_WAIT_MS)
      wait.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
      signal.addEventListener('abort', done, { signal: wait.signal })
      for (const name of ['seeked', 'playing']) {
        document.addEventListener(name, (event) => {
          if (event.target === getVideoElement())
            done()
        }, { capture: true, signal: wait.signal })
      }
    })
  }
  if (signal.aborted)
    return
  const style = getComputedStyle(host)
  const fade = host.animate({ opacity: [1, 0] }, {
    duration: Math.min(MAX_MOTION_MS, getMotionDuration(style, '--bew-duration-moderate', MAX_MOTION_MS)),
    easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease',
    fill: 'forwards',
  })
  signal.addEventListener('abort', () => fade.cancel(), { once: true })
  await fade.finished.catch(() => {})
}
