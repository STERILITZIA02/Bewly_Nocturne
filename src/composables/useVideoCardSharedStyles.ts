/**
 * 视频卡片共享样式计算（单例模式）
 * 避免每个卡片重复计算相同的样式
 */

import { computed } from 'vue'

import { settings } from '~/logic'

// 字体大小映射表（常量，无需重复计算）
const VIDEO_CARD_FONT_SIZE_MAP = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
} as const

const VIDEO_CARD_LINE_HEIGHT_MAP = {
  xs: 'var(--bew-line-height-caption)',
  sm: 'var(--bew-line-height-control)',
  base: 'var(--bew-line-height-body)',
  lg: 'var(--bew-line-height-heading)',
} as const

// These depend only on global settings, so every card can share the same refs.
const titleFontSizeClass = computed(() =>
  VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardTitleFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.base,
)

const titleStyle = computed((): Record<string, string | number> => ({
  '--bew-title-line-height': settings.value.videoCardTitleFontSize === 'base'
    ? 'var(--bew-line-height-title)'
    : VIDEO_CARD_LINE_HEIGHT_MAP[settings.value.videoCardTitleFontSize],
  'lineHeight': 'var(--bew-title-line-height)',
  'fontWeight': 'var(--bew-font-weight-semibold)',
}))

const metaStyle = computed(() => ({
  '--bew-author-line-height': VIDEO_CARD_LINE_HEIGHT_MAP[settings.value.videoCardAuthorFontSize],
  '--bew-meta-line-height': VIDEO_CARD_LINE_HEIGHT_MAP[settings.value.videoCardMetaFontSize],
}))

const authorFontSizeClass = computed(() =>
  VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardAuthorFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.sm,
)

const metaFontSizeClass = computed(() =>
  VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardMetaFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.xs,
)

export function useVideoCardSharedStyles() {
  return {
    titleFontSizeClass,
    titleStyle,
    authorFontSizeClass,
    metaFontSizeClass,
    metaStyle,
  }
}
