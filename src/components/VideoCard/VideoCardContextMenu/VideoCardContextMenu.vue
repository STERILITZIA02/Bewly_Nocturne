<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ChevronIcon from '~/components/ChevronIcon.vue'
import PipWindow from '~/components/PipWindow.vue'
import ProgressiveBlur from '~/components/ProgressiveBlur.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useMeasuredDisclosure } from '~/composables/useMeasuredDisclosure'
import { useUserRelations } from '~/composables/useUserRelations'
import { settings } from '~/logic'
import type { findLayoutEditableTarget } from '~/logic/layoutEdit'
import { enterLayoutEditMode } from '~/logic/layoutEdit'
import type { VideoCardContextMenuKey } from '~/logic/storage'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import type { AppFeedFeedbackSelection } from '~/utils/appFeedFeedback'
import { getAppFeedFeedbackTarget } from '~/utils/appFeedFeedback'
import { cleanBilibiliUrl, getCSRF, getUserID, openLinkToNewTab } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'
import { changeUserRelation } from '~/utils/userRelation'
import { canFavoriteVideo } from '~/utils/videoFavoriteSelection'

import type { Video } from '../types'
import { isBangumiVideo } from '../utils'
import BlockUserConfirmDialog from './components/BlockUserConfirmDialog.vue'
import DislikeDialog from './components/DislikeDialog.vue'
import FavoriteVideoDialog from './components/FavoriteVideoDialog.vue'
import FollowUserConfirmDialog from './components/FollowUserConfirmDialog.vue'
import UnfollowUserConfirmDialog from './components/UnfollowUserConfirmDialog.vue'

export interface VideoCardContextMenuExtraOption {
  key: string
  name: string
  icon: string
  color?: string
  run: () => void
}

const props = withDefaults(defineProps<{
  video: Video
  contextMenuStyles: CSSProperties
  isFollowingPage?: boolean
  /** Membership from `topBarStore`; `undefined` while it is still being confirmed. */
  watchLater?: { added: boolean | undefined, toggle: () => void }
  /** Layout region under the pointer; adds "edit layout" and "open setting". */
  layoutTarget?: ReturnType<typeof findLayoutEditableTarget>
  extraGroups?: VideoCardContextMenuExtraOption[][]
}>(), {
  isFollowingPage: false,
  extraGroups: () => [],
})
const emit = defineEmits<{
  (event: 'removed', selectedOpt?: AppFeedFeedbackSelection): void
  (event: 'close'): void
}>()
const menuListRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)
let closeRequested = false
let observedVisualViewport: VisualViewport | null = null

// Edge blurs show only while more of the list lies beyond that edge.
function handleScroll() {
  if (!menuListRef.value)
    return

  const { scrollTop, scrollHeight, clientHeight } = menuListRef.value
  canScrollUp.value = scrollTop > 0
  canScrollDown.value = scrollTop < scrollHeight - clientHeight - 5 // 5px 容差
}

// Collapsed advanced items stay mounted for the height animation but are inert.
function getMenuItems() {
  return Array.from(menuListRef.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    .filter(item => !item.closest('[inert]'))
}
function focusMenuItem(index: number) {
  const items = getMenuItems()
  if (items.length === 0)
    return
  const nextIndex = (index + items.length) % items.length
  items[nextIndex]?.focus({ preventScroll: true })
  items[nextIndex]?.scrollIntoView({ block: 'nearest' })
}

function handleMenuKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229)
    return
  const items = getMenuItems()
  if (items.length === 0)
    return
  const eventTarget = event.target instanceof Element
    ? event.target.closest<HTMLElement>('[role="menuitem"]')
    : null
  const currentIndex = eventTarget ? items.indexOf(eventTarget) : -1

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      focusMenuItem(currentIndex + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      focusMenuItem(currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
      break
    case 'Home':
      event.preventDefault()
      focusMenuItem(0)
      break
    case 'End':
      event.preventDefault()
      focusMenuItem(items.length - 1)
      break
    case 'Enter':
    case ' ':
      event.stopPropagation()
      break
    case 'Escape':
      event.preventDefault()
      handleClose()
      break
  }
}

const getVideoType = inject<() => string>('getVideoType')!

const { t } = useI18n()
const toast = useToast()
const topBarStore = useTopBarStore()
const { batchQueryUserRelations } = useUserRelations()
const currentAccountId = computed(() => resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid))
let relationPending = false
let disposed = false
const showContextMenu = ref<boolean>(false)
const showDislikeDialog = ref<boolean>(false)
const showBlockUserDialog = ref<boolean>(false)
const showFollowUserDialog = ref<boolean>(false)
const showUnfollowUserDialog = ref<boolean>(false)
const showFavoriteDialog = ref(false)
const showPipWindow = ref<boolean>(false)
const loadingWebDislike = ref<boolean>(false)
const { openLayoutEditorSetting } = useBewlyApp()

interface MenuItem { key: string, name: string, icon: string, color?: string, run: () => void }
type ConfigurableItem = Omit<MenuItem, 'key'> & { key: VideoCardContextMenuKey }

function closeThen(action: () => void) {
  return () => {
    action()
    handleClose()
  }
}

function getAuthorFollowed() {
  return Array.isArray(props.video.author) ? props.video.author[0]?.followed : props.video.author?.followed
}

// Every configurable item, grouped in display order. The settings list decides
// which ones fold under “更多操作”; nothing is hidden outright.
const configurableGroups = computed((): ConfigurableItem[][] => {
  const video = props.video
  const type = getVideoType()
  const isMedia = type === 'bangumi' || type === 'live' || isBangumiVideo(video)
  const authorMid = getAuthorMid()
  const recommendation: ConfigurableItem[] = video.recommendationSource === 'app'
    ? getAppFeedFeedbackTarget(video) && (video.threePointV2 ?? []).some(option => (option.type === ThreePointV2Type.Dislike || option.type === ThreePointV2Type.Feedback) && option.reasons?.length)
      ? [{ key: 'notInterested', name: t('video_card.operation.not_interested'), icon: 'i-tabler:mood-sad', run: openAppDislikeDialog }]
      : []
    : video.recommendationSource === 'web'
      ? [
          { key: 'notInterested', name: t('video_card.operation.not_interested'), icon: 'i-tabler:mood-sad', run: () => handleWebDislike(1) },
          { key: 'notInterestedUploader', name: t('video_card.operation.not_interested_uploader'), icon: 'i-tabler:mood-sad', run: () => handleWebDislike(2) },
        ]
      : []
  const followed = getAuthorFollowed()
  const isFollowed = followed === true || (props.isFollowingPage && followed !== false)
  return [
    recommendation,
    [
      ...(props.watchLater
        ? [props.watchLater.added
            ? { key: 'watchLater' as const, name: t('common.remove_from_watch_later'), icon: 'i-tabler:playlist-x', run: closeThen(props.watchLater.toggle) }
            : { key: 'watchLater' as const, name: t(props.watchLater.added === undefined ? 'common.save_to_watch_later' : 'common.add_to_watch_later'), icon: 'i-tabler:playlist-add', run: closeThen(props.watchLater.toggle) }]
        : []),
      ...(!isMedia && canFavoriteVideo(video)
        ? [{ key: 'favorite' as const, name: t('video_card.operation.favorite'), icon: 'i-tabler:star', run: openFavoriteDialog }]
        : []),
    ],
    video.url
      ? [
          { key: 'openInNewTab', name: t('video_card.operation.open_in_new_tab'), icon: 'i-tabler:layout-bottombar', run: closeThen(() => openLinkToNewTab(video.url!)) },
          { key: 'openInBackground', name: t('video_card.operation.open_in_background'), icon: 'i-tabler:layout-bottombar', run: closeThen(() => openLinkInBackground(video.url!)) },
          { key: 'openInNewWindow', name: t('documentPictureInPicture' in window ? 'video_card.operation.open_in_pip_window' : 'video_card.operation.open_in_new_window'), icon: 'i-tabler:maximize', run: () => showPipWindow.value = true },
          { key: 'openInCurrentTab', name: t('video_card.operation.open_in_current_tab'), icon: 'i-tabler:layout-bottombar', run: closeThen(() => window.open(video.url, '_self')) },
        ]
      : [],
    [
      ...(video.url
        ? [
            { key: 'copyVideoLink' as const, name: t('video_card.operation.copy_video_link'), icon: 'i-tabler:link', run: closeThen(copyCleanLink) },
            { key: 'copyOriginalLink' as const, name: t('video_card.operation.copy_original_link'), icon: 'i-tabler:copy', run: closeThen(() => void navigator.clipboard.writeText(video.url!)) },
          ]
        : []),
      ...(!isMedia && video.bvid
        ? [{ key: 'copyBVNumber' as const, name: t('video_card.operation.copy_bv_number'), icon: 'i-tabler:copy', run: closeThen(() => void navigator.clipboard.writeText(video.bvid!)) }]
        : []),
      ...(!isMedia && video.id
        ? [{ key: 'copyAVNumber' as const, name: t('video_card.operation.copy_av_number'), icon: 'i-tabler:copy', run: closeThen(() => void navigator.clipboard.writeText(`av${video.id}`)) }]
        : []),
    ],
    video.cover
      ? [{ key: 'viewOriginalCover', name: t('video_card.operation.view_the_original_cover'), icon: 'i-tabler:photo', run: closeThen(() => window.open(video.cover, '_blank')) }]
      : [],
    [
      // Follow state is known when passed in, or implied on the Following page.
      ...(authorMid && (followed !== undefined || props.isFollowingPage)
        ? [isFollowed
            ? { key: 'followUser' as const, name: t('video_card.operation.unfollow_user'), icon: 'i-tabler:user-minus', run: openUnfollowUserConfirmDialog }
            : { key: 'followUser' as const, name: t('video_card.operation.follow_user'), icon: 'i-tabler:user-plus', run: openFollowUserConfirmDialog }]
        : []),
      // Without an author mid a block request would be invalid.
      ...(authorMid
        ? [{ key: 'blockUser' as const, name: t('video_card.operation.block_user'), icon: 'i-tabler:user-cancel', color: 'text-$bew-error-color', run: openBlockUserConfirmDialog }]
        : []),
    ],
  ]
})

const layoutGroup = computed((): MenuItem[] => {
  const target = props.layoutTarget
  if (!target)
    return []
  return [
    { key: 'layout:edit', name: t('layout_editor.edit_layout'), icon: 'i-tabler:edit', run: closeThen(() => enterLayoutEditMode(target.descriptor.id)) },
    { key: 'layout:setting', name: t('layout_editor.open_setting'), icon: 'i-tabler:settings', run: closeThen(() => openLayoutEditorSetting(target.descriptor.settingId, target.element.getBoundingClientRect())) },
  ]
})

const advancedKeys = computed(() => new Set<string>(settings.value.videoCardContextMenuAdvanced))
const menuGroups = computed(() => {
  const extra = props.extraGroups.map(group => group.map(option => ({ ...option, run: closeThen(option.run) })))
  const main = configurableGroups.value.map(group => group.filter(item => !advancedKeys.value.has(item.key)))
  return [...main, ...extra, layoutGroup.value].filter(group => group.length > 0)
})
const advancedGroups = computed(() => configurableGroups.value
  .map(group => group.filter(item => advancedKeys.value.has(item.key)))
  .filter(group => group.length > 0))

const advancedOpen = ref(false)
const advancedOuterRef = ref<HTMLElement | null>(null)
const advancedInnerRef = ref<HTMLElement | null>(null)
const { height: advancedHeight, onTransitionEnd: handleAdvancedTransitionEnd } = useMeasuredDisclosure(advancedOuterRef, advancedInnerRef, advancedOpen, () => {}, () => {})

// 在菜单显示后检查边缘模糊状态
watch(() => showContextMenu.value, (newVal) => {
  if (newVal) {
    nextTick(() => {
      handleScroll()
    })
  }
})

// 监听菜单列表尺寸变化（含高级选项展开），确保边缘模糊状态正确
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const mid = getAuthorMid()
  if (mid)
    void batchQueryUserRelations([mid])
  window.addEventListener('resize', handleViewportResize)
  observedVisualViewport = window.visualViewport
  observedVisualViewport?.addEventListener('resize', handleViewportResize)
  showContextMenu.value = true
  nextTick(() => {
    handleScroll()
    focusMenuItem(0)

    // 监听菜单列表的尺寸变化
    if (menuListRef.value) {
      resizeObserver = new ResizeObserver(() => {
        handleScroll()
      })
      resizeObserver.observe(menuListRef.value)
    }
  })
})

onUnmounted(() => {
  disposed = true
  window.removeEventListener('resize', handleViewportResize)
  observedVisualViewport?.removeEventListener('resize', handleViewportResize)
  observedVisualViewport = null
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

function getAuthorMid() {
  if (!props.video.author)
    return undefined

  return Array.isArray(props.video.author)
    ? props.video.author[0]?.mid
    : props.video.author.mid
}

async function submitWebDislike(command: number) {
  const csrf = getCSRF()
  const authorMid = getAuthorMid()

  if (!csrf || !props.video.id || !authorMid)
    return

  if (loadingWebDislike.value)
    return

  loadingWebDislike.value = true

  try {
    const response = await api.video.webDislikeVideo({
      goto: props.video.goto || 'av',
      id: props.video.id,
      mid: authorMid,
      track_id: props.video.trackId || '',
      reason_id: command,
      csrf,
    })

    if (response.code !== 0)
      console.warn('Web dislike request failed:', response.message)
  }
  catch (error) {
    console.warn('Web dislike request error:', error)
  }
  finally {
    loadingWebDislike.value = false
  }
}

function handleWebDislike(command: number) {
  handleRemoved()
  void submitWebDislike(command)
}

// "复制链接" always copies the cleaned link (optionally titled); the raw link is a separate item.
function copyCleanLink() {
  const cleanUrl = cleanBilibiliUrl(props.video.url!)
  void navigator.clipboard.writeText(settings.value.cleanShareLinkIncludeTitle && props.video.title
    ? `${props.video.title} ${cleanUrl}`
    : cleanUrl)
}

function openFavoriteDialog() {
  showFavoriteDialog.value = true
  showContextMenu.value = false
}

function openAppDislikeDialog() {
  showDislikeDialog.value = true
  showContextMenu.value = false
}

function openFollowUserConfirmDialog() {
  showFollowUserDialog.value = true
  showContextMenu.value = false
}

function openUnfollowUserConfirmDialog() {
  showUnfollowUserDialog.value = true
  showContextMenu.value = false
}

function openBlockUserConfirmDialog() {
  showBlockUserDialog.value = true
  showContextMenu.value = false
}

function handleClose() {
  if (closeRequested)
    return
  closeRequested = true
  showContextMenu.value = false
  showPipWindow.value = false
  emit('close')
}

function handleViewportResize() {
  if (!showFavoriteDialog.value)
    handleClose()
}

function handleReopen() {
  handleClose()
}

function handleRemoved(selectedOpt?: AppFeedFeedbackSelection) {
  emit('removed', selectedOpt)
  handleClose()
}

async function writeRelation(act: 1 | 2 | 5) {
  if (relationPending)
    return
  const accountId = currentAccountId.value
  const authorMid = getAuthorMid()
  const videoId = props.video.id
  if (accountId === null || !authorMid) {
    toast.warning(t('common.please_log_in_first'))
    return
  }
  relationPending = true
  try {
    const response = await changeUserRelation(accountId, authorMid, act)
    if (accountId !== currentAccountId.value || String(getUserID()) !== String(accountId))
      return
    if (response.code !== 0)
      throw new Error(response.message || t('common.operation_failed'))
    toast.success(t('common.operation_completed'))
    if (!disposed && props.video.id === videoId && getAuthorMid() === authorMid)
      handleClose()
  }
  catch (error) {
    if (accountId === currentAccountId.value && String(getUserID()) === String(accountId))
      toast.error(error instanceof Error ? error.message : t('common.operation_failed'))
  }
  finally {
    relationPending = false
  }
}

const blockUser = () => writeRelation(5)
const followUser = () => writeRelation(1)
const unfollowUser = () => writeRelation(2)
</script>

<template>
  <div>
    <div v-if="showContextMenu">
      <div
        :style="contextMenuStyles"
        class="context-menu-container bew-popover-surface"
      >
        <ul
          ref="menuListRef"
          role="menu"
          :aria-label="$t('video_card.operation.more_options')"
          class="context-menu-list"
          @scroll="handleScroll"
          @keydown="handleMenuKeydown"
        >
          <template v-for="(optionGroup, index) in menuGroups" :key="optionGroup[0].key">
            <li v-if="index" role="separator" class="divider" />
            <li v-for="option in optionGroup" :key="option.key" role="presentation">
              <button
                type="button" class="context-menu-item" :class="option.color" role="menuitem" tabindex="-1"
                @click="option.run"
              >
                <i class="item-icon" :class="[option.icon, option.color]" aria-hidden="true" />
                {{ option.name }}
              </button>
            </li>
          </template>

          <template v-if="advancedGroups.length">
            <li role="separator" class="divider" />
            <li role="presentation">
              <button
                type="button" class="context-menu-item context-menu-advanced-toggle" role="menuitem" tabindex="-1"
                :aria-expanded="advancedOpen"
                @click="advancedOpen = !advancedOpen"
              >
                <i class="item-icon i-tabler:adjustments-horizontal" aria-hidden="true" />
                {{ $t('video_card.operation.advanced_options') }}
                <ChevronIcon class="context-menu-advanced-chevron" :direction="advancedOpen ? 'up' : 'down'" />
              </button>
            </li>
            <li
              ref="advancedOuterRef"
              role="presentation"
              class="context-menu-advanced"
              :class="{ 'is-open': advancedOpen }"
              :style="{ height: advancedHeight === undefined ? undefined : `${advancedHeight}px` }"
              :inert="!advancedOpen"
              @transitionend="handleAdvancedTransitionEnd($event); handleScroll()"
            >
              <ul ref="advancedInnerRef" role="presentation" class="context-menu-advanced__inner">
                <template v-for="(optionGroup, index) in advancedGroups" :key="optionGroup[0].key">
                  <li v-if="index" role="separator" class="divider" />
                  <li v-for="option in optionGroup" :key="option.key" role="presentation">
                    <button
                      type="button" class="context-menu-item" :class="option.color" role="menuitem" tabindex="-1"
                      @click="option.run"
                    >
                      <i class="item-icon" :class="[option.icon, option.color]" aria-hidden="true" />
                      {{ option.name }}
                    </button>
                  </li>
                </template>
              </ul>
            </li>
          </template>
        </ul>

        <!-- Gradient blur where the list is cut off; no arrow buttons. -->
        <ProgressiveBlur class="context-menu-edge context-menu-edge--top" edge="top" :visible="canScrollUp" />
        <ProgressiveBlur class="context-menu-edge context-menu-edge--bottom" edge="bottom" :visible="canScrollDown" />
      </div>
    </div>

    <!-- mask -->
    <div
      v-if="showContextMenu"
      aria-hidden="true"
      pos="fixed top-0 left-0" w-full h-full
      style="z-index: var(--bew-z-context-backdrop);"
      @click="handleClose"
      @click.right.prevent.stop="handleReopen"
    />

    <FavoriteVideoDialog v-if="showFavoriteDialog" :video="video" @close="handleClose" />

    <DislikeDialog
      v-if="showDislikeDialog"
      v-model="showDislikeDialog"
      :video="video"
      @close="handleClose"
      @removed="handleRemoved"
    />

    <FollowUserConfirmDialog
      v-if="showFollowUserDialog"
      v-model="showFollowUserDialog"
      :video="video"
      @close="handleClose"
      @confirm="followUser"
    />

    <UnfollowUserConfirmDialog
      v-if="showUnfollowUserDialog"
      v-model="showUnfollowUserDialog"
      :video="video"
      @close="handleClose"
      @confirm="unfollowUser"
    />

    <BlockUserConfirmDialog
      v-if="showBlockUserDialog"
      v-model="showBlockUserDialog"
      :video="video"
      @close="handleClose"
      @confirm="blockUser"
    />

    <PipWindow
      v-if="showPipWindow && video.url"
      :url="video.url"
      @close="handleClose"
    />
  </div>
</template>

<style lang="scss" scoped>
.context-menu-item {
  --uno: "rounded-$bew-interactive-radius cursor-pointer";
  --uno: "flex items-center";

  box-sizing: border-box;
  width: 100%;
  text-align: start;
  min-height: var(--bew-popover-row-min-height);
  padding: var(--bew-space-2) var(--bew-space-3);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover,
  &:focus-visible {
    background: var(--bew-fill-2);
  }

  &:focus-visible {
    outline: var(--bew-focus-ring);
  }

  &:active {
    background: var(--bew-fill-3);
  }
}

.item-icon {
  --uno: "inline-block color-$bew-text-color-2";

  margin-right: var(--bew-space-2);
}

.divider {
  --uno: "w-full h-1px px-2px bg-$bew-border-color";
  flex: none;
}

// Same frosted glass as the other overlays outside a glass parent: the shared
// translucent surface, the global blur token and the glass surface border.
// The glass lives on a background layer, not the container: a container with
// backdrop-filter would hide the page from the edge blurs inside it.
.context-menu-container {
  position: fixed;
  width: min(240px, calc(100vw - var(--bew-space-4)));
  max-height: min(406px, calc(100vh - var(--bew-space-4)));
  display: flex;
  flex-direction: column;
  // 8px items across the popover inset sit concentric with its 16px corner.
  padding: var(--bew-popover-padding);
  // A superellipse overflow clip on an ancestor makes Chromium drop the edge
  // layers' gradient masks. The surface, list and blur layers clip themselves.
  z-index: var(--bew-z-popover);
  background: transparent;
  animation: bew-context-menu-enter var(--bew-duration-fast) var(--bew-ease-standard) both;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    corner-shape: inherit;
    background: var(--bew-popover-surface-background);
    backdrop-filter: var(--bew-filter-glass-1);
  }
}

.context-menu-list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  min-height: 0;
  max-height: 100%;
  margin: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  padding: 0;
  list-style: none;
  > li {
    flex: none;
  }

  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.context-menu-advanced-chevron {
  width: var(--bew-icon-size-xs);
  height: var(--bew-icon-size-xs);
  margin-left: auto;
  color: var(--bew-text-3);
}

// Measured disclosure (useMeasuredDisclosure): only the clipped outer height animates.
.context-menu-advanced {
  display: block;
  height: 0;
  overflow: clip;
  transition: height var(--bew-duration-normal) var(--bew-ease-standard);
}

.context-menu-advanced.is-open {
  height: auto;
}

.context-menu-advanced__inner {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  margin: 0;
  padding: var(--bew-space-1) 0 0;
  list-style: none;
}

// Gradient blur over the cut-off rows (a user-requested exception to "no glass on
// glass"; it samples only the menu's own content).
.context-menu-edge {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 1;
  height: var(--bew-space-10);
  border-radius: inherit;
  corner-shape: inherit;
}

.context-menu-edge--top {
  top: 0;
}

.context-menu-edge--bottom {
  bottom: 0;
}

// Scale only: a glass surface is never faded.
@keyframes bew-context-menu-enter {
  from {
    transform: scale(0.98);
  }

  to {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .context-menu-container {
    animation: none;
  }

  .context-menu-advanced {
    transition: none;
  }
}
</style>
