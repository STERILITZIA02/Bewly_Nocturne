<script setup lang="ts">
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import LoadingRing from '~/components/LoadingRing.vue'
import MomentPromotionBadge from '~/components/MomentPromotionBadge.vue'
import VideoWatchedTag from '~/components/VideoWatchedTag.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHoverLiftHold } from '~/composables/useHoverLiftHold'
import { useImageTone } from '~/composables/useImageTone'
import { useMeasuredDisclosure } from '~/composables/useMeasuredDisclosure'
import { BEWLY_NATIVE_USER_PROFILE_RELEASE, BEWLY_NATIVE_USER_PROFILE_REQUEST } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { findLayoutEditableTarget } from '~/logic/layoutEdit'
import { useTopBarStore } from '~/stores/topBarStore'
import { getDeepActiveElement } from '~/utils/dialogFocus'
import { computeFloatingMenuPosition, getContextMenuPlacement } from '~/utils/floatingMenu'
import { createPointerNavigationGuard, hasNavigationModifier } from '~/utils/linkNavigation'
import { releaseElementImages } from '~/utils/mediaResources'
import { supportsWideMomentCardLayout } from '~/utils/momentCardLayout'
import { isMomentDescriptionOverflowing } from '~/utils/momentDescription'
import { isMomentVideoUrl } from '~/utils/momentUrl'
import { holdAnimation } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { isPortraitRatio } from '~/utils/portraitMedia'
import { getLayoutHeight } from '~/utils/viewportGeometry'

import type { Author, Video } from '../VideoCard/types'
import MomentCommentSection from './MomentCommentSection.vue'
import MomentForwardComposer from './MomentForwardComposer.vue'
import type { MomentDisclosure } from './momentForwardContent'
import {
  createMomentDisclosureCache,
  MOMENT_DISCLOSURES,
  normalizeForwardCount,
  toggleMomentDisclosure,
} from './momentForwardContent'
import MomentMediaStage from './MomentMediaStage.vue'
import MomentMoreMenu from './MomentMoreMenu.vue'
import MomentVideoPreview from './MomentVideoPreview.vue'
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
  previewLoading?: boolean
  previewGeneration?: number
  imageRatio?: number
  isLikeLoading?: boolean
  isReservationLoading?: boolean
  isForwardLoading?: boolean
  isWatchLaterAdded: (target: WatchLaterTarget) => boolean | undefined
  isWatchLaterLoading: (target: WatchLaterTarget) => boolean
}

const {
  moment,
  cardWidth = 520,
  ready = false,
  entering = false,
  previewActive = false,
  previewUrl = '',
  previewLoading = false,
  previewGeneration = 0,
  imageRatio = 1,
  isLikeLoading = false,
  isReservationLoading = false,
  isForwardLoading = false,
  isWatchLaterAdded,
  isWatchLaterLoading,
} = defineProps<Props>()

const emit = defineEmits<{
  cardElement: [element: HTMLElement | null]
  openDetail: [moment: DisplayMoment, forceDialog?: boolean]
  mediaEnter: [moment: DisplayMoment, event?: MouseEvent]
  mediaLeave: [moment: DisplayMoment]
  coverLoad: [event: Event, momentId: string]
  previewVideo: [element: Element | null, moment: DisplayMoment]
  openVideoLink: [url: string, video?: DisplayForwardVideo]
  toggleWatchLater: [target: WatchLaterTarget, isViewCurrent: () => boolean]
  toggleLike: [moment: DisplayMoment]
  toggleReservation: [moment: DisplayMoment]
  openImagePreview: [images: string[], index: number, trigger: HTMLElement]
  interactiveResize: []
  interactionChange: [held: boolean]
  disclosureMotion: [moving: boolean]
  requestDelete: [moment: DisplayMoment]
  requestReport: [moment: DisplayMoment]
}>()

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()
const topBarStore = useTopBarStore()
const addedCommentCount = ref(0)
watch(() => [moment.id, moment.commentCount, topBarStore.userInfo.mid], () => addedCommentCount.value = 0)
let cardElement: HTMLElement | null = null
const navigationGuard = createPointerNavigationGuard(() => cardElement)
// Its menu and composer pickers keep the hover scale while they are open.
const lift = useHoverLiftHold(() => cardElement)
const liftHeld = lift.held

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
  const forwarded = moment.forward?.video
  if (forwarded) {
    return getMenuVideo({ ...forwarded, author: forwarded.author
      ? { mid: Number(forwarded.author.mid), name: forwarded.author.name, authorFace: getAvatarThumbnailUrl(forwarded.author.face) }
      : undefined })
  }
  if (moment.isLive) {
    return moment.roomId
      ? {
        id: moment.roomId,
        roomid: moment.roomId,
        title: moment.title || t('moment_card.live_moment'),
        cover: moment.images[0] || '',
        url: `https://live.bilibili.com/${moment.roomId}`,
        author: { name: moment.author.name, authorFace: getAvatarThumbnailUrl(moment.author.face), mid: Number(moment.author.mid) || undefined },
        threePointV2: [],
      } satisfies Video
      : null
  }
  if (!moment.isVideo)
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

const menuButtonLabel = computed(() => t('video_card.operation.more_options'))
const menuAnchor = ref({ x: 0, y: 0 })
const menuLayoutTarget = shallowRef<ReturnType<typeof findLayoutEditableTarget>>()
let menuTrigger: HTMLElement | null = null
// Covers carry no watch-later button; the menu holds it, as on video cards.
const menuWatchLater = computed(() => {
  const target = moment.forward?.video ?? (moment.isVideo && !moment.isLive ? moment : undefined)
  if (!target || !getWatchLaterStateKey(target))
    return undefined
  return { added: isWatchLaterAdded(target), toggle: () => toggleCardWatchLater(target) }
})

const showVideoOptions = ref(false)
watch(showVideoOptions, open => lift.hold(open))
const videoOptionsFloatingStyles = ref<CSSProperties>({})
const moreBtnRef = ref<HTMLButtonElement | null>(null)
const authorAvatarLinkRef = ref<HTMLAnchorElement | null>(null)
const getDisclosureCacheKey = () => `${topBarStore.userInfo.mid || 'guest'}:${moment.id}`
const disclosureCache = inject(MOMENT_DISCLOSURES, undefined) ?? createMomentDisclosureCache()
const disclosure = ref<MomentDisclosure>(disclosureCache.get(getDisclosureCacheKey()))
const displayedDisclosure = ref<MomentDisclosure>(disclosure.value)
const disclosureRef = ref<HTMLElement | null>(null)
const disclosureContentRef = ref<HTMLElement | null>(null)
const { height: disclosureHeight, moving: disclosureMoving, onTransitionEnd: handleDisclosureTransitionEnd } = useMeasuredDisclosure(
  disclosureRef,
  disclosureContentRef,
  computed(() => disclosure.value !== 'none'),
  () => {
    if (disclosure.value === 'none')
      displayedDisclosure.value = 'none'
  },
  () => {},
)
const forwardComposerMounted = ref(disclosure.value === 'forward')
const forwardFocusRequested = ref(false)
const forwardInteracting = ref(false)
const displayedForwardCount = computed(() => normalizeForwardCount(moment.forwardCount))
const commentExpanded = computed(() => disclosure.value === 'comments')
const forwardExpanded = computed(() => disclosure.value === 'forward')
const cardFocused = ref(false)
const previewInteracting = ref(false)
const descriptionMoving = ref(false)
watch(() => {
  const media = moment.forward?.video ?? moment
  return `${media.bvid}:${media.cid}:${moment.forward?.video?.url ?? moment.videoUrl}`
}, () => {
  if (previewActive)
    emit('mediaEnter', moment)
})
const commentWriting = ref(false)
const interactionHeld = computed(() => cardFocused.value || showVideoOptions.value || forwardInteracting.value
  || disclosureMoving.value || descriptionMoving.value || previewInteracting.value || commentWriting.value || isForwardLoading || isLikeLoading || isReservationLoading
  || isWatchLaterLoading(moment) || (!!moment.forward?.video && isWatchLaterLoading(moment.forward.video)))
watch(interactionHeld, held => emit('interactionChange', held), { immediate: true, flush: 'sync' })
const canExpandComments = computed(() => Boolean(moment.id && !moment.isLive))
const commentSectionId = computed(() => `moment-comment-section-${moment.id}`)
const forwardSectionId = computed(() => `moment-forward-section-${moment.id}`)
const descriptionRef = ref<HTMLElement | null>(null)
// `descriptionOpen` is the toggle's target; `descriptionExpanded` drops the
// line clamp, so a collapse keeps it until the height animation has finished.
const descriptionOpen = ref(false)
const descriptionExpanded = ref(false)
const descriptionCanToggle = ref(false)
let descriptionAnimation: Animation | undefined
// The masonry holds its geometry while the comment area or the text animates.
watch(() => disclosureMoving.value || descriptionMoving.value, moving => emit('disclosureMotion', moving), { flush: 'sync' })
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

const primaryHref = computed(() => moment.isVideo && !moment.isForward
  ? moment.videoUrl || (moment.bvid ? `https://www.bilibili.com/video/${moment.bvid}` : moment.url)
  : moment.isLive && moment.roomId ? `https://live.bilibili.com/${moment.roomId}` : moment.url)
const isReservationAdditional = computed(() => Boolean(
  moment.additional?.reservationId
  && (moment.additional.isVideoReservation || moment.additional.isLiveReservation),
))
const supportsWideCardLayout = computed(() => supportsWideMomentCardLayout(moment))
// Media with a picture fills the top of the card: a video or live cover, or
// an image post's images.
const hasTopCover = computed(() => moment.images.length > 0)
const hasTopImages = computed(() => hasTopCover.value && !moment.isVideo && !moment.isLive)
const isTopMediaPortrait = computed(() => hasTopImages.value && isPortraitRatio(moment.imageRatios?.[0]))

// Image posts show one image at a time with a thumbnail strip; a portrait
// picture shows its upper part and the card below takes its colour
// (MomentMediaStage, useImageTone).
const shownTopImage = ref(0)
const topToneStyles = useImageTone(() => ({
  portrait: isTopMediaPortrait.value,
  image: moment.images[shownTopImage.value],
  ratio: moment.imageRatios?.[shownTopImage.value],
}))

// A quoted moment is a smaller card inside this one with the same top media
// (video or live cover, or images) and author row; its corners nest inside
// the card's.
const quoteImages = computed(() => moment.forward?.video || moment.forward?.liveCover ? [] : moment.forward?.images ?? [])
const quoteCover = computed(() => {
  const forward = moment.forward
  if (forward?.video) {
    return {
      cover: forward.video.cover,
      alt: forward.video.title,
      href: forward.video.url,
      label: t('moment_card.open_original_video', { title: forward.video.title }),
      live: false,
    }
  }
  if (forward?.liveCover)
    return { cover: forward.liveCover, alt: moment.title, href: primaryHref.value, label: primaryActionLabel.value, live: true }
  return null
})
const hasQuoteMedia = computed(() => Boolean(quoteCover.value || quoteImages.value.length))
const quoteImageRatio = computed(() => {
  const ratio = moment.forward?.imageRatios?.[0]
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : 1
})
const isQuotePortrait = computed(() => quoteImages.value.length > 0 && isPortraitRatio(moment.forward?.imageRatios?.[0]))
const quoteTitle = computed(() => moment.forward?.video?.title || moment.forward?.title || '')
const quoteText = computed(() => {
  const forward = moment.forward
  if (!forward)
    return ''
  if (forward.video)
    return forward.text || forward.video.desc || ''
  return forward.text || (forward.title ? '' : forward.fallback)
})
const shownQuoteImage = ref(0)
const quoteToneStyles = useImageTone(() => ({
  portrait: isQuotePortrait.value,
  image: quoteImages.value[shownQuoteImage.value],
  ratio: moment.forward?.imageRatios?.[shownQuoteImage.value],
}))

const reservationActionLabel = computed(() => moment.additional?.isReserved
  ? t('moment_card.cancel_reservation')
  : t('moment_card.reserve'))

// VideoCard positions its menu from the trigger and teleports the shared menu
// into the app root. Keep the same positioning behavior for MomentCard.
function handleMoreBtnClick(event: Event) {
  event.stopPropagation()
  event.preventDefault()

  if (!moreBtnRef.value)
    return

  const anchor = moreBtnRef.value.getBoundingClientRect()
  menuTrigger = moreBtnRef.value
  menuLayoutTarget.value = undefined
  menuAnchor.value = { x: anchor.right, y: anchor.bottom }
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

// Right-clicking a video or live cover opens the shared video card menu at the
// pointer (touch long-press and the menu key arrive as the same event).
function openCoverMenu(event: MouseEvent) {
  // Shift keeps the browser menu, and a text selection keeps native copy.
  if (!menuVideo.value || event.shiftKey || document.getSelection()?.toString())
    return
  event.preventDefault()
  const placement = getContextMenuPlacement(event)
  menuTrigger = placement.trigger
  menuAnchor.value = placement.anchor
  menuLayoutTarget.value = findLayoutEditableTarget(event.composedPath())
  showVideoOptions.value = false
  videoOptionsFloatingStyles.value = placement.styles
  showVideoOptions.value = true
}

function closeVideoOptions() {
  if (!showVideoOptions.value)
    return
  showVideoOptions.value = false
  const trigger = menuTrigger
  menuTrigger = null
  void nextTick(() => trigger?.isConnected && trigger.focus({ preventScroll: true }))
}

function requestMomentOperation(kind: 'delete' | 'report') {
  closeVideoOptions()
  void nextTick(() => {
    if (kind === 'delete')
      emit('requestDelete', moment)
    else
      emit('requestReport', moment)
  })
}

function openPrimaryDetail(event?: MouseEvent) {
  if (event && (event.defaultPrevented || event.button !== 0 || hasNavigationModifier(event) || navigationGuard.prevent(event)))
    return
  event?.preventDefault()
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
  if (event.button !== 0 || hasNavigationModifier(event) || navigationGuard.prevent(event))
    return
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
  if (nextDisclosure === 'forward') {
    forwardComposerMounted.value = true
    forwardFocusRequested.value = true
  }
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
    descriptionOpen.value = false
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
    descriptionOpen.value = false
    descriptionExpanded.value = false
    emit('interactiveResize')
  }
}

function scheduleDescriptionOverflowMeasure() {
  if (descriptionMeasureFrame || descriptionMoving.value)
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

// Long text opens and closes by animating its height between the clamped and
// full sizes (same timing as the comment area). Clicking again mid-way turns
// it around from the height drawn at that moment.
async function toggleDescription() {
  const element = descriptionRef.value
  if (!descriptionCanToggle.value || !element)
    return
  const opening = !descriptionOpen.value
  descriptionOpen.value = opening
  const style = getComputedStyle(element)
  const duration = getMotionDuration(style, '--bew-duration-normal')
  if (duration <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    descriptionAnimation?.cancel()
    descriptionExpanded.value = opening
    emit('interactiveResize')
    void nextTick(scheduleDescriptionOverflowMeasure)
    return
  }
  const from = getLayoutHeight(element)
  descriptionAnimation?.cancel()
  let to: number
  if (opening) {
    descriptionExpanded.value = true
    await nextTick()
    to = getLayoutHeight(element)
  }
  else {
    element.dataset.descriptionMeasureCollapsed = ''
    to = getLayoutHeight(element)
    delete element.dataset.descriptionMeasureCollapsed
  }
  descriptionMoving.value = true
  emit('interactiveResize')
  const animation = element.animate(
    [{ height: `${from}px`, overflow: 'clip' }, { height: `${to}px`, overflow: 'clip' }],
    { duration, easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease', fill: 'forwards' },
  )
  descriptionAnimation = animation
  holdAnimation(animation)
  try {
    await animation.finished
  }
  catch {
    return // A newer toggle took over.
  }
  if (descriptionAnimation !== animation)
    return
  descriptionExpanded.value = descriptionOpen.value
  await nextTick()
  animation.cancel()
  descriptionAnimation = undefined
  descriptionMoving.value = false
  emit('interactiveResize')
  scheduleDescriptionOverflowMeasure()
}

function syncDisplayedDisclosure(value: MomentDisclosure) {
  if (value !== 'none') {
    displayedDisclosure.value = value
    return
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    displayedDisclosure.value = 'none'
}

watch(disclosure, (value) => {
  disclosureCache.set(getDisclosureCacheKey(), value)
  syncDisplayedDisclosure(value)
})

watch(
  [() => moment.id, () => topBarStore.userInfo.mid],
  () => {
    disclosure.value = disclosureCache.get(getDisclosureCacheKey())
    forwardFocusRequested.value = false
    displayedDisclosure.value = disclosure.value
    forwardComposerMounted.value = disclosure.value === 'forward'
    emit('interactiveResize')
  },
)

watch(
  () => moment.id,
  () => {
    descriptionAnimation?.cancel()
    descriptionAnimation = undefined
    descriptionMoving.value = false
    descriptionOpen.value = false
    descriptionExpanded.value = false
    descriptionCanToggle.value = false
    void nextTick(scheduleDescriptionOverflowMeasure)
  },
)

function guardLinkClick(event: MouseEvent) {
  if ((event.target as Element)?.closest('a, .moment-card__primary-action'))
    navigationGuard.prevent(event)
}
function handleSurfaceClick(event: MouseEvent) {
  if ((event.target as Element)?.closest('a, button, input, textarea, video, [role="button"]'))
    return
  openPrimaryDetail(event)
}
function toggleCardWatchLater(target: WatchLaterTarget) {
  const element = cardElement
  const momentId = moment.id
  const isForward = target !== moment
  const key = getWatchLaterStateKey(target)
  emit('toggleWatchLater', target, () => element !== null && element === cardElement && element.isConnected
    && moment.id === momentId && getWatchLaterStateKey(isForward ? moment.forward?.video ?? {} : moment) === key)
}
function onCardFocusOut() {
  void nextTick(() => {
    cardFocused.value = !!cardElement?.contains(getDeepActiveElement(document))
  })
}
function handleCardRef(element: Element | ComponentPublicInstance | null) {
  const next = element instanceof HTMLElement ? element : null
  if (next === cardElement)
    return
  cardElement = next
  emit('cardElement', cardElement)
}

function handleCoverLoad(event: Event, imageIndex = 0) {
  if (imageIndex === 0)
    emit('coverLoad', event, moment.id)
}

function handlePreviewVideo(element: Element | ComponentPublicInstance | null) {
  emit('previewVideo', element instanceof Element ? element : null, moment)
}

function onMediaLeave() {
  if (!previewInteracting.value)
    emit('mediaLeave', moment)
}

function activateForwardPreviewLink(event: MouseEvent) {
  event.stopPropagation()
  // Reuse the existing link's navigation and visit tracking exactly once.
  const surface = event.currentTarget as HTMLElement
  surface.parentElement?.querySelector<HTMLAnchorElement>('.moment-media__link')?.click()
}

// The quoted cover opens the video, or the live room through its link; never
// the quoted moment around it.
function handleQuoteCoverClick(event: MouseEvent) {
  event.stopPropagation()
  if (moment.forward?.video)
    handleForwardVideoClick(event)
}

function handleForwardVideoClick(event: MouseEvent) {
  if (!moment.forward?.video?.url || event.button !== 0 || hasNavigationModifier(event) || navigationGuard.prevent(event))
    return
  event.preventDefault()
  emit('openVideoLink', moment.forward.video.url, moment.forward.video)
}

function handleRichLinkClick(event: MouseEvent, url: string) {
  if (!isMomentVideoUrl(url) || event.button !== 0 || hasNavigationModifier(event) || navigationGuard.prevent(event))
    return
  event.preventDefault()
  emit('openVideoLink', url)
}

function handleCommentImagePreview(images: string[], index: number, trigger: HTMLElement) {
  emit('openImagePreview', images, index, trigger)
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
  emit('interactionChange', false)
  releaseElementImages(cardElement)
  cardElement = null
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
      'moment-card--text': !moment.images.length && !moment.isVideo && !moment.isLive && !moment.isChargeExclusive && !hasQuoteMedia,
      'moment-card--compact-text': isCompactPlainTextMoment(moment),
      'moment-card--forward-video': !!moment.forward?.video,
      'moment-card--forward-draw': Boolean(moment.forward?.images?.length),
      'moment-card--charge': moment.isChargeExclusive,
      'moment-card--top-cover': hasTopCover,
      'moment-card--quote-media': hasQuoteMedia,
      'moment-card--portrait-top': isTopMediaPortrait,
      'moment-card--supports-wide-layout': supportsWideCardLayout,
      'moment-card--comments-expanded': commentExpanded,
      'moment-card--forward-expanded': forwardExpanded,
      'moment-card--preparing': !ready,
      'moment-card--entering': entering,
      'moment-card--lift-held': liftHeld,
    }"
    :style="[cardLayoutStyles, topToneStyles]"
    :data-description-expanded="descriptionExpanded ? 'true' : undefined"
    :data-bewly-portrait="isTopMediaPortrait ? '' : undefined"
    @focusin="cardFocused = true"
    @focusout="onCardFocusOut"
    @mouseenter="!moment.isLive && !settings.momentsOnlyCoverVideoPreview && emit('mediaEnter', moment, $event)"
    @mouseleave="onMediaLeave"
    @dragenter="onMediaLeave"
    @dragstart="onMediaLeave"
    @pointerdown.capture="navigationGuard.down"
    @pointermove.capture="navigationGuard.move"
    @pointerup.capture="navigationGuard.end"
    @pointercancel.capture="navigationGuard.end"
    @click.capture="guardLinkClick"
  >
    <a
      :href="primaryHref" target="_blank" rel="noopener noreferrer" draggable="false"
      class="moment-card__primary-action"
      :aria-label="primaryActionLabel"
      @click="openPrimaryDetail"
    />
    <div class="moment-card__surface" @click="handleSurfaceClick">
      <!-- Video and live covers, and an image post's images, fill the top of the
           card edge to edge; the bottom blends into the card through a short
           blur and colour fade. -->
      <MomentMediaStage
        v-if="hasTopCover"
        class="moment-card__top-media"
        :gallery="hasTopImages"
        :images="moment.images"
        :image-ratios="moment.imageRatios"
        :ratio="imageRatio"
        :author-name="moment.author.name"
        :cover="moment.images[0]"
        :cover-alt="moment.title"
        :href="primaryHref"
        :href-label="primaryActionLabel"
        :live="moment.isLive"
        :portrait="isTopMediaPortrait"
        :previewing="previewActive"
        :blur="ready && !entering"
        @shown="shownTopImage = $event"
        @first-load="handleCoverLoad"
        @preview="(index, trigger) => emit('openImagePreview', moment.images, index, trigger)"
        @cover-click="openPrimaryDetail"
        @cover-enter="(moment.isLive || settings.momentsOnlyCoverVideoPreview) && emit('mediaEnter', moment, $event)"
        @cover-leave="(moment.isLive || settings.momentsOnlyCoverVideoPreview) && onMediaLeave()"
        @cover-menu="openCoverMenu"
      >
        <MomentVideoPreview
          v-if="previewActive"
          :url="previewUrl"
          :loading="previewLoading"
          :generation="previewGeneration"
          :live="moment.isLive"
          @video="handlePreviewVideo"
          @interaction-change="previewInteracting = $event"
          @leave="onMediaLeave"
        />
      </MomentMediaStage>
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
          <a :href="`https://space.bilibili.com/${moment.author.mid}`" target="_blank" rel="noopener noreferrer" @click.stop>
            <strong>{{ moment.author.name }}</strong>
          </a>
          <small>{{ moment.time || t('moment_card.just_now') }}</small>
        </span>
        <MomentPromotionBadge v-if="moment.momentPromotion" :promotion="moment.momentPromotion" />
        <button
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
          <span i-tabler:dots-vertical aria-hidden="true" />
        </button>
      </header>

      <div
        class="moment-card__main"
        :class="{
          'moment-card__main--has-media': !hasTopCover && !moment.isForward && (!moment.isChargeExclusive || moment.isVideo) && (moment.isVideo || moment.isLive),
          'moment-card__main--video': !moment.isForward && (moment.isVideo || (!moment.isChargeExclusive && moment.isLive)),
          'moment-card__main--live': !moment.isForward && !moment.isChargeExclusive && moment.isLive,
        }"
      >
        <div
          v-if="!hasTopCover && !moment.isForward && (moment.isVideo || moment.isLive) && (!moment.isChargeExclusive || moment.isVideo)"
          class="moment-card__media moment-card__cover moment-card__text-cover moment-card__text-cover--video"
          @contextmenu="openCoverMenu"
        >
          <a
            :href="primaryHref" class="moment-card__cover-link" target="_blank" rel="noopener noreferrer" draggable="false"
            :aria-label="primaryActionLabel" @click="openPrimaryDetail"
          />
          <span v-if="moment.isLive" i-tabler-live-photo class="moment-card__text-cover-icon" />
          <span v-else i-tabler-player-play-filled class="moment-card__text-cover-icon" />
          <span>{{ moment.isLive ? t('moment_card.live_moment') : t('moment_card.video_moment') }}</span>
        </div>

        <div class="moment-card__body">
          <p v-if="moment.title && !moment.isForward" class="moment-card__title">
            <VideoWatchedTag
              v-if="moment.isVideo"
              :aid="moment.aid"
              :bvid="moment.bvid"
            />
            {{ moment.title }}
          </p>
          <p
            v-if="moment.mediaMeta && !moment.isForward && !moment.isChargeExclusive && (!moment.isVideo || moment.isLive)"
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
                    @click.stop="handleRichLinkClick($event, segment.url)"
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
              :aria-expanded="descriptionOpen"
              @click.stop="toggleDescription"
            >
              {{ t(descriptionOpen ? 'moment_card.collapse_text' : 'moment_card.expand_text') }}
            </button>
          </div>
          <!-- A quoted moment: a smaller card with the same top media and
               author row, its corners nested inside this card's. -->
          <div
            v-if="moment.forward"
            class="moment-card__quote"
            :class="{ 'moment-card__quote--portrait': isQuotePortrait }"
            :style="quoteToneStyles"
          >
            <div
              class="moment-card__quote-surface"
              :class="{ 'moment-card__quote-surface--media': hasQuoteMedia, 'moment-card__quote-surface--origin': !moment.forward.video }"
              :role="moment.forward.video ? undefined : 'button'"
              :tabindex="moment.forward.video ? undefined : 0"
              :aria-label="moment.forward.video ? undefined : t('moment_card.open_origin_moment', { name: moment.forward.author })"
              @click="!moment.forward.video && handleForwardOriginClick($event)"
              @keydown="!moment.forward.video && handleForwardOriginKeydown($event)"
            >
              <MomentMediaStage
                v-if="quoteCover"
                :cover="quoteCover.cover"
                :cover-alt="quoteCover.alt"
                :href="quoteCover.href"
                :href-label="quoteCover.label"
                :live="quoteCover.live"
                :previewing="previewActive"
                :blur="ready && !entering"
                @cover-click="handleQuoteCoverClick"
                @cover-enter="(moment.isLive || settings.momentsOnlyCoverVideoPreview) && emit('mediaEnter', moment, $event)"
                @cover-leave="(moment.isLive || settings.momentsOnlyCoverVideoPreview) && onMediaLeave()"
                @cover-menu="openCoverMenu"
              >
                <MomentVideoPreview
                  v-if="previewActive"
                  :url="previewUrl"
                  :loading="previewLoading"
                  :generation="previewGeneration"
                  :live="moment.isLive"
                  @video="handlePreviewVideo"
                  @interaction-change="previewInteracting = $event"
                  @leave="onMediaLeave"
                  @activate="activateForwardPreviewLink"
                />
              </MomentMediaStage>
              <MomentMediaStage
                v-else-if="quoteImages.length"
                gallery
                :images="quoteImages"
                :image-ratios="moment.forward.imageRatios"
                :ratio="quoteImageRatio"
                :author-name="moment.forward.author"
                :portrait="isQuotePortrait"
                :blur="ready && !entering"
                @shown="shownQuoteImage = $event"
                @preview="(index, trigger) => emit('openImagePreview', quoteImages, index, trigger)"
              />
              <div class="moment-card__quote-body">
                <div class="moment-card__quote-source">
                  <component
                    :is="moment.forward.authorMid ? 'a' : 'span'"
                    :href="moment.forward.authorMid ? `https://space.bilibili.com/${moment.forward.authorMid}` : undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click.stop
                  >
                    <img v-if="moment.forward.authorFace" :src="getAvatarThumbnailUrl(moment.forward.authorFace)" alt="" loading="lazy" decoding="async">
                    <span>{{ moment.forward.author }}</span>
                  </component>
                  <span>{{ moment.forward.authorAction || (moment.forward.video ? t('moment_card.video_post') : '') }}</span>
                </div>
                <a
                  v-if="moment.forward.video"
                  :href="moment.forward.video.url || undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="moment-card__quote-title"
                  @click.stop="handleForwardVideoClick"
                >
                  <VideoWatchedTag :aid="moment.forward.video.aid" :bvid="moment.forward.video.bvid" />
                  {{ quoteTitle || moment.forward.fallback }}
                </a>
                <p v-else-if="quoteTitle" class="moment-card__quote-title">
                  {{ quoteTitle }}
                </p>
                <p v-if="quoteText" class="moment-card__quote-text">
                  {{ quoteText }}
                </p>
                <small v-if="moment.forward.video?.author && moment.forward.video.author.mid !== moment.forward.authorMid" class="moment-card__quote-meta">
                  <span i-tabler-user aria-hidden="true" />{{ moment.forward.video.author.name }}
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Teleport
        v-if="showVideoOptions"
        :to="mainAppRef"
      >
        <MomentMoreMenu
          :moment="moment"
          :video="menuVideo"
          :href="primaryHref"
          :menu-styles="videoOptionsFloatingStyles"
          :anchor="menuAnchor"
          :trigger="menuTrigger"
          :watch-later="menuWatchLater"
          :layout-target="menuLayoutTarget"
          @close="closeVideoOptions"
          @request-delete="requestMomentOperation('delete')"
          @request-report="requestMomentOperation('report')"
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
          :aria-busy="isReservationLoading"
          :aria-label="reservationActionLabel"
          :aria-pressed="Boolean(moment.additional.isReserved)"
          @click.stop="emit('toggleReservation', moment)"
        >
          <LoadingRing :loading="isReservationLoading" />
          <span>{{ reservationActionLabel }}</span>
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
          {{ formatCount(moment.commentCount + addedCommentCount) }}
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
        ref="disclosureRef"
        class="moment-card__disclosure"
        :style="{ height: disclosureHeight === undefined ? undefined : `${disclosureHeight}px` }"
        :class="{ 'is-open': disclosure !== 'none' }"
        :aria-hidden="disclosure === 'none'"
        :inert="disclosure === 'none'"
        @transitionend="handleDisclosureTransitionEnd"
        @transitioncancel="handleDisclosureTransitionEnd"
      >
        <div ref="disclosureContentRef" class="moment-card__disclosure-inner">
          <div
            v-if="displayedDisclosure === 'comments' && canExpandComments"
            :id="commentSectionId"
            class="moment-card__comments"
          >
            <MomentCommentSection
              :moment="moment"
              :active="commentExpanded"
              @writing-change="commentWriting = $event"
              @posted="addedCommentCount += 1"
              @removed="addedCommentCount -= $event"
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
              :autofocus="forwardFocusRequested"
              @interaction-change="forwardInteracting = $event"
              @close="closeForwardComposer"
            />
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style lang="scss" scoped>
@use "../../styles/truncateFade";
@use "../../styles/contentCard";
@use "../../styles/breakpoints";
@use "../../styles/momentDisclosure";
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
  // The card wears the video cover's corner and frame (user request).
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
  background-color: transparent;
  cursor: pointer;
  // Its own stacking context: the surface's z-index stays inside the card, so
  // a hovered card (z-index 1) is drawn over every neighbour, not under the
  // later ones.
  isolation: isolate;
  // Same hover as video cards: the whole card scales above its neighbours,
  // a little less since the card is much larger. Open comments and forwarding
  // scale too; layout reads ignore the scale (getLayoutHeight).
  @include contentCard.hover-lift(var(--bew-moment-card-hover-scale), ".moment-card--lift-held");
}

.moment-card__surface {
  // Video cover frame: the hairline drawn over the content, then the shadow.
  @include contentCard.media-frame;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: inherit;
  corner-shape: inherit;
  // Opaque, though it looks the same as the translucent surface over the page:
  // a hovered card overlapping its neighbours must not show them through.
  background: var(--bew-elevated-over-page);
  pointer-events: auto;
  transition: box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);
}

@media (hover: hover) and (pointer: fine) {
  .moment-card:hover .moment-card__surface {
    box-shadow: var(--bew-shadow-2);
  }
}

.moment-card:focus-within .moment-card__surface {
  box-shadow: var(--bew-shadow-2);
}

// Covers fill the top of the card, and a quote's media the top of its quote
// (MomentMediaStage). The surface does not clip: an ancestor that pairs a
// smooth corner with an overflow clip makes Chromium drop the blur's masks.
.moment-card--top-cover .moment-card__surface,
.moment-card--quote-media .moment-card__surface {
  overflow: visible;
}

// Below a portrait picture a surface takes the picture's colour where it is
// cut (useImageTone): the card under its top image, or a quote under its own.
// All text turns black or white for that colour; fills, borders, hovers and
// the composer glass derive from the same foreground. Until the colour is read
// the surface keeps its own; the two colours are registered, so reading one,
// or switching to an image with another, eases every derived colour, the
// fade's gradient included. The fallbacks sit on the host and the overrides on
// the surface: on one element they would refer to each other.
$tone-transition:
  --moment-tone var(--bew-duration-moderate) var(--bew-ease-standard),
  --moment-tone-fg var(--bew-duration-moderate) var(--bew-ease-standard);

@mixin toned-surface {
  --bew-elevated-over-page: var(--moment-tone);
  --bew-elevated-solid: color-mix(in srgb, var(--moment-tone-fg) 8%, var(--moment-tone));
  --bew-neutral-fg: var(--moment-tone-fg);
  --bew-text-1: var(--moment-tone-fg);
  --bew-text-2: color-mix(in srgb, var(--moment-tone-fg) 80%, transparent);
  --bew-text-3: color-mix(in srgb, var(--moment-tone-fg) 70%, transparent);
  --bew-text-4: color-mix(in srgb, var(--moment-tone-fg) 50%, transparent);
  --bew-fill-1: color-mix(in srgb, var(--moment-tone-fg) 6%, transparent);
  --bew-fill-2: color-mix(in srgb, var(--moment-tone-fg) 10%, transparent);
  --bew-fill-3: color-mix(in srgb, var(--moment-tone-fg) 15%, transparent);
  --bew-fill-4: color-mix(in srgb, var(--moment-tone-fg) 22%, transparent);
  --bew-border-color: color-mix(in srgb, var(--moment-tone-fg) 16%, transparent);
  --bew-surface-border-color: color-mix(in srgb, var(--moment-tone-fg) 18%, transparent);
  --bew-hover-bg: color-mix(in srgb, var(--moment-tone-fg) 8%, transparent);
  --bew-selected-bg: color-mix(in srgb, var(--moment-tone-fg) 12%, transparent);
  --bew-theme-foreground: var(--moment-tone-fg);
  // Glass stays glass: the solid tint takes the tone, and the glass tint is it
  // at the global glass opacity, as the shared tokens are built. Inherited
  // tints were resolved against the page's solid tint, so all four are set.
  --bew-glass-tint-solid: color-mix(in srgb, var(--moment-tone-fg) 10%, var(--moment-tone));
  --bew-glass-tint-solid-hover: color-mix(in srgb, var(--moment-tone-fg) 7%, var(--bew-glass-tint-solid));
  --bew-glass-tint: rgb(from var(--bew-glass-tint-solid) r g b / var(--bew-content-opacity));
  --bew-glass-tint-hover: rgb(from var(--bew-glass-tint-solid-hover) r g b / var(--bew-content-opacity));
  --bew-glass-border-color: var(--bew-surface-border-color);
  color: var(--bew-text-1);
  color-scheme: var(--moment-tone-scheme);
}

.moment-card--portrait-top {
  --moment-tone: var(--bew-elevated-over-page);
  --moment-tone-fg: var(--bew-neutral-fg);
}

.moment-card--portrait-top .moment-card__surface {
  @include toned-surface;
  transition:
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard),
    $tone-transition;

  @media (prefers-reduced-motion: reduce) {
    transition: box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);
  }
}

.moment-card--top-cover .moment-card__header {
  padding-top: var(--bew-card-stack-gap);
}

.moment-card__cover-link {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  corner-shape: inherit;
}

.moment-card__surface :is(a, button, [role="button"]),
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
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
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

.moment-card__text-cover {
  min-height: 152px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
  background: var(--bew-theme-surface);
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
  --bew-truncate-lines: 10;
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
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
  line-height: var(--bew-line-height-control);
}

.moment-card__desc {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  @include truncateFade.lines(4);
}

.moment-card__footer {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
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
  border-radius: var(--bew-interactive-radius);
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
  @include truncateFade.line;
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
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-foreground);
  background: transparent;
  box-sizing: border-box;
  cursor: pointer;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
  white-space: nowrap;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__additional-action:hover {
  background: var(--bew-theme-surface);
}

.moment-card__additional-action.is-reserved {
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
}

.moment-card__additional-action:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
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
  border-radius: var(--bew-interactive-radius);
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
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
}

.moment-card__likes:active {
  transform: scale(0.94);
}

.moment-card__likes.is-liked {
  color: var(--bew-text-1);
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
  padding: var(--bew-card-inset) var(--bew-card-inset) var(--bew-card-stack-gap);
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
  @include truncateFade.line;
}

.moment-card__identity strong {
  display: block;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);
  font-weight: var(--bew-font-weight-medium);
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
}

.moment-card__identity a:is(:hover, :focus-visible) strong {
  color: var(--bew-theme-foreground);
}

.moment-card__identity small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.moment-card__main {
  // The side inset equals the card radius, so media inside keep the full media
  // radius instead of a concentric one (inset >= outer radius).
  padding: 0 var(--bew-card-inset) var(--bew-space-3);
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

.moment-card__media {
  min-width: 0;
  overflow: hidden;
  border-radius: var(--bew-media-radius);
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
  // Its header inset exceeds the card radius, so no concentric constraint applies.
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
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
  outline: var(--bew-focus-ring, 1px solid CanvasText);
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
.moment-card__main--has-media:not(.moment-card__main--live) .moment-card__body {
  @include contentCard.under-cover(var(--bew-media-radius));
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
  --bew-truncate-lines: var(--moment-card-description-lines, 3);
}

.moment-card__main--video:not(.moment-card__main--live) .moment-card__title {
  flex: 0 0 auto;
  @include truncateFade.lines(2);
}

.moment-card--text .moment-card__body {
  padding-top: 0;
}

.moment-card--text .moment-card__desc,
.moment-card--forward-video .moment-card__desc {
  --bew-truncate-lines: var(--moment-card-description-lines, 7);
}

.moment-card--forward-draw .moment-card__body {
  min-height: 0;
}

.moment-card--compact-text .moment-card__body {
  min-height: 0;
}

.moment-card__title {
  margin-bottom: var(--bew-space-1);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-title);
}

.moment-card__desc {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  --bew-truncate-lines: var(--moment-card-description-lines, 7);
}

.moment-card__desc.is-expanded:not([data-description-measure-collapsed]) {
  @include truncateFade.release;
}

.moment-card__desc--inherited {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  --bew-truncate-lines: 2;
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
  outline: var(--bew-focus-ring, 1px solid CanvasText);
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

.moment-card__more,
.moment-card__reserve-mark,
.moment-card__media-meta--live,
.moment-card__additional,
.moment-card__additional img,
.moment-card__likes,
.moment-card__media {
  corner-shape: var(--bew-corner-shape);
}

// A quoted moment: a smaller card inside this one. Its media (MomentMediaStage)
// fills its top and fades into its colour, then the author row and two lines.
// The card's inset (16) equals its corner, so the quote takes the smaller
// interactive corner and its thumbnail strip, inset by more than that, the
// tiny one: each corner nests inside the one around it (user request). The
// quote does not clip either (the blur's masks).
.moment-card__quote {
  --moment-quote-bg: color-mix(in srgb, var(--bew-neutral-fg) 5%, var(--bew-elevated-over-page));
  margin-top: var(--bew-space-3);
}

.moment-card__quote--portrait {
  --moment-tone: var(--moment-quote-bg);
  --moment-tone-fg: var(--bew-neutral-fg);
}

.moment-card__quote-surface {
  --moment-media-corners: var(--bew-interactive-radius) var(--bew-interactive-radius) 0 0;
  --moment-media-inset: var(--bew-space-3);
  --moment-media-strip-radius: var(--bew-radius-tiny);
  --moment-media-base: var(--moment-quote-bg);
  display: flex;
  flex-direction: column;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-2);
  background: var(--moment-quote-bg);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  pointer-events: auto;
}

.moment-card__quote-surface--origin {
  cursor: pointer;
}

.moment-card__quote-surface:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: 2px;
}

.moment-card__quote--portrait .moment-card__quote-surface {
  @include toned-surface;
  --moment-quote-bg: var(--moment-tone);
  transition: $tone-transition;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.moment-card__quote-body {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  min-width: 0;
  padding: var(--bew-space-3);
}

.moment-card__quote-surface--media .moment-card__quote-body {
  padding-top: var(--bew-space-2);
}

.moment-card__quote-source {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bew-space-1) var(--bew-space-2);
  margin-bottom: var(--bew-space-1);
  color: var(--bew-text-2);

  > :first-child {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-2);
    min-width: 0;
    color: var(--bew-text-1);
    font-weight: var(--bew-font-weight-medium);
    text-decoration: none;
    transition: color var(--bew-duration-fast) var(--bew-ease-standard);
  }

  a:hover {
    color: var(--bew-theme-foreground);
  }

  img {
    width: var(--bew-space-6);
    height: var(--bew-space-6);
    flex: none;
    border-radius: 50%;
    corner-shape: var(--bew-corner-shape-round);
    object-fit: cover;
  }
}

.moment-card__quote-title {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-title);
  text-decoration: none;
  @include truncateFade.lines(2);
}

.moment-card__quote-text {
  margin: 0;
  @include truncateFade.lines(2);
}

.moment-card__quote-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-1);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  @include truncateFade.line;
}

@media (prefers-reduced-motion: reduce) {
  .moment-card__quote-source > :first-child {
    transition: none;
  }
}

.moment-card__additional--footer {
  margin: 0 var(--bew-space-4) var(--bew-space-3);
}

.moment-card__hot-comment {
  display: flex;
  width: calc(100% - 2 * var(--bew-card-inset));
  max-width: 100%;
  min-height: 40px;
  align-items: center;
  gap: var(--bew-space-2);
  margin: 0 var(--bew-card-inset) var(--bew-card-stack-gap);
  padding: var(--bew-space-2) var(--bew-space-3);
  overflow: hidden;
  border: 0;
  border-radius: var(--bew-interactive-radius);
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
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
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
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-medium);
}

.moment-card__hot-comment-content {
  display: block;
  min-width: 0;
  @include truncateFade.line;
}

.moment-card__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: 0;
  min-height: var(--bew-space-10);
  padding: 0 var(--bew-space-2);
  box-sizing: border-box;
  margin: 0;
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
  height: var(--bew-icon-button-size-md);
  margin: 0;
  padding: 0 var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
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
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
}

.moment-card__footer > button.is-active {
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
}

.moment-card__footer > button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.moment-card__footer .moment-card__likes:active {
  transform: none;
}

.moment-card__footer .moment-card__likes:disabled {
  cursor: wait;
  opacity: 0.65;
}

.moment-card__comments,
.moment-card__forward-disclosure {
  min-width: 0;
  background: transparent;
  cursor: default;
}

@container (max-width: 359px) {
  .moment-card__main--has-media.moment-card__main--live .moment-card__body {
    @include contentCard.under-cover(var(--bew-media-radius));
  }
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
@container (min-width: #{breakpoints.$moment-card-wide}) {
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

  // A wide card puts its top cover down the left, flush with the top and left
  // edges, beside the header and body.
  .moment-card--top-cover.moment-card--supports-wide-layout .moment-card__top-media {
    --moment-media-corners: var(--bew-media-radius) 0 0 0;
    grid-column: 1;
    grid-row: 1 / span 2;
    align-self: start;
  }

  .moment-card--top-cover.moment-card--supports-wide-layout .moment-card__header {
    grid-column: 2;
    grid-row: 1;
    padding-top: var(--bew-card-inset);
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
