import type { Video } from './types'

export interface NormalizedVideoCardTag {
  searchable: boolean
  text: string
}

type VideoTagSource = Pick<Video, 'displayTags' | 'searchableTags' | 'tag'>

function normalizeTagValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values.map(tag => tag.trim()).filter(Boolean)
}

export function normalizeVideoCardTags(video: VideoTagSource): NormalizedVideoCardTag[] {
  const normalized: NormalizedVideoCardTag[] = []
  const seen = new Set<string>()
  const append = (values: string[], searchable: boolean) => {
    values.forEach((text) => {
      if (seen.has(text))
        return
      seen.add(text)
      normalized.push({ searchable, text })
    })
  }

  append(normalizeTagValues(video.displayTags), false)
  append(normalizeTagValues(video.tag), false)
  append(normalizeTagValues(video.searchableTags), true)
  return normalized
}

export function selectVisibleVideoCardTags(
  tags: NormalizedVideoCardTag[],
  highlightTags: string[],
  showTags: boolean,
  showHighlights: boolean,
) {
  const leading = showTags ? tags.slice(0, 2) : []
  const remaining = 2 - leading.length
  return {
    leading,
    highlights: showHighlights && remaining > 0
      ? highlightTags.slice(0, remaining)
      : [],
  }
}
