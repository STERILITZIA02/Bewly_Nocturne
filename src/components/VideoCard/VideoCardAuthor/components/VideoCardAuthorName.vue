<script lang="ts" setup>
import { getAuthorJumpUrl } from '~/components/VideoCard/utils'

import type { Author } from '../../types'

defineProps<{
  author?: Author | Author[]
}>()
</script>

<template>
  <span class="video-card-author">
    <a
      class="channel-name"
      un-text="$bew-text-2 hover:$bew-theme-foreground"
      cursor-pointer truncate font-normal
      :href="getAuthorJumpUrl(Array.isArray(author) ? author[0] : author)"
      target="_blank"
      @click.stop=""
    >
      <span v-if="Array.isArray(author) && author.length > 1">
        {{ $t('video_card.group_contribution', { firstAuthor: author[0].name, num: author.length }) }}
      </span>
      <span v-else>
        {{ Array.isArray(author) ? author[0].name : author?.name }}
      </span>
    </a>
    <span v-if="!Array.isArray(author) && author?.followed" class="video-card-author__followed">
      {{ $t('video_card.followed') }}
    </span>
  </span>
</template>

<style scoped>
.video-card-author {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
}
.channel-name {
  min-width: 0;
  line-height: var(--bew-author-line-height);
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
}
.channel-name:focus-visible {
  color: var(--bew-theme-foreground);
}
.video-card-author__followed {
  flex: none;
  padding-inline: var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-round);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  white-space: nowrap;
}
</style>
