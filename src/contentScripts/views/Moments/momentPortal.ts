import { normalizeMomentRemoteUrl } from '~/utils/momentUrl'

export interface MomentsPortalUser {
  mid: string
  name: string
  face: string
  following: string
  follower: string
  dyns: string
  vip?: { status?: number, nickname_color?: string, label?: { text?: string } }
  level_info?: { current_level?: number }
}

export interface MomentsPortalLiveUser {
  mid: string
  room_id: string
  jump_url: string
  face: string
  uname: string
  title: string
}

export function getSidebarAvatarUrl(url = '', size = 96) {
  const normalized = normalizeMomentRemoteUrl(url).replace(/@[^/]*$/, '')
  if (!normalized || !/hdslb\.com|biliimg\.com|bilibili\.com/.test(normalized))
    return normalized
  return `${normalized}@${size}w_${size}h_1c.webp`
}
