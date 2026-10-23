// Pictures fade in when they first load. Remember which URLs have loaded so a
// picture shown again (a remounted card, a cached cover) appears at once
// instead of fading in again. Holds URLs only, never image data.
const MAX_REMEMBERED_PICTURES = 240
const loadedPictureSources = new Set<string>()

export function hasLoadedPicture(src: string): boolean {
  if (!src || !loadedPictureSources.has(src))
    return false

  // 刷新插入顺序，使最近重新使用的封面更晚被淘汰。
  loadedPictureSources.delete(src)
  loadedPictureSources.add(src)
  return true
}

export function rememberLoadedPicture(src: string) {
  if (!src)
    return

  loadedPictureSources.delete(src)
  loadedPictureSources.add(src)

  while (loadedPictureSources.size > MAX_REMEMBERED_PICTURES) {
    const oldestSource = loadedPictureSources.values().next().value
    if (!oldestSource)
      break
    loadedPictureSources.delete(oldestSource)
  }
}

export function forgetLoadedPicture(src: string) {
  if (!src)
    return
  loadedPictureSources.delete(src)
}
