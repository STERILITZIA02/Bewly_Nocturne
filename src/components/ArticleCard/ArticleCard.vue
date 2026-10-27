<script lang="ts" setup>
import ALink from '~/components/ALink.vue'
import ProgressiveBlur from '~/components/ProgressiveBlur.vue'
import { calcTimeSince, numFormatter } from '~/utils/dataFormatter'

interface ArticleCardProps {
  id: number | string
  url?: string
  title: string
  desc?: string
  cover?: string
  coverFill?: boolean
  author: string
  authorMid?: number
  /** 数字或接口已格式化文案（如 "20.4万"） */
  view?: number | string
  like?: number | string
  reply?: number | string
  /** Unix 秒级时间戳，或接口直接返回的展示文案 */
  publishTime?: number | string
  categoryName?: string
  tags?: Array<{ name: string }>
}

const props = defineProps<ArticleCardProps>()

const articleUrl = computed(() => {
  if (props.url)
    return props.url

  const id = String(props.id)
  if (/^\d{15,}$/.test(id))
    return `https://www.bilibili.com/opus/${id}`
  return `https://www.bilibili.com/read/${id.startsWith('cv') ? id : `cv${id}`}`
})

// 格式化日期：字符串直接展示；数字按 Unix 秒处理
function formatDate(timestamp: number | string | undefined) {
  if (timestamp === undefined || timestamp === null || timestamp === '')
    return ''
  if (typeof timestamp === 'string')
    return timestamp

  return calcTimeSince(timestamp * 1000)
}
</script>

<template>
  <ALink
    :href="articleUrl"
    type="videoCard"
    class="article-card bew-surface-border"
    :class="{ 'article-card--cover-fill': coverFill && cover }"
    bg="$bew-elevated"
    rounded="$bew-surface-radius"
    cursor-pointer
  >
    <!-- 左侧内容 -->
    <div class="article-content" flex-1 min-w-0>
      <!-- 标题 -->
      <h3
        class="article-title keep-two-lines"
        text="$bew-text-1"
        mb-2
      >
        {{ title }}
      </h3>

      <!-- 描述 -->
      <p
        v-if="desc"
        class="article-desc keep-two-lines"
        text="$bew-text-2"
        mb-2
      >
        {{ desc }}
      </p>

      <!-- 元信息 -->
      <div
        class="article-meta" flex flex-wrap items-center gap-2
        text="xs $bew-text-3"
      >
        <span class="author">{{ author }}</span>
        <span v-if="categoryName">{{ categoryName }}</span>
        <span v-if="publishTime">{{ formatDate(publishTime) }}</span>
        <div v-if="view !== undefined" flex items-center gap-1>
          <div i-tabler:eye />
          <span>{{ numFormatter(view) }}</span>
        </div>
        <div v-if="like !== undefined" flex items-center gap-1>
          <div i-tabler:thumb-up />
          <span>{{ numFormatter(like) }}</span>
        </div>
        <div v-if="reply !== undefined" flex items-center gap-1>
          <div i-tabler:message />
          <span>{{ numFormatter(reply) }}</span>
        </div>
      </div>

      <!-- 标签 -->
      <div
        v-if="tags && tags.length > 0"
        class="article-tags"
        flex flex-wrap gap-2 mt-2
      >
        <span
          v-for="tag in tags.slice(0, 2)"
          :key="tag.name"
          text="xs $bew-on-theme-surface"
          bg="$bew-theme-surface"
          px-2 h-6 inline-flex items-center
          rounded="$bew-pill-radius"
        >
          {{ tag.name }}
        </span>
      </div>
    </div>

    <!-- 右侧图片 -->
    <div
      v-if="cover"
      class="article-cover"
      rounded="$bew-interactive-radius"
      overflow-hidden
      flex-shrink-0
      bg="$bew-fill-1"
    >
      <img
        :src="cover"
        :alt="title"
        loading="lazy" decoding="async"
        w-full h-full object-cover rounded-inherit
      >
    </div>
    <div v-if="coverFill && cover" class="article-cover-transition" aria-hidden="true">
      <ProgressiveBlur class="article-cover-transition__blur" edge="left" sample-within=".article-card" />
      <div class="article-cover-transition__wash" />
    </div>
  </ALink>
</template>

<style lang="scss" scoped>
@use "../../styles/truncateFade";
@use "../../styles/contentCard";
.article-title {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-title);
}

.article-card {
  display: flex;
  gap: var(--bew-space-4);
  padding: var(--bew-space-4);
  color: inherit;
  text-decoration: none;
  @include contentCard.surface;
}
.article-card--cover-fill {
  --article-cover-width: min(38%, 180px);
  position: relative;
  display: block;
  padding: 0;

  .article-content {
    padding: var(--bew-space-4);
    padding-right: calc(var(--article-cover-width) + var(--bew-space-4));
  }

  .article-cover {
    position: absolute;
    inset: 0 0 0 auto;
    // The side-by-side layout aligns the cover to the start; on an absolute box
    // that shrinks it to its content (the image's own height) instead of
    // filling between the insets, so the cover would stop short or overflow.
    align-self: stretch;
    width: var(--article-cover-width);
    aspect-ratio: auto;
    border-radius: 0 var(--bew-surface-radius) var(--bew-surface-radius) 0;
    corner-shape: var(--bew-corner-shape);
  }
}
.article-cover-transition {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(100% - var(--article-cover-width));
  width: var(--bew-space-10);
  pointer-events: none;
}
.article-cover-transition__blur,
.article-cover-transition__wash {
  position: absolute;
  inset: 0;
}
.article-cover-transition__wash {
  background: linear-gradient(to right, var(--bew-elevated), transparent);
}
.article-desc {
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}
.article-meta > :not(:first-child)::before {
  content: "·";
  margin-right: var(--bew-space-2);
}
.article-meta .author {
  min-width: 0;
  max-width: 100%;
  font-weight: var(--bew-font-weight-regular);
  @include truncateFade.line;
}
.article-tags > span {
  display: block;
  max-width: 100%;
  line-height: var(--bew-space-6);
  @include truncateFade.line;
}
.article-meta .author:hover {
  color: var(--bew-theme-foreground);
}
.article-cover {
  width: min(32%, 160px);
  aspect-ratio: 16 / 10;
  align-self: flex-start;
}
</style>
