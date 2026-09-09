<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { calcTimeSince } from '~/utils/dataFormatter'

import FollowingGroupActions from './FollowingGroupActions.vue'
import type { FollowingGroup, FollowingGroupMutation, FollowingUploader } from './model'
import { groupFollowingUploaders, SPECIAL_FOLLOWING_GROUP } from './model'
import type { FollowingGroupWriteResult } from './useFollowingGroupWrites'

const props = defineProps<{
  uploaders: FollowingUploader[]
  groups: FollowingGroup[]
  grouped: boolean
  accountId: number | null
  selected: number | null
  loading: boolean
  failed: boolean
  groupsLoading: boolean
  groupsFailed: boolean
  busy: boolean
  loadGroups: () => Promise<boolean>
  loadMember: (mid: number) => Promise<FollowingUploader | undefined>
  write: (operation: FollowingGroupMutation) => Promise<FollowingGroupWriteResult>
}>()
const emit = defineEmits<{ select: [mid: number | null], retry: [], retryGroups: [], scrollElement: [element: HTMLElement | null] }>()
const query = defineModel<string>('query', { required: true })
const expanded = defineModel<number[]>('expanded', { required: true })
const { t } = useI18n()
const scroller = ref<HTMLElement | null>(null)
const actions = ref<InstanceType<typeof FollowingGroupActions>>()
const unread = computed(() => props.uploaders.filter(user => user.hasUpdate).length)
const keyword = computed(() => query.value.trim().toLocaleLowerCase())
const matching = (user: FollowingUploader) => !keyword.value || user.name.toLocaleLowerCase().includes(keyword.value)
const displayed = computed(() => props.uploaders.filter(matching))
type Row = { type: 'group', key: string, group: FollowingGroup, expanded: boolean, count: number }
  | { type: 'uploader', key: string, uploader: FollowingUploader, groupId?: number }
const rows = computed<Row[]>(() => {
  if (!props.grouped)
    return displayed.value.map(uploader => ({ type: 'uploader', key: String(uploader.mid), uploader }))
  const groups = groupFollowingUploaders(props.uploaders, props.groups, id => t(id === 0
    ? 'home.following_default_group'
    : id === SPECIAL_FOLLOWING_GROUP ? 'home.following_special_group' : 'home.following_group_name', { id }))
  return groups.flatMap((group): Row[] => {
    const members = group.uploaders.filter(matching)
    if (keyword.value && group.uploaders.length && !members.length)
      return []
    const open = Boolean(keyword.value) || expanded.value.includes(group.tagid)
    return [
      { type: 'group', key: `group:${group.tagid}`, group, count: members.length, expanded: open },
      ...(open ? members.map(uploader => ({ type: 'uploader' as const, key: `${group.tagid}:${uploader.mid}`, groupId: group.tagid, uploader })) : []),
    ]
  })
})
function toggleGroup(id: number) {
  if (keyword.value)
    return
  expanded.value = expanded.value.includes(id) ? expanded.value.filter(value => value !== id) : [...expanded.value, id]
}
function keyboardMenu(event: KeyboardEvent, row: Row) {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey
    || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (row.type === 'group')
    actions.value?.openGroup(event, row.group)
  else
    void actions.value?.openUploader(event, row.uploader)
}
async function afterCommit(operation: FollowingGroupMutation) {
  if (operation.kind !== 'move' && operation.kind !== 'special' && operation.kind !== 'delete')
    return
  const destination = operation.kind === 'move'
    ? operation.targetGroupId
    : operation.kind === 'special' && operation.enabled ? SPECIAL_FOLLOWING_GROUP : undefined
  if (destination !== undefined && !expanded.value.includes(destination))
    expanded.value = [...expanded.value, destination]
  await nextTick()
  const selector = 'mid' in operation
    ? `[data-uploader-mid="${operation.mid}"]${props.grouped && destination !== undefined ? `[data-uploader-group="${destination}"]` : ''}`
    : ''
  const target = selector ? scroller.value?.querySelector<HTMLElement>(selector) : null
  ;(target ?? scroller.value)?.focus({ preventScroll: true })
}
onMounted(() => emit('scrollElement', scroller.value))
</script>

<template>
  <aside class="following-sidebar">
    <div ref="scroller" class="following-sidebar__scroll" tabindex="-1">
      <Input v-model="query" :placeholder="$t('common.search')" class="following-sidebar__search" />
      <div v-if="failed || groupsFailed" class="following-sidebar__status" role="status">
        <span>{{ $t(groupsFailed ? 'home.following_groups_load_failed' : 'common.load_failed') }}</span>
        <button type="button" class="following-sidebar__group" @click="groupsFailed ? emit('retryGroups') : emit('retry')">
          {{ $t('home.following_groups_retry') }}
        </button>
      </div>
      <ul class="following-sidebar__list">
        <li>
          <button type="button" class="following-sidebar__uploader" :class="{ active: selected === null }" :aria-pressed="selected === null" @click="emit('select', null)">
            <span class="following-sidebar__avatar following-sidebar__all"><span i-mingcute-classify-2-fill aria-hidden="true" /></span>
            <span class="following-sidebar__labels">
              <span>{{ $t('topbar.moments_dropdown.tabs.all') }}</span>
              <small v-if="unread">{{ $t('home.uploaders_with_updates', { count: unread }) }}</small>
            </span>
          </button>
        </li>
        <template v-if="loading && !uploaders.length">
          <li v-for="index in 6" :key="`loading:${index}`" aria-hidden="true">
            <div class="following-sidebar__uploader">
              <SkeletonBlock width="var(--bew-space-8)" height="var(--bew-space-8)" radius="circle" />
              <span class="following-sidebar__labels">
                <SkeletonBlock height="var(--bew-line-height-control)" width="85%" />
                <SkeletonBlock height="var(--bew-line-height-caption)" width="60%" />
              </span>
            </div>
          </li>
        </template>
        <li v-for="row in rows" :key="row.key">
          <button
            v-if="row.type === 'group'" type="button" class="following-sidebar__group"
            :aria-expanded="row.expanded" aria-haspopup="menu"
            @click="toggleGroup(row.group.tagid)" @keydown="keyboardMenu($event, row)"
            @contextmenu.prevent.stop="actions?.openGroup($event, row.group)"
          >
            <span :class="row.expanded ? 'i-mingcute:down-line' : 'i-mingcute:right-line'" aria-hidden="true" />
            <span class="following-sidebar__group-name">{{ row.group.name }}</span><span>{{ row.count }}</span>
          </button>
          <button
            v-else type="button" class="following-sidebar__uploader" :class="{ active: selected === row.uploader.mid }"
            :data-uploader-mid="row.uploader.mid" :data-uploader-group="row.groupId"
            :aria-pressed="selected === row.uploader.mid" aria-haspopup="menu"
            @click="emit('select', row.uploader.mid)" @keydown="keyboardMenu($event, row)"
            @contextmenu.prevent.stop="actions?.openUploader($event, row.uploader)"
          >
            <span class="following-sidebar__avatar">
              <img :src="`${row.uploader.face}@50w_50h`" alt="" loading="lazy" decoding="async">
              <span v-if="row.uploader.hasUpdate" class="following-sidebar__unread" />
            </span>
            <span class="following-sidebar__labels"><span>{{ row.uploader.name }}</span><small>{{ calcTimeSince(row.uploader.lastUpdateTime) }}</small></span>
          </button>
        </li>
      </ul>
      <SkeletonBlock v-if="grouped && groupsLoading && !groups.length" height="var(--bew-control-height)" />
      <button type="button" class="following-sidebar__group" :disabled="accountId === null || busy" @click="actions?.create()">
        <span i-mingcute-folder-add-line aria-hidden="true" />{{ $t('home.following_create_group') }}
      </button>
      <p v-if="keyword && !displayed.length" class="following-sidebar__status">
        {{ $t('common.no_data') }}
      </p>
    </div>
    <FollowingGroupActions
      ref="actions" :account-id="accountId" :groups="groups" :busy="busy" :load-groups="loadGroups"
      :load-member="loadMember" :write="write" @committed="afterCommit"
    />
  </aside>
</template>

<style scoped lang="scss">
.following-sidebar {
  position: sticky;
  top: var(--bew-layout-sidebar-sticky-top);
  align-self: flex-start;
  width: var(--bew-layout-sidebar-width);
  height: calc(100dvh - var(--bew-layout-sidebar-sticky-top) - var(--bew-space-2));
  flex: none;
}
.following-sidebar__scroll {
  height: inherit;
  padding: var(--bew-space-2) var(--bew-space-5) var(--bew-space-5);
  margin: calc(var(--bew-space-5) * -1);
  overflow: hidden auto;
  overflow-anchor: none;
  overscroll-behavior: contain;
}
.following-sidebar__search {
  margin-bottom: var(--bew-space-3);
}
.following-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}
.following-sidebar__uploader,
.following-sidebar__group {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  width: 100%;
  padding: var(--bew-space-2) var(--bew-space-4);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  color: var(--bew-text-1);
  text-align: start;
  cursor: pointer;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  transition:
    background-color var(--bew-duration-fast),
    color var(--bew-duration-fast);
  &:hover:not(:disabled):not(.active) {
    background: var(--bew-fill-2);
  }
  &:active:not(:disabled):not(.active) {
    background: var(--bew-fill-3);
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
  &:focus-visible {
    outline: var(--bew-space-0-5) solid var(--bew-theme-foreground);
    outline-offset: var(--bew-space-0-5);
  }
}
.following-sidebar__avatar {
  position: relative;
  width: var(--bew-space-8);
  height: var(--bew-space-8);
  flex: none;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  > img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    corner-shape: inherit;
  }
}
.following-sidebar__all {
  display: grid;
  place-items: center;
  background: var(--bew-fill-2);
}
.following-sidebar__unread {
  position: absolute;
  inset: 0 0 auto auto;
  width: var(--bew-space-2);
  height: var(--bew-space-2);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: var(--bew-error-color);
}
.following-sidebar__labels {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: calc(var(--bew-line-height-control) + var(--bew-line-height-caption));
  flex-direction: column;
  justify-content: center;
  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}
.following-sidebar__group {
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  color: var(--bew-text-2);
  font-weight: var(--bew-font-weight-semibold);
}
.following-sidebar__group-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.following-sidebar__status {
  margin-block: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.active {
  background: var(--bew-theme-color-auto);
  color: var(--bew-text-auto);
  box-shadow: var(--bew-shadow-2);
  small {
    color: inherit;
    opacity: 0.85;
  }
}
</style>
