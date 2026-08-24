<script lang="ts" setup>
import { removeHttpFromUrl } from '~/utils/main'

import type { Author } from '../../types'
import { getAuthorJumpUrl } from '../../utils'

const props = withDefaults(defineProps<{
  author: Author | Author[]
  maxCount?: number
  isLive?: boolean
  compact?: boolean
}>(), {
  maxCount: 3, // 最多显示的头像数量
  compact: false,
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
      width: '34px',
      height: '34px',
    }"
    :class="compact ? 'mr-2' : 'mr-4'"
    pos="relative"
    shrink-0
  >
    <div
      class="ketang-icon video-card-author-avatar bew-shape-circle"
      w-34px h-34px
      bg="$bew-theme-color-10"
      grid="~ place-items-center"
    >
      <div i-mingcute:book-2-line text="xl $bew-theme-color" />
    </div>
  </div>

  <!-- 普通头像 -->
  <div
    v-else
    :style="{
      width: Array.isArray(author) && author.length > 1 ? `${28 + (displayedAvatars?.length) * 6}px` : '34px',
      height: Array.isArray(author) && author.length > 1 ? '28px' : '34px',
    }"
    :class="compact ? 'mr-2' : 'mr-4'"
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
        left: `${index * 6}px`,
        width: displayedAvatars.length > 1 ? `28px` : '34px',
        height: displayedAvatars.length > 1 ? `28px` : '34px',
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
        pos="absolute top-21px left-22px"
        w-14px h-14px
        bg="$bew-theme-color"
        border="2 outset solid white"
        grid place-items-center
      >
        <div color="$bew-on-theme-color" text-sm class="i-mingcute:check-fill w-8px h-8px" />
      </div>
      <div
        v-else-if="isLive"
        class="bew-shape-circle"
        pos="absolute top-18px left-22px"
        w-14px h-14px
        bg="$bew-theme-color"
        grid place-items-center
      >
        <div color="$bew-on-theme-color" text-sm class="i-svg-spinners:pulse-3 w-12px h-12px" />
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
  border: 1px solid var(--bew-surface-border-color);
}

.live {
  padding: 2px;
  border-width: 2px;
  border-color: var(--bew-theme-color-60);
}
</style>
