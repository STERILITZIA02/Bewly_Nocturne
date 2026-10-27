<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ALink from '~/components/ALink.vue'
import Empty from '~/components/Empty.vue'
import IconButton from '~/components/IconButton.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import MomentReadMarker from '~/components/MomentReadMarker.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { createAccountLifetime } from '~/utils/accountLifetime'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { getUserID, scrollToTop } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { keepMomentAnchorInterval } from '~/utils/momentsReadPosition'
import { retiringListTransition } from '~/utils/motionPresence'
import type { ScrollPositionClaim } from '~/utils/scrollIntent'
import { claimScrollCardAnchor, claimScrollPosition, ownsScrollPosition, resolveScrollCardAnchor, scrollToPosition } from '~/utils/scrollIntent'
import { readViewportGeometry } from '~/utils/viewportGeometry'
import { updateOwnedWatchLater } from '~/utils/watchLater'

import PopoverListSkeleton from './PopoverListSkeleton.vue'

type MomentType = 'video' | 'live' | 'article'
interface MomentTab { type: MomentType, name: string }

const topBarStore = useTopBarStore()
const toast = useToast()
const watchLaterLifetime = createAccountLifetime(() => {
  const accountId = resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid)
  return String(accountId) === getUserID() ? accountId : null
})
const watchLaterWrites = new Map<number, symbol>()
onScopeDispose(() => watchLaterLifetime.dispose())
watch(() => topBarStore.userInfo.mid, () => {
  watchLaterLifetime.invalidate()
  watchLaterWrites.clear()
}, { flush: 'sync' })

const { t } = useI18n()

const momentTabs = computed((): MomentTab[] => {
  return [
    {
      type: 'video',
      // 如果开启了过滤专栏，显示"视频"，否则显示"全部"
      name: settings.value.filterArticlesInMoments
        ? t('topbar.moments_dropdown.tabs.videos')
        : t('topbar.moments_dropdown.tabs.all'),
    },
    {
      type: 'live',
      name: t('topbar.moments_dropdown.tabs.live'),
    },
  ]
},
)
const selectedMomentTab = ref<MomentTab>(momentTabs.value[0])

const momentsWrap = ref<HTMLElement>()
let mounted = true
let lastReadingInput = 0
let readingIntent: ScrollPositionClaim | undefined
let readVersion = 0
const entryBoundary = shallowRef<{ id: string, local: boolean }>()
const boundaryId = computed(() => {
  const boundary = entryBoundary.value
  if (!boundary)
    return
  const threshold = BigInt(boundary.id) - (boundary.local ? 0n : 1n)
  return topBarStore.moments.find(item => item.dynamicId && BigInt(item.dynamicId) <= threshold)?.id_str
})
const gapBoundaryId = computed(() => topBarStore.momentNewerGap ? topBarStore.moments.find(item => item.dynamicId && BigInt(item.dynamicId) <= BigInt(topBarStore.momentNewerGap!.targetId))?.id_str : undefined)

function captureAnchor() {
  const wrap = momentsWrap.value
  if (!wrap)
    return
  const geometry = readViewportGeometry(wrap)
  const cards = Array.from(wrap.querySelectorAll<HTMLElement>('[data-moment-id]')).map(element => ({ key: element.dataset.momentId!, top: element.getBoundingClientRect().top - geometry.top + geometry.scrollTop }))
  return claimScrollCardAnchor(wrap, cards)
}
function rememberReading() {
  const wrap = momentsWrap.value
  if (!wrap || selectedMomentTab.value.type !== 'video' || document.hidden)
    return
  const claim = claimScrollPosition(wrap)
  if (claim.inputVersion !== lastReadingInput) {
    lastReadingInput = claim.inputVersion
    readingIntent = claim
  }
  if (!readingIntent || !ownsScrollPosition(wrap, readingIntent) || topBarStore.isLoadingNewerMoments)
    return
  const anchor = captureAnchor()?.candidates[0]
  if (anchor)
    topBarStore.momentReadingBookmark = { id: anchor.key, offset: anchor.offset }
}

async function getNewerData() {
  const wrap = momentsWrap.value
  if (!wrap || document.hidden || selectedMomentTab.value.type !== 'video')
    return
  const version = readVersion
  const anchor = keepMomentAnchorInterval(captureAnchor(), topBarStore.momentNewerGap)
  await topBarStore.getNewerTopBarMoments()
  await nextTick()
  if (!mounted || document.hidden || version !== readVersion || momentsWrap.value !== wrap || !anchor)
    return
  const geometry = readViewportGeometry(wrap)
  const offsets = new Map(Array.from(wrap.querySelectorAll<HTMLElement>('[data-moment-id]')).map(element => [element.dataset.momentId!, element.getBoundingClientRect().top - geometry.top + geometry.scrollTop]))
  const top = resolveScrollCardAnchor(wrap, anchor, id => offsets.get(id))
  if (top !== undefined)
    wrap.scrollTop = top
}

watch(() => selectedMomentTab.value.type, (newVal, oldVal) => {
  if (newVal === oldVal)
    return

  if (momentsWrap.value)
    scrollToTop(momentsWrap.value)

  initData()
})
watch(() => settings.value.filterArticlesInMoments, () => {
  if (selectedMomentTab.value.type === 'video')
    void initData()
}, { flush: 'sync' })

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (topBarStore.isLoadingMoments || topBarStore.moments.length === 0)
    return

  getData()
}

useOptimizedScroll(
  momentsWrap,
  { onReachBottom: handleReachBottom, onScroll: rememberReading },
  { bottomThreshold: 400, throttleDelay: 100 },
)

function onClickTab(tab: MomentTab) {
  // Prevent changing tab when loading, cuz it will cause a bug
  if (topBarStore.isLoadingMoments || tab.type === selectedMomentTab.value.type)
    return

  selectedMomentTab.value = tab
  // 移除这里的 initData() 调用，因为 watch 已经会处理
}

async function initData(start: 'automatic' | 'resume' | 'latest' = 'automatic') {
  const version = ++readVersion
  readingIntent = undefined
  const type = selectedMomentTab.value.type
  const wrap = momentsWrap.value
  if (wrap)
    scrollToPosition(wrap, 0)
  const claim = wrap ? claimScrollPosition(wrap) : undefined
  const bookmark = type === 'video' ? topBarStore.momentReadingBookmark : undefined
  void topBarStore.ensureWatchLaterState()
  await topBarStore.initMomentsData(type, start)
  if (!mounted || version !== readVersion)
    return
  const boundary = bookmark?.id ?? topBarStore.momentEntrySnapshot?.oldestId
  entryBoundary.value = type === 'video' && boundary ? { id: boundary, local: !!bookmark } : undefined
  await nextTick()
  if (!mounted || version !== readVersion || !wrap || !claim)
    return
  if (bookmark && (start === 'resume' || (start === 'automatic' && settings.value.momentsStartFromLastSeen))) {
    const geometry = readViewportGeometry(wrap)
    const card = wrap.querySelector<HTMLElement>(`[data-moment-id="${bookmark.id}"]`)
    const top = resolveScrollCardAnchor(wrap, { position: claim, candidates: [{ key: bookmark.id, offset: bookmark.offset }] }, () => card ? card.getBoundingClientRect().top - geometry.top + geometry.scrollTop : undefined)
    if (top !== undefined)
      wrap.scrollTop = top
  }
  if (type === 'video' && !topBarStore.momentAtLatest && !document.hidden)
    await getNewerData()
}

onBeforeUnmount(() => {
  mounted = false
  readVersion++
  topBarStore.releaseMomentList()
})

function getData() {
  topBarStore.getMomentsData(selectedMomentTab.value.type)
}

async function toggleWatchLater(aid: number) {
  if (watchLaterWrites.has(aid))
    return
  const owner = watchLaterLifetime.capture()
  const requestId = Symbol('watch-later')
  watchLaterWrites.set(aid, requestId)
  try {
    const result = await updateOwnedWatchLater({ aid }, 'toggle', owner, topBarStore)
    if (owner.isCurrent() && result.status === 'failed')
      toast.error(result.message || t('video_card.watch_later_update_failed'))
  }
  catch (error) {
    if (owner.isCurrent() && !isExtensionContextInvalidatedError(error))
      toast.error(t('video_card.watch_later_update_failed'))
  }
  finally {
    if (watchLaterWrites.get(aid) === requestId)
      watchLaterWrites.delete(aid)
  }
}

defineExpose({
  initData,
})
</script>

<template>
  <div
    class="moments-pop bew-popover bew-popover-surface"
    data-key="moments"
  >
    <header class="bew-popover__header">
      <div
        class="moments-pop__tabs bew-segment-control"
      >
        <LiquidSegmentIndicator :active-key="selectedMomentTab.type" />
        <button
          v-for="tab in momentTabs"
          :key="tab.type"
          type="button"
          class="bew-segment-control__item"
          data-segment-item
          :data-active="tab.type === selectedMomentTab.type ? 'true' : 'false'"
          :disabled="topBarStore.isLoadingMoments"
          @click="onClickTab(tab)"
        >
          {{ tab.name }}
        </button>
      </div>
      <div class="bew-popover__actions">
        <Tooltip :content="$t('common.view_all')" placement="bottom" teleport>
          <ALink href="https://t.bilibili.com/" type="topBar" class="bew-popover__action" :aria-label="$t('common.view_all')">
            <i i-tabler:arrow-up-right />
          </ALink>
        </Tooltip>
      </div>
    </header>

    <main
      ref="momentsWrap"
      class="bew-popover__body bew-popover__scroll bew-popover__list moments-pop__scroll"
    >
      <PopoverListSkeleton
        v-if="topBarStore.isLoadingMoments && topBarStore.moments.length === 0"
        variant="moments"
      />

      <div v-if="selectedMomentTab.type === 'video'" class="moments-reading-actions">
        <button v-if="topBarStore.momentReadingBookmark || topBarStore.momentEntrySnapshot?.oldestId" type="button" :disabled="topBarStore.isLoadingMoments || topBarStore.isLoadingNewerMoments" @click="initData('resume')">
          {{ t(topBarStore.momentReadingBookmark ? 'moments.jump_to_last_seen' : 'moments.jump_to_video_boundary') }}
        </button>
        <button type="button" :disabled="topBarStore.isLoadingMoments || topBarStore.isLoadingNewerMoments" @click="initData('latest')">
          {{ t('moments.jump_to_latest') }}
        </button>
        <button v-if="!topBarStore.momentAtLatest" type="button" :disabled="topBarStore.isLoadingMoments || topBarStore.isLoadingNewerMoments" @click="getNewerData">
          {{ t('moments.load_newer') }}
        </button>
        <span v-if="topBarStore.momentNewerGap" class="bew-help" role="status">{{ t(`moments.join_${topBarStore.momentJoinStatus}`) }}</span>
        <span v-if="topBarStore.visibleNewMomentsCount" class="bew-help">{{ t('moments.loaded_new_videos', { count: topBarStore.visibleNewMomentsCount }) }}</span>
      </div>

      <Empty
        v-if="!topBarStore.isLoadingMoments && topBarStore.moments.length === 0"
        :description="topBarStore.momentsPageFailed ? t('common.load_failed') : undefined"
        class="bew-popover__state"
      />
      <div v-if="topBarStore.momentsPageFailed" class="moments-reading-actions">
        <button type="button" :disabled="topBarStore.isLoadingMoments" @click="topBarStore.getTopBarMoments(selectedMomentTab.type, false, true)">
          {{ t('moments.retry') }}
        </button>
      </div>

      <TransitionGroup name="list" v-bind="retiringListTransition">
        <article
          v-for="(moment, index) in topBarStore.moments"
          :key="moment.id_str"
          :data-moment-id="moment.dynamicId"
          class="popover-card"
        >
          <MomentReadMarker v-if="moment.id_str === boundaryId" :label="t(entryBoundary?.local ? 'moments.local_bookmark' : 'moments.video_boundary')" />
          <button v-if="moment.id_str === gapBoundaryId" type="button" class="popover-card__interactive" :disabled="topBarStore.isLoadingNewerMoments" @click="getNewerData">
            {{ t('moments.continue_gap') }}
          </button>
          <ALink
            class="popover-card__primary"
            :href="moment.link"
            :aria-label="moment.title"
            type="topBar"
          />
          <span
            v-if="topBarStore.isNewMoment(index) && selectedMomentTab.type === 'video'"
            class="moments-pop__new-dot bew-shape-circle"
            aria-hidden="true"
          />
          <div class="popover-card__content">
            <ALink
              :href="moment.authorJumpUrl"
              type="topBar"
              class="popover-card__interactive moments-pop__avatar bew-shape-circle"
            >
              <img :src="`${moment.authorFace}@50w_50h_1c`" alt="">
            </ALink>

            <div class="popover-card__copy">
              <!-- A joint upload lists every author. -->
              <div class="moments-pop__authors">
                <template v-if="moment.isCollaborative && moment.authors">
                  <template v-for="(author, authorIndex) in moment.authors" :key="author.jump_url">
                    <ALink :href="author.jump_url" type="topBar" class="popover-card__interactive">
                      {{ author.name }}
                    </ALink>
                    <span v-if="Number(authorIndex) < moment.authors.length - 1">/</span>
                  </template>
                </template>
                <ALink v-else :href="moment.authorJumpUrl" type="topBar" class="popover-card__interactive">
                  {{ moment.author }}
                </ALink>
              </div>
              <div class="popover-card__title keep-two-lines">
                {{ moment.title }}
              </div>
              <div class="popover-card__footer">
                <p class="popover-card__meta">
                  <span v-if="selectedMomentTab.type === 'live'" class="moments-pop__live">
                    <i i-tabler:broadcast aria-hidden="true" />
                    {{ $t('topbar.moments_dropdown.live_status') }}
                  </span>
                  <span v-else>{{ moment.pubTime }}</span>
                </p>
                <div v-if="moment.watchLaterAid" class="popover-card__actions">
                  <Tooltip :content="topBarStore.isInWatchLater(moment.watchLaterAid) === undefined ? $t('common.watch_later_status_unknown') : topBarStore.isInWatchLater(moment.watchLaterAid) ? $t('common.remove_from_watch_later') : $t('common.save_to_watch_later')" placement="top" teleport>
                    <IconButton
                      :label="topBarStore.isInWatchLater(moment.watchLaterAid) === undefined ? $t('common.watch_later_status_unknown') : topBarStore.isInWatchLater(moment.watchLaterAid) ? $t('common.remove_from_watch_later') : $t('common.save_to_watch_later')"
                      :aria-pressed="topBarStore.isInWatchLater(moment.watchLaterAid) === true"
                      class="popover-card__interactive bew-popover__action"
                      @click.stop.prevent="toggleWatchLater(moment.watchLaterAid)"
                    >
                      <i :class="topBarStore.isInWatchLater(moment.watchLaterAid) ? 'i-tabler:check' : 'i-tabler:clock'" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            </div>

            <div class="popover-card__media">
              <img :src="`${moment.cover}@164w_92h_1c`" :alt="moment.title">
            </div>
          </div>
        </article>
      </TransitionGroup>

      <!-- loading -->
      <Transition name="fade">
        <PopoverListSkeleton v-if="topBarStore.isLoadingMoments && topBarStore.moments.length !== 0" variant="moments" :count="2" />
      </Transition>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../../styles/truncateFade";
@use "../../styles/popoverCards";

.moments-pop {
  --bew-popover-media-width: 82px;
  --bew-popover-media-ratio: 82 / 46;
  width: 380px;
  height: min(500px, var(--bew-popover-max-height));
}

.moments-pop__tabs {
  flex: 0 0 auto;
}

.moments-pop__avatar {
  flex: 0 0 auto;
  align-self: flex-start;
  width: var(--bew-space-10);
  height: var(--bew-space-10);
  overflow: hidden;
  background: var(--bew-skeleton);

  img {
    display: block;
    width: 100%;
    height: 100%;
  }
}

// Unread marker in the row's leading gutter, level with the avatar.
.moments-pop__new-dot {
  position: absolute;
  top: calc(var(--bew-space-3) + var(--bew-space-5) - var(--bew-space-1));
  left: calc((var(--bew-popover-inset) - var(--bew-space-2)) / 2);
  width: var(--bew-space-2);
  height: var(--bew-space-2);
  background: var(--bew-accent-marker);
}

.moments-pop__authors {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-1);
  margin-bottom: var(--bew-space-0-5);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
  white-space: nowrap;

  a {
    min-width: 0;
    @include truncateFade.line;
  }
}

// The read boundary is a labelled rule across the top of its row.
.popover-card .moment-read-marker {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-2);
  padding: 0;
  color: var(--bew-text-3);
  background: none;

  &::after {
    content: "";
    flex: 1 1 auto;
    border-top: var(--bew-hairline) solid var(--bew-separator-color);
  }
}

.moments-pop__live {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  color: var(--bew-text-1);
}
</style>
