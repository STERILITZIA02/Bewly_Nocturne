<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { MessageServerSettingField } from '~/background/messageServerSettings/types'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import api from '~/utils/api'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import { useMessageServerSettings } from './useMessageServerSettings'

const { t } = useI18n()

const densityOptions = computed(() => [
  { label: t('settings.messages_density_comfortable'), value: 'comfortable' },
  { label: t('settings.messages_density_compact'), value: 'compact' },
])
const cachedConversationOptions = [5, 10, 20].map(value => ({ label: String(value), value }))
const cachedMessageOptions = [100, 200, 500].map(value => ({ label: String(value), value }))
const mobileOpenOptions = computed(() => [
  { label: t('settings.messages_mobile_open_list'), value: 'list' },
  { label: t('settings.messages_mobile_open_last'), value: 'last-conversation' },
])
const binaryOptions = computed(() => [
  { label: t('settings.messages_server_enabled'), value: 1 },
  { label: t('settings.messages_server_disabled'), value: 0 },
])
const notificationOptions = computed(() => [
  { label: t('settings.messages_server_enabled'), value: 1 },
  { label: t('settings.messages_server_disabled'), value: 3 },
])
const replyAtOptions = computed(() => [
  { label: t('settings.messages_server_everyone'), value: 0 },
  { label: t('settings.messages_server_following'), value: 1 },
  { label: t('settings.messages_server_nobody'), value: 2 },
])
const likeOptions = computed(() => [
  { label: t('settings.messages_server_enabled'), value: 0 },
  { label: t('settings.messages_server_disabled'), value: 5 },
])
const serverSettings = useMessageServerSettings({
  fetchSettings: () => api.messageServerSettings.getMessageServerSettings(),
  setSetting: (field, value) => api.messageServerSettings.setMessageServerSetting({ field, value }),
  fetchBlockWords: () => api.messageServerSettings.getMessageBlockWords(),
  addBlockWord: word => api.messageServerSettings.addMessageBlockWord({ word }),
  deleteBlockWord: word => api.messageServerSettings.deleteMessageBlockWord({ word }),
})
const blockWordDraft = ref('')
const canAddBlockWord = computed(() => {
  const word = blockWordDraft.value.trim()
  const blockWords = serverSettings.state.blockWords
  return Boolean(word)
    && !blockWords.pendingWord
    && (blockWords.maxWordLength <= 0 || Array.from(word).length <= blockWords.maxWordLength)
    && (blockWords.maxWordsSize <= 0 || blockWords.words.length < blockWords.maxWordsSize)
})

function getSettingValue(field: MessageServerSettingField): number | null {
  return serverSettings.state.settings[field].serverValue
}

function getSettingError(field: MessageServerSettingField): string {
  const kind = serverSettings.state.settings[field].errorKind
  return kind ? t(`settings.messages_server_errors.${kind}`) : ''
}

function updateServerSetting(field: MessageServerSettingField, value: unknown) {
  if (typeof value === 'number')
    void serverSettings.updateSetting(field, value)
}

async function addBlockWord() {
  if (!canAddBlockWord.value)
    return
  const word = blockWordDraft.value.trim()
  if (await serverSettings.addBlockWord(word))
    blockWordDraft.value = ''
}

onMounted(() => void serverSettings.load())
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.messages_reading_behavior')">
      <SettingsItem setting-id="messages.autoMarkRead" :title="$t('settings.messages_auto_mark_read')" :desc="$t('settings.messages_auto_mark_read_desc')" right-width="auto">
        <Radio v-model="settings.autoMarkPrivateMessagesRead" />
      </SettingsItem>
      <SettingsItem setting-id="messages.followNew" :title="$t('settings.messages_follow_new')" :desc="$t('settings.messages_follow_new_desc')" right-width="auto">
        <Radio v-model="settings.followNewPrivateMessages" />
      </SettingsItem>
      <SettingsItem setting-id="messages.autoLoadImages" :title="$t('settings.messages_auto_load_images')" :desc="$t('settings.messages_auto_load_images_desc')" right-width="auto">
        <Radio v-model="settings.autoLoadPrivateMessageImages" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.messages_conversation_list')">
      <SettingsItem setting-id="messages.showOfficialAssistants" :title="$t('settings.messages_show_official_assistants')" right-width="auto">
        <Radio v-model="settings.showOfficialPrivateAssistants" />
      </SettingsItem>
      <SettingsItem setting-id="messages.density" :title="$t('settings.messages_density')" right-width="auto">
        <Select v-model="settings.privateMessageDensity" :options="densityOptions" w="160px" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.messages_memory')">
      <SettingsItem setting-id="messages.maxCachedConversations" :title="$t('settings.messages_max_cached_conversations')" right-width="auto">
        <Select v-model="settings.maxCachedPrivateConversations" :options="cachedConversationOptions" w="160px" />
      </SettingsItem>
      <SettingsItem setting-id="messages.maxMessagesPerConversation" :title="$t('settings.messages_max_messages_per_conversation')" right-width="auto">
        <Select v-model="settings.maxPrivateMessagesPerConversation" :options="cachedMessageOptions" w="160px" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.messages_mobile')">
      <SettingsItem setting-id="messages.mobileOpenMode" :title="$t('settings.messages_mobile_open_mode')" right-width="auto">
        <Select v-model="settings.privateMessageMobileOpenMode" :options="mobileOpenOptions" w="180px" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.messages_server_settings')">
      <SettingsItem
        :title="$t('settings.messages_server_refresh')"
        :desc="serverSettings.state.errorKind ? $t(`settings.messages_server_errors.${serverSettings.state.errorKind}`) : ''"
        right-width="auto"
      >
        <Button type="tertiary" :disabled="serverSettings.state.loading" @click="serverSettings.refresh()">
          {{ serverSettings.state.loading ? $t('settings.messages_server_loading') : $t('settings.messages_server_refresh_action') }}
        </Button>
      </SettingsItem>

      <SettingsItem setting-id="messages.server.msgNotify" :title="$t('settings.messages_server_msg_notify')" :desc="getSettingError('msg_notify')" right-width="auto">
        <Select
          :model-value="getSettingValue('msg_notify')"
          :options="notificationOptions"
          :disabled="getSettingValue('msg_notify') === null || serverSettings.state.settings.msg_notify.pending"
          w="160px"
          @update:model-value="updateServerSetting('msg_notify', $event)"
        />
      </SettingsItem>
      <SettingsItem setting-id="messages.server.aiIntercept" :title="$t('settings.messages_server_ai_intercept')" :desc="getSettingError('ai_intercept')" right-width="auto">
        <Select
          :model-value="getSettingValue('ai_intercept')"
          :options="binaryOptions"
          :disabled="getSettingValue('ai_intercept') === null || serverSettings.state.settings.ai_intercept.pending"
          w="160px"
          @update:model-value="updateServerSetting('ai_intercept', $event)"
        />
      </SettingsItem>
      <SettingsItem setting-id="messages.server.reply" :title="$t('settings.messages_server_reply')" :desc="getSettingError('set_comment')" right-width="auto">
        <Select
          :model-value="getSettingValue('set_comment')"
          :options="replyAtOptions"
          :disabled="getSettingValue('set_comment') === null || serverSettings.state.settings.set_comment.pending"
          w="160px"
          @update:model-value="updateServerSetting('set_comment', $event)"
        />
      </SettingsItem>
      <SettingsItem setting-id="messages.server.at" :title="$t('settings.messages_server_at')" :desc="getSettingError('set_at')" right-width="auto">
        <Select
          :model-value="getSettingValue('set_at')"
          :options="replyAtOptions"
          :disabled="getSettingValue('set_at') === null || serverSettings.state.settings.set_at.pending"
          w="160px"
          @update:model-value="updateServerSetting('set_at', $event)"
        />
      </SettingsItem>
      <SettingsItem setting-id="messages.server.like" :title="$t('settings.messages_server_like')" :desc="getSettingError('set_like')" right-width="auto">
        <Select
          :model-value="getSettingValue('set_like')"
          :options="likeOptions"
          :disabled="getSettingValue('set_like') === null || serverSettings.state.settings.set_like.pending"
          w="160px"
          @update:model-value="updateServerSetting('set_like', $event)"
        />
      </SettingsItem>
      <SettingsItem setting-id="messages.server.unfollowed" :title="$t('settings.messages_server_unfollowed')" :desc="getSettingError('show_unfollowed_msg')" right-width="auto">
        <Select
          :model-value="getSettingValue('show_unfollowed_msg')"
          :options="binaryOptions"
          :disabled="getSettingValue('show_unfollowed_msg') === null || serverSettings.state.settings.show_unfollowed_msg.pending"
          w="160px"
          @update:model-value="updateServerSetting('show_unfollowed_msg', $event)"
        />
      </SettingsItem>

      <SettingsItem setting-id="messages.server.blockWords" :title="$t('settings.messages_server_block_words')">
        <template #desc>
          <span v-if="serverSettings.state.blockWords.errorKind">
            {{ $t(`settings.messages_server_errors.${serverSettings.state.blockWords.errorKind}`) }}
          </span>
          <span v-else>
            {{ $t('settings.messages_server_block_words_limit', {
              count: serverSettings.state.blockWords.words.length,
              max: serverSettings.state.blockWords.maxWordsSize,
              length: serverSettings.state.blockWords.maxWordLength,
            }) }}
          </span>
        </template>
        <div class="message-block-word-input">
          <Input
            v-model="blockWordDraft"
            size="small"
            :maxlength="serverSettings.state.blockWords.maxWordLength || undefined"
            :placeholder="$t('settings.messages_server_block_words_placeholder')"
            @enter="addBlockWord"
          />
          <Button type="tertiary" :disabled="!canAddBlockWord" @click="addBlockWord">
            {{ $t('settings.messages_server_block_words_add') }}
          </Button>
        </div>
        <template #bottom>
          <div v-if="serverSettings.state.blockWords.words.length" class="message-block-words">
            <span v-for="word in serverSettings.state.blockWords.words" :key="word" class="message-block-word">
              <span>{{ word }}</span>
              <TagRemoveButton
                :label="$t('settings.messages_server_block_words_remove', { word })"
                @click="serverSettings.deleteBlockWord(word)"
              />
            </span>
          </div>
          <span v-else-if="!serverSettings.state.blockWords.loading" class="message-block-words-empty">
            {{ $t('settings.messages_server_block_words_empty') }}
          </span>
        </template>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style scoped lang="scss">
.message-block-word-input {
  display: flex;
  width: min(360px, 100%);
  gap: var(--bew-space-2);
  align-items: center;
}

.message-block-word-input > :first-child {
  min-width: 0;
  flex: 1 1 auto;
}

.message-block-words {
  display: flex;
  gap: var(--bew-space-2);
  flex-wrap: wrap;
}

.message-block-word {
  display: inline-flex;
  min-height: var(--bew-control-height-sm);
  gap: var(--bew-space-1);
  align-items: center;
  padding: 0 var(--bew-space-1) 0 var(--bew-space-2);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}

.message-block-words-empty {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
