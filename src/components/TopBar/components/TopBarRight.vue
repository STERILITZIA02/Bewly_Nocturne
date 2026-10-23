<script setup lang="ts">
import { useWindowFocus } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import ALink from '~/components/ALink.vue'
import CountBadge from '~/components/CountBadge.vue'
import OpenTabsDialog from '~/components/WatchLater/OpenTabsDialog.vue'
import { settings } from '~/logic'
import { getTopBarItemLayoutEditableId, vLayoutEditable } from '~/logic/layoutEdit'
import { useTopBarStore } from '~/stores/topBarStore'
import { getUserID, isInIframe, removeHttpFromUrl } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'
import { holdMotion } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { isComponentVisible, shouldShowBadge, shouldShowDotBadge, shouldShowNumberBadge } from '~/utils/topBarBadge'

import { resetTopBarTransientInteraction, useTopBarInteraction } from '../composables/useTopBarInteraction'
import { MESSAGE_URL } from '../constants/urls'
import FavoritesPop from './pops/FavoritesPop.vue'
import HistoryPop from './pops/HistoryPop.vue'
import MomentsPop from './pops/MomentsPop.vue'
import MorePop from './pops/MorePop.vue'
import UploadPop from './pops/UploadPop.vue'
import UserPanelPop from './pops/UserPanelPop.vue'
import WatchLaterPop from './pops/WatchLaterPop.vue'

const topBarStore = useTopBarStore()
const showOpenTabsDialog = ref(false)
function openTabsDialog() {
  resetTopBarTransientInteraction()
  showOpenTabsDialog.value = true
}
// 使用 store 中的必要状态
const {
  isLogin,
  userInfo,
  newMomentsCount,
  watchLaterCount,
  popupVisible,
  hasBCoinToReceive,
} = storeToRefs(topBarStore)

const { syncMomentsState, syncSharedData, syncUnreadMessageState } = topBarStore

function refreshUnreadMessageSharedState() {
  syncUnreadMessageState().catch((error) => {
    reportRuntimeFailure('Failed to sync shared unread-message state', error)
  })
}

const {
  getTopBarItemHref,
  handleClickTopBarItem,
  setupTopBarItemHoverEvent,
  setupTopBarItemTransformer,
  shouldOpenConfiguredTopBarItem,
  isCurrentTopBarItemPage,
} = useTopBarInteraction()

const mid = computed(() => userInfo.value.mid || getUserID())

// Controllers are created independently of current visibility so hiding and
// later re-enabling an item restores hover/popover behavior without remounting.
const moments = setupTopBarItemHoverEvent('moments')
const favorites = setupTopBarItemHoverEvent('favorites')
const history = setupTopBarItemHoverEvent('history')
const watchLater = setupTopBarItemHoverEvent('watchLater')
const upload = setupTopBarItemHoverEvent('upload')
const more = setupTopBarItemHoverEvent('more')
// The user panel opens on click; hovering only nudges the avatar circle.
const avatar = setupTopBarItemHoverEvent('userPanel', { openOnClick: true })

// 将transformer初始化移到onMounted中
// 声明组件ref
const avatarPopRef = ref()
const momentsPopRef = ref()
const favoritesPopRef = ref()
const historyPopRef = ref()
const watchLaterPopRef = ref()
const uploadPopRef = ref()
const morePopRef = ref()

setupTopBarItemTransformer('userPanel', avatarPopRef)
setupTopBarItemTransformer('moments', momentsPopRef)
setupTopBarItemTransformer('favorites', favoritesPopRef)
setupTopBarItemTransformer('history', historyPopRef)
setupTopBarItemTransformer('watchLater', watchLaterPopRef)
setupTopBarItemTransformer('upload', uploadPopRef)
setupTopBarItemTransformer('more', morePopRef)

const focused = useWindowFocus()
watch(() => focused.value, (newVal, _) => {
  if (!isLogin.value)
    return

  if (!newVal) {
    if (MESSAGE_URL.test(location.href) && !isInIframe())
      refreshUnreadMessageSharedState()
    return
  }

  syncSharedData().catch((error) => {
    reportRuntimeFailure('Failed to sync shared TopBar state', error)
  })

  nextTick(() => {
    favoritesPopRef.value?.refreshFavoriteData?.()
  })
})

watch(
  () => popupVisible.value?.moments ?? false,
  async (newVal, oldVal) => {
    if (newVal === undefined || oldVal === undefined)
      return

    if (newVal === oldVal)
      return

    // 弹窗关闭时更新
    if (isLogin.value) {
      if (!newVal) {
        await syncMomentsState('video')
      }
      else {
        nextTick(() => {
          if (momentsPopRef.value)
            momentsPopRef.value.initData?.()
        })
      }
    }
  },
)

// The capsule change runs before the incoming page mounts: leaving buttons fade
// out, slots resize, entering buttons fade in (durations from index.scss).
function holdItemMotion(element: Element, entering: boolean) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  const style = getComputedStyle(element)
  const fade = getMotionDuration(style, '--top-bar-item-fade', 150)
  const resize = getMotionDuration(style, '--top-bar-item-resize', 300)
  holdMotion(entering ? fade * 2 + resize : fade + resize)
}

// A page's own action is redundant while that page is already open.
function showPageItem(key: 'moments' | 'favorites' | 'history' | 'watchLater') {
  return isComponentVisible(key) && !isCurrentTopBarItemPage(key)
}

// 判断分割线是否应该显示：左右两组至少各有一个可见时才显示
const shouldShowDivider = computed(() => {
  const leftSideVisible = showPageItem('moments')
    || showPageItem('favorites')
    || showPageItem('history')
    || showPageItem('watchLater')
    || isComponentVisible('creatorCenter')

  const rightSideVisible = isComponentVisible('upload')

  return leftSideVisible && rightSideVisible
})
</script>

<template>
  <div
    class="right-side"
    flex="inline xl:1 justify-end items-center"
  >
    <div class="others" text="$bew-text-1">
      <div
        v-if="!isLogin"
        class="right-side-item"
        important-w-auto
      >
        <a href="https://passport.bilibili.com/login" class="login">
          <div i-tabler:user-circle class="text-xl mr-2" />{{
            $t('topbar.sign_in')
          }}
        </a>
      </div>
      <!-- Everything but the avatar shares one glass capsule, balancing the logo circle. -->
      <div v-if="isLogin" class="top-bar-tools">
        <div class="hidden lg:flex" gap-1>
          <!-- Moments -->
          <Transition name="top-bar-item" @before-enter="holdItemMotion($event, true)" @before-leave="holdItemMotion($event, false)">
            <div
              v-if="showPageItem('moments')"
              :ref="el => moments = (el as HTMLElement | null)"
              v-layout-editable="getTopBarItemLayoutEditableId('moments')"
              class="right-side-item"
              :data-layout-editable-id="getTopBarItemLayoutEditableId('moments')"
              :class="{ active: popupVisible?.moments }"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'moments')"
            >
              <template v-if="newMomentsCount > 0 && shouldShowBadge('moments')">
                <CountBadge
                  v-if="shouldShowNumberBadge('moments')"
                  class="unread-num-dot"
                  :count="newMomentsCount"
                />
                <div
                  v-else-if="shouldShowDotBadge('moments')"
                  class="unread-dot"
                />
              </template>
              <ALink
                class="top-bar-trigger"
                :href="getTopBarItemHref('moments', 'https://t.bilibili.com')"
                :title="$t('topbar.moments')"
                type="topBar"
                :custom-click-event="!settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem('moments')"
                @click="(event: MouseEvent) => handleClickTopBarItem(event, 'moments')"
              >
                <div i-tabler:windmill />
              </ALink>

              <Transition name="slide-in">
                <MomentsPop
                  v-if="popupVisible?.moments"
                  ref="momentsPopRef"
                  class="bew-popover"
                  @click.stop="() => {}"
                />
              </Transition>
            </div>
          </Transition>

          <!-- Favorites -->
          <Transition name="top-bar-item" @before-enter="holdItemMotion($event, true)" @before-leave="holdItemMotion($event, false)">
            <div
              v-if="showPageItem('favorites')"
              :ref="el => favorites = (el as HTMLElement | null)"
              v-layout-editable="getTopBarItemLayoutEditableId('favorites')"
              class="right-side-item"
              :data-layout-editable-id="getTopBarItemLayoutEditableId('favorites')"
              :class="{ active: popupVisible?.favorites }"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'favorites')"
            >
              <ALink
                class="top-bar-trigger"
                :href="getTopBarItemHref('favorites', `https://space.bilibili.com/${mid}/favlist`)"
                :title="$t('topbar.favorites')"
                type="topBar"
                :custom-click-event="!settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem('favorites')"
                @click="(event: MouseEvent) => handleClickTopBarItem(event, 'favorites')"
              >
                <div i-tabler:star />
              </ALink>

              <Transition name="slide-in">
                <FavoritesPop
                  v-if="popupVisible?.favorites"
                  ref="favoritesPopRef"
                  class="bew-popover"
                  @click.stop="() => {}"
                />
              </Transition>
            </div>
          </Transition>

          <!-- History -->
          <Transition name="top-bar-item" @before-enter="holdItemMotion($event, true)" @before-leave="holdItemMotion($event, false)">
            <div
              v-if="showPageItem('history')"
              :ref="el => history = (el as HTMLElement | null)"
              v-layout-editable="getTopBarItemLayoutEditableId('history')"
              class="right-side-item"
              :data-layout-editable-id="getTopBarItemLayoutEditableId('history')"
              :class="{ active: popupVisible?.history }"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'history')"
            >
              <ALink
                class="top-bar-trigger"
                :href="getTopBarItemHref('history', 'https://www.bilibili.com/history')"
                :title="$t('topbar.history')"
                type="topBar"
                :custom-click-event="!settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem('history')"
                @click="(event: MouseEvent) => handleClickTopBarItem(event, 'history')"
              >
                <div i-tabler:clock />
              </ALink>

              <Transition name="slide-in">
                <HistoryPop
                  v-if="popupVisible?.history"
                  ref="historyPopRef"
                  class="bew-popover"
                  @click.stop="() => {}"
                />
              </Transition>
            </div>
          </Transition>

          <!-- Watch later -->
          <Transition name="top-bar-item" @before-enter="holdItemMotion($event, true)" @before-leave="holdItemMotion($event, false)">
            <div
              v-if="showPageItem('watchLater')"
              :ref="el => watchLater = (el as HTMLElement | null)"
              v-layout-editable="getTopBarItemLayoutEditableId('watchLater')"
              class="right-side-item"
              :data-layout-editable-id="getTopBarItemLayoutEditableId('watchLater')"
              :class="{ active: popupVisible?.watchLater }"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'watchLater')"
            >
              <template v-if="watchLaterCount > 0 && shouldShowBadge('watchLater')">
                <CountBadge
                  v-if="shouldShowNumberBadge('watchLater')"
                  class="unread-num-dot"
                  :count="watchLaterCount"
                />
                <div
                  v-else-if="shouldShowDotBadge('watchLater')"
                  class="unread-dot"
                />
              </template>
              <ALink
                class="top-bar-trigger"
                :href="getTopBarItemHref('watchLater', 'https://www.bilibili.com/watchlater/list')"
                :title="$t('topbar.watch_later')"
                type="topBar"
                :custom-click-event="!settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem('watchLater')"
                @click="(event: MouseEvent) => handleClickTopBarItem(event, 'watchLater')"
              >
                <div i-tabler:playlist />
              </ALink>

              <Transition name="slide-in">
                <WatchLaterPop
                  v-if="popupVisible?.watchLater"
                  ref="watchLaterPopRef"
                  class="bew-popover"
                  @add-open-tabs="openTabsDialog"
                  @click.stop="() => {}"
                />
              </Transition>
            </div>
          </Transition>

          <!-- Creative center -->
          <Transition name="top-bar-item" @before-enter="holdItemMotion($event, true)" @before-leave="holdItemMotion($event, false)">
            <div
              v-if="isComponentVisible('creatorCenter')"
              v-layout-editable="getTopBarItemLayoutEditableId('creatorCenter')"
              class="right-side-item"
              :data-layout-editable-id="getTopBarItemLayoutEditableId('creatorCenter')"
            >
              <a
                class="top-bar-trigger"
                href="https://member.bilibili.com/platform/home"
                target="_blank"
                :title="$t('topbar.creative_center')"
                @click="resetTopBarTransientInteraction"
              >
                <div i-tabler:bulb />
              </a>
            </div>
          </Transition>
        </div>

        <!-- More -->
        <div
          :ref="el => more = (el as HTMLElement | null)"
          v-layout-editable="'topbar-more'"
          class="right-side-item lg:!hidden flex"
          data-layout-editable-id="topbar-more"
          :class="{ active: popupVisible?.more }"
          @click="(event: MouseEvent) => handleClickTopBarItem(event, 'more')"
        >
          <button
            type="button"
            class="top-bar-icon-button top-bar-trigger"
            :title="$t('video_card.operation.more_options')"
            :aria-label="$t('video_card.operation.more_options')"
            :aria-expanded="Boolean(popupVisible?.more)"
          >
            <div i-tabler:menu />
          </button>

          <Transition name="slide-in">
            <MorePop
              v-show="popupVisible?.more"
              ref="morePopRef"
              class="bew-popover"
              @click.stop="() => {}"
            />
          </Transition>
        </div>

        <div class="hidden lg:flex" gap-1 items-center>
          <!-- Divider -->
          <Transition name="top-bar-item" @before-enter="holdItemMotion($event, true)" @before-leave="holdItemMotion($event, false)">
            <div
              v-if="shouldShowDivider"
              w-2px h-16px bg="$bew-border-color" mx-1
              rounded="$bew-radius-tiny"
            />
          </Transition>

          <!-- Upload -->
          <Transition name="top-bar-item" @before-enter="holdItemMotion($event, true)" @before-leave="holdItemMotion($event, false)">
            <div
              v-if="isComponentVisible('upload')"
              :ref="el => upload = (el as HTMLElement | null)"
              v-layout-editable="getTopBarItemLayoutEditableId('upload')"
              class="right-side-item"
              :data-layout-editable-id="getTopBarItemLayoutEditableId('upload')"
              :class="{ active: popupVisible?.upload }"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'upload')"
            >
              <a
                class="upload top-bar-trigger"
                href="https://member.bilibili.com/platform/upload/video/frame"
                target="_blank"
                :title="$t('topbar.upload')"
                @click="resetTopBarTransientInteraction"
              >
                <div i-tabler:upload flex-shrink-0 />
              </a>

              <Transition name="slide-in">
                <UploadPop
                  v-show="popupVisible?.upload"
                  ref="uploadPopRef"
                  class="bew-popover"
                  @click.stop="() => {}"
                />
              </Transition>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Avatar: its own glass circle; a click opens the user panel below it. -->
      <div
        v-if="isLogin"
        :ref="el => avatar = (el as HTMLElement | null)"
        :class="{ hover: popupVisible?.userPanel }"
        class="avatar right-side-item"
        @click="(event: MouseEvent) => handleClickTopBarItem(event, 'userPanel')"
      >
        <!-- Glass circle and face move as one: hover nudges them, opening carries
             them into the panel corner while the circle fades away. -->
        <div class="avatar-orb" :class="{ open: popupVisible?.userPanel }">
          <div class="avatar-face">
            <ALink
              :href="`https://space.bilibili.com/${mid}`"
              type="topBar"
              custom-click-event
              class="avatar-img top-bar-trigger"
              :style="{
                backgroundImage: `url(${userInfo.face ? removeHttpFromUrl(userInfo.face) : ''})`,
              }"
            />
            <div
              class="avatar-shadow"
              :style="{
                backgroundImage: `url(${userInfo.face ? removeHttpFromUrl(userInfo.face) : ''})`,
              }"
            />
            <svg
              v-if="userInfo.vip?.status === 1"
              class="vip-img"
              bg="[url(https://i0.hdslb.com/bfs/seed/jinkela/short/user-avatar/big-vip.svg)] contain no-repeat"
            />
            <!-- B币领取提醒dot -->
            <div
              v-if="hasBCoinToReceive && settings.showBCoinReceiveReminder"
              class="unread-dot avatar-dot"
            />
          </div>
        </div>

        <Transition name="slide-in">
          <UserPanelPop
            v-if="popupVisible?.userPanel"
            ref="avatarPopRef"
            :user-info="userInfo"
            class="bew-popover"
            @click.stop="() => {}"
          />
        </Transition>
      </div>
    </div>
    <OpenTabsDialog v-if="showOpenTabsDialog" @close="showOpenTabsDialog = false" />
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";
</style>
