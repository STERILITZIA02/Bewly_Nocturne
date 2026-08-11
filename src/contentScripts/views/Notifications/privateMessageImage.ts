export const PRIVATE_MESSAGE_IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const PRIVATE_MESSAGE_GIF_MAX_BYTES = 1024 * 1024

export type PrivateMessageImageValidationError = 'image_too_large' | 'gif_too_large'

export function validatePrivateMessageImage(file: Pick<File, 'size' | 'type'>): PrivateMessageImageValidationError | null {
  if (file.size > PRIVATE_MESSAGE_IMAGE_MAX_BYTES)
    return 'image_too_large'
  if (file.type.toLocaleLowerCase() === 'image/gif' && file.size > PRIVATE_MESSAGE_GIF_MAX_BYTES)
    return 'gif_too_large'
  return null
}
