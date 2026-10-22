/**
 * 视频卡片共享样式计算（单例模式）
 * 避免每个卡片重复计算相同的样式
 */

import { computed } from 'vue'

import { settings } from '~/logic'

// Each size option is a type role, so card text scales with the browser font
// size like the rest of the UI (no Tailwind rem classes, which ran larger).
const VIDEO_CARD_TYPE_ROLES = {
  xs: 'caption',
  sm: 'control',
  base: 'title',
  lg: 'subheading',
} as const

function typeRole(size: keyof typeof VIDEO_CARD_TYPE_ROLES) {
  const role = VIDEO_CARD_TYPE_ROLES[size] ?? VIDEO_CARD_TYPE_ROLES.base
  return { size: `var(--bew-font-size-${role})`, lineHeight: `var(--bew-line-height-${role})` }
}

// These depend only on global settings, so every card can share the same ref.
const textStyle = computed(() => {
  const title = typeRole(settings.value.videoCardTitleFontSize)
  const author = typeRole(settings.value.videoCardAuthorFontSize)
  return {
    '--video-card-title-size': title.size,
    '--bew-title-line-height': title.lineHeight,
    '--video-card-author-size': author.size,
    '--bew-author-line-height': author.lineHeight,
  }
})

export function useVideoCardSharedStyles() {
  return { textStyle }
}

const bangumiTitleClass = computed(() => ({ 'bew-title-auto': settings.value.homeAdaptiveTitleAutoSize }))
const bangumiTitleStyle = computed(() => !settings.value.homeAdaptiveTitleAutoSize && settings.value.homeAdaptiveTitleFontSize
  ? { fontSize: `${settings.value.homeAdaptiveTitleFontSize}px`, lineHeight: '1.25' }
  : {})

export function useBangumiCardSharedStyles() {
  return { bangumiTitleClass, bangumiTitleStyle }
}
