<script setup lang="ts">
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import VideoWatchedTag from '~/components/VideoWatchedTag.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { BEWLY_NATIVE_USER_PROFILE_RELEASE, BEWLY_NATIVE_USER_PROFILE_REQUEST } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { computeFloatingMenuPosition } from '~/utils/floatingMenu'
import { supportsWideMomentCardLayout } from '~/utils/momentCardLayout'
import { isMomentDescriptionOverflowing } from '~/utils/momentDescription'

import type { Author, Video } from '../VideoCard/types'
import VideoCardContextMenu from '../VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue'
import MomentCommentSection from './MomentCommentSection.vue'
import MomentForwardComposer from './MomentForwardComposer.vue'
import type { MomentDisclosure } from './momentForwardContent'
import {
  getCachedMomentDisclosure,
  normalizeForwardCount,
  setCachedMomentDisclosure,
  toggleMomentDisclosure,
} from './momentForwardContent'
import MomentVote from './MomentVote.vue'
import type { DisplayForwardVideo, DisplayMoment, WatchLaterTarget } from './types'
import {
  formatCount,
  getAvatarThumbnailUrl,
  getCardPreviewText,
  getMomentThumbnailUrl,
  getWatchLaterStateKey,
  isCompactPlainTextMoment,
} from './utils'

interface Props {
  moment: DisplayMoment
  cardWidth?: number
  ready?: boolean
  entering?: boolean
  previewActive?: boolean
  previewUrl?: string
  imageRatio?: number
  isLikeLoading?: boolean
  isReservationLoading?: boolean
  isWatchLaterAdded: (target: WatchLaterTarget) => boolean
  isWatchLaterLoading: (target: WatchLaterTarget) => boolean
}

const {
  moment,
  cardWidth = 520,
  ready = false,
  entering = false,
  previewActive = false,
  previewUrl = '',
  imageRatio = 1,
  isLikeLoading = false,
  isReservationLoading = false,
  isWatchLaterAdded,
  isWatchLaterLoading,
} = defineProps<Props>()

const emit = defineEmits<{
  cardElement: [element: HTMLElement | null]
  openDetail: [moment: DisplayMoment, forceDialog?: boolean]
  mediaEnter: [moment: DisplayMoment]
  mediaLeave: [moment: DisplayMoment]
  coverLoad: [event: Event, momentId: string]
  previewVideo: [element: Element | null, moment: DisplayMoment]
  previewCanplay: [event: Event]
  forwardVideoClick: [video: DisplayForwardVideo]
  toggleWatchLater: [target: WatchLaterTarget]
  toggleLike: [moment: DisplayMoment]
  toggleReservation: [moment: DisplayMoment]
  openImagePreview: [images: string[], index: number, trigger: HTMLElement]
  interactiveResize: []
  forwardCountChange: [momentId: string, forwardCount: number]
}>()

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()
const topBarStore = useTopBarStore()

const cardLayoutStyles = computed<CSSProperties>(() => {
  const scale = Math.max(1, cardWidth / 520)
  return {
    '--moment-card-text-cover-min-height': `${Math.round(176 * scale)}px`,
  } as CSSProperties
})

// The shared context menu expects the same video shape as VideoCard. A dynamic
// video without a stable aid is intentionally left without a menu instead of
// manufacturing an id that could make copy/dislike actions target the wrong
// video.
function getMenuVideo(source: {
  aid?: number | string
  bvid?: string
  title: string
  cover: string
  duration?: string
  play?: string
  danmaku?: string
  url?: string
  author?: Author
}) {
  const aid = Number(source.aid || 0)
  if (!Number.isFinite(aid) || aid <= 0)
    return null

  const url = source.url
    || (source.bvid ? `https://www.bilibili.com/video/${source.bvid}` : `https://www.bilibili.com/video/av${aid}`)
  if (!url)
    return null

  return {
    id: aid,
    aid,
    bvid: source.bvid,
    title: source.title,
    cover: source.cover,
    durationStr: source.duration,
    viewStr: source.play,
    danmakuStr: source.danmaku,
    url,
    author: source.author,
    threePointV2: [],
  } satisfies Video
}

const menuVideo = computed<Video | null>(() => {
  if (!moment.isVideo || moment.isLive)
    return null

  return getMenuVideo({
    aid: moment.aid,
    bvid: moment.bvid,
    title: moment.title || t('moment_card.video_moment'),
    cover: moment.images[0] || moment.chargeCover || '',
    duration: moment.duration,
    play: moment.videoPlay,
    danmaku: moment.videoDanmaku,
    url: moment.videoUrl,
    author: {
      name: moment.author.name,
      authorFace: getAvatarThumbnailUrl(moment.author.face),
      mid: Number(moment.author.mid) || undefined,
    },
  })
})

const menuButtonLabel = computed(() => menuVideo.value
  ? t('video_card.operation.more_options')
  : '')

const showVideoOptions = ref(false)
const videoOptionsFloatingStyles = ref<CSSProperties>({})
const moreBtnRef = ref<HTMLButtonElement | null>(null)
const authorAvatarLinkRef = ref<HTMLAnchorElement | null>(null)
const getDisclosureCacheKey = () => `${topBarStore.userInfo.mid || 'guest'}:${moment.id}`
const disclosure = ref<MomentDisclosure>(getCachedMomentDisclosure(getDisclosureCacheKey()))
const displayedDisclosure = ref<MomentDisclosure>(disclosure.value)
const forwardComposerMounted = ref(disclosure.value === 'forward')
const displayedForwardCount = ref(normalizeForwardCount(moment.forwardCount))
const commentExpanded = computed(() => disclosure.value === 'comments')
const forwardExpanded = computed(() => disclosure.value === 'forward')
const canExpandComments = computed(() => Boolean(moment.id && !moment.isLive))
const commentSectionId = computed(() => `moment-comment-section-${moment.id}`)
const forwardSectionId = computed(() => `moment-forward-section-${moment.id}`)
const descriptionRef = ref<HTMLElement | null>(null)
const descriptionExpanded = ref(false)
const descriptionCanToggle = ref(false)
const descriptionId = computed(() => `moment-description-${moment.id}`)
const descriptionPreviewText = computed(() => getCardPreviewText(moment))
const hasUserDescription = computed(() => Boolean(
  !moment.descInherited
  && !moment.isChargeExclusive
  && (moment.richText.length || moment.text.trim()),
))
let descriptionResizeObserver: ResizeObserver | null = null
let descriptionMeasureFrame = 0
const primaryActionLabel = computed(() => moment.isVideo && !moment.isLive
  ? t('moment_card.open_new_tab')
  : t('moment_card.open_detail', { author: moment.author.name }))

const isReservationAdditional = computed(() => Boolean(
  moment.additional?.reservationId
  && (moment.additional.isVideoReservation || moment.additional.isLiveReservation),
))
const supportsWideCardLayout = computed(() => supportsWideMomentCardLayout(moment))

const reservationActionLabel = computed(() => moment.additional?.isReserved
  ? t('moment_card.cancel_reservation')
  : t('moment_card.reserve'))
const forwardSingleImageStyle = computed<CSSProperties | undefined>(() => {
  if (moment.forward?.images?.length !== 1)
    return undefined
  const ratio = moment.forward.imageRatios?.[0]
  const normalizedRatio = typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0
    ? Math.min(2, Math.max(0.5, ratio))
    : 1
  return { '--moment-forward-single-image-ratio': normalizedRatio } as CSSProperties
})

// VideoCard positions its menu from the trigger and teleports the shared menu
// into the app root. Keep the same positioning behavior for MomentCard.
function handleMoreBtnClick(event: Event) {
  event.stopPropagation()
  event.preventDefault()

  if (!menuVideo.value || !moreBtnRef.value)
    return

  const anchor = moreBtnRef.value.getBoundingClientRect()
  const position = computeFloatingMenuPosition(anchor, window.innerWidth, window.innerHeight)
  showVideoOptions.value = false
  videoOptionsFloatingStyles.value = {
    position: 'fixed',
    top: position.top,
    bottom: position.bottom,
    left: position.left,
    width: position.width,
    maxHeight: position.maxHeight,
    transformOrigin: position.direction === 'up' ? 'bottom right' : 'top right',
  }
  showVideoOptions.value = true
}

function closeVideoOptions() {
  showVideoOptions.value = false
  void nextTick(() => moreBtnRef.value?.focus())
}

function openPrimaryDetail() {
  emit('openDetail', moment)
}

function getForwardOriginMoment(): DisplayMoment | null {
  const forward = moment.forward
  if (!forward?.url)
    return null

  const images = forward.images || []
  return {
    id: forward.id || forward.url,
    author: {
      mid: forward.authorMid,
      name: forward.author,
      face: '',
    },
    publishedAt: moment.publishedAt,
    title: forward.title,
    text: forward.text,
    richText: [],
    images,
    imageRatios: forward.imageRatios,
    time: '',
    likeCount: 0,
    isLiked: false,
    isLikeDisabled: true,
    commentCount: 0,
    forwardCount: 0,
    url: forward.url,
    isVideo: false,
    isRegularVideo: false,
    isUgcSeason: false,
    isDraw: images.length > 0,
    isPgc: false,
    isLive: false,
    isChargeExclusive: false,
    // Origin opened from an embedded reference stays in the native/plain path;
    // the iframe layout must not attempt another forwarded-card reconstruction.
    isForward: true,
    isArticle: forward.isArticle,
    isUpRecommendation: false,
    isVideoReservation: false,
    isLiveReservation: false,
    mediaMeta: '',
    liveArea: '',
    livePopularity: '',
    duration: '',
    videoPlay: '',
    videoDanmaku: '',
  }
}

function handleForwardOriginClick(event: MouseEvent) {
  event.stopPropagation()
  emit('openDetail', getForwardOriginMoment() || moment)
}

function handleForwardOriginKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' '))
    return
  event.preventDefault()
  event.stopPropagation()
  emit('openDetail', getForwardOriginMoment() || moment)
}

function setDisclosure(target: Exclude<MomentDisclosure, 'none'>) {
  closeVideoOptions()
  const nextDisclosure = toggleMomentDisclosure(disclosure.value, target)
  if (nextDisclosure === 'forward')
    forwardComposerMounted.value = true
  disclosure.value = nextDisclosure
  emit('interactiveResize')
}

function toggleComments() {
  if (canExpandComments.value)
    setDisclosure('comments')
}

function toggleForward() {
  setDisclosure('forward')
}

function closeForwardComposer() {
  if (disclosure.value === 'forward') {
    disclosure.value = 'none'
    emit('interactiveResize')
  }
}

function measureDescriptionOverflow() {
  const element = descriptionRef.value
  if (!element || !hasUserDescription.value) {
    const wasExpanded = descriptionExpanded.value
    descriptionExpanded.value = false
    descriptionCanToggle.value = false
    if (wasExpanded)
      emit('interactiveResize')
    return
  }

  if (descriptionExpanded.value)
    element.dataset.descriptionMeasureCollapsed = ''
  const canToggle = isMomentDescriptionOverflowing(element)
  delete element.dataset.descriptionMeasureCollapsed

  descriptionCanToggle.value = canToggle
  if (!canToggle && descriptionExpanded.value) {
    descriptionExpanded.value = false
    emit('interactiveResize')
  }
}

function scheduleDescriptionOverflowMeasure() {
  if (descriptionMeasureFrame)
    return
  descriptionMeasureFrame = window.requestAnimationFrame(() => {
    descriptionMeasureFrame = 0
    measureDescriptionOverflow()
  })
}

function bindDescription(element: Element | ComponentPublicInstance | null) {
  const next = element instanceof HTMLElement ? element : null
  if (descriptionRef.value === next)
    return

  descriptionResizeObserver?.disconnect()
  descriptionRef.value = next
  if (!next)
    return

  descriptionResizeObserver ??= new ResizeObserver(scheduleDescriptionOverflowMeasure)
  descriptionResizeObserver.observe(next)
  scheduleDescriptionOverflowMeasure()
}

function toggleDescription() {
  if (!descriptionCanToggle.value)
    return
  descriptionExpanded.value = !descriptionExpanded.value
  emit('interactiveResize')
  void nextTick(scheduleDescriptionOverflowMeasure)
}

function syncDisplayedDisclosure(value: MomentDisclosure) {
  if (value !== 'none') {
    displayedDisclosure.value = value
    return
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    displayedDisclosure.value = 'none'
}

function handleDisclosureTransitionEnd(event: TransitionEvent) {
  if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows')
    return
  if (disclosure.value === 'none')
    displayedDisclosure.value = 'none'
}

function handleForwardSubmitted(nextForwardCount: number) {
  const normalizedCount = normalizeForwardCount(nextForwardCount)
  displayedForwardCount.value = normalizedCount
  emit('forwardCountChange', moment.id, normalizedCount)
}

watch(
  () => moment.forwardCount,
  forwardCount => displayedForwardCount.value = normalizeForwardCount(forwardCount),
)

watch(disclosure, (value) => {
  setCachedMomentDisclosure(getDisclosureCacheKey(), value)
  syncDisplayedDisclosure(value)
})

watch(
  [() => moment.id, () => topBarStore.userInfo.mid],
  () => {
    disclosure.value = getCachedMomentDisclosure(getDisclosureCacheKey())
    displayedDisclosure.value = disclosure.value
    forwardComposerMounted.value = disclosure.value === 'forward'
    displayedForwardCount.value = normalizeForwardCount(moment.forwardCount)
    emit('interactiveResize')
  },
)

watch(
  () => moment.id,
  () => {
    descriptionExpanded.value = false
    descriptionCanToggle.value = false
    void nextTick(scheduleDescriptionOverflowMeasure)
  },
)

// VideoCardContextMenu uses this injection to select its common option set.
provide('getVideoType', () => 'common')

function handleCardRef(element: Element | ComponentPublicInstance | null) {
  emit('cardElement', element instanceof HTMLElement ? element : null)
}

function handleCoverLoad(event: Event, imageIndex = 0) {
  if (imageIndex === 0)
    emit('coverLoad', event, moment.id)
}

function handlePreviewVideo(element: Element | ComponentPublicInstance | null) {
  emit('previewVideo', element instanceof Element ? element : null, moment)
}

function handleForwardVideoClick() {
  if (moment.forward?.video)
    emit('forwardVideoClick', moment.forward.video)
}

function handleImagePreview(images: string[], index: number, event: MouseEvent) {
  if (!(event.currentTarget instanceof HTMLElement))
    return
  emit('openImagePreview', images, index, event.currentTarget)
}

function handleCommentImagePreview(images: string[], index: number, trigger: HTMLElement) {
  emit('openImagePreview', images, index, trigger)
}

function getImagePreviewLabel(author: string, index: number) {
  return t('moment_card.preview_image', { author, index: index + 1 })
}

function requestNativeUserProfile(event: MouseEvent) {
  const trigger = event.currentTarget
  if (!(trigger instanceof HTMLAnchorElement))
    return

  trigger.dispatchEvent(new CustomEvent(BEWLY_NATIVE_USER_PROFILE_REQUEST, {
    bubbles: true,
    composed: true,
  }))
}

onBeforeUnmount(() => {
  descriptionResizeObserver?.disconnect()
  descriptionResizeObserver = null
  if (descriptionMeasureFrame)
    cancelAnimationFrame(descriptionMeasureFrame)
  descriptionMeasureFrame = 0
  authorAvatarLinkRef.value?.dispatchEvent(new CustomEvent(BEWLY_NATIVE_USER_PROFILE_RELEASE, {
    bubbles: true,
    composed: true,
  }))
})
</script>

<template>
  <article
    :ref="handleCardRef"
    class="moment-card"
    :class="{
      'moment-card--text': !moment.images.length && !moment.isVideo && !moment.isLive && !moment.isChargeExclusive && !moment.forward?.video,
      'moment-card--compact-text': isCompactPlainTextMoment(moment),
      'moment-card--forward-video': !!moment.forward?.video,
      'moment-card--forward-draw': Boolean(moment.forward?.images?.length),
      'moment-card--charge': moment.isChargeExclusive,
      'moment-card--supports-wide-layout': supportsWideCardLayout,
      'moment-card--wide-single-image': supportsWideCardLayout && !moment.isVideo && !moment.isLive,
      'moment-card--comments-expanded': commentExpanded,
      'moment-card--forward-expanded': forwardExpanded,
      'moment-card--preparing': !ready,
      'moment-card--entering': entering,
    }"
    :style="cardLayoutStyles"
    :data-description-expanded="descriptionExpanded ? 'true' : undefined"
  >
    <button
      type="button"
      class="moment-card__primary-action"
      :aria-label="primaryActionLabel"
      @click="openPrimaryDetail"
    />
    <div class="moment-card__surface">
      <header class="moment-card__header">
        <a
          ref="authorAvatarLinkRef"
          class="moment-card__avatar-link"
          :href="`https://space.bilibili.com/${moment.author.mid}`"
          target="_blank"
          rel="noopener noreferrer"
          :data-user-profile-id="moment.author.mid || undefined"
          data-user-profile-spmid-follow="dynamic.profile.click"
          @click.stop
          @mouseenter="requestNativeUserProfile"
        >
          <img :src="getAvatarThumbnailUrl(moment.author.face)" :alt="moment.author.name" class="moment-card__avatar" loading="lazy" decoding="async">
        </a>
        <span class="moment-card__identity">
          <strong>{{ moment.author.name }}</strong>
          <small>{{ moment.time || t('moment_card.just_now') }}</small>
        </span>
        <button
          v-if="menuVideo"
          ref="moreBtnRef"
          type="button"
          class="moment-card__more-btn"
          :class="{ 'is-open': showVideoOptions }"
          :aria-label="menuButtonLabel"
          aria-haspopup="menu"
          :aria-expanded="showVideoOptions"
          :title="menuButtonLabel"
          @click.stop.prevent="handleMoreBtnClick"
          @keydown.enter.stop.prevent="handleMoreBtnClick"
          @keydown.space.stop.prevent="handleMoreBtnClick"
        >
          <span i-mingcute:more-2-line aria-hidden="true" />
        </button>
      </header>

      <div
        class="moment-card__main"
        :class="{
          'moment-card__main--has-media': (!moment.isChargeExclusive || moment.isVideo) && (
            (moment.images.length > 0 && (moment.isVideo || moment.isLive))
            || (!moment.images.length && (moment.isVideo || moment.isLive))
          ),
          'moment-card__main--video': moment.isVideo || (!moment.isChargeExclusive && moment.isLive),
          'moment-card__main--live': !moment.isChargeExclusive && moment.isLive,
        }"
      >
        <div
          v-if="moment.images.length && (moment.isVideo || moment.isLive)"
          class="moment-card__media moment-card__cover moment-card__cover--media"
          @mouseenter="emit('mediaEnter', moment)"
          @mouseleave="emit('mediaLeave', moment)"
          @click="openPrimaryDetail"
        >
          <img
            :src="getMomentThumbnailUrl(moment.images[0])"
            :alt="moment.title"
            :class="{ 'is-ready': ready }"
            loading="lazy"
            decoding="async"
            @load="handleCoverLoad"
          >
          <video
            v-if="previewActive && previewUrl"
            :ref="handlePreviewVideo"
            :src="moment.isLive ? undefined : previewUrl"
            autoplay
            muted
            :loop="!moment.isLive"
            playsinline
            @canplay="emit('previewCanplay', $event)"
          />
          <span
            v-if="moment.isVideo && settings.showVideoCardViewCount && moment.videoPlay"
            class="moment-card__video-stats"
          >
            <span class="moment-card__video-stat-group">
              <span>
                <span i-tabler-player-play aria-hidden="true" />
                {{ moment.videoPlay }}
              </span>
            </span>
          </span>
          <span v-if="moment.isLive" class="moment-card__live-mark">
            LIVE
            <span i-svg-spinners:pulse-3 aria-hidden="true" />
          </span>
          <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
            {{ moment.chargeBadge || t('moment_card.charge_exclusive') }}
          </span>
          <button
            v-if="settings.showVideoCardWatchLater && moment.isVideo && !moment.isLive"
            type="button"
            class="moment-card__watch-later"
            :class="{ 'is-added': isWatchLaterAdded(moment) }"
            :disabled="isWatchLaterLoading(moment)"
            :aria-label="isWatchLaterAdded(moment) ? t('moment_card.watch_later_added') : t('moment_card.add_watch_later')"
            :aria-pressed="isWatchLaterAdded(moment)"
            :title="isWatchLaterAdded(moment) ? t('moment_card.added') : t('moment_card.watch_later')"
            @click.stop="emit('toggleWatchLater', moment)"
          >
            <span v-if="isWatchLaterLoading(moment)" i-svg-spinners:ring-resize aria-hidden="true" />
            <span v-else-if="isWatchLaterAdded(moment)" i-line-md:confirm aria-hidden="true" />
            <span v-else i-mingcute:carplay-line aria-hidden="true" />
          </button>
        </div>
        <div
          v-else-if="(moment.isVideo || moment.isLive) && (!moment.isChargeExclusive || moment.isVideo)"
          class="moment-card__media moment-card__cover moment-card__text-cover moment-card__text-cover--video"
          @click="openPrimaryDetail"
        >
          <span v-if="moment.isLive" i-tabler-live-photo class="moment-card__text-cover-icon" />
          <span v-else i-tabler-player-play-filled class="moment-card__text-cover-icon" />
          <span>{{ moment.isLive ? t('moment_card.live_moment') : t('moment_card.video_moment') }}</span>
          <button
            v-if="settings.showVideoCardWatchLater && moment.isVideo && !moment.isLive"
            type="button"
            class="moment-card__watch-later"
            :class="{ 'is-added': isWatchLaterAdded(moment) }"
            :disabled="isWatchLaterLoading(moment)"
            :aria-label="isWatchLaterAdded(moment) ? t('moment_card.watch_later_added') : t('moment_card.add_watch_later')"
            :aria-pressed="isWatchLaterAdded(moment)"
            :title="isWatchLaterAdded(moment) ? t('moment_card.added') : t('moment_card.watch_later')"
            @click.stop="emit('toggleWatchLater', moment)"
          >
            <span v-if="isWatchLaterLoading(moment)" i-svg-spinners:ring-resize aria-hidden="true" />
            <span v-else-if="isWatchLaterAdded(moment)" i-line-md:confirm aria-hidden="true" />
            <span v-else i-mingcute:carplay-line aria-hidden="true" />
          </button>
        </div>

        <div class="moment-card__body">
          <p v-if="moment.title && !moment.forward?.video" class="moment-card__title">
            <VideoWatchedTag
              v-if="moment.isVideo"
              :aid="moment.aid"
              :bvid="moment.bvid"
            />
            {{ moment.title }}
          </p>
          <p
            v-if="moment.mediaMeta && !moment.isChargeExclusive && (!moment.isVideo || moment.isLive)"
            class="moment-card__media-meta"
            :class="{ 'moment-card__media-meta--live': moment.isLive }"
          >
            {{ moment.mediaMeta }}
          </p>
          <div
            v-if="!moment.isLive && (moment.richText.length || descriptionPreviewText)"
            class="moment-card__description"
            :class="{ 'moment-card__description--inherited': moment.descInherited }"
          >
            <p
              :id="descriptionId"
              :ref="bindDescription"
              class="moment-card__desc"
              :class="{
                'is-expanded': descriptionExpanded,
                'moment-card__desc--inherited': moment.descInherited,
              }"
            >
              <template v-if="!moment.descInherited && moment.richText.length">
                <template v-for="(segment, segmentIndex) in moment.richText" :key="`${moment.id}-${segmentIndex}`">
                  <img
                    v-if="segment.type === 'emoji' && segment.imageUrl"
                    :src="segment.imageUrl"
                    :alt="segment.text"
                    :title="segment.text"
                    class="moment-card__emoji"
                    :class="{ 'moment-card__emoji--large': segment.size === 2 }"
                    loading="lazy"
                    decoding="async"
                  >
                  <a
                    v-else-if="segment.type === 'link' && segment.url"
                    :href="segment.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="moment-card__rich-link"
                    @click.stop
                  >
                    {{ segment.text }}
                  </a>
                  <template v-else>
                    {{ segment.text }}
                  </template>
                </template>
              </template>
              <template v-else>
                {{ descriptionPreviewText }}
              </template>
            </p>
            <button
              v-if="descriptionCanToggle"
              type="button"
              class="moment-card__description-toggle"
              :aria-controls="descriptionId"
              :aria-expanded="descriptionExpanded"
              @click.stop="toggleDescription"
            >
              {{ t(descriptionExpanded ? 'moment_card.collapse_text' : 'moment_card.expand_text') }}
            </button>
          </div>
          <div
            v-if="moment.forward?.video"
            class="moment-card__forward-video"
          >
            <span class="moment-card__forward-video-cover">
              <a
                :href="moment.forward.video.url || undefined"
                target="_blank"
                rel="noopener noreferrer"
                class="moment-card__forward-video-cover-link"
                :aria-label="t('moment_card.open_original_video', { title: moment.forward.video.title })"
                @click.stop="handleForwardVideoClick"
              >
                <img
                  :src="getMomentThumbnailUrl(moment.forward.video.cover)"
                  :alt="moment.forward.video.title"
                  loading="lazy"
                  decoding="async"
                >
                <span
                  v-if="settings.showVideoCardViewCount && moment.forward.video.play"
                  class="moment-card__video-stats"
                >
                  <span class="moment-card__video-stat-group">
                    <span>
                      <span i-tabler-player-play aria-hidden="true" />
                      {{ moment.forward.video.play }}
                    </span>
                  </span>
                </span>
              </a>
              <button
                v-if="settings.showVideoCardWatchLater && getWatchLaterStateKey(moment.forward.video)"
                type="button"
                class="moment-card__watch-later"
                :class="{
                  'is-added': isWatchLaterAdded(moment.forward.video),
                  'is-disabled': isWatchLaterLoading(moment.forward.video),
                }"
                :disabled="isWatchLaterLoading(moment.forward.video)"
                :aria-disabled="isWatchLaterLoading(moment.forward.video)"
                :aria-label="isWatchLaterAdded(moment.forward.video) ? t('moment_card.watch_later_added') : t('moment_card.add_watch_later')"
                :aria-pressed="isWatchLaterAdded(moment.forward.video)"
                :title="isWatchLaterAdded(moment.forward.video) ? t('moment_card.added') : t('moment_card.watch_later')"
                @click.stop.prevent="emit('toggleWatchLater', moment.forward.video)"
              >
                <span v-if="isWatchLaterLoading(moment.forward.video)" i-svg-spinners:ring-resize aria-hidden="true" />
                <span v-else-if="isWatchLaterAdded(moment.forward.video)" i-line-md:confirm aria-hidden="true" />
                <span v-else i-mingcute:carplay-line aria-hidden="true" />
              </button>
            </span>
            <a
              :href="moment.forward.video.url || undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="moment-card__forward-video-info"
              :aria-label="t('moment_card.open_original_video', { title: moment.forward.video.title })"
              @click.stop="handleForwardVideoClick"
            >
              <strong>
                <VideoWatchedTag
                  :aid="moment.forward.video.aid"
                  :bvid="moment.forward.video.bvid"
                />
                {{ moment.forward.video.title || moment.forward.fallback }}
              </strong>
              <small><span i-tabler-user aria-hidden="true" />{{ moment.forward.author }}</small>
            </a>
          </div>
          <div
            v-else-if="moment.forward"
            class="moment-card__forward"
            :class="{ 'moment-card__forward--draw': Boolean(moment.forward.images?.length) }"
            role="button"
            tabindex="0"
            :aria-label="t('moment_card.open_origin_moment', { name: moment.forward.author })"
            @click="handleForwardOriginClick"
            @keydown="handleForwardOriginKeydown"
          >
            <div class="moment-card__forward-copy">
              <strong>@{{ moment.forward.author }}</strong>
              <p>{{ moment.forward.title || moment.forward.text || moment.forward.fallback }}</p>
            </div>
            <div
              v-if="moment.forward.images?.length"
              class="moment-card__forward-gallery"
              :class="`moment-card__forward-gallery--${Math.min(moment.forward.images.length, 9)}`"
              :style="forwardSingleImageStyle"
            >
              <button
                v-for="(image, imageIndex) in moment.forward.images.slice(0, 9)"
                :key="image"
                type="button"
                class="moment-card__gallery-item"
                :aria-label="getImagePreviewLabel(moment.forward.author, imageIndex)"
                @click.stop="handleImagePreview(moment.forward.images || [], imageIndex, $event)"
              >
                <img
                  :src="getMomentThumbnailUrl(image, 360)"
                  :alt="t('moment_card.moment_image_alt', { author: moment.forward.author, index: imageIndex + 1 })"
                  loading="lazy"
                  decoding="async"
                >
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="moment.images.length && !moment.isVideo && !moment.isLive"
          class="moment-card__gallery"
          :class="`moment-card__gallery--${Math.min(moment.images.length, 9)}`"
          :style="moment.images.length === 1 ? { '--moment-single-image-ratio': imageRatio } : undefined"
        >
          <button
            v-for="(image, imageIndex) in moment.images.slice(0, 9)"
            :key="image"
            type="button"
            class="moment-card__gallery-item"
            :aria-label="getImagePreviewLabel(moment.author.name, imageIndex)"
            @click.stop="handleImagePreview(moment.images, imageIndex, $event)"
          >
            <img
              :src="getMomentThumbnailUrl(image, 360)"
              :alt="t('moment_card.moment_image_alt', { author: moment.author.name, index: imageIndex + 1 })"
              loading="lazy"
              decoding="async"
              @load="handleCoverLoad($event, imageIndex)"
            >
          </button>
          <span v-if="moment.images.length > 9" class="moment-card__image-count">+{{ moment.images.length - 9 }}</span>
          <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
            {{ moment.chargeBadge || t('moment_card.charge_exclusive') }}
          </span>
        </div>
      </div>

      <Teleport
        v-if="showVideoOptions && menuVideo"
        :to="mainAppRef"
      >
        <VideoCardContextMenu
          :video="menuVideo"
          :context-menu-styles="videoOptionsFloatingStyles"
          @close="closeVideoOptions"
          @removed="closeVideoOptions"
        />
      </Teleport>

      <MomentVote
        v-if="moment.additional?.isVote && moment.additional.voteId"
        class="moment-card__vote"
        :vote-id="moment.additional.voteId"
        :moment-id="moment.id"
        :fallback-title="moment.additional.title"
        :fallback-end-time="moment.additional.voteEndTime"
        @interactive-resize="emit('interactiveResize')"
      />
      <div
        v-else-if="moment.additional"
        class="moment-card__additional moment-card__additional--footer"
        :class="{ 'moment-card__additional--no-cover': moment.isChargeExclusive || !moment.additional.cover }"
      >
        <a
          :href="moment.additional.url || undefined"
          class="moment-card__additional-main"
          @click.stop
        >
          <img
            v-if="moment.additional.cover && !moment.isChargeExclusive"
            :src="getMomentThumbnailUrl(moment.additional.cover, 80)"
            alt=""
            loading="lazy"
            decoding="async"
          >
          <span>
            <strong>
              <span v-if="moment.additional.isVote" i-tabler-chart-bar aria-hidden="true" class="moment-card__additional-vote-icon" />
              {{ moment.additional.title || t('moment_card.additional_content') }}
            </strong>
            <small v-if="moment.additional.desc">{{ moment.additional.desc }}</small>
          </span>
        </a>
        <button
          v-if="isReservationAdditional"
          type="button"
          class="moment-card__additional-action"
          :class="{ 'is-reserved': moment.additional.isReserved }"
          :disabled="isReservationLoading"
          :aria-label="reservationActionLabel"
          :aria-pressed="Boolean(moment.additional.isReserved)"
          @click.stop="emit('toggleReservation', moment)"
        >
          <span v-if="isReservationLoading" i-svg-spinners:ring-resize aria-hidden="true" />
          <span v-else>{{ reservationActionLabel }}</span>
        </button>
        <a
          v-else
          :href="moment.additional.url || undefined"
          class="moment-card__additional-action"
          @click.stop
        >
          {{ moment.additional.action }}
        </a>
      </div>

      <button
        v-if="moment.hotComment"
        type="button"
        class="moment-card__hot-comment"
        :class="{ 'is-active': commentExpanded }"
        :aria-label="commentExpanded ? t('moment_card.collapse_comments') : t('moment_card.view_hot_comment')"
        :aria-expanded="commentExpanded"
        :aria-controls="commentSectionId"
        :disabled="!canExpandComments"
        @click.stop="toggleComments"
      >
        <span class="moment-card__hot-comment-label">
          <span i-tabler-message-circle-filled aria-hidden="true" />
          {{ t('moment_card.hot_comment') }}
        </span>
        <span class="moment-card__hot-comment-content">
          <template v-if="moment.hotComment.richText.length">
            <template v-for="(segment, segmentIndex) in moment.hotComment.richText" :key="`${moment.id}-hot-comment-${segmentIndex}`">
              <img
                v-if="segment.type === 'emoji' && segment.imageUrl"
                :src="segment.imageUrl"
                :alt="segment.text"
                :title="segment.text"
                class="moment-card__emoji"
                :class="{ 'moment-card__emoji--large': segment.size === 2 }"
                loading="lazy"
                decoding="async"
              >
              <template v-else>{{ segment.text }}</template>
            </template>
          </template>
          <template v-else>{{ moment.hotComment.text }}</template>
        </span>
      </button>

      <footer class="moment-card__footer">
        <button
          type="button"
          :class="{ 'is-active': forwardExpanded }"
          :aria-label="forwardExpanded ? t('moment_card.forward_collapse') : t('moment_card.forward')"
          :aria-expanded="forwardExpanded"
          :aria-controls="forwardSectionId"
          :disabled="!moment.id"
          @click.stop="toggleForward"
        >
          <span i-tabler-repeat />
          {{ formatCount(displayedForwardCount) }}
        </button>
        <button
          v-if="!moment.isLive"
          type="button"
          :class="{ 'is-active': commentExpanded }"
          :aria-label="commentExpanded ? t('moment_card.collapse_comments') : t('moment_card.view_comments')"
          :aria-expanded="commentExpanded"
          :aria-controls="commentSectionId"
          :disabled="!canExpandComments"
          @click.stop="toggleComments"
        >
          <span i-tabler-message-circle />
          {{ formatCount(moment.commentCount) }}
        </button>
        <span v-else class="moment-card__footer-stat" :aria-label="t('moment_card.live_popularity', { value: moment.livePopularity || t('moment_card.no_data') })">
          <span i-tabler-users />
          {{ moment.livePopularity || t('moment_card.live_now') }}
        </span>
        <button
          type="button"
          class="moment-card__likes"
          :class="{ 'is-liked': moment.isLiked, 'is-unavailable': moment.isLikeDisabled }"
          :disabled="isLikeLoading || moment.isLikeDisabled"
          :aria-label="moment.isLikeDisabled ? t('moment_card.like_unavailable') : moment.isLiked ? t('moment_card.cancel_like') : t('moment_card.like')"
          :aria-pressed="moment.isLiked"
          :title="moment.isLikeDisabled ? t('moment_card.like_unavailable') : moment.isLiked ? t('moment_card.cancel_like') : t('moment_card.like')"
          @click.stop="emit('toggleLike', moment)"
          @keydown.enter.stop
        >
          <span v-if="moment.isLiked" i-tabler-heart-filled />
          <span v-else i-tabler-heart />
          {{ formatCount(moment.likeCount) }}
        </button>
      </footer>

      <div
        class="moment-card__disclosure"
        :class="{ 'is-open': disclosure !== 'none' }"
        :aria-hidden="disclosure === 'none'"
        :inert="disclosure === 'none'"
        @transitionend="handleDisclosureTransitionEnd"
        @transitioncancel="handleDisclosureTransitionEnd"
      >
        <div class="moment-card__disclosure-inner">
          <div
            v-if="displayedDisclosure === 'comments' && canExpandComments"
            :id="commentSectionId"
            class="moment-card__comments"
          >
            <MomentCommentSection
              :moment="moment"
              @open-image-preview="handleCommentImagePreview"
              @interactive-resize="emit('interactiveResize')"
            />
          </div>
          <div
            v-if="forwardComposerMounted"
            v-show="displayedDisclosure === 'forward'"
            :id="forwardSectionId"
            class="moment-card__forward-disclosure"
          >
            <MomentForwardComposer
              :moment="moment"
              :active="forwardExpanded"
              :forward-count="displayedForwardCount"
              @close="closeForwardComposer"
              @submitted="handleForwardSubmitted"
            />
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.moment-card--preparing {
  visibility: hidden;
}

.moment-card--entering {
  will-change: opacity;
  animation: moment-card-enter 0.2s ease both;
}

@keyframes moment-card-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.moment-card {
  container-type: inline-size;
  break-inside: avoid;
  position: relative;
  margin: 0;
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
  background-color: transparent;
  cursor: pointer;
  box-shadow: none;
  transition:
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-emphasized);
}

.moment-card__surface {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: inherit;
  corner-shape: inherit;
  background: var(--bew-elevated);
  pointer-events: none;
}

.moment-card__surface :is(a, button, [role="button"]),
.moment-card__cover--media,
.moment-card__text-cover--video {
  pointer-events: auto;
}

.moment-card__primary-action {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: inherit;
  corner-shape: inherit;
  background: transparent;
  cursor: pointer;
}

.moment-card__primary-action:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: 4px;
}

@media (hover: hover) and (pointer: fine) {
  .moment-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--bew-shadow-1);
  }

  .moment-card--comments-expanded:hover,
  .moment-card--forward-expanded:hover {
    transform: none;
  }
}

.moment-card:has(.moment-card__primary-action:active) {
  transform: translateY(0) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .moment-card {
    transition: none;
  }

  .moment-card--entering {
    animation: none;
  }
}

.moment-card__cover {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--bew-fill-1);
}

.moment-card__cover > img {
  display: block;
  width: 100%;
  height: auto;
  opacity: 0;
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
  transition: opacity 0.12s ease;
}

.moment-card__cover > img.is-ready {
  opacity: 1;
}

.moment-card__cover--media {
  aspect-ratio: 16 / 9;
  background: #111;
}

.moment-card__cover--media > img,
.moment-card__cover--media > video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-card__cover--media > video {
  z-index: 1;
}

.moment-card__watch-later {
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  z-index: 3;
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  place-items: center;
  color: #fff;
  background: rgb(0 0 0 / 62%);
  cursor: pointer;
  font-size: var(--bew-icon-size-md);
  opacity: 0;
  transform: scale(0.78);
  transition:
    opacity var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__cover:hover .moment-card__watch-later,
.moment-card__forward-video-cover:hover .moment-card__watch-later,
.moment-card__forward-video-cover:focus-within .moment-card__watch-later,
.moment-card__watch-later:focus-visible,
.moment-card__watch-later.is-added {
  opacity: 1;
  transform: scale(1);
}

.moment-card__watch-later:hover {
  background: rgb(0 0 0 / 78%);
}

.moment-card__watch-later:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.moment-card__watch-later:disabled,
.moment-card__watch-later.is-disabled {
  cursor: wait;
  opacity: 0.72;
}

.moment-card__image-count,
.moment-card__video-mark,
.moment-card__live-mark {
  position: absolute;
  bottom: var(--bew-space-2);
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  color: #fff;
  background: rgb(0 0 0 / 58%);
  font-size: var(--bew-font-size-control);
}

.moment-card__image-count {
  right: var(--bew-space-2);
}

.moment-card__video-mark {
  left: var(--bew-space-2);
}

.moment-card__live-mark {
  top: 8px;
  left: 8px;
  bottom: auto;
  z-index: 2;
  border-radius: var(--bew-badge-radius);
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  font-weight: var(--bew-font-weight-bold);
  letter-spacing: 0.02em;
}

.moment-card__charge-badge {
  position: absolute;
  top: var(--bew-space-2);
  left: var(--bew-space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  color: #fff;
  background: linear-gradient(135deg, #ff8eb4, #fb7299);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  box-shadow: 0 2px 8px rgb(251 114 153 / 35%);
}

.moment-card__text-cover {
  min-height: 152px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
  background: linear-gradient(145deg, var(--bew-theme-color-20), var(--bew-fill-1));
}

.moment-card__text-cover--video {
  color: #fff;
  background: linear-gradient(145deg, #394e74, #141b2d);
}

.moment-card__text-cover-icon {
  font-size: var(--bew-icon-size-xl);
}

.moment-card--charge .moment-card__additional-action {
  color: #fb7299;
}

.moment-card__body {
  padding: var(--bew-space-3);
}

.moment-card--text .moment-card__body {
  display: flex;
  flex-direction: column;
  padding-top: var(--bew-space-4);
}

.moment-card--text .moment-card__desc {
  flex: 1 1 auto;
  -webkit-line-clamp: 10;
}

.moment-card__title {
  margin: 0 0 var(--bew-space-2);
}

.moment-card__media-meta {
  margin: 0 0 var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.moment-card__media-meta--live {
  align-self: flex-start;
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-foreground);
  background: var(--bew-theme-color-10);
  line-height: 1.35;
}

.moment-card__desc {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-wrap;
  word-break: break-word;
}

.moment-card__footer {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.moment-card__forward {
  display: flex;
  flex-direction: column;
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-card-radius);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  pointer-events: auto;
  transition:
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__forward:hover,
.moment-card__forward:focus-visible {
  border-color: var(--bew-theme-color-60);
  background: var(--bew-theme-color-10);
  outline: none;
}

.moment-card__forward:focus-visible {
  box-shadow: 0 0 0 2px var(--bew-theme-focus-ring);
}

.moment-card__forward-copy {
  padding: var(--bew-space-3);
}

.moment-card__forward strong {
  color: var(--bew-text-1);
}

.moment-card__forward p {
  display: -webkit-box;
  margin: var(--bew-space-1) 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.moment-card__additional {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-3);
  padding: var(--bew-space-3) var(--bew-space-4);
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  background: var(--bew-fill-1);
  text-decoration: none;
}

.moment-card__additional-main {
  display: grid;
  min-width: 0;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: var(--bew-space-3);
  color: inherit;
  text-decoration: none;
}

.moment-card__additional--no-cover .moment-card__additional-main {
  grid-template-columns: minmax(0, 1fr);
}

.moment-card__additional-vote-icon {
  margin-right: var(--bew-space-1);
  font-size: var(--bew-icon-size-sm);
  vertical-align: -0.125em;
}

.moment-card__additional-main img {
  width: 40px;
  height: 40px;
  border-radius: var(--bew-radius-md);
  object-fit: cover;
}

.moment-card__additional-main > span {
  display: flex;
  min-width: 0;
  min-height: 40px;
  flex-direction: column;
  justify-content: center;
}

.moment-card__additional-main strong,
.moment-card__additional-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__additional-main small {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
}

.moment-card__additional-action {
  display: inline-flex;
  min-width: 48px;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  padding: var(--bew-space-1) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-foreground);
  background: transparent;
  box-sizing: border-box;
  cursor: pointer;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
  white-space: nowrap;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__additional-action:hover {
  background: var(--bew-theme-color-10);
}

.moment-card__additional-action.is-reserved {
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
}

.moment-card__additional-action:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: 2px;
}

.moment-card__additional-action:disabled {
  cursor: wait;
  opacity: 0.65;
}

.moment-card__avatar {
  width: 21px;
  height: 21px;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  object-fit: cover;
  background: var(--bew-fill-1);
}

.moment-card__likes {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  margin-left: auto;
  padding: var(--bew-space-1) var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-radius-md);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;
}

.moment-card__likes:hover {
  color: var(--bew-theme-foreground);
  background: color-mix(in srgb, var(--bew-theme-color) 10%, transparent);
}

.moment-card__likes:active {
  transform: scale(0.94);
}

.moment-card__likes.is-liked {
  color: var(--bew-theme-foreground);
}

.moment-card__likes:disabled {
  cursor: wait;
  opacity: 0.65;
}

.moment-card__likes.is-unavailable {
  cursor: not-allowed;
}

.moment-card__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3) var(--bew-space-4);
}

.moment-card__header .moment-card__avatar {
  display: block;
  width: 36px;
  height: 36px;
}

.moment-card__avatar-link {
  display: block;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.moment-card__identity {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.moment-card__identity strong,
.moment-card__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__identity strong {
  color: var(--bew-theme-foreground);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-card__identity small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}

.moment-card__main {
  padding: 0 var(--bew-space-4) var(--bew-space-3);
}

.moment-card__main--has-media {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: var(--bew-space-3);
}

.moment-card__main--live {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
}

.moment-card__main--live .moment-card__body {
  order: 1;
  height: auto;
  max-height: none;
}

.moment-card__main--live .moment-card__media {
  order: 2;
  width: 100%;
}

.moment-card__main--live .moment-card__cover--media {
  aspect-ratio: 16 / 9;
}

.moment-card__media {
  min-width: 0;
  overflow: hidden;
  border-radius: var(--bew-media-radius);
}

.moment-card__cover--media {
  aspect-ratio: 16 / 9;
}

.moment-card__gallery {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: var(--bew-space-1);
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 1;
  background: var(--bew-fill-1);
}

.moment-card__gallery--1 {
  grid-template-columns: 1fr;
  aspect-ratio: var(--moment-single-image-ratio, 1);
}

.moment-card__gallery--2,
.moment-card__gallery--4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.moment-card__gallery--2 {
  aspect-ratio: 2 / 1;
}

.moment-card__gallery--3 {
  aspect-ratio: 3 / 1;
}

.moment-card__gallery--5,
.moment-card__gallery--6 {
  aspect-ratio: 3 / 2;
}

.moment-card__gallery-item {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  color: inherit;
  background: var(--bew-fill-1);
  cursor: zoom-in;
}

.moment-card__gallery-item:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: -2px;
}

.moment-card__gallery-item > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
}

.moment-card__gallery .moment-card__image-count {
  right: 8px;
  bottom: 8px;
}

.moment-card__text-cover {
  min-height: var(--moment-card-text-cover-min-height, 176px);
  box-sizing: border-box;
}

.moment-card__text-cover--video {
  min-height: 0;
  aspect-ratio: 16 / 9;
}

.moment-card__body {
  min-width: 0;
  padding: 0;
}

.moment-card__description {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: flex-start;
}

.moment-card__description--inherited {
  flex: 0 0 auto;
}

.moment-card__more-btn {
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  place-items: center;
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-icon-size-md);
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__more-btn:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.moment-card__more-btn.is-open {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.moment-card__more-btn:active {
  background: var(--bew-fill-3);
}

.moment-card__more-btn:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: 2px;
}

.moment-card__main--video .moment-card__body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.moment-card__main--video:not(.moment-card__main--live) {
  display: flex;
  flex-direction: column;
}

.moment-card__main--video:not(.moment-card__main--live) .moment-card__media {
  width: 100%;
}

.moment-card__main--video.moment-card__main--live .moment-card__body {
  height: auto;
  max-height: none;
}

.moment-card__main--video .moment-card__desc {
  min-height: 0;
  flex: 1 1 auto;
  -webkit-line-clamp: var(--moment-card-description-lines, 3);
  text-overflow: ellipsis;
}

.moment-card__main--video:not(.moment-card__main--live) .moment-card__title {
  display: -webkit-box;
  flex: 0 0 auto;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  text-overflow: ellipsis;
}

.moment-card--text .moment-card__body {
  padding-top: 0;
}

.moment-card--text .moment-card__desc,
.moment-card--forward-video .moment-card__desc {
  -webkit-line-clamp: var(--moment-card-description-lines, 7);
}

.moment-card--forward-draw .moment-card__body {
  min-height: 0;
}

.moment-card--compact-text .moment-card__body {
  min-height: 0;
}

.moment-card__title {
  margin-bottom: var(--bew-space-2);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.moment-card__desc {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  -webkit-line-clamp: var(--moment-card-description-lines, 7);
}

.moment-card__desc.is-expanded:not([data-description-measure-collapsed]) {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
  text-overflow: clip;
}

.moment-card__desc--inherited {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  -webkit-line-clamp: 2;
}

.moment-card__description-toggle {
  display: inline-flex;
  min-width: 24px;
  min-height: 24px;
  align-items: center;
  margin-top: var(--bew-space-1);
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-foreground);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
}

.moment-card__description-toggle:hover {
  color: var(--bew-text-1);
}

.moment-card__description-toggle:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.moment-card[data-description-expanded="true"] .moment-card__main--video .moment-card__body {
  max-height: none;
  overflow: visible;
}

.moment-card__emoji {
  display: inline-block;
  width: 1.35em;
  height: 1.35em;
  margin: 0 0.08em;
  vertical-align: -0.28em;
  object-fit: contain;
}

.moment-card__emoji--large {
  width: 1.6em;
  height: 1.6em;
  vertical-align: -0.4em;
}

.moment-card__rich-link {
  color: var(--bew-theme-foreground);
  text-decoration: none;
  text-underline-offset: 0.15em;
}

.moment-card__rich-link:hover {
  text-decoration: underline;
}

.moment-card__forward-video {
  display: grid;
  grid-template-columns: minmax(150px, 44%) minmax(0, 1fr);
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-card-radius);
  color: inherit;
  background: var(--bew-fill-1);
  box-sizing: border-box;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.moment-card__forward-video:hover,
.moment-card__forward-video:focus-within {
  border-color: color-mix(in oklab, var(--bew-theme-color), transparent 48%);
  background: color-mix(in oklab, var(--bew-theme-color) 7%, var(--bew-fill-1));
  outline: none;
}

.moment-card__forward-video-cover {
  position: relative;
  display: block;
  min-width: 0;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: #111;
}

.moment-card__forward-video-cover-link {
  display: block;
  width: 100%;
  height: 100%;
}

.moment-card__forward-video-cover-link > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-card__forward-gallery {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: var(--bew-space-1);
  margin: 0 var(--bew-space-3) var(--bew-space-3);
  overflow: hidden;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 1;
  background: var(--bew-fill-1);
}

.moment-card__more,
.moment-card__video-mark,
.moment-card__live-mark,
.moment-card__reserve-mark,
.moment-card__media-meta--live,
.moment-card__image-count,
.moment-card__charge-badge,
.moment-card__watch-later,
.moment-card__forward,
.moment-card__additional,
.moment-card__additional img,
.moment-card__likes,
.moment-card__media,
.moment-card__gallery,
.moment-card__forward-video,
.moment-card__forward-gallery {
  corner-shape: var(--bew-corner-shape);
}

.moment-card__forward-gallery--1 {
  grid-template-columns: 1fr;
  aspect-ratio: var(--moment-forward-single-image-ratio, 1);
}

.moment-card__forward-gallery--2,
.moment-card__forward-gallery--4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.moment-card__forward-gallery--2 {
  aspect-ratio: 2 / 1;
}

.moment-card__forward-gallery--3 {
  aspect-ratio: 3 / 1;
}

.moment-card__forward-gallery--5,
.moment-card__forward-gallery--6 {
  aspect-ratio: 3 / 2;
}

.moment-card__forward-gallery .moment-card__gallery-item > img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
}

.moment-card__image-count,
.moment-card__charge-badge {
  pointer-events: none;
}

.moment-card__video-stats {
  position: absolute;
  inset: auto 0 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2);
  min-height: 28px;
  padding: var(--bew-space-3) var(--bew-space-2) var(--bew-space-1);
  color: #fff;
  background: linear-gradient(to bottom, transparent, rgb(0 0 0 / 72%));
  box-sizing: border-box;
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-shadow: 0 1px 2px rgb(0 0 0 / 65%);
}

.moment-card__video-stat-group,
.moment-card__video-stat-group > span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
}

.moment-card__video-stat-group {
  gap: var(--bew-space-2);
}

.moment-card__video-stat-group > span {
  gap: var(--bew-space-1);
}

.moment-card__forward-video-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-3);
}

.moment-card__forward-video-info strong {
  display: -webkit-box;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.moment-card__forward-video-info small {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-1);
  overflow: hidden;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__additional--footer {
  margin: 0 var(--bew-space-4) var(--bew-space-3);
}

.moment-card__hot-comment {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-height: 40px;
  align-items: center;
  gap: var(--bew-space-2);
  margin: 0 0 var(--bew-space-3);
  padding: var(--bew-space-2) var(--bew-space-4);
  overflow: hidden;
  border: 0;
  border-radius: 0;
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  box-sizing: border-box;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-align: left;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__hot-comment:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.moment-card__hot-comment.is-active {
  color: var(--bew-theme-foreground);
  background: var(--bew-theme-color-10);
}

.moment-card__hot-comment:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.moment-card__hot-comment-label {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--bew-space-1);
  color: var(--bew-theme-foreground);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-card__hot-comment-content {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: 0;
  min-height: 42px;
  margin: 0;
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 64%);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.moment-card__footer > a,
.moment-card__footer > button,
.moment-card__footer > .moment-card__footer-stat {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  color: inherit;
  background: transparent;
  box-sizing: border-box;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}

.moment-card__footer-stat {
  cursor: default;
}

.moment-card__footer > a:hover,
.moment-card__footer > button:hover {
  color: var(--bew-theme-foreground);
  background: color-mix(in srgb, var(--bew-theme-color) 8%, transparent);
}

.moment-card__footer > button.is-active {
  color: var(--bew-theme-foreground);
  background: var(--bew-theme-color-10);
}

.moment-card__footer > button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.moment-card__footer > :not(:first-child) {
  border-left: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 72%);
}

.moment-card__footer .moment-card__likes:active {
  transform: none;
}

.moment-card__footer .moment-card__likes:disabled {
  cursor: wait;
  opacity: 0.65;
}

.moment-card__disclosure {
  display: grid;
  pointer-events: auto;
  grid-template-rows: 0fr;
  min-width: 0;
  transition: grid-template-rows var(--bew-duration-moderate) var(--bew-ease-standard);
}

.moment-card__disclosure.is-open {
  grid-template-rows: 1fr;
}

.moment-card__disclosure:not(.is-open) {
  pointer-events: none;
}

.moment-card__disclosure-inner {
  min-height: 0;
  overflow: hidden;
  opacity: 0;
  background: transparent;
  transform: translateY(calc(0px - var(--bew-space-2)));
  transition:
    opacity var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-standard);
}

.moment-card__disclosure.is-open .moment-card__disclosure-inner {
  opacity: 1;
  transform: translateY(0);
}

.moment-card__comments,
.moment-card__forward-disclosure {
  min-width: 0;
  background: transparent;
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .moment-card__disclosure,
  .moment-card__disclosure-inner {
    transition: none;
  }
}

@container (max-width: 359px) {
  .moment-card__main--has-media {
    display: flex;
    flex-direction: column;
  }

  .moment-card__media {
    width: 100%;
  }

  .moment-card__main--video .moment-card__body {
    height: auto;
    max-height: 220px;
  }

  .moment-card--text .moment-card__body {
    min-height: 0;
  }
}

// 880px keeps two- and three-column cards vertical while allowing a genuinely
// wide single-column card to use its own inline size for a split composition.
@container (min-width: 880px) {
  .moment-card--supports-wide-layout .moment-card__surface {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
    align-items: start;
  }

  .moment-card--supports-wide-layout .moment-card__header,
  .moment-card--supports-wide-layout .moment-card__hot-comment,
  .moment-card--supports-wide-layout .moment-card__footer,
  .moment-card--supports-wide-layout .moment-card__disclosure {
    grid-column: 1 / -1;
  }

  .moment-card--supports-wide-layout .moment-card__main {
    display: contents;
  }

  .moment-card--supports-wide-layout .moment-card__main .moment-card__media {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
    width: auto;
    margin: 0 0 var(--bew-space-3) var(--bew-space-4);
  }

  .moment-card--supports-wide-layout .moment-card__main .moment-card__body {
    grid-column: 2;
    grid-row: 2;
    align-self: stretch;
    min-width: 0;
    height: auto;
    max-height: none;
    padding: 0 var(--bew-space-4) var(--bew-space-3);
    overflow: hidden;
  }

  .moment-card--wide-single-image .moment-card__gallery--1 {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
    width: auto;
    margin: 0 0 var(--bew-space-3) var(--bew-space-4);
  }

  .moment-card--supports-wide-layout .moment-card__additional {
    grid-column: 2;
    align-self: start;
    margin: 0 var(--bew-space-4) var(--bew-space-3);
  }

  .moment-card--supports-wide-layout .moment-card__vote {
    grid-column: 2;
  }
}
</style>
