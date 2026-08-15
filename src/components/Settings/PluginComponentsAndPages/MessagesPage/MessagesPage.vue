<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import { ORIGINAL_MESSAGE_SETTINGS_URL } from '~/utils/notificationRoute'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../../components/SettingsSectionHeading.vue'

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
</script>

<template>
  <div>
    <SettingsSectionHeading
      :title="$t('settings.plugin.messages_page')"
      :desc="$t('settings.category_navigation_messages_page_desc')"
      icon="i-mingcute:message-3-fill"
    />

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

    <SettingsItemGroup :title="$t('settings.messages_server_settings')" :desc="$t('settings.messages_server_settings_desc')">
      <SettingsItem :title="$t('settings.messages_original_settings')" right-width="auto">
        <ALink :href="ORIGINAL_MESSAGE_SETTINGS_URL" type="content">
          <Button type="tertiary">
            <template #left>
              <i i-mingcute:external-link-line aria-hidden="true" />
            </template>
            {{ $t('settings.messages_original_settings') }}
          </Button>
        </ALink>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
