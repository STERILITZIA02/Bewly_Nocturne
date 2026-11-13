<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BangumiCard from '~/components/BangumiCard/BangumiCard.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'

import { convertBangumiHighlight, convertMediaFtHighlight, isMediaFtItem } from '../searchTransforms'
import type { SearchMediaResult } from '../types'

const props = defineProps<{ item: SearchMediaResult, movie?: boolean }>()
const { t } = useI18n()
const media = computed(() => props.movie || isMediaFtItem(props.item)
  ? { kind: 'movie' as const, ...convertMediaFtHighlight(props.item) }
  : { kind: 'anime' as const, ...convertBangumiHighlight(props.item) })
const caption = computed(() => {
  const item = media.value
  const values = [item.score ? t('search.media.score', { score: Number(item.score).toFixed(1) }) : '', item.areas]
  if (item.kind === 'movie') {
    values.push(item.styles, item.indexShow)
  }
  else {
    values.push(
      item.episodeCount ? t('search.media.episode_count', { count: item.episodeCount }) : '',
      item.publishDateFormatted ? t('search.media.premiere', { date: item.publishDateFormatted }) : '',
    )
  }
  return values.filter(Boolean).join(' · ') || item.desc
})
const card = computed(() => {
  const item = media.value
  const badgeText = item.kind === 'movie' ? item.badge : item.capsuleText
  return {
    url: item.url,
    title: item.title,
    cover: item.cover || '',
    desc: caption.value,
    evaluate: item.kind === 'movie' ? item.desc : item.evaluate || item.desc,
    tags: item.kind === 'movie' ? (item.styles ? [item.styles] : []) : item.tags,
    actionLabel: `${(item.kind === 'anime' && item.buttonText) || t('search.media.watch_now')}：${item.title}`,
    badge: item.kind === 'anime' && item.badge
      ? item.badge
      : badgeText
        ? { text: badgeText, bgColor: props.item.badge_info?.bg_color || '', bgColorDark: props.item.badge_info?.bg_color_night || '' }
        : undefined,
  }
})
</script>

<template>
  <BangumiCard :bangumi="card">
    <template #caption>
      <div class="search-media-caption">
        <span class="search-media-caption__text keep-one-line" :title="caption">{{ caption }}</span>
        <MediaEpisodeSelect v-if="media.episodes.length" class="search-media-caption__episodes" :episodes="media.episodes" compact />
      </div>
    </template>
  </BangumiCard>
</template>

<style scoped lang="scss">
.search-media-caption {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
  min-height: var(--bew-line-height-caption);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  pointer-events: none;
}

.search-media-caption__text {
  flex: 1;
  min-width: 0;
}

.search-media-caption__episodes {
  flex: none;
  pointer-events: auto;
}
</style>
