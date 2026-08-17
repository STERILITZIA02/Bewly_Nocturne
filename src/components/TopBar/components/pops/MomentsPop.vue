<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, scrollToTop } from '~/utils/main'

type MomentType = 'video' | 'live' | 'article'
interface MomentTab { type: MomentType, name: any }

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
    style="backdrop-filter: var(--bew-filter-glass-1);" h="[calc(100vh-100px)]" max-h-500px
    important-overflow-y-overlay
    bg="$bew-elevated"
    w="380px"
    rounded="$bew-radius"
    pos="relative"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-surface-border-color"
    class="moments-pop bew-popover"
    data-key="moments"
    flex="~ col"
  >
    <!-- top bar -->
    <header
      flex="~ items-center justify-between"
      p="x-6"
      pos="sticky top-0 left-0"
      w="full"
      h-50px
      z="2"
    >
      <div flex="~">
        <div
          v-for="tab in momentTabs"
          :key="tab.type"
          m="r-4"
          transition="background-color duration-200, color duration-200, opacity duration-200"
          class="tab"
          :class="tab.type === selectedMomentTab.type ? 'tab-selected' : ''"
          cursor="pointer"
          @click="onClickTab(tab)"
        >
          {{ tab.name }}
        </div>
      </div>
      <ALink
        href="https://t.bilibili.com/"
        type="topBar"
        flex="~ items-center"
      >
        <span text="sm">{{ $t('common.view_all') }}</span>
      </ALink>
    </header>

    <!-- moments wrapper -->
    <main
      ref="momentsWrap"
      rounded="$bew-radius"
      overflow-x-hidden
      overflow-y-auto
      p="x-4"
      flex-1
      min-h-0
    >
      <!-- loading -->
      <Loading
        v-if="topBarStore.isLoadingMoments && topBarStore.moments.length === 0"
        h="full"
        flex="~"
        items="center"
      />

      <!-- empty -->
      <Empty
        v-else-if="!topBarStore.isLoadingMoments && topBarStore.moments.length === 0"
        pos="absolute top-0 left-0"
        z="0" w="full" h="full"
        flex="~ items-center"
        rounded="$bew-radius-half"
      />

      <!-- moments -->
      <TransitionGroup name="list">
        <article
          v-for="(moment, index) in topBarStore.moments"
          :key="index"
          flex="~ justify-between"
          m="b-2" p="2"
          rounded="$bew-radius"
          hover:bg="$bew-fill-2"
          duration-300
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
          <div class="popover-card__content" flex="~ justify-between" w="full">
            <ALink
              :href="moment.authorJumpUrl"
              type="topBar"
              class="popover-card__interactive"
              rounded="1/2"
              w="40px" h="40px" m="r-4"
              bg="$bew-skeleton"
              shrink-0
            >
              <img
                :src="`${moment.authorFace}@50w_50h_1c`"
                rounded="1/2"
                w="40px" h="40px"
              >
            </ALink>

            <div flex="~" justify="between" w="full">
              <div>
                <!-- <span v-if="selectedTab !== 1">{{ `${moment.name} ${t('topbar.moments_dropdown.uploaded')}` }}</span> -->
                <!-- <span v-else>{{ `${moment.name} ${t('topbar.moments_dropdown.now_streaming')}` }}</span> -->

                <!-- 联合投稿显示多个作者 -->
                <div v-if="moment.isCollaborative && moment.authors" flex="~ wrap" items="center" gap="1">
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
                <div overflow-hidden text-ellipsis break-anywhere>
                  {{ moment.title }}
                </div>
                <div
                  text="$bew-text-2 sm"
                  m="y-2"
                >
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
                flex="~ items-center justify-center" w="82px"
                h="46px" m="l-4" shrink-0
                bg="$bew-skeleton"
              >
                <img
                  :src="`${moment.cover}@128w_72h_1c`"
                  w="82px" h="46px"
                >
                <button
                  v-if="moment.watchLaterAid"
                  type="button"
                  class="popover-card__interactive popover-card-action"
                  :aria-label="topBarStore.isInWatchLater(moment.watchLaterAid) ? $t('common.remove_from_watch_later') : $t('common.save_to_watch_later')"
                  opacity-0 group-hover:opacity-100
                  pos="absolute" duration-300 bg="black opacity-60"
                  rounded="$bew-radius-half" p-1
                  z-1 color-white
                  @click.stop.prevent="toggleWatchLater(moment.watchLaterAid)"
                >
                  <Tooltip v-if="!topBarStore.isInWatchLater(moment.watchLaterAid)" :content="$t('common.save_to_watch_later')" placement="bottom" type="dark">
                    <div i-mingcute:carplay-line />
                  </Tooltip>
                  <Tooltip v-else :content="$t('common.added')" placement="bottom" type="dark">
                    <Icon icon="line-md:confirm" />
                  </Tooltip>
                </button>
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

.tab {
  --uno: "relative text-$bew-text-2";

  &::after {
    --uno: "absolute bottom-0 left-0 w-full h-12px bg-$bew-theme-color opacity-0 transform scale-x-0 -z-1";
    --uno: "transition-colors duration-200";
    content: "";
  }
}

.tab-selected {
  --uno: "font-bold text-$bew-text-1";

  &::after {
    --uno: "scale-x-80 opacity-40";
  }
}
</style>
