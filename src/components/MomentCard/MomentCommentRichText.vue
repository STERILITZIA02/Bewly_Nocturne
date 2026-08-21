<script setup lang="ts">
import { removeHttpFromUrl } from '~/utils/main'

import type { MomentCommentSegment } from './commentUtils'

const props = defineProps<{
  segments: MomentCommentSegment[]
}>()

const failedEmoteUrls = ref(new Set<string>())

function markEmoteFailed(url: string) {
  failedEmoteUrls.value.add(url)
}
</script>

<template>
  <span class="moment-comment-rich-text">
    <template v-for="(segment, index) in props.segments" :key="`${index}:${segment.type}:${segment.text}`">
      <template v-if="segment.type === 'text'">{{ segment.text }}</template>
      <template v-else-if="segment.type === 'emote'">
        <span v-if="failedEmoteUrls.has(segment.url)">{{ segment.text }}</span>
        <img
          v-else
          class="moment-comment-rich-text__emote"
          :src="removeHttpFromUrl(segment.url)"
          :alt="segment.text"
          loading="lazy"
          decoding="async"
          @error="markEmoteFailed(segment.url)"
        >
      </template>
      <a
        v-else-if="segment.type === 'mention'"
        :href="`https://space.bilibili.com/${segment.mid}`"
        target="_blank"
        rel="noopener noreferrer"
      >{{ segment.text }}</a>
      <a
        v-else
        :href="segment.url"
        target="_blank"
        rel="noopener noreferrer"
      >{{ segment.text }}</a>
    </template>
  </span>
</template>

<style scoped lang="scss">
.moment-comment-rich-text {
  white-space: inherit;
}

.moment-comment-rich-text__emote {
  display: inline-block;
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
  margin: 0 var(--bew-space-0-5);
  object-fit: contain;
  vertical-align: -0.25em;
}

.moment-comment-rich-text a {
  color: var(--bew-theme-foreground);
  text-decoration: none;
}

.moment-comment-rich-text a:hover {
  text-decoration: underline;
}
</style>
