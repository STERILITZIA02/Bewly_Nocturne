<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'
import Dialog from '~/components/Dialog.vue'
import Input from '~/components/Input.vue'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { changeUserRelation } from '~/utils/userRelation'

import type { FollowingGroup, FollowingGroupMutation, FollowingUploader } from './model'
import { isFollowingGroupNameValid, SPECIAL_FOLLOWING_GROUP } from './model'
import type { FollowingGroupWriteResult } from './useFollowingGroupWrites'

const props = defineProps<{
  accountId: number | null
  groups: readonly FollowingGroup[]
  busy: boolean
  loadGroups: () => Promise<boolean>
  loadMember: (mid: number) => Promise<FollowingUploader | undefined>
  write: (operation: FollowingGroupMutation) => Promise<FollowingGroupWriteResult>
}>()
const emit = defineEmits<{ committed: [operation: FollowingGroupMutation] }>()
const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirmDialog()
const target = shallowRef<{ type: 'uploader', value: Pick<FollowingUploader, 'mid' | 'name' | 'groupIds'> } | { type: 'group', value: FollowingGroup }>()
const trigger = shallowRef<HTMLElement | null>(null)
const anchor = ref({ x: 0, y: 0 })
const menu = ref<'actions' | 'groups' | null>(null)
const menuLoading = ref(false)
const confirmPending = ref(false)
const form = ref<{ kind: 'create' | 'rename', groupId?: number }>()
const nameDraft = ref('')
const formError = ref('')
const dialog = ref<InstanceType<typeof Dialog>>()
let contextAbort = new AbortController()
let menuGeneration = 0

const options = computed<ContextMenuOption[]>(() => {
  if (menu.value === 'groups') {
    const groups = props.groups.filter(group => group.tagid >= 0)
    if (!groups.some(group => group.tagid === 0))
      groups.unshift({ tagid: 0, name: t('home.following_default_group'), count: 0 })
    return groups.map(group => ({ value: group.tagid, label: group.tagid === 0 ? t('home.following_default_group') : group.name, icon: 'i-mingcute:folder-line', kind: 'radio', closeOnSelect: true, checked: target.value?.type === 'uploader' && target.value.value.groupIds.includes(group.tagid), disabled: props.busy || menuLoading.value }))
  }
  if (target.value?.type === 'uploader') {
    const special = target.value.value.groupIds.includes(SPECIAL_FOLLOWING_GROUP)
    return [
      { value: 'move', label: t('home.following_move_group'), icon: 'i-mingcute:folder-line', closeOnSelect: false, disabled: menuLoading.value },
      { value: 'special', label: t(special ? 'home.following_remove_special' : 'home.following_add_special'), icon: 'i-mingcute:star-line', kind: 'toggle', checked: special, closeOnSelect: true, disabled: menuLoading.value },
      { value: 'unfollow', label: t('video_card.operation.unfollow_user'), icon: 'i-solar:user-minus-bold-duotone', danger: true, disabled: menuLoading.value },
    ]
  }
  return [
    { value: 'create', label: t('home.following_create_group'), icon: 'i-mingcute:folder-add-line' },
    ...(target.value?.type === 'group' && target.value.value.tagid > 0
      ? [
          { value: 'rename', label: t('home.following_rename_group'), icon: 'i-mingcute:edit-line' },
          { value: 'delete', label: t('home.following_delete_group'), icon: 'i-mingcute:delete-line', danger: true },
        ]
      : []),
  ]
})

function closeMenu() {
  menuGeneration++
  menu.value = null
  menuLoading.value = false
}
function open(event: MouseEvent | KeyboardEvent) {
  if (props.busy || form.value || confirmPending.value || props.accountId === null)
    return false
  const element = event.currentTarget
  trigger.value = element instanceof HTMLElement ? element : null
  const rect = trigger.value?.getBoundingClientRect()
  anchor.value = event instanceof MouseEvent && (event.clientX || event.clientY)
    ? { x: event.clientX, y: event.clientY }
    : { x: rect?.right ?? 0, y: rect?.bottom ?? 0 }
  menuGeneration++
  menu.value = 'actions'
  return true
}
async function openUploader(event: MouseEvent | KeyboardEvent, uploader: FollowingUploader) {
  if (!open(event))
    return
  target.value = { type: 'uploader', value: { mid: uploader.mid, name: uploader.name, groupIds: [...uploader.groupIds] } }
  menuLoading.value = true
  const generation = menuGeneration
  const signal = contextAbort.signal
  const current = await props.loadMember(uploader.mid)
  if (signal.aborted || generation !== menuGeneration)
    return
  menuLoading.value = false
  if (current) {
    target.value = { type: 'uploader', value: { mid: current.mid, name: current.name, groupIds: [...current.groupIds] } }
  }
  else {
    closeMenu()
    toast.error(t('common.load_failed'))
  }
}
function openGroup(event: MouseEvent | KeyboardEvent, group: FollowingGroup) {
  if (open(event))
    target.value = { type: 'group', value: { tagid: group.tagid, name: group.name, count: group.count } }
}
function create() {
  if (props.busy || form.value || confirmPending.value || props.accountId === null)
    return
  closeMenu()
  nameDraft.value = ''
  formError.value = ''
  form.value = { kind: 'create' }
}
function errorLabel(result: FollowingGroupWriteResult) {
  if (result.reason === 'invalid-name')
    return t('home.following_group_name_invalid')
  if (result.reason === 'account-unavailable')
    return t('common.please_log_in_first')
  return result.error || t('common.operation_failed')
}
async function write(operation: FollowingGroupMutation) {
  const result = await props.write(operation)
  if (!result.applied)
    return result
  if (result.success) {
    emit('committed', operation)
    toast.success(t('common.operation_completed'))
  }
  else {
    toast.error(errorLabel(result))
  }
  return result
}

async function select(value: string | number) {
  const snapshot = target.value
  const account = props.accountId
  const signal = contextAbort.signal
  if (!snapshot || props.busy || account === null || signal.aborted)
    return
  if (snapshot.type === 'uploader') {
    const uploader = snapshot.value
    if (value === 'move') {
      menu.value = 'groups'
      menuLoading.value = true
      const generation = menuGeneration
      const loaded = await props.loadGroups()
      if (generation !== menuGeneration || signal.aborted)
        return
      menuLoading.value = false
      if (!loaded) {
        closeMenu()
        toast.error(t('home.following_groups_load_failed'))
      }
    }
    else if (value === 'special') {
      await write({ kind: 'special', mid: uploader.mid, groupIds: [...uploader.groupIds], enabled: !uploader.groupIds.includes(SPECIAL_FOLLOWING_GROUP) })
    }
    else if (typeof value === 'number') {
      await write({ kind: 'move', mid: uploader.mid, groupIds: [...uploader.groupIds], targetGroupId: value })
    }
    else if (value === 'unfollow') {
      confirmPending.value = true
      try {
        if (!await confirm(t('video_card.unfollow_user_confirm.message', { name: uploader.name }), signal) || signal.aborted || account !== props.accountId)
          return
        const response = await changeUserRelation(account, uploader.mid, 2)
        if (signal.aborted || account !== props.accountId)
          return
        if (response.code !== 0)
          throw new Error(response.message || t('common.operation_failed'))
        toast.success(t('common.operation_completed'))
      }
      catch (error) {
        if (!signal.aborted)
          toast.error(error instanceof Error ? error.message : t('common.operation_failed'))
      }
      finally { confirmPending.value = false }
    }
  }
  else if (value === 'create') {
    create()
  }
  else if (value === 'rename') {
    nameDraft.value = snapshot.value.name
    formError.value = ''
    form.value = { kind: 'rename', groupId: snapshot.value.tagid }
  }
  else if (value === 'delete') {
    confirmPending.value = true
    try {
      if (await confirm(t('home.following_delete_group_confirm', { name: snapshot.value.name }), signal) && !signal.aborted && account === props.accountId)
        await write({ kind: 'delete', groupId: snapshot.value.tagid })
    }
    finally { confirmPending.value = false }
  }
}

async function submitName() {
  const snapshot = form.value
  const name = nameDraft.value.trim()
  const signal = contextAbort.signal
  if (!snapshot || props.busy)
    return
  if (!isFollowingGroupNameValid(name)) {
    formError.value = t('home.following_group_name_invalid')
    return
  }
  const operation: FollowingGroupMutation = snapshot.kind === 'create'
    ? { kind: 'create', name }
    : { kind: 'rename', groupId: snapshot.groupId!, name }
  const result = await props.write(operation)
  if (signal.aborted || form.value !== snapshot || !result.applied)
    return
  if (!result.success) {
    formError.value = errorLabel(result)
    return
  }
  toast.success(t('common.operation_completed'))
  emit('committed', operation)
  if (nameDraft.value.trim() === name) {
    await nextTick()
    dialog.value?.close()
  }
}
watch(() => props.accountId, () => {
  contextAbort.abort()
  contextAbort = new AbortController()
  closeMenu()
  form.value = undefined
  target.value = undefined
})
onBeforeUnmount(() => contextAbort.abort())
defineExpose({ openUploader, openGroup, create })
</script>

<template>
  <ContextMenu
    v-if="menu" :options="options" :anchor="anchor" :trigger="trigger" :loading="menuLoading"
    @select="select" @close="closeMenu"
  />
  <Dialog
    v-if="form" ref="dialog" :title="$t(`home.following_${form.kind}_group`)" width="var(--bew-layout-dialog-width)" append-to-bewly-body
    :close-on-confirm="false" :loading="busy" @confirm="submitName" @close="form = undefined"
  >
    <div class="following-group-form">
      <label>
        <span>{{ $t('home.following_group_name_label') }}</span>
        <Input v-model="nameDraft" :disabled="busy" :aria-invalid="Boolean(formError)" @enter="submitName" />
      </label>
      <p v-if="formError" role="alert">
        {{ formError }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.following-group-form,
.following-group-form label {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}
.following-group-form [role="alert"] {
  color: var(--bew-error-color);
}
</style>
