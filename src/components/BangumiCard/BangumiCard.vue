<script setup lang="ts">
import { useDark } from '~/composables/useDark'
import { useBangumiCardSharedStyles } from '~/composables/useVideoCardSharedStyles'
import { numFormatter } from '~/utils/dataFormatter'
import { removeHttpFromUrl } from '~/utils/main'
import { getContrastingForeground } from '~/utils/themeColor'

import BangumiCardSkeleton from './BangumiCardSkeleton.vue'

const props = defineProps<{
  skeleton?: boolean
  bangumi: Bangumi
  horizontal?: boolean
}>()
interface Bangumi {
  url: string
  cover: string
  coverHover?: string
  tags?: string[]
  title: string
  desc: string
  evaluate?: string
  capsuleText?: string
  rank?: number
  view?: number
  follow?: number
  badge?: {
    text: string
    bgColor: string
    bgColorDark: string
  }
}

const { isDark } = useDark()
const badgeStyle = computed(() => {
  const color = (isDark.value ? props.bangumi.badge?.bgColorDark : props.bangumi.badge?.bgColor) ?? ''
  const backgroundColor = /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color) ? color : isDark.value ? '#1b1b1b' : '#ffffff'
  return { backgroundColor, color: getContrastingForeground(backgroundColor) }
})
const { bangumiTitleClass, bangumiTitleStyle } = useBangumiCardSharedStyles()
</script>

<template>
  <div class="bangumi-card-shell">
    <div
      v-if="!skeleton && bangumi"
      class="bangumi-card"
      :class="{ 'bangumi-card--horizontal': horizontal }"
      :style="{
        display: horizontal ? 'flex' : 'block',
      }"
      gap-4
      content-visibility-auto intrinsic-size-400px
      h-fit
    >
      <ALink
        class="bangumi-card__overlay"
        :href="bangumi.url"
        type="videoCard"
        :aria-label="bangumi.title"
      />
      <!-- Cover -->
      <div
        tabindex="-1" block
        class="bangumi-card__cover"
        rounded="$bew-thumb-radius" w-full bg="$bew-skeleton" relative shrink-0
        overflow-hidden
      >
        <div aspect="12/16" rounded-inherit>
          <!-- badge -->
          <div
            v-if="bangumi.badge && bangumi.badge.text"
            class="bangumi-card__badge"
            :style="badgeStyle"
            pos="absolute top-0 right-0"
            p="x-2 y-1" m="$bew-cover-overlay-inset" rounded="$bew-pill-radius"
            text="sm" z-1
          >
            {{ bangumi.badge.text }}
          </div>

          <!-- rank -->
          <div
            v-if="bangumi.rank"
            class="bangumi-rank"
            w-full
            pos="absolute bottom-0" z-1
            text="white shadow"
            p-2 fw-bold h-150px flex items-end
            bg="gradient-to-b gradient-from-transparent gradient-to-[rgba(0,0,0,.6)]"
            :style="{
              '--un-text-shadow': bangumi.rank <= 3 ? '4px 4px 0 var(--bew-selected-bg), 6px 6px 0 var(--bew-fill-3)' : '',
            }"
          >
            {{ bangumi.rank }}
          </div>

          <div
            rounded-inherit
            aspect="12/16"
            pos="relative"
          >
            <!-- anime genres -->
            <div
              v-if="bangumi.evaluate || (Array.isArray(bangumi.tags) && bangumi.tags?.length > 0)"
              class="bangumi-card__details"
              pos="absolute bottom-0" w-full h-full p-2
              flex="~ col justify-end"
              z-1
              style="
                background: linear-gradient(
                  transparent,
                  rgba(0, 0, 0, 0.8)
                );
              "
            >
              <div mb-4 text="white">
                {{ bangumi.evaluate }}
              </div>
              <template v-if="Array.isArray(bangumi.tags) && bangumi.tags?.length > 0">
                <div flex="~ wrap" gap-2>
                  <span
                    v-for="tag in bangumi.tags"
                    :key="tag"
                    bg="$bew-cover-scrim"
                    text="white sm"
                    leading-none
                    p="x-2 y-1"
                    rounded="$bew-pill-radius"
                    shrink-0
                  >{{ tag }}
                  </span>
                </div>
              </template>
            </div>

            <img
              :src="`${removeHttpFromUrl(bangumi.cover)}@466w_622h.webp`"
              :alt="bangumi.title"
              rounded-inherit aspect="12/16" max-w-full w-full
            >

            <!-- image after hovering -->
            <div
              v-if="bangumi.coverHover"
              class="bangumi-card__hover-cover"
              w-full
              rounded-inherit
              aspect="12/16"
              bg="cover center"
              pos="absolute top-0 left-0"
              :style="{
                backgroundImage: `url(${removeHttpFromUrl(
                  bangumi.coverHover || bangumi.cover,
                )}@672w_378h_1c.webp)`,
              }"
            />
          </div>
        </div>
      </div>
      <div
        class="bangumi-card__info"
        flex-1
        :style="{
          marginTop: horizontal ? '0' : 'var(--bew-card-stack-gap)',
        }"
      >
        <p class="bangumi-card__heading" mb-2 :class="bangumiTitleClass" :style="bangumiTitleStyle">
          <span
            class="bangumi-card__title keep-two-lines"
            :title="bangumi.title"
          >
            {{ bangumi.title }}
          </span>
        </p>
        <p v-if="bangumi.view || bangumi.follow" text="sm $bew-text-2" mb-2>
          <span v-if="bangumi.view" mr-4>{{ $t('common.view', { count: numFormatter(bangumi.view) }, bangumi.view) }}</span>
          <span v-if="bangumi.follow">{{ $t('common.anime_follow_count', { count: numFormatter(bangumi.follow) }, bangumi.follow) }}</span>
        </p>
        <div text="sm $bew-text-2" flex flex-wrap gap-2 items-center>
          <div
            v-if="bangumi.capsuleText && bangumi.capsuleText.trim()"
            class="bangumi-capsule"
            text="$bew-text-3"
          >
            {{ bangumi.capsuleText }}
          </div>
          <span lh="$bew-line-height-body"> {{ bangumi.desc }} </span>
        </div>
      </div>
    </div>
    <BangumiCardSkeleton
      v-else-if="skeleton"
      :horizontal="horizontal"
      :show-stats="Boolean(bangumi?.view || bangumi?.follow)"
    />
  </div>
</template>

<style scoped lang="scss">
@use "./title";
@use "../../styles/contentCard";

.bangumi-card-shell {
  min-width: 0;
}

.bangumi-card {
  position: relative;
  @include contentCard.bare;
}

.bangumi-card__overlay {
  position: absolute;
  z-index: 1;
  inset: 0;
  border-radius: inherit;
  corner-shape: inherit;
}

.bangumi-card__cover {
  z-index: 0;
  width: 100%;
}
.bangumi-card--horizontal .bangumi-card__cover {
  width: min(170px, 42%);
}
.bangumi-card__info {
  min-width: 0;
  overflow-wrap: anywhere;
}
.bangumi-card:not(.bangumi-card--horizontal) .bangumi-card__info {
  @include contentCard.under-cover;
}

.bangumi-card__badge,
.bangumi-card__details,
.bangumi-card__hover-cover {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.bangumi-card__details,
.bangumi-card__hover-cover {
  opacity: 0;
}

.bangumi-card:is(:hover, :focus-within) {
  .bangumi-card__badge {
    opacity: 0;
  }

  .bangumi-card__details,
  .bangumi-card__hover-cover {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bangumi-card,
  .bangumi-card__badge,
  .bangumi-card__details,
  .bangumi-card__hover-cover {
    transition: none;
  }
}

.bangumi-capsule {
  display: inline-flex;
  min-height: calc(var(--bew-line-height-control) + var(--bew-space-2));
  align-items: center;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

// Ranking numbers are decorative data, scaled from the shared emphasis token
// rather than introducing another arbitrary text size.
.bangumi-rank {
  font-size: calc(var(--bew-font-size-data-emphasis) * 2.5);
  line-height: 1;
}
</style>
