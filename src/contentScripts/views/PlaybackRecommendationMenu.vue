<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, nextTick, onScopeDispose, provide, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { Video } from '~/components/VideoCard/types'
import VideoCardContextMenu from '~/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useTopBarStore } from '~/stores/topBarStore'
import { createAccountLifetime } from '~/utils/accountLifetime'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { PGC_RECOMMEND_LIST_CLASS } from '~/utils/bewlyWidescreen/constants'
import { session as playbackSession } from '~/utils/bewlyWidescreen/session'
import { bv2av } from '~/utils/bvid'
import { getContextMenuPlacement } from '~/utils/floatingMenu'
import { getUserID } from '~/utils/main'
import { updateOwnedWatchLater } from '~/utils/watchLater'

// The playback page's cards (recommendations; on a bangumi page also its
// related recommendations and episode rows and tiles) are Bilibili's own
// nodes; a right click (long press, menu key) opens the same menu as every
// video card.
const { t } = useI18n()
const toast = useToast()
const { mainAppRef } = useBewlyApp()
const topBar = useTopBarStore()
const lifetime = createAccountLifetime(() => {
  const accountId = resolveAuthenticatedAccountId(topBar.isLogin, topBar.userInfo.mid)
  return String(accountId) === getUserID() ? accountId : null
})
onScopeDispose(() => lifetime.dispose())

provide('getVideoType', () => 'common')

const menu = shallowRef<{ video: Video, styles: CSSProperties, trigger: HTMLElement | null } | null>(null)

// Video cards (recommendations) link a BV; bangumi cards (related
// recommendations, episode rows and tiles) link a season or an episode.
const CARD_SELECTOR = [
  ':is(.next-play, .rec-list) > .video-page-card-small',
  `.${PGC_RECOMMEND_LIST_CLASS} > [class*="RecommendItem_wrap"]`,
  '[class*="EpisodeVirtualList_listItem"]',
  '[class*="EpisodeVirtualList_numberItem"]',
].join(', ')

function readCover(card: Element) {
  return card.querySelector('img')?.src.split('@')[0] ?? ''
}

function readBangumi(card: Element): Video | null {
  const link = card.matches('a') ? card as HTMLAnchorElement : card.querySelector<HTMLAnchorElement>('a[href*="/bangumi/play/"]')
  const match = link?.href.match(/\/bangumi\/play\/(ep|ss)(\d+)/)
  if (!link || !match)
    return null
  const title = card.querySelector('[class*="RecommendItem_title"], strong')?.textContent?.trim() || link.title || link.textContent?.trim() || ''
  return {
    id: 0,
    epid: match[1] === 'ep' ? Number(match[2]) : undefined,
    goto: 'bangumi',
    title,
    cover: readCover(card),
    url: `https://www.bilibili.com/bangumi/play/${match[1]}${match[2]}`,
    threePointV2: [],
  }
}

function readVideo(card: Element): Video | null {
  const bvid = card.querySelector<HTMLAnchorElement>('a[href*="/video/BV"]')?.href.match(/\/video\/(BV\w{10})/)?.[1]
  if (!bvid)
    return readBangumi(card)
  const author = card.querySelector<HTMLAnchorElement>('.upname a')
  return {
    id: bv2av(bvid),
    bvid,
    title: card.querySelector('.title')?.textContent?.trim() ?? '',
    cover: readCover(card),
    author: {
      name: author?.querySelector('.name')?.textContent?.trim(),
      mid: Number(author?.href.match(/\/(\d+)/)?.[1]) || undefined,
      authorFace: '',
    },
    url: `https://www.bilibili.com/video/${bvid}`,
    threePointV2: [],
  }
}

function handleContextMenu(event: MouseEvent) {
  // Shift keeps the browser menu, and a text selection keeps native copy.
  const card = event.target instanceof Element ? event.target.closest(CARD_SELECTOR) : null
  const video = card && readVideo(card)
  if (!video || event.shiftKey || document.getSelection()?.toString())
    return
  event.preventDefault()
  const placement = getContextMenuPlacement(event)
  menu.value = { video, styles: placement.styles, trigger: placement.trigger }
  if (video.id)
    void topBar.ensureWatchLaterState()
}

watch(() => playbackSession.current?.root, (root, previous) => {
  previous?.removeEventListener('contextmenu', handleContextMenu)
  root?.addEventListener('contextmenu', handleContextMenu)
  menu.value = null
}, { immediate: true })
onScopeDispose(() => playbackSession.current?.root.removeEventListener('contextmenu', handleContextMenu))

function close() {
  const trigger = menu.value?.trigger
  menu.value = null
  void nextTick(() => trigger?.isConnected && trigger.focus({ preventScroll: true }))
}

async function toggleWatchLater(video: Video) {
  const owner = lifetime.capture()
  const loaded = await topBar.ensureWatchLaterState()
  if (!owner.isCurrent() || !loaded)
    return
  const result = await updateOwnedWatchLater(video, topBar.isInWatchLater(video.id) ? 'remove' : 'add', owner, topBar, async () => video.id)
  if (!owner.isCurrent())
    return
  if (result.status === 'success')
    toast.success(t(result.added ? 'common.added_to_watch_later' : 'common.operation_completed'))
  else if (result.status === 'failed' || result.status === 'unavailable')
    toast.error((result.status === 'failed' && result.message) || t('video_card.watch_later_update_failed'))
}

const watchLater = computed(() => {
  // Watch later holds archives (aid); a bangumi season or episode has none here.
  const video = menu.value?.video
  return video?.id ? { added: topBar.isInWatchLater(video.id), toggle: () => void toggleWatchLater(video) } : undefined
})
</script>

<template>
  <Teleport v-if="menu" :to="mainAppRef">
    <VideoCardContextMenu
      :video="menu.video"
      :context-menu-styles="menu.styles"
      :watch-later="watchLater"
      @close="close"
      @removed="close"
    />
  </Teleport>
</template>
