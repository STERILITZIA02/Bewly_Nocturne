/** Matches the current native space folder editor and medialist upload contract. */
export const FAVORITE_FOLDER_TITLE_LIMIT = 20
export const FAVORITE_FOLDER_INTRO_LIMIT = 200
export const FAVORITE_COVER_MAX_BYTES = 5 * 1024 * 1024
export const FAVORITE_COVER_TYPES: readonly string[] = ['image/jpeg', 'image/png']

export interface FavoriteFolderForm {
  title: string
  intro: string
  cover: string
  privacy: number
}

export function isFavoriteCover(file: { type: string, size: number }) {
  return FAVORITE_COVER_TYPES.includes(file.type) && file.size > 0 && file.size <= FAVORITE_COVER_MAX_BYTES
}

export function serializeFavoriteCover(body: Record<string, unknown>): FormData {
  const { bytes, mimeType, fileName, csrf } = body
  if (!Array.isArray(bytes) || !isFavoriteCover({ type: String(mimeType), size: bytes.length })
    || !bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255) || !csrf) {
    throw new Error('invalid-favorite-cover')
  }
  const form = new FormData()
  form.set('bucket', 'medialist')
  form.set('dir', 'cover')
  form.set('csrf', String(csrf))
  form.set('file', new Blob([new Uint8Array(bytes)], { type: String(mimeType) }), String(fileName || 'cover'))
  return form
}

/** Keep the default folder first and preserve every other folder's relative order. */
export function moveFavoriteFolderToTop(ids: readonly number[], target: number): number[] {
  if (!ids.includes(target) || ids[0] === target)
    return [...ids]
  return [ids[0], target, ...ids.slice(1).filter(id => id !== target)]
}
