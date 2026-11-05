/**
 * A picture's own colours as a soft field, the way Apple Music lays them
 * behind a cover: a small anonymous copy blurred and saturated once into a
 * 64px image, which a surface scales up to cover itself (the upscale finishes
 * the blend). Each field is an object URL, cached per source; the oldest are
 * released past the limit.
 */
const FIELD_SIZE = 64
const CACHE_LIMIT = 12
const fields = new Map<string, Promise<string | null>>()

async function paint(url: string) {
  try {
    // Bilibili's image CDN answers CORS requests, so the copy can be exported.
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    await image.decode()
    const canvas = new OffscreenCanvas(FIELD_SIZE, FIELD_SIZE)
    const context = canvas.getContext('2d')
    if (!context)
      return null
    // Drawn past the edges so the blur has no rim.
    const bleed = FIELD_SIZE / 8
    context.filter = 'blur(4px) saturate(1.6)'
    context.drawImage(image, -bleed, -bleed, FIELD_SIZE + bleed * 2, FIELD_SIZE + bleed * 2)
    return URL.createObjectURL(await canvas.convertToBlob())
  }
  catch {
    return null
  }
}

/** The field's object URL, or null when the picture cannot be read. */
export function readCoverField(url: string) {
  let field = fields.get(url)
  if (!field) {
    field = paint(url)
    fields.set(url, field)
    if (fields.size > CACHE_LIMIT) {
      const [oldest, released] = fields.entries().next().value!
      fields.delete(oldest)
      void released.then(objectUrl => objectUrl && URL.revokeObjectURL(objectUrl))
    }
  }
  return field
}
