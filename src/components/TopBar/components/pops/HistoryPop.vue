<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ALink from '~/components/ALink.vue'
import Button from '~/components/Button.vue'
import Empty from '~/components/Empty.vue'
import IconButton from '~/components/IconButton.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import Progress from '~/components/Progress.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import type { HistoryResult, List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import { useTopBarStore } from '~/stores/topBarStore'
import { isAccountRequestCurrent, resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getHistoryUrl, getHistoryVideoIdentity } from '~/utils/historyTarget'
import { captureListRemovalFocus } from '~/utils/listRemovalFocus'
import { getCSRF, removeHttpFromUrl, scrollToTop } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { retiringListTransition } from '~/utils/motionPresence'
import { getVideoProgressPercentage, removeVideoVisitHistory } from '~/utils/videoVisitHistory'

import PopoverListSkeleton from './PopoverListSkeleton.vue'

const { t } = useI18n()
const toast = useToast()
const topBarStore = useTopBarStore()
const currentAccountId = computed(() => resolveAuthenticatedAccountId(
  topBarStore.isLogin,
  topBarStore.userInfo.mid,
))
const historys = reactive<Array<HistoryItem>>([])
const pendingRemovals = reactive(new Set<string>())
const historyTabs = computed(() => [
  {
    id: 0,
    name: t('topbar.moments_dropdown.tabs.videos'),
  },
  {
    id: 1,
    name: t('topbar.moments_dropdown.tabs.live'),
  },
  {
    id: 2,
    name: t('topbar.moments_dropdown.tabs.articles'),
  },
])
/**
 * Active tab (0: archive, 1: live, 2: article)
 */
const activatedTab = ref<number>(0)
const isLoading = ref<boolean>(false)
// when noMoreContent is true, the user can't scroll down to load more content
const noMoreContent = ref<boolean>(false)
const loadError = ref(false)
const failedRequest = ref<{ type: Business, viewAt: number } | null>(null)
const livePage = ref<number>(1)
const historysWrap = ref<HTMLElement>() as Ref<HTMLElement>
let requestGeneration = 0

function resetHistoryState() {
  requestGeneration++
  historys.length = 0
  isLoading.value = false
  noMoreContent.value = false
  loadError.value = false
  failedRequest.value = null
  livePage.value = 1
  if (historysWrap.value)
    scrollToTop(historysWrap.value)
}

function loadActiveTab() {
  if (currentAccountId.value === null)
    return

  if (activatedTab.value === 0)
    void getHistoryList(Business.ARCHIVE)
  else if (activatedTab.value === 1)
    void getHistoryList(Business.LIVE)
  else if (activatedTab.value === 2)
    void getHistoryList(Business.ARTICLE)
}

watch(activatedTab, (newVal: number | undefined, oldVal: number | undefined) => {
  if (newVal === oldVal)
    return

  resetHistoryState()
  loadActiveTab()
})

watch(currentAccountId, () => {
  resetHistoryState()
  loadActiveTab()
}, { immediate: true })

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (isLoading.value || loadError.value || noMoreContent.value || historys.length === 0)
    return

  const lastViewAt = historys[historys.length - 1]?.view_at
  if (!lastViewAt)
    return

  if (activatedTab.value === 0) {
    void getHistoryList(Business.ARCHIVE, lastViewAt)
  }
  else if (activatedTab.value === 1) {
    void getHistoryList(Business.LIVE, lastViewAt)
  }
  else if (activatedTab.value === 2) {
    void getHistoryList(Business.ARTICLE, lastViewAt)
  }
}

useOptimizedScroll(
  historysWrap,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

onBeforeUnmount(() => {
  requestGeneration++
})

function onClickTab(tabId: number) {
  // Prevent changing tab when loading, cuz it will cause a bug
  if (isLoading.value)
    return

  noMoreContent.value = false

  activatedTab.value = tabId
}

/**
 * Get history list
 * @param type
 * @param view_at Last viewed timestamp
 */
async function getHistoryList(type: Business, view_at = 0 as number) {
  if (isLoading.value)
    return
  if (noMoreContent.value)
    return

  const requestAccountId = currentAccountId.value
  if (requestAccountId === null)
    return

  const generation = requestGeneration
  isLoading.value = true
  loadError.value = false
  failedRequest.value = null

  try {
    const res: HistoryResult = await api.history.getHistoryList({
      type,
      view_at,
    })

    if (!isAccountRequestCurrent(requestAccountId, generation, currentAccountId.value, requestGeneration))
      return
    if (res.code !== 0 || !Array.isArray(res.data?.list))
      throw res

    // API success with an empty list is a normal empty/end state.
    if (res.data.list.length === 0) {
      noMoreContent.value = true
      return
    }

    historys.push(...res.data.list)
    loadError.value = false
    failedRequest.value = null
  }
  catch (error) {
    if (!isAccountRequestCurrent(requestAccountId, generation, currentAccountId.value, requestGeneration))
      return
    loadError.value = true
    failedRequest.value = { type, viewAt: view_at }
    noMoreContent.value = false
    if (!isExtensionContextInvalidatedError(error))
      console.error('Failed to load history list:', error)
  }
  finally {
    if (isAccountRequestCurrent(requestAccountId, generation, currentAccountId.value, requestGeneration))
      isLoading.value = false
  }
}

function retryFailedLoad() {
  const request = failedRequest.value
  if (!request || isLoading.value)
    return

  loadError.value = false
  noMoreContent.value = false
  void getHistoryList(request.type, request.viewAt)
}

function getHistoryItemKey(historyItem: HistoryItem): string {
  return `${historyItem.history.business}_${historyItem.history.oid}`
}

async function deleteHistoryItem(historyItem: HistoryItem, event?: MouseEvent) {
  const requestAccountId = currentAccountId.value
  if (requestAccountId === null)
    return

  const generation = requestGeneration
  const itemKey = getHistoryItemKey(historyItem)
  const pendingKey = `${requestAccountId}:${itemKey}`
  if (pendingRemovals.has(pendingKey))
    return
  const restoreFocus = captureListRemovalFocus(event?.currentTarget)
  pendingRemovals.add(pendingKey)
  try {
    const res = await api.history.deleteHistoryItem({
      kid: itemKey,
      csrf: getCSRF(),
    })
    if (!isAccountRequestCurrent(requestAccountId, generation, currentAccountId.value, requestGeneration))
      return
    if (res.code !== 0) {
      toast.error(t('common.load_failed'))
      return
    }

    void removeVideoVisitHistory(getHistoryVideoIdentity(historyItem))
    const currentIndex = historys.findIndex(item => getHistoryItemKey(item) === itemKey)
    if (currentIndex >= 0)
      historys.splice(currentIndex, 1)
    await nextTick()
    restoreFocus()
  }
  catch (error) {
    if (!isAccountRequestCurrent(requestAccountId, generation, currentAccountId.value, requestGeneration))
      return
    console.error('Failed to delete history item:', error)
    toast.error(t('common.load_failed'))
  }
  finally { pendingRemovals.delete(pendingKey) }
}

function initData() {
  resetHistoryState()
  loadActiveTab()
}

defineExpose({
  initData,
})
</script>

<template>
  <div
    class="history-pop bew-popover bew-popover-surface"
    data-key="history"
  >
    <header class="bew-popover__header">
      <div class="history-pop__tabs bew-segment-control">
        <LiquidSegmentIndicator :active-key="activatedTab" />
        <button
          v-for="tab in historyTabs"
          :key="tab.id"
          type="button"
          class="bew-segment-control__item"
          data-segment-item
          :data-active="tab.id === activatedTab ? 'true' : 'false'"
          :disabled="isLoading"
          @click="onClickTab(tab.id)"
        >
          {{ tab.name }}
        </button>
      </div>
      <div class="bew-popover__actions">
        <Tooltip :content="$t('common.view_all')" placement="bottom" teleport>
          <ALink href="https://www.bilibili.com/history" type="topBar" class="bew-popover__action" :aria-label="$t('common.view_all')">
            <i i-tabler:arrow-up-right />
          </ALink>
        </Tooltip>
      </div>
    </header>

    <main
      ref="historysWrap"
      class="bew-popover__body bew-popover__scroll bew-popover__list"
    >
      <PopoverListSkeleton v-if="isLoading && historys.length === 0" />

      <Empty
        v-else-if="loadError && historys.length === 0"
        class="bew-popover__state"
        :description="$t('common.load_failed')"
      >
        <Button type="primary" @click="retryFailedLoad">
          {{ $t('common.operation.refresh') }}
        </Button>
      </Empty>

      <Empty
        v-else-if="historys.length === 0"
        class="bew-popover__state"
      />

      <!-- historys -->
      <TransitionGroup name="list" v-bind="retiringListTransition">
        <article
          v-for="historyItem in historys"
          :key="historyItem.kid"
          class="popover-card"
        >
          <ALink
            class="popover-card__primary"
            :href="getHistoryUrl(historyItem)"
            :aria-label="historyItem.title"
            type="topBar"
          />
          <section class="popover-card__content">
            <div class="popover-card__media">
              <img
                :src="`${removeHttpFromUrl(activatedTab === 2 ? Array.isArray(historyItem.covers) ? historyItem.covers[0] : '' : historyItem.cover)}@256w_144h_1c`"
                :alt="historyItem.title"
              >
              <Progress
                v-if="activatedTab === 0"
                class="popover-card__progress"
                :percentage="getVideoProgressPercentage(getHistoryVideoIdentity(historyItem), historyItem.progress, historyItem.duration)"
              />
            </div>

            <div class="popover-card__copy">
              <h3 class="keep-two-lines popover-card__title">
                {{ historyItem.title }}
              </h3>
              <div class="popover-card__footer">
                <p class="popover-card__meta">
                  <ALink
                    :href="`https://space.bilibili.com/${historyItem.author_mid}`"
                    type="topBar"
                    class="popover-card__interactive"
                  >
                    {{ historyItem.author_name }}
                  </ALink>
                  <span v-if="historyItem.live_status === 1" class="history-pop__live">
                    {{ $t('topbar.moments_dropdown.live_status') }}
                  </span>
                  <span v-else-if="activatedTab !== 1">{{ useDateFormat(historyItem.view_at * 1000, 'MM-DD HH:mm').value }}</span>
                </p>
                <div class="popover-card__actions">
                  <Tooltip :content="$t('history.remove_from_history')" placement="top" teleport>
                    <IconButton
                      class="popover-card__interactive bew-popover__action bew-popover__action--danger"
                      :label="$t('history.remove_from_history')"
                      :disabled="pendingRemovals.has(`${currentAccountId}:${getHistoryItemKey(historyItem)}`)"
                      @click.stop.prevent="deleteHistoryItem(historyItem, $event)"
                    >
                      <i i-tabler:trash />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            </div>
          </section>
        </article>
      </TransitionGroup>
      <!-- loading -->
      <Transition name="fade">
        <PopoverListSkeleton v-if="isLoading && historys.length !== 0" :count="2" />
        <div
          v-else-if="loadError && historys.length !== 0"
          class="history-pop__pagination-error"
        >
          <span>{{ $t('common.load_failed') }}</span>
          <Button type="secondary" size="small" @click="retryFailedLoad">
            {{ $t('common.operation.refresh') }}
          </Button>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/popoverCards";

.history-pop {
  width: 380px;
  height: min(500px, var(--bew-popover-max-height));
}

.history-pop__tabs {
  flex: 0 0 auto;
}

.history-pop__live {
  color: var(--bew-text-1);
}

.history-pop__pagination-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3) 0 var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

@media (max-width: 420px) {
  .history-pop__tabs {
    --bew-control-item-padding-x: var(--bew-space-2);
  }
}
</style>
