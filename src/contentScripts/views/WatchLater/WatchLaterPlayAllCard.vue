<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import type { List as VideoItem } from '~/models/video/watchLater'
import { removeHttpFromUrl } from '~/utils/main'

const props = defineProps<{
  items: readonly Pick<VideoItem, 'aid' | 'pic' | 'title'>[]
  total: number
  loading?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ (event: 'play'): void }>()
const { t } = useI18n()
const MAX_PREVIEW_COVERS = 6
// Preserve the server queue order used by the native play-all destination.
const covers = computed(() => props.items.slice(0, Math.min(MAX_PREVIEW_COVERS, Math.max(0, props.total))))
const remaining = computed(() => Math.max(0, props.total - covers.value.length))
const stackCount = computed(() => covers.value.length || (props.loading ? MAX_PREVIEW_COVERS : 1))
const failedCovers = ref(new Set<string>())
watch(() => JSON.stringify(covers.value.map(item => item.pic)), () => {
  failedCovers.value = new Set()
})
function failCover(pic: string) {
  failedCovers.value = new Set([...failedCovers.value, pic])
}
</script>

<template>
  <div class="watch-later-play-all-card">
    <span class="watch-later-play-all-card__preview" aria-hidden="true">
      <span class="watch-later-play-all-card__covers" :style="{ '--cover-gaps': stackCount - 1, '--cover-steps': Math.max(stackCount - 1, 1) }">
        <template v-if="covers.length">
          <span
            v-for="(item, index) in covers" :key="item.aid" class="watch-later-play-all-card__cover"
            :style="{ '--cover-index': index, 'zIndex': covers.length - index }"
          >
            <img
              v-if="item.pic && !failedCovers.has(item.pic)" :src="removeHttpFromUrl(`${item.pic}@192w_108h_1c`)"
              alt="" loading="lazy" decoding="async" @error="failCover(item.pic)"
            >
            <i v-else i-tabler:photo-off />
          </span>
        </template>
        <template v-else>
          <span
            v-for="index in stackCount" :key="index" class="watch-later-play-all-card__cover"
            :style="{ '--cover-index': index - 1, 'zIndex': stackCount - index }"
          >
            <SkeletonBlock v-if="loading" width="100%" height="100%" />
            <i v-else i-tabler:photo-off />
          </span>
        </template>
      </span>
      <span v-if="remaining && (!loading || covers.length)" class="watch-later-play-all-card__remaining">⋯ +{{ remaining }}</span>
    </span>
    <Button
      type="primary" block center round class="watch-later-play-all-card__play"
      :disabled="disabled"
      @click="emit('play')"
    >
      <i i-tabler:player-play aria-hidden="true" />{{ t('common.play_all') }}
    </Button>
  </div>
</template>

<style scoped lang="scss">
.watch-later-play-all-card {
  --queue-cover-width: calc(var(--bew-space-12) * 2 + var(--bew-space-4));
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--bew-space-2);
  gap: var(--bew-space-2);
  border-radius: var(--bew-library-filter-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
}
.watch-later-play-all-card__preview {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--bew-space-2);
  width: 100%;
  min-width: 0;
}
.watch-later-play-all-card__covers {
  position: relative;
  flex: 1 1 calc(var(--queue-cover-width) + var(--cover-gaps) * var(--bew-space-4));
  min-width: 0;
  height: calc(var(--queue-cover-width) * 9 / 16);
}
.watch-later-play-all-card__cover {
  position: absolute;
  top: 50%;
  left: calc((100% - min(100%, var(--queue-cover-width))) * var(--cover-index) / var(--cover-steps));
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: min(100%, var(--queue-cover-width));
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--bew-static-white);
  // The 12px cover radius + 8px inset follows the filter card's 20px contour.
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-1);
  background: var(--bew-content-solid);
  transform: translateY(-50%);

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  i {
    font-size: var(--bew-icon-size-md);
  }
  :deep([data-bew-skeleton]) {
    border-radius: 0;
  }
}
.watch-later-play-all-card__remaining {
  flex: none;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.b-button.watch-later-play-all-card__play {
  --b-button-border-width: 0;
  i {
    width: var(--bew-control-icon-size);
    height: var(--bew-control-icon-size);
  }
}
</style>
