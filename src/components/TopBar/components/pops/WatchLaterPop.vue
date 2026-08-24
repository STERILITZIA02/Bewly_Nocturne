<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Empty from '~/components/Empty.vue'
import IconButton from '~/components/IconButton.vue'
import Loading from '~/components/Loading.vue'
import Picture from '~/components/Picture.vue'
import Progress from '~/components/Progress.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { isHomePage, isInIframe, removeHttpFromUrl } from '~/utils/main'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'
import { openLinkInBackground } from '~/utils/tabs'

const topBarStore = useTopBarStore()
const { t } = useI18n()
const toast = useToast()
const { watchLaterList, isLoadingWatchLater, watchLaterCount } = storeToRefs(topBarStore)
const viewAllUrl = computed((): string => {
  return 'https://www.bilibili.com/watchlater/list'
})
const playAllUrl = computed((): string => {
  return 'https://www.bilibili.com/list/watchlater'
})

const scrollContainer = ref<HTMLElement>()
const pendingActions = reactive(new Set<number>())

// 检查是否还有更多内容
const hasMoreContent = computed(() => {
  return watchLaterList.value.length < watchLaterCount.value
})

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (isLoadingWatchLater.value || !hasMoreContent.value)
    return

  topBarStore.loadMoreWatchLaterList()
}

useOptimizedScroll(
  scrollContainer,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

onMounted(async () => {
  await topBarStore.syncWatchLaterState(true)
})

function getVideoPageUrl(bvid: string): string {
  return `https://www.bilibili.com/video/${bvid}/`
}

function getWatchLaterVideoUrl(bvid: string): string {
  return `https://www.bilibili.com/list/watchlater?bvid=${bvid}`
}

function openVideoPage(url: string) {
  if (settings.value.topBarLinkOpenMode === 'background') {
    void openLinkInBackground(url)
    return
  }

  if (settings.value.topBarLinkOpenMode === 'currentTabIfNotHomepage') {
    // Keep the behavior consistent with ALink's target logic.
    if (isInIframe() || isHomePage()) {
      window.open(url, '_blank')
    }
    else {
      window.open(url, '_top')
    }
    return
  }

  if (settings.value.topBarLinkOpenMode === 'newTab') {
    window.open(url, '_blank')
    return
  }

  window.open(url, '_top')
}

async function deleteWatchLaterItem(aid: number): Promise<boolean> {
  if (pendingActions.has(aid))
    return false

  pendingActions.add(aid)
  try {
    const removed = await topBarStore.deleteWatchLaterItem(aid)
    if (!removed)
      toast.error(t('moments.watch_later_failed_retry'))
    return removed
  }
  finally {
    pendingActions.delete(aid)
  }
}

async function handleOpenVideoPageAndRemove(aid: number, bvid: string) {
  if (await deleteWatchLaterItem(aid))
    openVideoPage(getVideoPageUrl(bvid))
}
</script>

<template>
  <div
    class="watchLater-pop bew-popover bew-popover-surface"
    data-key="watchLater"
  >
    <header class="bew-popover__header">
      <h3 class="bew-popover__title">
        {{ $t('topbar.watch_later') }}
      </h3>

      <div class="bew-popover__actions">
        <ALink
          :href="playAllUrl"
          type="topBar"
          class="bew-popover__action"
        >
          {{ $t('common.play_all') }}
        </ALink>
        <ALink
          :href="viewAllUrl"
          type="topBar"
          class="bew-popover__action"
        >
          {{ $t('common.view_all') }}
        </ALink>
      </div>
    </header>

    <main
      ref="scrollContainer"
      class="bew-popover__body bew-popover__scroll bew-popover__list watch-later-pop__scroll"
    >
      <Loading
        v-if="isLoadingWatchLater && watchLaterList.length === 0"
        class="bew-popover__state"
      />

      <Empty
        v-if="!isLoadingWatchLater && watchLaterList.length === 0"
        class="bew-popover__state"
      />

      <!-- watchlater -->
      <TransitionGroup name="list">
        <article
          v-for="item in watchLaterList"
          :key="item.aid"
          class="group popover-card"
        >
          <ALink
            class="popover-card__primary"
            :href="getWatchLaterVideoUrl(item.bvid)"
            :aria-label="item.title"
            type="topBar"
          />
          <section class="popover-card__content" flex="~ gap-4 items-start">
            <!-- Video cover, live cover, ariticle cover -->
            <div
              class="popover-card__media watch-later-pop__media aspect-video"
            >
              <div
                class="popover-card__interactive popover-card-action watch-later-pop__leading-actions"
                pos="absolute top-0 left-0" z-1
                flex="~ gap-1"
                m="1"
              >
                <!-- Open in regular video page button -->
                <Tooltip :content="$t('watch_later.open_video_page')" placement="top">
                  <IconButton
                    class="popover-card__interactive popover-card__overlay-action"
                    :label="$t('watch_later.open_video_page')"
                    :disabled="pendingActions.has(item.aid)"
                    @click.stop.prevent="openVideoPage(getVideoPageUrl(item.bvid))"
                  >
                    <i i-tabler:external-link />
                  </IconButton>
                </Tooltip>

                <!-- Open in video page and remove button -->
                <Tooltip :content="$t('watch_later.play_video')" placement="top">
                  <IconButton
                    class="popover-card__interactive popover-card__overlay-action"
                    :label="$t('watch_later.play_video')"
                    :disabled="pendingActions.has(item.aid)"
                    @click.stop.prevent="handleOpenVideoPageAndRemove(item.aid, item.bvid)"
                  >
                    <i i-tabler:player-play />
                  </IconButton>
                </Tooltip>
              </div>

              <!-- Delete button -->
              <IconButton
                class="popover-card__interactive popover-card-action popover-card__overlay-action popover-card__overlay-action--danger watch-later-pop__remove"
                :label="$t('common.operation.delete')"
                :disabled="pendingActions.has(item.aid)"
                @click.stop.prevent="deleteWatchLaterItem(item.aid)"
              >
                <i i-mingcute:close-line />
              </IconButton>

              <!-- Video -->
              <div pos="absolute inset-0">
                <Picture
                  class="watch-later-pop__cover"
                  aspect-ratio="auto"
                  :src="`${removeHttpFromUrl(
                    item.pic,
                  )}@256w_144h_1c`"
                  :alt="item.title"
                  loading="lazy"
                />
                <div
                  pos="absolute bottom-0 right-0"
                  bg="black opacity-60"
                  m="1"
                  p="x-2 y-1"
                  text="white xs"
                  border="rounded-full"
                >
                  <!--  When progress = -1 means that the user watched the full video -->
                  {{
                    `${
                      item.progress === -1
                        ? calcCurrentTime(item.duration)
                        : calcCurrentTime(item.progress)
                    } /
                    ${calcCurrentTime(item.duration)}`
                  }}
                </div>
              </div>
              <Progress
                class="watch-later-pop__progress"
                :percentage="
                  normalizePlaybackProgress(item.progress, item.duration)
                "
              />
            </div>

            <!-- Description -->
            <div class="popover-card__copy">
              <h3
                class="keep-two-lines popover-card__title"
                overflow="hidden"
                text="ellipsis"
                break-anywhere
              >
                {{ item.title }}
              </h3>
              <div class="popover-card__meta" flex="~" align="items-center">
                <ALink
                  :href="`https://space.bilibili.com/${item.owner.mid}`"
                  type="topBar"
                  class="popover-card__interactive"
                >
                  {{ item.owner.name }}
                </ALink>
              </div>
            </div>
          </section>
        </article>
      </TransitionGroup>

      <!-- loading -->
      <Transition name="fade">
        <Loading v-if="isLoadingWatchLater && watchLaterList.length !== 0" m="b-4" />
      </Transition>

      <!-- no more content -->
      <div
        v-if="!isLoadingWatchLater && !hasMoreContent && watchLaterList.length > 0"
        text="$bew-text-3 xs center"
        p="y-4"
      >
        {{ $t('common.no_more_content') }}
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/popoverCards";

.watchLater-pop {
  width: 380px;
  height: min(500px, var(--bew-popover-max-height));
}

.watch-later-pop__scroll {
  position: relative;
}

.watch-later-pop__media {
  flex: 0 0 144px;
  width: 144px;
}

.watch-later-pop__cover {
  width: 100%;
  height: 100%;
  overflow: visible;
  border-radius: 0;
  corner-shape: unset;
}

.watch-later-pop__cover :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0;
  corner-shape: unset;
}

.watch-later-pop__leading-actions {
  z-index: 3;
}

.watch-later-pop__remove {
  z-index: 3;
  top: var(--bew-space-1);
  right: var(--bew-space-1);
}

.watch-later-pop__progress {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: 0;
  left: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: inherit;
  border-bottom-left-radius: inherit;
  corner-shape: inherit;
}
</style>
