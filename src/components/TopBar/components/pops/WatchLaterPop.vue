<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ALink from '~/components/ALink.vue'
import CardRemovalPanel from '~/components/CardRemovalPanel.vue'
import Empty from '~/components/Empty.vue'
import IconButton from '~/components/IconButton.vue'
import Picture from '~/components/Picture.vue'
import Progress from '~/components/Progress.vue'
import Tooltip from '~/components/Tooltip.vue'
import { resetTopBarTransientInteraction } from '~/components/TopBar/composables/useTopBarInteraction'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useCardRemoval } from '~/composables/useCardRemoval'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import type { List as WatchLaterItem } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import { createAccountLifetime } from '~/utils/accountLifetime'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { resolveConfiguredLinkAction } from '~/utils/configuredLinkNavigation'
import { calcCurrentTime } from '~/utils/dataFormatter'
import type { ResolvedLinkOpenAction } from '~/utils/linkNavigation'
import { captureListRemovalFocus } from '~/utils/listRemovalFocus'
import { getUserID, removeHttpFromUrl } from '~/utils/main'
import { retiringListTransition } from '~/utils/motionPresence'
import { openLinkInBackground } from '~/utils/tabs'
import { getVideoProgressPercentage } from '~/utils/videoVisitHistory'
import { captureWatchLaterRemoval } from '~/utils/watchLater'
import { getWatchLaterAuthor, getWatchLaterPlaybackUrl } from '~/utils/watchLaterList'

import PopoverListSkeleton from './PopoverListSkeleton.vue'

const emit = defineEmits<{ addOpenTabs: [] }>()
const topBarStore = useTopBarStore()
const { openIframeDrawer } = useBewlyApp()
const { t } = useI18n()
const toast = useToast()
const { watchLaterList, isLoadingWatchLater, watchLaterCount, watchLaterPageState } = storeToRefs(topBarStore)
const viewAllUrl = computed((): string => {
  return 'https://www.bilibili.com/watchlater/list'
})
const playAllUrl = computed((): string => {
  return 'https://www.bilibili.com/list/watchlater'
})

const scrollContainer = ref<HTMLElement>()
const pendingActions = reactive(new Map<number, symbol>())
const actionLifetime = createAccountLifetime(() => {
  const accountId = resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid)
  return getUserID() === String(accountId) ? accountId : null
})
onScopeDispose(() => actionLifetime.dispose())
const removals = useCardRemoval({ items: () => watchLaterList.value, key: (item: WatchLaterItem) => String(item.aid), scope: () => String(topBarStore.userInfo.mid) })
function confirmRemoval(item: WatchLaterItem) {
  removals.begin(item, { restorable: !!getWatchLaterPlaybackUrl(item), ...captureWatchLaterRemoval(item.aid, actionLifetime.capture(), topBarStore) })
}
watch(() => topBarStore.userInfo.mid, () => {
  actionLifetime.invalidate()
  pendingActions.clear()
}, { flush: 'sync' })

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

function openVideoPage(url: string, action: ResolvedLinkOpenAction = resolveConfiguredLinkAction(settings.value.topBarLinkOpenMode, location.href)) {
  if (action === 'background') {
    resetTopBarTransientInteraction()
    void openLinkInBackground(url)
    return
  }

  if (action === 'newTab') {
    resetTopBarTransientInteraction()
    window.open(url, '_blank')
    return
  }
  if (action === 'drawer') {
    openIframeDrawer(url)
    return
  }

  window.open(url, '_top')
}

async function deleteWatchLaterItem(aid: number, event?: MouseEvent): Promise<boolean> {
  if (pendingActions.has(aid))
    return false

  const owner = actionLifetime.capture()
  const restoreFocus = captureListRemovalFocus(event?.currentTarget)
  const requestId = Symbol('watch-later-remove')
  pendingActions.set(aid, requestId)
  try {
    const removed = await topBarStore.deleteWatchLaterItem(aid, owner.isCurrent)
    if (!owner.isCurrent())
      return false
    if (!removed) {
      toast.error(t('moments.watch_later_failed_retry'))
    }
    else {
      await nextTick()
      restoreFocus()
    }
    return removed
  }
  finally {
    if (pendingActions.get(aid) === requestId)
      pendingActions.delete(aid)
  }
}

async function handleOpenVideoPageAndRemove(item: WatchLaterItem) {
  const owner = actionLifetime.capture()
  const url = getWatchLaterPlaybackUrl(item)
  if (!url || pendingActions.has(item.aid))
    return
  const action = resolveConfiguredLinkAction(settings.value.topBarLinkOpenMode, location.href)
  // Reserve the tab in the activation task; only navigate it after confirmed removal.
  const tab = action === 'newTab' ? window.open('about:blank', '_blank') : null
  if (action === 'newTab' && !tab)
    return
  if (tab)
    tab.opener = null
  try {
    if (await deleteWatchLaterItem(item.aid) && owner.isCurrent()) {
      if (tab)
        tab.location.replace(url)
      else openVideoPage(url, action)
    }
    else {
      tab?.close()
    }
  }
  catch {
    tab?.close()
    if (owner.isCurrent())
      toast.error(t('moments.watch_later_failed_retry'))
  }
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
        <Tooltip :content="$t('watch_later.open_tabs.title')" placement="bottom" teleport>
          <IconButton class="bew-popover__action" :label="$t('watch_later.open_tabs.title')" @click.stop="emit('addOpenTabs')">
            <i i-tabler:browser-plus />
          </IconButton>
        </Tooltip>
        <Tooltip :content="$t('common.play_all')" placement="bottom" teleport>
          <ALink :href="playAllUrl" type="topBar" class="bew-popover__action" :aria-label="$t('common.play_all')">
            <i i-tabler:player-play />
          </ALink>
        </Tooltip>
        <Tooltip :content="$t('common.view_all')" placement="bottom" teleport>
          <ALink :href="viewAllUrl" type="topBar" class="bew-popover__action" :aria-label="$t('common.view_all')">
            <i i-tabler:arrow-up-right />
          </ALink>
        </Tooltip>
      </div>
    </header>

    <main
      ref="scrollContainer"
      class="bew-popover__body bew-popover__scroll bew-popover__list watch-later-pop__scroll"
    >
      <PopoverListSkeleton
        v-if="isLoadingWatchLater && removals.displayItems.value.length === 0"
      />

      <Empty
        v-if="!isLoadingWatchLater && removals.displayItems.value.length === 0 && watchLaterPageState !== 'failed' && watchLaterPageState !== 'stalled'"
        class="bew-popover__state"
      />

      <Empty
        v-if="!isLoadingWatchLater && (watchLaterPageState === 'failed' || watchLaterPageState === 'stalled')" text-only
        :description="t(watchLaterPageState === 'stalled' ? 'common.pagination_stalled' : 'common.load_failed')" :action-label="t('common.retry')"
        @action="topBarStore.loadMoreWatchLaterList(true)"
      />

      <!-- watchlater -->
      <TransitionGroup name="list" v-bind="retiringListTransition">
        <article
          v-for="item in removals.displayItems.value"
          :key="item.aid"
          class="popover-card"
        >
          <ALink
            class="popover-card__primary"
            :inert="!!removals.get(item) || undefined"
            :href="getWatchLaterPlaybackUrl(item, true)"
            :aria-label="item.title"
            type="topBar"
          />
          <section class="popover-card__content" :inert="!!removals.get(item) || undefined">
            <div class="popover-card__media">
              <Picture
                class="watch-later-pop__cover"
                aspect-ratio="auto"
                :src="`${removeHttpFromUrl(item.pic)}@256w_144h_1c`"
                :alt="item.title"
                loading="lazy"
              />
              <Progress
                class="popover-card__progress"
                :percentage="getVideoProgressPercentage({ aid: item.aid, bvid: item.bvid, cid: item.cid, epid: item.bangumi?.ep_id }, item.progress, item.duration)"
              />
            </div>

            <div class="popover-card__copy">
              <h3 class="keep-two-lines popover-card__title">
                {{ item.title }}
              </h3>
              <div class="popover-card__footer">
                <p class="popover-card__meta">
                  <ALink
                    :href="getWatchLaterAuthor(item).authorUrl"
                    type="topBar"
                    class="popover-card__interactive"
                  >
                    {{ getWatchLaterAuthor(item).name }}
                  </ALink>
                  <span>{{ calcCurrentTime(item.duration) }}</span>
                </p>
                <div class="popover-card__actions">
                  <Tooltip :content="$t('watch_later.play_and_remove')" placement="top" teleport>
                    <IconButton
                      class="popover-card__interactive bew-popover__action"
                      :label="$t('watch_later.play_and_remove')"
                      :disabled="pendingActions.has(item.aid) || !getWatchLaterPlaybackUrl(item)"
                      @click.stop.prevent="handleOpenVideoPageAndRemove(item)"
                    >
                      <i i-tabler:player-play />
                    </IconButton>
                  </Tooltip>
                  <Tooltip :content="$t('watch_later.open_video_page')" placement="top" teleport>
                    <IconButton
                      class="popover-card__interactive bew-popover__action"
                      :label="$t('watch_later.open_video_page')"
                      :disabled="pendingActions.has(item.aid) || !getWatchLaterPlaybackUrl(item)"
                      @click.stop.prevent="openVideoPage(getWatchLaterPlaybackUrl(item))"
                    >
                      <i i-tabler:external-link />
                    </IconButton>
                  </Tooltip>
                  <Tooltip :content="$t('common.operation.delete')" placement="top" teleport>
                    <IconButton
                      class="popover-card__interactive bew-popover__action bew-popover__action--danger"
                      :label="$t('common.operation.delete')"
                      :disabled="pendingActions.has(item.aid)"
                      @click.stop.prevent="confirmRemoval(item)"
                    >
                      <i i-tabler:trash />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            </div>
          </section>
          <CardRemovalPanel v-if="removals.get(item)" :state="removals.get(item)!" kind="watchLater" />
        </article>
      </TransitionGroup>

      <!-- loading -->
      <Transition name="fade">
        <PopoverListSkeleton v-if="isLoadingWatchLater && watchLaterList.length !== 0" :count="2" />
      </Transition>

      <!-- no more content -->
      <div
        v-if="!isLoadingWatchLater && !hasMoreContent && watchLaterList.length > 0"
        class="watch-later-pop__end"
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

.watch-later-pop__cover,
.watch-later-pop__cover :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0;
  corner-shape: unset;
}

// The undo panel covers the whole row, square like the row itself.
.popover-card .card-removal {
  border-radius: 0;
}

.watch-later-pop__end {
  padding-block: var(--bew-space-4);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}
</style>
