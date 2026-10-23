import { getContrastingForeground } from './themeColor'

export interface ImageTone {
  /** Average colour of the band, `#rrggbb`. */
  color: string
  /** Black or white, whichever reads better on `color`. */
  foreground: string
}

const SAMPLE_WIDTH = 16
const CACHE_LIMIT = 200
const tones = new Map<string, Promise<ImageTone | null>>()
const settledTones = new Map<string, ImageTone | null>()

function toHex(value: number) {
  return Math.round(value).toString(16).padStart(2, '0')
}

async function sampleBand(url: string, top: number, bottom: number): Promise<ImageTone | null> {
  try {
    // Bilibili's image CDN answers CORS requests, so a separate anonymous
    // copy can be read back from a canvas.
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    await image.decode()
    const height = Math.max(1, Math.round(SAMPLE_WIDTH * image.naturalHeight / image.naturalWidth))
    const canvas = new OffscreenCanvas(SAMPLE_WIDTH, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context)
      return null
    context.drawImage(image, 0, 0, SAMPLE_WIDTH, height)
    const start = Math.min(height - 1, Math.floor(top * height))
    const end = Math.max(start + 1, Math.min(height, Math.ceil(bottom * height)))
    const { data } = context.getImageData(0, start, SAMPLE_WIDTH, end - start)
    let r = 0
    let g = 0
    let b = 0
    const count = data.length / 4
    for (let index = 0; index < data.length; index += 4) {
      r += data[index]
      g += data[index + 1]
      b += data[index + 2]
    }
    const color = `#${toHex(r / count)}${toHex(g / count)}${toHex(b / count)}`
    return { color, foreground: getContrastingForeground(color) }
  }
  catch {
    return null
  }
}

let toneRegistered = false

/**
 * Registers the moment card's tone colours (`--moment-tone`, `--moment-tone-fg`)
 * so a change eases every colour derived from them, gradients included. Once
 * per document; a reloaded content script finds them already registered.
 */
export function registerToneProperties() {
  if (toneRegistered || typeof CSS === 'undefined' || !CSS.registerProperty)
    return
  for (const name of ['--moment-tone', '--moment-tone-fg']) {
    try {
      CSS.registerProperty({ name, syntax: '<color>', inherits: true, initialValue: 'transparent' })
    }
    catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'InvalidModificationError')
        throw error
    }
  }
  toneRegistered = true
}

/**
 * The average colour of a horizontal band of a picture (`top` and `bottom` are
 * fractions of its height from the top) and the black or white text that reads
 * on it. Pass a small rendition of the image; results are cached per band.
 */
export function readImageBandTone(url: string, top: number, bottom: number) {
  const key = getBandKey(url, top, bottom)
  let tone = tones.get(key)
  if (!tone) {
    tone = sampleBand(url, top, bottom)
    tones.set(key, tone)
    void tone.then((value) => {
      if (tones.has(key))
        settledTones.set(key, value)
    })
    if (tones.size > CACHE_LIMIT) {
      const oldest = tones.keys().next().value!
      tones.delete(oldest)
      settledTones.delete(oldest)
    }
  }
  return tone
}

/**
 * A band already read, without waiting: a card shown again starts in its
 * colour instead of easing into it.
 */
export function peekImageBandTone(url: string, top: number, bottom: number) {
  return settledTones.get(getBandKey(url, top, bottom))
}

function getBandKey(url: string, top: number, bottom: number) {
  return `${url}|${top.toFixed(2)}|${bottom.toFixed(2)}`
}
