// The current Web IM accepts PNG/JPEG/GIF, up to 20 MiB (GIF up to 1 MiB).
export const PRIVATE_MESSAGE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif'

export function validatePrivateMessageImage(file: { type: string, size: number }): 'image_type_unsupported' | 'image_too_large' | 'gif_too_large' | null {
  if (!PRIVATE_MESSAGE_IMAGE_ACCEPT.split(',').includes(file.type) || file.size <= 0)
    return 'image_type_unsupported'
  if (file.type === 'image/gif' && file.size > 1024 * 1024)
    return 'gif_too_large'
  if (file.size > 20 * 1024 * 1024)
    return 'image_too_large'
  return null
}
