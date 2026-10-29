<script setup lang="ts">
import DOMPurify from 'dompurify'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import { resetTopBarTransientInteraction } from '~/components/TopBar/composables/useTopBarInteraction'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { isAccountRequestCurrent, resolveAuthenticatedAccountId, resolveCookieMatchedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { resolveConfiguredLinkAction } from '~/utils/configuredLinkNavigation'
import { numFormatter } from '~/utils/dataFormatter'
import { LV0_ICON, LV1_ICON, LV2_ICON, LV3_ICON, LV4_ICON, LV5_ICON, LV6_ICON, LV6_LIGHTNING_ICON } from '~/utils/lvIcons'
import { getCSRF, getUserID } from '~/utils/main'
import { isExtensionContextInvalidatedError, reportRuntimeFailure } from '~/utils/messaging'
import { openLinkInBackground } from '~/utils/tabs'

import type { UserInfo, UserStat } from '../../types'

interface LoginLogItem {
  ip: string
  time: number
  time_at: string
  status: number
  type: number
  geo: string
}

const props = defineProps<{
  userInfo: UserInfo
}>()

const { t } = useI18n()

const topBarStore = useTopBarStore()
const { hasBCoinToReceive } = storeToRefs(topBarStore)
const currentAccountId = computed(() => resolveAuthenticatedAccountId(
  topBarStore.isLogin,
  topBarStore.userInfo.mid,
))
const mid = computed(() => currentAccountId.value ?? 0)

const otherLinks = computed((): { name: string, url: string, icon: string, code?: string }[] => {
  return [

    {
      name: t('topbar.user_dropdown.uploads_manager'),
      url: 'https://member.bilibili.com/platform/upload-manager/article',
      icon: 'i-tabler:video',
    },
    {
      name: t('topbar.user_dropdown.account_settings'),
      url: 'https://account.bilibili.com/account/home',
      icon: 'i-tabler:user-circle',
    },
    {
      name: t('topbar.user_dropdown.bilibili_premium'),
      url: 'https://account.bilibili.com/big',
      icon: 'i-tabler:crown',
    },
    {
      name: t('topbar.user_dropdown.bilibili_premium_rewards'),
      url: 'https://account.bilibili.com/account/big/myPackage',
      icon: 'i-tabler:gift',
      code: 'vip_rewards',
    },
    {
      name: t('topbar.user_dropdown.b_coins_wallet'),
      url: 'https://pay.bilibili.com/',
      icon: 'i-tabler:wallet',
    },
    {
      name: t('topbar.user_dropdown.orders'),
      url: 'https://show.bilibili.com/orderlist',
      icon: 'i-tabler:clipboard-list',
    },
    {
      name: t('topbar.user_dropdown.workshop'),
      url: 'https://gf.bilibili.com?msource=main_station',
      icon: 'i-tabler:building-warehouse',
    },
    {
      name: t('topbar.user_dropdown.my_stream_info'),
      url: 'https://link.bilibili.com/p/center/index',
      icon: 'i-tabler:broadcast',
    },
    {
      name: t('topbar.user_dropdown.my_courses'),
      url: 'https://www.bilibili.com/cheese/mine/list',
      icon: 'i-tabler:notebook',
    },
  ]
})

const level = computed(() => props.userInfo.level_info?.current_level ?? 0)
// LV6 is the top level: its bar stays full instead of giving way to other content.
const isMaxLevel = computed(() => level.value >= 6)
const levelProgress = computed(() => {
  if (isMaxLevel.value)
    return 100
  // userInfo can be empty while the login state is re-checked after a transient failure.
  const { next_exp: nextExp = 1, current_exp: currentExp = 0 } = props.userInfo.level_info ?? {}
  return Math.min(100, Math.max(0, (currentExp / nextExp) * 100))
})
const levelCaption = computed(() => {
  const { current_exp: currentExp = 0, next_exp: nextExp = 0 } = props.userInfo.level_info ?? {}
  return isMaxLevel.value
    ? t('topbar.user_dropdown.exp_max', { current_exp: currentExp })
    : t('topbar.user_dropdown.exp_desc', { current_exp: currentExp, level: level.value + 1, need_exp: nextExp - currentExp || 0 })
})

const userStat = reactive<Partial<UserStat>>({})
const loginLog = reactive<Partial<LoginLogItem>>({})

const showLastLogin = computed(() => !settings.value.hideTopBarUserPanelLastLogin)
let requestGeneration = 0
let readController: AbortController | undefined

function cancelPanelReads() {
  requestGeneration++
  readController?.abort()
  readController = undefined
}

function isPanelReadCurrent(accountId: number, generation: number) {
  return topBarStore.canReadUi()
    && isAccountRequestCurrent(accountId, generation, currentAccountId.value, requestGeneration)
    && resolveCookieMatchedAccountId(accountId, getUserID()) === accountId
}

function handlePanelReadFailure(context: string, error: unknown, accountId: number, generation: number, signal: AbortSignal) {
  // A stale account can still discover that this whole content-script world is
  // invalid. Reuse the TopBar's terminal state so reopening cannot retry it.
  if (isExtensionContextInvalidatedError(error)) {
    topBarStore.invalidateExtensionContext()
    cancelPanelReads()
    return
  }
  if (!signal.aborted && isPanelReadCurrent(accountId, generation))
    reportRuntimeFailure(context, error)
}

function clearAccountData() {
  Object.keys(userStat).forEach(key => Reflect.deleteProperty(userStat, key))
  Object.keys(loginLog).forEach(key => Reflect.deleteProperty(loginLog, key))
}

async function loadUserStat(requestAccountId: number, generation: number, signal: AbortSignal) {
  try {
    const res = await api.user.getUserStat({}, { signal })
    if (!isPanelReadCurrent(requestAccountId, generation))
      return
    if (res.code === 0)
      Object.assign(userStat, res.data)
  }
  catch (error) {
    handlePanelReadFailure('Failed to load user statistics', error, requestAccountId, generation, signal)
  }
}

async function loadLoginLog(requestAccountId: number, generation: number, signal: AbortSignal) {
  try {
    const res = await api.user.getLoginLog({}, { signal })
    if (!isPanelReadCurrent(requestAccountId, generation))
      return
    if (res.code === 0 && res.data?.list?.length > 0)
      Object.assign(loginLog, res.data.list[0])
  }
  catch (error) {
    handlePanelReadFailure('Failed to load recent login information', error, requestAccountId, generation, signal)
  }
}

watch([currentAccountId, showLastLogin], ([accountId, shouldLoadLogin]) => {
  cancelPanelReads()
  const generation = requestGeneration
  clearAccountData()
  if (accountId === null || !isPanelReadCurrent(accountId, generation))
    return

  const controller = new AbortController()
  readController = controller
  void loadUserStat(accountId, generation, controller.signal)
  if (shouldLoadLogin)
    void loadLoginLog(accountId, generation, controller.signal)
}, { immediate: true, flush: 'sync' })

onBeforeUnmount(cancelPanelReads)

async function logout() {
  // Web session logout is independent from optional App recommendation auth.
  // 立即更新登录状态，让顶栏立即显示未登录状态
  topBarStore.isLogin = false
  topBarStore.cleanup()

  try {
    await api.auth.logout({
      biliCSRF: getCSRF(),
    })
    location.reload()
  }
  catch (error) {
    console.error('Failed to log out:', error)
    topBarStore.reconcileLocalLoginState()
  }
}

const levelIcons: string[] = [
  LV0_ICON,
  LV1_ICON,
  LV2_ICON,
  LV3_ICON,
  LV4_ICON,
  LV5_ICON,
  LV6_ICON,
  LV6_LIGHTNING_ICON,
]

function getLvIcon(level: number, isSigma: boolean = false): string {
  if (level === 6 && isSigma) {
    return LV6_LIGHTNING_ICON
  }
  return levelIcons[level] || ''
}

function handleClickChannel() {
  const url = `https://space.bilibili.com/${mid.value}`
  const action = resolveConfiguredLinkAction(settings.value.topBarLinkOpenMode, location.href)
  if (action === 'newTab' || action === 'background')
    resetTopBarTransientInteraction()
  if (action === 'background')
    void openLinkInBackground(url)
  else
    window.open(url, action === 'newTab' ? '_blank' : '_top')
}
</script>

<template>
  <div
    class="userPanel-pop bew-popover bew-popover-surface"
    data-key="userPanel"
  >
    <!-- The enlarged avatar settles in this strip's top-right corner. -->
    <header class="user-panel__identity">
      <!-- Clicking the avatar opens this panel, so the name leads to the profile. -->
      <button type="button" class="user-panel__name" @click="handleClickChannel">
        {{ userInfo.uname || '-' }}
      </button>
      <p class="user-panel__balances">
        <ALink class="user-panel__balance" href="https://account.bilibili.com/account/coin" type="topBar">
          {{ $t('topbar.user_dropdown.money') }}{{ userInfo.money ?? '-' }}
        </ALink>
        <ALink class="user-panel__balance" href="https://pay.bilibili.com/pay-v2-web/bcoin_index" type="topBar">
          {{ $t('topbar.user_dropdown.b_coins') }}{{ userInfo.wallet?.bcoin_balance ?? '-' }}
        </ALink>
      </p>
    </header>

    <div class="bew-popover__scroll user-panel__scroll">
      <section class="user-panel__section">
        <ALink class="user-panel__level" href="//account.bilibili.com/account/record?type=exp" type="topBar">
          <span class="user-panel__level-bar">
            <span
              class="user-panel__level-icon"
              v-html="DOMPurify.sanitize(getLvIcon(level, isMaxLevel && userInfo.is_senior_member))"
            />
            <span
              class="user-panel__progress"
              role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(levelProgress)"
            >
              <span class="user-panel__progress-fill" :style="{ width: `${levelProgress}%` }" />
            </span>
            <span
              v-if="!isMaxLevel"
              class="user-panel__level-icon user-panel__level-icon--next"
              v-html="DOMPurify.sanitize(getLvIcon(level + 1))"
            />
          </span>
          <span class="user-panel__caption">{{ levelCaption }}</span>
        </ALink>
        <dl v-if="showLastLogin && (loginLog.time_at || loginLog.geo)" class="user-panel__login">
          <div v-if="loginLog.time_at" class="user-panel__login-item">
            <dt class="user-panel__login-label">
              {{ $t('topbar.user_dropdown.last_login_time') }}
            </dt>
            <dd class="user-panel__login-value">
              {{ loginLog.time_at }}
            </dd>
          </div>
          <div v-if="loginLog.geo" class="user-panel__login-item">
            <dt class="user-panel__login-label">
              {{ $t('topbar.user_dropdown.last_login_location') }}
            </dt>
            <dd class="user-panel__login-value">
              {{ loginLog.geo }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="user-panel__section user-panel__stats">
        <ALink
          v-for="stat in [
            { href: `https://space.bilibili.com/${mid}/fans/follow`, value: userStat.following, label: $t('topbar.user_dropdown.following') },
            { href: `https://space.bilibili.com/${mid}/fans/fans`, value: userStat.follower, label: $t('topbar.user_dropdown.followers') },
            { href: `https://space.bilibili.com/${mid}/dynamic`, value: userStat.dynamic_count, label: $t('topbar.user_dropdown.posts') },
          ]"
          :key="stat.href"
          class="channel-info-item"
          :href="stat.href"
          :title="stat.value === undefined ? undefined : String(stat.value)"
          type="topBar"
        >
          <span class="num">{{ stat.value === undefined ? '—' : numFormatter(stat.value) }}</span>
          <span class="channel-info-item__label">{{ stat.label }}</span>
        </ALink>
      </section>

      <section
        v-for="(group, groupIndex) in [otherLinks.slice(0, 2), otherLinks.slice(2)]"
        :key="groupIndex"
        class="user-panel__section user-panel__links"
      >
        <ALink
          v-for="item in group"
          :key="item.url"
          :href="item.url"
          type="topBar"
          class="user-panel__row"
        >
          <i :class="item.icon" class="user-panel__row-icon" aria-hidden="true" />
          <span class="user-panel__row-label">{{ item.name }}</span>
          <span
            v-if="hasBCoinToReceive && item.code === 'vip_rewards' && settings.showBCoinReceiveReminder"
            class="user-panel__dot"
            aria-hidden="true"
          />
        </ALink>
      </section>

      <section class="user-panel__section user-panel__links">
        <button type="button" class="user-panel__row user-panel__row--danger" @click="logout()">
          <i class="i-tabler:logout user-panel__row-icon" aria-hidden="true" />
          <span class="user-panel__row-label">{{ $t('topbar.user_dropdown.log_out') }}</span>
        </button>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../../styles/modalWindow";
@use "../../../../styles/truncateFade";

.userPanel-pop {
  width: 340px;
  max-height: var(--bew-popover-panel-height);
}

// The same solid window as the other top bar panels and the settings window.
// The top-right corner is concentric with the enlarged avatar sitting a
// space-2 inside it (--avatar-panel-face-radius comes from the .avatar host).
.userPanel-pop.bew-popover-surface {
  @include modalWindow.surface;
  border-radius: var(--bew-modal-radius) calc(var(--avatar-panel-face-radius) + var(--bew-space-2))
    var(--bew-modal-radius) var(--bew-modal-radius);
  corner-shape: var(--bew-corner-shape) round var(--bew-corner-shape) var(--bew-corner-shape);
}

// Ruled like the media popovers and the settings window: flat on the glass,
// sections divided by edge-to-edge hairlines, rows tinted edge to edge on hover.
// The identity strip is as tall as the enlarged avatar plus its space-2 inset,
// and its line is the scroll edge of everything below.
.user-panel__identity {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  justify-content: center;
  gap: var(--bew-space-1);
  box-sizing: border-box;
  min-height: calc(var(--avatar-panel-face-radius) * 2 + var(--bew-space-2) * 2);
  padding: var(--bew-space-3) calc(var(--avatar-panel-face-radius) * 2 + var(--bew-space-2) * 2) var(--bew-space-3)
    var(--bew-popover-inset);
  border-bottom: var(--bew-hairline) solid var(--bew-separator-color);
}

.user-panel__name {
  appearance: none;
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  color: var(--bew-text-1);
  background: transparent;
  font: inherit;
  font-size: var(--bew-font-size-subheading);
  line-height: var(--bew-line-height-subheading);
  text-align: start;
  cursor: pointer;
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
  @include truncateFade.line;
}

.user-panel__balances {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--bew-space-3);
  margin: 0;
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
}

.user-panel__balance {
  color: var(--bew-text-2);
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
}

.user-panel__name:is(:hover, :focus-visible),
.user-panel__balance:is(:hover, :focus-visible) {
  color: var(--bew-theme-foreground);
}

.user-panel__section + .user-panel__section {
  border-top: var(--bew-hairline) solid var(--bew-separator-color);
}

.user-panel__level {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3) var(--bew-popover-inset);
  color: var(--bew-text-2);
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.user-panel__level-bar {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

// The level badges are fixed artwork; only their height is set.
.user-panel__level-icon {
  display: flex;
  flex: 0 0 auto;

  :deep(.icon) {
    width: auto;
    height: var(--bew-icon-size-sm);
  }
}

.user-panel__level-icon--next :deep(.level-bg) {
  fill: var(--bew-text-4);
}

.user-panel__progress {
  position: relative;
  flex: 1 1 auto;
  height: var(--bew-space-1);
  overflow: hidden;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  background: var(--bew-fill-3);
}

.user-panel__progress-fill {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  border-radius: inherit;
  corner-shape: inherit;
  background: var(--bew-accent-solid);
}

.user-panel__caption {
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
}

.user-panel__login {
  display: grid;
  gap: var(--bew-space-1);
  margin: 0;
  padding: 0 var(--bew-popover-inset) var(--bew-space-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.user-panel__login-item {
  display: flex;
  gap: var(--bew-space-2);
  min-width: 0;
}

.user-panel__login-label {
  flex: 0 0 auto;
  color: var(--bew-text-3);
}

.user-panel__login-value {
  min-width: 0;
  margin: 0;
  color: var(--bew-text-2);
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
  @include truncateFade.line;
}

// Three counts side by side, split by inset vertical hairlines.
.user-panel__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.channel-info-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-0-5);
  padding: var(--bew-space-3) var(--bew-space-2);
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

  .num {
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-heading);
    line-height: var(--bew-line-height-heading);
    font-family: var(--bew-fonts-monospace);
    font-variant-numeric: tabular-nums;
  }
}

.channel-info-item + .channel-info-item::before {
  content: "";
  position: absolute;
  inset-block: var(--bew-space-3);
  inset-inline-start: 0;
  border-inline-start: var(--bew-hairline) solid var(--bew-separator-color);
  pointer-events: none;
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.channel-info-item__label {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

// A tinted cell hides the lines beside it, so the tint never meets a line.
.channel-info-item:is(:hover, :focus-visible)::before,
.channel-info-item:is(:hover, :focus-visible) + .channel-info-item::before {
  opacity: 0;
}

.user-panel__links {
  display: flex;
  flex-direction: column;
  padding-block: var(--bew-space-1);
}

.user-panel__row {
  appearance: none;
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  box-sizing: border-box;
  width: 100%;
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-popover-inset);
  border: 0;
  color: var(--bew-text-1);
  background: transparent;
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-align: start;
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.user-panel__row-icon {
  flex: 0 0 auto;
  width: var(--bew-icon-size-sm);
  height: var(--bew-icon-size-sm);
  color: var(--bew-text-2);
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
}

.user-panel__row-label {
  flex: 1 1 auto;
  min-width: 0;
  @include truncateFade.line;
}

.user-panel__row:is(:hover, :focus-visible) .user-panel__row-icon {
  color: var(--bew-text-1);
}

.user-panel__row--danger,
.user-panel__row--danger .user-panel__row-icon,
.user-panel__row--danger:is(:hover, :focus-visible) .user-panel__row-icon {
  color: var(--bew-error-color);
}

.user-panel__dot {
  flex: 0 0 auto;
  width: var(--bew-space-2);
  height: var(--bew-space-2);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: var(--bew-accent-marker);
}

.user-panel__level:is(:hover, :focus-visible),
.channel-info-item:is(:hover, :focus-visible),
.user-panel__row:is(:hover, :focus-visible) {
  background: var(--bew-hover-bg);
}
</style>
