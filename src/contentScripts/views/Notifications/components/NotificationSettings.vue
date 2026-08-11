<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import SettingsItem from '~/components/Settings/components/SettingsItem.vue'
import SettingsItemGroup from '~/components/Settings/components/SettingsItemGroup.vue'
import TagRemoveButton from '~/components/TagRemoveButton.vue'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { MessageSettingKey } from '../composables/useMessageSettings'
import type {
  MessageSettingState,
  NotificationMode,
  NotificationModeKey,
  SimpleAutoReplyType,
} from '../types'

const props = defineProps<{
  state: MessageSettingState
  loading: boolean
  loaded: boolean
  error: string
  saving: Set<MessageSettingKey>
  notificationModeSaving: Set<NotificationModeKey>
  antiDisturbBusy: boolean
  autoReplySaving: Set<SimpleAutoReplyType>
  blockWordBusy: boolean
}>()

const emit = defineEmits<{
  'refresh': []
  'update': [key: MessageSettingKey, value: boolean]
  'updateNotificationMode': [key: NotificationModeKey, mode: NotificationMode]
  'updateAntiDisturb': [id: number, isOpen: boolean]
  'saveAutoReplyText': [type: SimpleAutoReplyType, reply: string]
  'addBlockWord': [word: string]
  'removeBlockWord': [word: string]
}>()

const { t } = useI18n()
const blockWordDraft = ref('')
const blockWordSearch = ref('')
const scrollRef = ref<HTMLElement | null>(null)
const autoReplyDrafts = reactive<Record<SimpleAutoReplyType, string>>({
  1: '',
  3: '',
  5: '',
})
const dirtyAutoReplies = ref<Set<SimpleAutoReplyType>>(new Set())
const autoReplyTypes = [1, 3, 5] as const satisfies readonly SimpleAutoReplyType[]
const blockWordLimitReached = computed(() => (
  props.state.limits.maxBlockWords !== null
  && props.state.blockWords.length >= props.state.limits.maxBlockWords
))
const filteredBlockWords = computed(() => {
  const query = blockWordSearch.value.trim().toLocaleLowerCase()
  return query
    ? props.state.blockWords.filter(word => word.toLocaleLowerCase().includes(query))
    : props.state.blockWords
})
const notificationModeOptions = computed(() => [
  { value: 0, label: t('notifications.settings.notification_mode_all') },
  { value: 1, label: t('notifications.settings.notification_mode_following') },
  { value: 2, label: t('notifications.settings.notification_mode_off') },
])
const antiDisturbOptions = computed(() => props.state.antiDisturb.options.map(option => ({
  value: option.id,
  label: option.title || option.content || t('notifications.settings.anti_disturb_option', { id: option.id }),
})))
const antiDisturbAvailable = computed(() => (
  props.state.antiDisturb.selectedId > 0 || antiDisturbOptions.value.length > 0
))
const selectedAntiDisturbDescription = computed(() => {
  const selected = props.state.antiDisturb.options.find(option => option.id === props.state.antiDisturb.selectedId)
  return selected?.content || props.state.antiDisturb.content || t('notifications.settings.anti_disturb_desc')
})

type SettingItem = {
  kind: 'boolean'
  key: MessageSettingKey
  title: string
  desc: string
} | {
  kind: 'mode'
  key: NotificationModeKey
  title: string
  desc: string
}

const groups: {
  title: string
  icon: string
  items: SettingItem[]
}[] = [
  {
    title: 'notifications.settings.groups.notifications',
    icon: 'i-tabler-bell',
    items: [
      { kind: 'boolean', key: 'messageNotification', title: 'notifications.settings.message_notification', desc: 'notifications.settings.message_notification_desc' },
      { kind: 'mode', key: 'comment', title: 'notifications.settings.comment_notification', desc: 'notifications.settings.comment_notification_desc' },
      { kind: 'mode', key: 'mention', title: 'notifications.settings.mention_notification', desc: 'notifications.settings.mention_notification_desc' },
      { kind: 'boolean', key: 'likeNotification', title: 'notifications.settings.like_notification', desc: 'notifications.settings.like_notification_desc' },
    ],
  },
  {
    title: 'notifications.settings.groups.conversations',
    icon: 'i-tabler-messages',
    items: [
      { kind: 'boolean', key: 'receiveUnfollowedMessage', title: 'notifications.settings.receive_unfollowed', desc: 'notifications.settings.receive_unfollowed_desc' },
      { kind: 'boolean', key: 'showUnfollowedMessage', title: 'notifications.settings.show_unfollowed', desc: 'notifications.settings.show_unfollowed_desc' },
    ],
  },
  {
    title: 'notifications.settings.groups.groups',
    icon: 'i-tabler-users-group',
    items: [
      { kind: 'boolean', key: 'receiveGroupMessage', title: 'notifications.settings.receive_group', desc: 'notifications.settings.receive_group_desc' },
      { kind: 'boolean', key: 'foldGroupMessage', title: 'notifications.settings.fold_group', desc: 'notifications.settings.fold_group_desc' },
    ],
  },
  {
    title: 'notifications.settings.groups.safety',
    icon: 'i-tabler-shield-check',
    items: [
      { kind: 'boolean', key: 'aiIntercept', title: 'notifications.settings.ai_intercept', desc: 'notifications.settings.ai_intercept_desc' },
      { kind: 'boolean', key: 'antiHarassment', title: 'notifications.settings.anti_harassment', desc: 'notifications.settings.anti_harassment_desc' },
    ],
  },
]

const autoReplyItems: {
  type: SimpleAutoReplyType
  key: MessageSettingKey
  title: string
  desc: string
}[] = [
  { type: 1, key: 'followedAutoReply', title: 'notifications.settings.followed_auto_reply', desc: 'notifications.settings.followed_auto_reply_desc' },
  { type: 3, key: 'receivedMessageAutoReply', title: 'notifications.settings.received_auto_reply', desc: 'notifications.settings.received_auto_reply_desc' },
  { type: 5, key: 'voyageAutoReply', title: 'notifications.settings.voyage_auto_reply', desc: 'notifications.settings.voyage_auto_reply_desc' },
]

watch(
  () => autoReplyTypes.map(type => props.state.autoReplyTexts[type][0]?.reply || ''),
  (serverReplies) => {
    const nextDirty = new Set(dirtyAutoReplies.value)
    autoReplyTypes.forEach((type, index) => {
      const serverReply = serverReplies[index]
      if (!nextDirty.has(type) || autoReplyDrafts[type] === serverReply) {
        autoReplyDrafts[type] = serverReply
        nextDirty.delete(type)
      }
    })
    dirtyAutoReplies.value = nextDirty
  },
  { immediate: true },
)

function updateNotificationMode(key: NotificationModeKey, value: unknown) {
  if (value === 0 || value === 1 || value === 2)
    emit('updateNotificationMode', key, value)
}

function updateAntiDisturbOpen(isOpen: boolean) {
  const id = props.state.antiDisturb.selectedId || antiDisturbOptions.value[0]?.value
  if (id)
    emit('updateAntiDisturb', id, isOpen)
}

function updateAntiDisturbOption(value: unknown) {
  if (typeof value === 'number')
    emit('updateAntiDisturb', value, props.state.antiDisturb.isOpen)
}

function markAutoReplyDirty(type: SimpleAutoReplyType) {
  dirtyAutoReplies.value = new Set([...dirtyAutoReplies.value, type])
}

function saveAutoReplyText(type: SimpleAutoReplyType) {
  if (!props.autoReplySaving.has(type) && dirtyAutoReplies.value.has(type))
    emit('saveAutoReplyText', type, autoReplyDrafts[type])
}

function addBlockWord() {
  const word = blockWordDraft.value.trim()
  if (!word)
    return
  emit('addBlockWord', word)
  blockWordDraft.value = ''
}

defineExpose({ scrollRef })
</script>

<template>
  <section class="notification-settings">
    <header class="notification-settings__header">
      <div>
        <h2>{{ t('notifications.sections.settings') }}</h2>
        <p>{{ t('notifications.settings.description') }}</p>
      </div>
      <button type="button" :aria-label="t('notifications.actions.refresh')" @click="emit('refresh')">
        <i i-tabler-refresh aria-hidden="true" />
      </button>
    </header>

    <div ref="scrollRef" class="notification-settings__scroll">
      <div v-if="loading && !loaded" class="notification-settings__state" role="status">
        <i i-svg-spinners-180-ring-with-bg aria-hidden="true" />
        <span>{{ t('common.loading') }}</span>
      </div>
      <div v-else-if="error && !loaded" class="notification-settings__state" role="alert">
        <i i-tabler-alert-circle aria-hidden="true" />
        <span>{{ t('notifications.status.load_failed') }}</span>
        <Button type="secondary" size="small" @click="emit('refresh')">
          {{ t('notifications.actions.retry') }}
        </Button>
      </div>
      <div v-else class="notification-settings__content">
        <SettingsItemGroup
          v-for="group in groups"
          :key="group.title"
          :title="t(group.title)"
          :icon="group.icon"
        >
          <SettingsItem
            v-for="item in group.items"
            :key="item.key"
            :title="t(item.title)"
            :desc="t(item.desc)"
          >
            <Radio
              v-if="item.kind === 'boolean'"
              :model-value="state.values[item.key]"
              :disabled="saving.has(item.key)"
              :aria-label="t(item.title)"
              @update:model-value="emit('update', item.key, Boolean($event))"
            />
            <Select
              v-else
              class="notification-settings__select"
              :options="notificationModeOptions"
              :model-value="state.notificationModes[item.key]"
              :disabled="notificationModeSaving.has(item.key)"
              :aria-label="t(item.title)"
              @update:model-value="updateNotificationMode(item.key, $event)"
            />
          </SettingsItem>
        </SettingsItemGroup>

        <SettingsItemGroup :title="t('notifications.settings.groups.anti_disturb')" icon="i-tabler-moon-stars">
          <SettingsItem :title="t('notifications.settings.anti_disturb')" :desc="selectedAntiDisturbDescription">
            <Radio
              :model-value="state.antiDisturb.isOpen"
              :disabled="antiDisturbBusy || !antiDisturbAvailable"
              :aria-label="t('notifications.settings.anti_disturb')"
              @update:model-value="updateAntiDisturbOpen(Boolean($event))"
            />
          </SettingsItem>
          <SettingsItem :title="t('notifications.settings.anti_disturb_period')" :desc="t('notifications.settings.anti_disturb_period_desc')">
            <Select
              class="notification-settings__select"
              :options="antiDisturbOptions"
              :model-value="state.antiDisturb.selectedId"
              :disabled="antiDisturbBusy || !antiDisturbOptions.length"
              :aria-label="t('notifications.settings.anti_disturb_period')"
              @update:model-value="updateAntiDisturbOption"
            />
          </SettingsItem>
        </SettingsItemGroup>

        <SettingsItemGroup
          :title="t('notifications.settings.groups.auto_reply')"
          :desc="state.system.autoReplyDescription || t('notifications.settings.auto_reply_group_desc')"
          icon="i-tabler-message-2-bolt"
        >
          <SettingsItem
            v-for="item in autoReplyItems"
            :key="item.type"
            :title="t(item.title)"
            :desc="t(item.desc)"
          >
            <Radio
              :model-value="state.values[item.key]"
              :disabled="saving.has(item.key) || !state.system.autoReplyAvailable"
              :aria-label="t(item.title)"
              @update:model-value="emit('update', item.key, Boolean($event))"
            />
            <template #bottom>
              <div class="notification-settings__auto-reply-editor">
                <textarea
                  v-model="autoReplyDrafts[item.type]"
                  rows="3"
                  :aria-label="t('notifications.settings.auto_reply_text_label', { name: t(item.title) })"
                  :placeholder="t('notifications.settings.auto_reply_text_placeholder')"
                  :disabled="autoReplySaving.has(item.type) || !state.system.autoReplyAvailable"
                  @input="markAutoReplyDirty(item.type)"
                />
                <div>
                  <span v-if="autoReplySaving.has(item.type)" role="status">
                    {{ t('notifications.settings.auto_reply_saving') }}
                  </span>
                  <Button
                    type="secondary"
                    size="small"
                    :disabled="autoReplySaving.has(item.type) || !dirtyAutoReplies.has(item.type) || !state.system.autoReplyAvailable"
                    @click="saveAutoReplyText(item.type)"
                  >
                    {{ t('notifications.settings.save_auto_reply') }}
                  </Button>
                </div>
              </div>
            </template>
          </SettingsItem>

          <SettingsItem :title="t('notifications.settings.keyword_auto_reply')" :desc="t('notifications.settings.keyword_auto_reply_original_desc')">
            <Radio
              :model-value="state.values.keywordAutoReply"
              :aria-label="t('notifications.settings.keyword_auto_reply')"
              disabled
            />
            <template #bottom>
              <ALink class="notification-settings__original-link" :href="buildOriginalNotificationUrl('settings')">
                {{ t('notifications.actions.open_original_manage') }}
                <i i-tabler-external-link aria-hidden="true" />
              </ALink>
            </template>
          </SettingsItem>
        </SettingsItemGroup>

        <SettingsItemGroup :title="t('notifications.settings.groups.block_words')" icon="i-tabler-filter-x">
          <SettingsItem :title="t('notifications.settings.block_words')" :desc="t('notifications.settings.block_words_desc')" right-width="auto">
            <template #bottom>
              <div class="notification-settings__block-word-form">
                <Input
                  v-model="blockWordDraft"
                  :placeholder="t('notifications.settings.block_word_placeholder')"
                  :aria-label="t('notifications.settings.block_word_placeholder')"
                  :maxlength="state.limits.maxBlockWordLength || undefined"
                  :disabled="blockWordBusy || blockWordLimitReached"
                  @enter="addBlockWord"
                />
                <Button type="secondary" :disabled="!blockWordDraft.trim() || blockWordBusy || blockWordLimitReached" @click="addBlockWord">
                  {{ t('notifications.actions.add') }}
                </Button>
              </div>
              <p v-if="state.limits.maxBlockWords !== null" class="notification-settings__limit">
                {{ t('notifications.settings.block_words_count', { count: state.blockWords.length, max: state.limits.maxBlockWords }) }}
                <span v-if="state.limits.maxBlockWordLength !== null">
                  {{ t('notifications.settings.block_word_length_limit', { length: state.limits.maxBlockWordLength }) }}
                </span>
              </p>
              <Input
                v-if="state.blockWords.length"
                v-model="blockWordSearch"
                class="notification-settings__block-word-search"
                size="small"
                inputmode="search"
                :placeholder="t('notifications.settings.block_word_search')"
                :aria-label="t('notifications.settings.block_word_search')"
              />
              <div v-if="filteredBlockWords.length" class="notification-settings__tags">
                <span v-for="word in filteredBlockWords" :key="word" class="notification-settings__tag">
                  <span>{{ word }}</span>
                  <TagRemoveButton :label="t('notifications.settings.remove_block_word', { word })" @click="emit('removeBlockWord', word)" />
                </span>
              </div>
              <p v-else class="notification-settings__no-words">
                {{ t(state.blockWords.length ? 'notifications.settings.no_matching_block_words' : 'notifications.settings.no_block_words') }}
              </p>
            </template>
          </SettingsItem>
        </SettingsItemGroup>

        <div class="notification-settings__original">
          <div>
            <strong>{{ t('notifications.settings.advanced_title') }}</strong>
            <span>{{ t('notifications.settings.advanced_desc') }}</span>
          </div>
          <ALink :href="buildOriginalNotificationUrl('settings')">
            {{ t('notifications.actions.open_original') }}
            <i i-tabler-external-link aria-hidden="true" />
          </ALink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.notification-settings {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--bew-content-alt);
}

.notification-settings__header {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: var(--bew-notifications-header-height);
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-4);
  padding: var(--bew-space-3) var(--bew-space-5);
  background: var(--bew-notifications-detail-header-background);
  border-bottom: 1px solid var(--bew-border-color);
  backdrop-filter: var(--bew-filter-glass-1);

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }

  p {
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }

  > button {
    display: grid;
    width: var(--bew-icon-button-size-sm);
    height: var(--bew-icon-button-size-sm);
    place-items: center;
    color: var(--bew-text-2);
    background: var(--bew-fill-1);
    border: 0;
    border-radius: 50%;
    corner-shape: round;
    cursor: pointer;
  }
}

.notification-settings__scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}

.notification-settings__content {
  width: min(100%, var(--bew-notifications-content-max-width));
  margin-inline: auto;
  padding: var(--bew-space-5);
}

.notification-settings__state {
  display: flex;
  min-height: 320px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--bew-space-3);
  color: var(--bew-text-3);

  > i {
    width: var(--bew-icon-size-xl);
    height: var(--bew-icon-size-xl);
  }
}

.notification-settings__select {
  min-width: calc(var(--bew-control-height) * 5);
}

.notification-settings__auto-reply-editor {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);

  textarea {
    width: 100%;
    min-height: calc(var(--bew-line-height-body) * 3 + var(--bew-space-4));
    box-sizing: border-box;
    padding: var(--bew-space-2) var(--bew-space-3);
    resize: vertical;
    color: var(--bew-text-1);
    font: inherit;
    font-size: var(--bew-font-size-body);
    line-height: var(--bew-line-height-body);
    background: var(--bew-fill-1);
    border: 1px solid var(--bew-surface-border-color);
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    outline: none;

    &:focus-visible {
      outline: 2px solid var(--bew-theme-focus-ring);
      outline-offset: 2px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  > div {
    display: flex;
    min-height: var(--bew-control-height-sm);
    align-items: center;
    justify-content: flex-end;
    gap: var(--bew-space-2);
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}

.notification-settings__block-word-form {
  display: flex;
  gap: var(--bew-space-2);
}

.notification-settings__block-word-search {
  margin-top: var(--bew-space-3);
}

.notification-settings__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
}

.notification-settings__tag {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: var(--bew-space-1);
  padding-left: var(--bew-space-3);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-badge-radius);
  corner-shape: round;
}

.notification-settings__limit,
.notification-settings__no-words {
  margin: var(--bew-space-3) 0 0;
  color: var(--bew-text-3);
}

.notification-settings__limit span {
  margin-left: var(--bew-space-2);
}

.notification-settings__original-link {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.notification-settings__original {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-4);
  margin-top: var(--bew-space-6);
  padding: var(--bew-space-4);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);

  > div {
    display: flex;
    flex-direction: column;
    gap: var(--bew-space-1);
  }

  span {
    color: var(--bew-text-3);
  }

  a {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-1);
    color: var(--bew-theme-color);
    white-space: nowrap;
  }
}

@media (width < breakpoints.$grid-md) {
  .notification-settings__header,
  .notification-settings__content {
    padding-inline: var(--bew-space-4);
  }

  .notification-settings__original,
  .notification-settings__block-word-form {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
