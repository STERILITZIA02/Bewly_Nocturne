<script lang="ts" setup>
import { removeHttpFromUrl } from '~/utils/main'

import type { Author } from '../../types'
import { getAuthorJumpUrl } from '../../utils'

const props = withDefaults(defineProps<{
  author: Author | Author[]
  maxCount?: number
  isLive?: boolean
}>(), {
  maxCount: 3, // 最多显示的头像数量
})

// 限制显示的头像数量，最多显示 maxCount 个
const displayedAvatars = computed(() => {
  if (Array.isArray(props.author))
    return props.author?.slice(0, props.maxCount) || []
  else
    return [props.author]
})

// 检查是否是课堂类型（使用特殊标记）
const isKetang = computed(() => {
  if (Array.isArray(props.author))
    return false
  return props.author?.authorFace === '__ketang_icon__'
})
</script>

<template>
  <!-- 课堂图标 -->
  <div
    v-if="isKetang"
    :style="{
      width: 'var(--bew-card-avatar-size)',
      height: 'var(--bew-card-avatar-size)',
    }"
    pos="relative"
    shrink-0
  >
    <div
      class="ketang-icon video-card-author-avatar bew-shape-circle"
      w-full h-full
      bg="$bew-theme-surface"
      grid="~ place-items-center"
    >
      <div i-tabler:book text="xl $bew-text-1" />
    </div>
  </div>

  <!-- 普通头像 -->
  <div
    v-else
    :style="{
      width: `calc(var(--bew-card-avatar-size) + ${(displayedAvatars.length - 1)} * var(--bew-space-2))`,
      height: 'var(--bew-card-avatar-size)',
    }"
    pos="relative"
    shrink-0
  >
    <a
      v-for="(item, index) in displayedAvatars"
      :key="index"
      :href="getAuthorJumpUrl(item)" target="_blank"
      class="video-card-author-avatar bew-shape-circle"
      object="center cover" bg="$bew-skeleton" cursor="pointer"
      position-absolute top-0 inline-block
      :style="{
        zIndex: displayedAvatars.length - index,
        left: `calc(${index} * var(--bew-space-2))`,
        width: 'var(--bew-card-avatar-size)',
        height: 'var(--bew-card-avatar-size)',
      }"
      :class="{ live: isLive }"
      @click.stop=""
    >
      <!-- Avatar -->
      <Picture
        :src="`${removeHttpFromUrl(item.authorFace)}@50w_50h_1c`"
        loading="lazy"
        class="bew-shape-circle"
        w-full h-full
        aspect-ratio="1/1"
      />

      <!-- Following Flag -->
      <div
        v-if="item.followed && !Array.isArray(author)"
        class="bew-shape-circle"
        pos="absolute bottom--2px right--2px"
        w-14px h-14px
        bg="$bew-selected-bg"
        border="2 outset solid white"
        grid place-items-center
      >
        <div color="$bew-text-1" text-sm class="i-tabler:check w-8px h-8px" />
      </div>
      <div
        v-else-if="isLive"
        class="bew-shape-circle"
        pos="absolute bottom--2px right--2px"
        w-14px h-14px
        bg="$bew-selected-bg"
        grid place-items-center
      >
        <div color="$bew-text-1" text-sm class="i-svg-spinners:pulse-3 w-12px h-12px" />
      </div>
    </a>

    <!-- More avatars not shown -->
    <span
      v-if="Array.isArray(author) && author.length > maxCount"
      class="video-card-author-avatar bew-shape-circle"
      pos="absolute right--4px"
      w="28px" h="28px"
      bg="$bew-skeleton"
      flex="~ items-center justify-end"
    >
      <span text="sm $bew-text-2" mr-1px>+</span>
    </span>
  </div>
</template>

<style scoped lang="scss">
.video-card-author-avatar {
  box-sizing: border-box;
  border: 0;
}

.live {
  padding: 2px;
  // A live status indicator, not a decorative image frame.
  border: 2px solid var(--bew-text-1);
}
</style>
