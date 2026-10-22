<script lang="ts" setup>
import { computed, ref, watch } from 'vue'

import ProgressiveBlur from '~/components/ProgressiveBlur.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useUserRelations } from '~/composables/useUserRelations'
import { useVideoCardSharedStyles } from '~/composables/useVideoCardSharedStyles'
import { settings } from '~/logic'
import { recordVideoVisit } from '~/utils/videoVisitHistory'

import VideoCardCover from './components/VideoCardCover.vue'
import VideoCardInfo from './components/VideoCardInfo.vue'
import { useVideoCardLogic } from './composables/useVideoCardLogic'
import type { Video, VideoCardState } from './types'
import type { VideoCardContextMenuExtraOption } from './VideoCardContextMenu/VideoCardContextMenu.vue'
import VideoCardContextMenu from './VideoCardContextMenu/VideoCardContextMenu.vue'

const props = withDefaults(defineProps<Props>(), {
  showWatchLater: true,
  type: 'common',
  contextMenu: true,
  disableContentVisibility: false,
})

interface Props {
  persistentState?: VideoCardState
  skeleton?: boolean
  video?: Video
  type?: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'
  showWatchLater?: boolean
  horizontal?: boolean
  showPreview?: boolean
  /** Right-click (or long-press / context-menu key) opens the card menu; off falls back to the browser menu. */
  contextMenu?: boolean
  /** Page-specific menu items, built only while the menu is open. */
  getMenuExtraGroups?: (item: unknown) => VideoCardContextMenuExtraOption[][]
  menuItem?: unknown
  hideAuthor?: boolean
  disableContentVisibility?: boolean
  isFollowingPage?: boolean
  customClickHandler?: (event: MouseEvent) => void
  coverTopLeftAlwaysVisible?: boolean
}

// 数据现在在转换阶段已经完成 HTML 解码，直接使用 props
const logic = useVideoCardLogic(props, props.persistentState)
defineExpose({ canRecycle: computed(() => !logic.showVideoOptions.value && !logic.isPreviewFullscreen.value && !logic.isPreviewScrubbing.value && !logic.isHover.value && !logic.isUpdatingWatchLater.value && !logic.isUndoing.value) })
const { mainAppRef } = useBewlyApp()
const { userRelations, retainUserRelations } = useUserRelations()
watch(() => {
  const authors = props.video?.author
  return (Array.isArray(authors) ? authors : [authors]).flatMap(author => author?.mid ? [author.mid] : [])
}, retainUserRelations, { immediate: true })
const relationVideo = computed(() => {
  const video = props.video
  if (!video?.author)
    return video
  const authors = Array.isArray(video.author) ? video.author : [video.author]
  const resolved = authors.map(author => author.mid && userRelations.value[author.mid]
    ? { ...author, followed: userRelations.value[author.mid].isFollowing }
    : author)
  return { ...video, author: Array.isArray(video.author) ? resolved : resolved[0] }
})

// 使用共享样式（避免每个卡片重复计算）
const { textStyle } = useVideoCardSharedStyles()

const previewEnabled = computed(() =>
  Boolean(props.showPreview && settings.value.enableVideoPreview),
)

const shouldDisableLinkDragging = computed(() =>
  previewEnabled.value
  && settings.value.enableVideoPreviewSwipeSeek,
)

const hoverPreviewOnCoverOnly = computed(() =>
  previewEnabled.value && settings.value.onlyCoverVideoPreview,
)

function handleLinkClick(event: MouseEvent) {
  if (props.video)
    recordVideoVisit(props.video)

  const clickHandler = props.customClickHandler || logic.handleClick
  clickHandler(event)
}

const linkEvents = computed(() => ({
  click: handleLinkClick,
  dragenter: logic.cancelDragPreview,
  dragstart: logic.cancelDragPreview,
  ...(hoverPreviewOnCoverOnly.value
    ? {}
    : {
        mouseenter: logic.handleMouseEnter,
        mouseleave: logic.handelMouseLeave,
      }),
}))

const coverEvents = computed(() =>
  hoverPreviewOnCoverOnly.value
    ? {
        mouseenter: logic.handleMouseEnter,
        mouseleave: logic.handelMouseLeave,
      }
    : {},
)

const coverImageUrl = computed(() =>
  props.video ? `${logic.removeHttpFromUrl(props.video.cover)}@672w_378h_1c_!web-home-common-cover` : '',
)

// Cover 骨架屏状态：只依赖数据骨架屏，让图片能立即开始加载
const coverSkeleton = computed(() => props.skeleton)

// Info 骨架屏状态：只依赖数据骨架屏，不等待图片加载
// 这避免了滚动时图片加载触发的大量 DOM 重构
const infoSkeleton = computed(() => props.skeleton)

function handleContextMenu(event: MouseEvent) {
  // Shift keeps the browser menu, and a text selection keeps native copy.
  if (!props.contextMenu || !props.video || props.skeleton || logic.removed.value || event.shiftKey || document.getSelection()?.toString())
    return
  event.preventDefault()
  logic.openContextMenu(event)
}

// The gradient-blur halo exists only while a mouse is over the card.
const haloActive = ref(false)

const watchLaterMenuState = computed(() => props.showWatchLater && !props.video?.roomid
  ? { added: logic.isInWatchLater.value, toggle: logic.toggleWatchLater }
  : undefined)

provide('getVideoType', () => props.type!)
</script>

<template>
  <div
    :ref="(el) => logic.cardRootRef.value = el as HTMLElement"
    class="video-card-container"
    :data-bew-skeleton-group="skeleton ? '' : undefined"
    :class="[
      skeleton ? 'video-card-container--skeleton' : 'video-card-container--interactive',
      disableContentVisibility ? 'video-card-container--layout-stable' : '',
    ]"
    :style="disableContentVisibility
      ? { contentVisibility: 'visible', containIntrinsicSize: 'none' }
      : undefined"
    @contextmenu="handleContextMenu"
    @pointerenter="haloActive = $event.pointerType === 'mouse'"
    @pointerleave="haloActive = false"
  >
    <ProgressiveBlur v-if="haloActive && !skeleton" class="video-card-halo" edge="center" radius="var(--bew-card-hover-blur-radius)" />
    <div
      class="video-card group"
      w="full"
      rounded-inherit
    >
      <component
        :is="coverSkeleton ? 'div' : 'ALink'"
        :style="{ display: horizontal ? 'flex' : 'block', gap: horizontal ? 'var(--bew-card-inset)' : '0' }"
        v-bind="coverSkeleton ? {} : {
          href: logic.videoUrl.value,
          type: 'videoCard',
          customClickEvent: Boolean(props.customClickHandler) || settings.videoCardLinkOpenMode === 'drawer' || settings.videoCardLinkOpenMode === 'background',
          customClickEventIncludesModifiers: Boolean(props.customClickHandler),
          disableDragging: shouldDisableLinkDragging,
        }"
        v-on="coverSkeleton ? {} : linkEvents"
      >
        <!-- Cover -->
        <div
          :class="horizontal ? 'horizontal-card-cover' : 'vertical-card-cover'"
          relative
          v-on="coverSkeleton ? {} : coverEvents"
        >
          <VideoCardCover
            :skeleton="coverSkeleton"
            :video="props.video"
            :removed="logic.removed.value"
            :is-hover="logic.isHover.value"
            :preview-video-url="logic.previewVideoUrl.value || ''"
            :preview-identity="logic.previewMediaIdentity.value"
            :preview-current-time="logic.videoCurrentTime.value"
            :cover-top-left-always-visible="coverTopLeftAlwaysVisible"
            :cover-image-url="coverImageUrl"
            @undo="logic.handleUndo"
            @preview-error="logic.clearPreviewVideoUrl"
            @preview-fullscreen-change="logic.handlePreviewFullscreenChange"
            @preview-scrub-change="logic.handlePreviewScrubChange"
            @preview-progress="logic.recordPreviewProgress"
          >
            <template #coverTopLeft>
              <slot name="coverTopLeft" />
            </template>
          </VideoCardCover>
        </div>

        <!-- Other Information -->
        <VideoCardInfo
          v-if="!logic.removed.value"
          :class="{ 'horizontal-card-info': horizontal }"
          :skeleton="infoSkeleton"
          :video="relationVideo"
          :horizontal="horizontal || false"
          :video-url="logic.videoUrl.value"
          :text-style="textStyle"
          :hide-author="hideAuthor"
        />
        <div
          v-else-if="horizontal"
          class="horizontal-card-info"
          aria-hidden="true"
        />
      </component>
    </div>

    <!-- context menu -->
    <Teleport
      v-if="logic.showVideoOptions.value && props.video"
      :to="mainAppRef"
    >
      <VideoCardContextMenu
        :video="{
          ...props.video,
          ...relationVideo,
          url: logic.videoUrl.value,
        }"
        :context-menu-styles="logic.videoOptionsFloatingStyles.value"
        :is-following-page="props.isFollowingPage"
        :watch-later="watchLaterMenuState"
        :layout-target="logic.contextMenuLayoutTarget.value"
        :extra-groups="getMenuExtraGroups?.(menuItem)"
        @close="logic.closeContextMenu"
        @removed="logic.handleRemoved"
      />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/contentCard";

.video-card-container {
  contain: layout style;
  min-width: 0;

  // Windowed grids disable this estimate and use their shared measured heights.
  content-visibility: auto;
  contain-intrinsic-size: 376px 276px;

  /* 防止骨架屏和真实内容切换时的布局偏移：
     确保容器在加载过程中保持稳定的最小高度 */
  min-height: fit-content;
  @include contentCard.bare;
  @include contentCard.hover-halo;
}

.video-card-halo {
  @include contentCard.hover-halo-layer;
}

@media (hover: hover) and (pointer: fine) {
  .video-card-container:hover :deep(.video-card-cover) {
    box-shadow: var(--bew-shadow-2);
  }
}

/* 骨架屏状态：禁用交互；各内容块自身已经提供骨架反馈。 */
.video-card-container--skeleton {
  pointer-events: none;
}

/* 普通分页 grid 不使用 offscreen 估算，避免滚动进入视口时发生高度回流。 */
.video-card-container--layout-stable {
  content-visibility: visible;
  contain-intrinsic-size: none;
}

.horizontal-card-cover {
  --uno: "w-full";
  aspect-ratio: var(--bew-video-cover-aspect-ratio);
  flex: var(--video-card-cover-flex, 50) 1 0;
  min-width: 0;
  max-width: var(--video-card-cover-max-width, 400px);
}

.horizontal-card-info {
  flex: var(--video-card-info-flex, 50) 1 0;
  min-width: 0;
}

.vertical-card-cover {
  --uno: "w-full";
}
</style>
