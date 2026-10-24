import { getVideoPlaybackUrl } from '~/utils/videoPreviewProgress'

import type { Author, Video } from './types'

export function isBangumiVideo(video: Video) {
  return Boolean(video.epid) || video.goto === 'bangumi' || video.type === 'bangumi' || video.type === 'ketang'
}

export function getAuthorJumpUrl(author?: Author) {
  if (!author)
    return ''

  return author.authorUrl || (author.mid ? `//space.bilibili.com/${author.mid}` : '')
}

export function getCurrentVideoUrl(video: Video, videoCurrentTime: Ref<number | null>, injectPreviewTime = true) {
  return getVideoPlaybackUrl(video, videoCurrentTime.value, injectPreviewTime)
}
