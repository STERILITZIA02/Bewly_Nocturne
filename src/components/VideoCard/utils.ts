import { resolveSearchNavigationTarget } from '~/utils/searchNavigation'
import { getVideoPlaybackUrl } from '~/utils/videoPreviewProgress'

import type { Author, Video } from './types'

export function getAuthorJumpUrl(author?: Author) {
  if (!author)
    return ''

  return author.authorUrl || (author.mid ? `//space.bilibili.com/${author.mid}` : '')
}

/** 标签点击跳转搜索页（复用统一的搜索链接构建入口） */
export function getTagSearchUrl(tag: string) {
  return resolveSearchNavigationTarget(tag)
}

export function getCurrentVideoUrl(video: Video, videoCurrentTime: Ref<number | null>) {
  return getVideoPlaybackUrl(video, videoCurrentTime.value)
}
