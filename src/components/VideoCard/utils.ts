import { getVideoPlaybackUrl } from '~/utils/videoPreviewProgress'

import type { Author, Video } from './types'

export function getAuthorJumpUrl(author?: Author) {
  if (!author)
    return ''

  return author.authorUrl || (author.mid ? `//space.bilibili.com/${author.mid}` : '')
}

export function getCurrentVideoUrl(video: Video, videoCurrentTime: Ref<number | null>) {
  return getVideoPlaybackUrl(video, videoCurrentTime.value)
}
