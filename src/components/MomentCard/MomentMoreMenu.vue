<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { useUserRelations } from '~/composables/useUserRelations'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { getUserID, openLinkToNewTab } from '~/utils/main'
import { changeUserRelation } from '~/utils/userRelation'

import type { Video } from '../VideoCard/types'
import type { VideoCardContextMenuExtraOption } from '../VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue'
import VideoCardContextMenu from '../VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue'
import type { DisplayMoment } from './types'

const props = defineProps<{
  moment: DisplayMoment
  video: Video | null
  href: string
  menuStyles: CSSProperties
  anchor: { x: number, y: number }
  trigger: HTMLElement | null
}>()
const emit = defineEmits<{
  close: []
  requestDelete: [moment: DisplayMoment]
  requestReport: [moment: DisplayMoment]
}>()

const { t } = useI18n()
const toast = useToast()
const topBarStore = useTopBarStore()
const { confirm } = useConfirmDialog()
const { userRelations, batchQueryUserRelations } = useUserRelations()
const accountId = computed(() => resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid))
const authorMid = computed(() => {
  const mid = Number(props.moment.author.mid)
  return Number.isSafeInteger(mid) && mid > 0 ? mid : undefined
})
const isOwnMoment = computed(() => accountId.value !== null && authorMid.value === accountId.value)
const capability = computed(() => props.moment.moreCapability)
const canDelete = computed(() => Boolean(isOwnMoment.value && capability.value?.canDelete && capability.value.deleteParams))
const canReport = computed(() => Boolean(accountId.value !== null && !isOwnMoment.value && capability.value?.canReport))
const following = computed(() => authorMid.value ? userRelations.value[authorMid.value]?.isFollowing : undefined)

const menuVideo = computed<Video | null>(() => {
  const video = props.video
  if (!video)
    return null
  const author = Array.isArray(video.author) ? video.author[0] : video.author
  const mid = author?.mid
  const followed = mid ? userRelations.value[mid]?.isFollowing : undefined
  if (!author || followed === undefined || Array.isArray(video.author))
    return video
  return { ...video, author: { ...author, followed } }
})

const momentGroups = computed<VideoCardContextMenuExtraOption[][]>(() => {
  const group: VideoCardContextMenuExtraOption[] = []
  if (canReport.value)
    group.push({ key: 'moment:report', name: t('moment_card.report'), icon: 'i-tabler:flag', run: () => emit('requestReport', props.moment) })
  if (canDelete.value)
    group.push({ key: 'moment:delete', name: t('moment_card.delete'), icon: 'i-tabler:trash', color: 'text-$bew-error-color', run: () => emit('requestDelete', props.moment) })
  return group.length ? [group] : []
})

const options = computed<ContextMenuOption[]>(() => {
  const result: ContextMenuOption[] = []
  if (props.href)
    result.push({ value: 'open', label: t('video_card.operation.open_in_new_tab'), icon: 'i-tabler:layout-bottombar' })
  if (props.moment.url)
    result.push({ value: 'copy', label: t('moment_card.copy_link'), icon: 'i-tabler:copy' })
  if (authorMid.value && accountId.value !== null && !isOwnMoment.value && following.value !== undefined) {
    result.push(following.value
      ? { value: 'unfollow', label: t('video_card.operation.unfollow_user'), icon: 'i-tabler:user-minus' }
      : { value: 'follow', label: t('video_card.operation.follow_user'), icon: 'i-tabler:user-plus' })
  }
  for (const group of momentGroups.value) {
    for (const option of group)
      result.push({ value: option.key, label: option.name, icon: option.icon, danger: option.key === 'moment:delete' })
  }
  return result
})

async function writeRelation(follow: boolean) {
  const account = accountId.value
  const mid = authorMid.value
  if (account === null || !mid)
    return
  if (!follow && !await confirm(t('video_card.unfollow_user_confirm.message', { name: props.moment.author.name })))
    return
  if (account !== accountId.value || String(getUserID() ?? '') !== String(account))
    return
  try {
    const response = await changeUserRelation(account, mid, follow ? 1 : 2)
    if (account !== accountId.value || String(getUserID() ?? '') !== String(account))
      return
    if (response.code !== 0)
      throw new Error(response.message || t('common.operation_failed'))
    toast.success(t('common.operation_completed'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.operation_failed'))
  }
}

function select(value: string | number) {
  if (value === 'open') {
    openLinkToNewTab(props.href)
  }
  else if (value === 'copy') {
    void navigator.clipboard.writeText(props.moment.url).then(() => toast.success(t('moment_card.link_copied')), () => toast.error(t('common.operation_failed')))
  }
  else if (value === 'follow' || value === 'unfollow') {
    void writeRelation(value === 'follow')
  }
  else {
    momentGroups.value.flat().find(option => option.key === value)?.run()
  }
}

onMounted(() => {
  if (authorMid.value && accountId.value !== null && !isOwnMoment.value)
    void batchQueryUserRelations([authorMid.value])
})
</script>

<template>
  <VideoCardContextMenu
    v-if="menuVideo"
    :video="menuVideo"
    :context-menu-styles="menuStyles"
    :extra-groups="momentGroups"
    @close="emit('close')"
    @removed="emit('close')"
  />
  <ContextMenu
    v-else
    :options="options"
    :anchor="anchor"
    :trigger="trigger"
    @select="select"
    @close="emit('close')"
  />
</template>
