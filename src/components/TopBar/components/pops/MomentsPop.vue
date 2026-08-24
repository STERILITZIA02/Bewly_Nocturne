<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import IconButton from '~/components/IconButton.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import Loading from '~/components/Loading.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, scrollToTop } from '~/utils/main'

type MomentType = 'video' | 'live' | 'article'
interface MomentTab { type: MomentType, name: string }

const topBarStore = useTopBarStore()

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

watch(() => selectedMomentTab.value.type, (newVal, oldVal) => {
  if (newVal === oldVal)
    return

  if (momentsWrap.value)
    scrollToTop(momentsWrap.value)

  initData()
})

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (topBarStore.isLoadingMoments || topBarStore.moments.length === 0)
    return

  getData()
}

useOptimizedScroll(
  momentsWrap,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

function onClickTab(tab: MomentTab) {
  // Prevent changing tab when loading, cuz it will cause a bug
  if (topBarStore.isLoadingMoments || tab.type === selectedMomentTab.value.type)
    return

  selectedMomentTab.value = tab
  // 移除这里的 initData() 调用，因为 watch 已经会处理
}

function initData() {
  void topBarStore.ensureWatchLaterState()
  topBarStore.initMomentsData(selectedMomentTab.value.type)
}

function getData() {
  topBarStore.getMomentsData(selectedMomentTab.value.type)
}

async function toggleWatchLater(aid: number) {
  const accountId = topBarStore.userInfo.mid
  if (!topBarStore.isLogin || !accountId)
    return

  await topBarStore.ensureWatchLaterState()
  const isInWatchLater = topBarStore.isInWatchLater(aid)

  if (!isInWatchLater) {
    const res = await api.watchlater.saveToWatchLater({
      aid,
      csrf: getCSRF(),
    })
    if (res.code === 0 && topBarStore.isLogin && topBarStore.userInfo.mid === accountId)
      await topBarStore.commitWatchLaterMutation(aid, true, accountId)
  }
  else {
    const res = await api.watchlater.removeFromWatchLater({
      aid,
      csrf: getCSRF(),
    })
    if (res.code === 0 && topBarStore.isLogin && topBarStore.userInfo.mid === accountId)
      await topBarStore.commitWatchLaterMutation(aid, false, accountId)
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
        :class="{ 'bew-segment-control--solid': settings.disableFrostedGlass }"
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
      <ALink
        href="https://t.bilibili.com/"
        type="topBar"
        class="bew-popover__action"
      >
        {{ $t('common.view_all') }}
      </ALink>
    </header>

    <main
      ref="momentsWrap"
      class="bew-popover__body bew-popover__scroll bew-popover__list moments-pop__scroll"
    >
      <Loading
        v-if="topBarStore.isLoadingMoments && topBarStore.moments.length === 0"
        class="bew-popover__state"
      />

      <Empty
        v-else-if="!topBarStore.isLoadingMoments && topBarStore.moments.length === 0"
        class="bew-popover__state"
      />

      <TransitionGroup name="list">
        <article
          v-for="(moment, index) in topBarStore.moments"
          :key="index"
          class="group popover-card"
        >
          <ALink
            class="popover-card__primary"
            :href="moment.link"
            :aria-label="moment.title"
            type="topBar"
          />
          <!-- new moment dot -->
          <div
            v-if="topBarStore.isNewMoment(index) && selectedMomentTab.type === 'video'"
            class="bew-shape-circle"
            rounded="full"
            w="8px"
            h="8px"
            m="-2"
            bg="$bew-theme-color"
            pos="absolute -top-12px -left-12px"
            style="box-shadow: 0 0 4px var(--bew-theme-color)"
          />
          <div class="popover-card__content moments-pop__card-content">
            <ALink
              :href="moment.authorJumpUrl"
              type="topBar"
              class="popover-card__interactive bew-shape-circle"
              w="40px" h="40px" m="r-4"
              bg="$bew-skeleton"
              shrink-0
            >
              <img
                :src="`${moment.authorFace}@50w_50h_1c`"
                rounded-inherit
                w="40px" h="40px"
              >
            </ALink>

            <div class="moments-pop__content-row">
              <div class="moments-pop__copy popover-card__copy">
                <!-- <span v-if="selectedTab !== 1">{{ `${moment.name} ${t('topbar.moments_dropdown.uploaded')}` }}</span> -->
                <!-- <span v-else>{{ `${moment.name} ${t('topbar.moments_dropdown.now_streaming')}` }}</span> -->

                <!-- 联合投稿显示多个作者 -->
                <div v-if="moment.isCollaborative && moment.authors" class="moments-pop__authors">
                  <template v-for="(author, authorIndex) in moment.authors" :key="author.jump_url">
                    <ALink
                      :href="author.jump_url"
                      type="topBar"
                      class="popover-card__interactive"
                      font-bold
                    >
                      {{ author.name }}
                    </ALink>
                    <span v-if="authorIndex < moment.authors.length - 1" text="$bew-text-2">/</span>
                  </template>
                </div>
                <!-- 单个作者 -->
                <ALink
                  v-else
                  :href="moment.authorJumpUrl"
                  type="topBar"
                  class="popover-card__interactive"
                  font-bold
                >
                  {{ moment.author }}
                </ALink>
                <div class="moments-pop__title popover-card__title">
                  {{ moment.title }}
                </div>
                <div class="popover-card__meta moments-pop__meta">
                  <!-- publish time -->
                  <div v-if="selectedMomentTab.type !== 'live'">
                    {{ moment.pubTime }}
                  </div>

                  <!-- Live -->
                  <div
                    v-else
                    text="$bew-theme-foreground"
                    font="bold"
                    flex="~"
                    items="center"
                  >
                    <div i-fluent:live-24-filled m="r-2" />
                    {{ $t('topbar.moments_dropdown.live_status') }}
                  </div>
                </div>
              </div>
              <div
                class="group popover-card__media"
              >
                <img
                  :src="`${moment.cover}@128w_72h_1c`"
                  :alt="moment.title"
                >
                <IconButton
                  v-if="moment.watchLaterAid"
                  :label="topBarStore.isInWatchLater(moment.watchLaterAid) ? $t('common.remove_from_watch_later') : $t('common.save_to_watch_later')"
                  class="popover-card__interactive popover-card-action popover-card__overlay-action"
                  @click.stop.prevent="toggleWatchLater(moment.watchLaterAid)"
                >
                  <Tooltip v-if="!topBarStore.isInWatchLater(moment.watchLaterAid)" :content="$t('common.save_to_watch_later')" placement="bottom" type="dark">
                    <div i-mingcute:carplay-line />
                  </Tooltip>
                  <Tooltip v-else :content="$t('common.added')" placement="bottom" type="dark">
                    <Icon icon="line-md:confirm" />
                  </Tooltip>
                </IconButton>
              </div>
            </div>
          </div>
        </article>
      </TransitionGroup>

      <!-- loading -->
      <Transition name="fade">
        <Loading v-if="topBarStore.isLoadingMoments && topBarStore.moments.length !== 0" m="b-4" />
      </Transition>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/popoverCards";

.moments-pop {
  width: 380px;
  height: min(500px, var(--bew-popover-max-height));
}

.moments-pop__tabs {
  flex: 0 0 auto;
}

.moments-pop__scroll {
  position: relative;
}

.moments-pop__card-content,
.moments-pop__content-row {
  display: flex;
  width: 100%;
  min-width: 0;
}

.moments-pop__card-content {
  align-items: flex-start;
}

.moments-pop__content-row {
  justify-content: space-between;
}

.moments-pop__copy {
  min-width: 0;
}

.moments-pop__authors {
  display: flex;
  max-width: 100%;
  align-items: center;
  gap: var(--bew-space-1);
  overflow: hidden;
  white-space: nowrap;
}

.moments-pop__authors a {
  min-width: 0;
  overflow: hidden;
  font-weight: var(--bew-font-weight-semibold);
  text-overflow: ellipsis;
}

.moments-pop__title {
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}

.moments-pop .popover-card__media {
  display: flex;
  flex: 0 0 82px;
  width: 82px;
  height: 46px;
  align-items: center;
  justify-content: center;
  margin-left: var(--bew-space-4);
}

.moments-pop .popover-card__overlay-action {
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
}
</style>
