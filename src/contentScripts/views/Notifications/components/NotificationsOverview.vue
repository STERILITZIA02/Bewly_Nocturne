<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { NotificationSection } from '~/utils/notificationRoute'

import type { DisplayConversation } from '../types'

defineProps<{
  unread: Partial<Record<NotificationSection, number>>
  recent: DisplayConversation[]
}>()

const emit = defineEmits<{
  section: [section: NotificationSection]
  conversation: [conversation: DisplayConversation]
}>()

const { t } = useI18n()

function getConversationName(conversation: DisplayConversation) {
  return conversation.isSupportGroup
    ? t('notifications.conversations.support_group')
    : conversation.name || t('notifications.conversations.unknown_user')
}

function getConversationSummary(conversation: DisplayConversation) {
  if (conversation.isSupportGroup)
    return t(conversation.unreadCount ? 'notifications.conversations.support_group_new' : 'notifications.conversations.support_group_empty')
  return conversation.lastMessage || t('notifications.conversations.no_messages')
}

const cards: { section: NotificationSection, icon: string }[] = [
  { section: 'whisper', icon: 'i-tabler-message-circle' },
  { section: 'reply', icon: 'i-tabler-message-reply' },
  { section: 'at', icon: 'i-tabler-at' },
  { section: 'love', icon: 'i-tabler-heart' },
  { section: 'system', icon: 'i-tabler-bell' },
]
</script>

<template>
  <section class="notifications-overview">
    <div class="notifications-overview__content">
      <header>
        <div>
          <h2>{{ t('notifications.overview.title') }}</h2>
          <p>{{ t('notifications.overview.description') }}</p>
        </div>
      </header>
      <div class="notifications-overview__cards">
        <button v-for="card in cards" :key="card.section" type="button" @click="emit('section', card.section)">
          <i :class="card.icon" aria-hidden="true" />
          <span>{{ t(`notifications.sections.${card.section}`) }}</span>
          <strong>{{ unread[card.section] || 0 }}</strong>
        </button>
      </div>
      <section v-if="recent.length" class="notifications-overview__recent">
        <h3>{{ t('notifications.overview.recent') }}</h3>
        <div>
          <button v-for="conversation in recent.slice(0, 5)" :key="conversation.key" type="button" @click="emit('conversation', conversation)">
            <img v-if="conversation.avatar" :src="conversation.avatar" alt="" loading="lazy">
            <span v-else class="notifications-overview__avatar"><i i-tabler-user aria-hidden="true" /></span>
            <span>
              <strong>{{ getConversationName(conversation) }}</strong>
              <small>{{ getConversationSummary(conversation) }}</small>
            </span>
            <span v-if="conversation.unreadCount" class="notifications-overview__badge">{{ conversation.unreadCount }}</span>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.notifications-overview {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--bew-content-alt);
}

.notifications-overview__content {
  width: min(100%, var(--bew-notifications-content-max-width));
  margin-inline: auto;
  padding: var(--bew-space-8) var(--bew-space-5);

  > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--bew-space-5);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--bew-font-size-heading);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-heading);
  }

  p {
    margin-top: var(--bew-space-1);
    color: var(--bew-text-3);
  }
}

.notifications-overview__cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-6);

  button {
    display: grid;
    min-width: 0;
    min-height: 112px;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    align-items: center;
    gap: var(--bew-space-2);
    padding: var(--bew-space-4);
    color: var(--bew-text-1);
    font: inherit;
    text-align: left;
    background: var(--bew-fill-1);
    border: 1px solid var(--bew-surface-border-color);
    border-radius: var(--bew-card-radius);
    corner-shape: var(--bew-corner-shape);
    cursor: pointer;
    transition:
      background-color var(--bew-duration-fast) var(--bew-ease-standard),
      border-color var(--bew-duration-fast) var(--bew-ease-standard);

    &:hover {
      background: var(--bew-fill-2);
      border-color: var(--bew-theme-color-40);
    }

    &:focus-visible {
      outline: 2px solid var(--bew-theme-focus-ring);
      outline-offset: 2px;
    }

    > i {
      width: var(--bew-icon-size-lg);
      height: var(--bew-icon-size-lg);
      color: var(--bew-theme-color);
    }

    > span {
      overflow: hidden;
      color: var(--bew-text-2);
      font-size: var(--bew-font-size-control);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    > strong {
      grid-column: 1 / -1;
      font-size: var(--bew-font-size-data);
      line-height: var(--bew-line-height-data);
    }
  }
}

.notifications-overview__recent {
  margin-top: var(--bew-space-8);

  h3 {
    margin-bottom: var(--bew-space-3);
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }

  > div {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--bew-space-2);
  }

  button {
    display: grid;
    min-width: 0;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--bew-space-3);
    padding: var(--bew-space-3);
    color: var(--bew-text-1);
    font: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    cursor: pointer;

    &:hover {
      background: var(--bew-fill-1);
    }

    img,
    .notifications-overview__avatar {
      width: 40px;
      height: 40px;
      object-fit: cover;
      background: var(--bew-fill-1);
      border: 1px solid var(--bew-surface-border-color);
      border-radius: 50%;
      corner-shape: round;
    }

    .notifications-overview__avatar {
      display: grid;
      place-items: center;
      color: var(--bew-text-3);
    }

    > span:nth-child(2) {
      display: flex;
      min-width: 0;
      flex-direction: column;
    }

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: var(--bew-text-3);
    }
  }
}

.notifications-overview__badge {
  min-width: 20px;
  height: 20px;
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-caption);
  line-height: 20px;
  text-align: center;
  background: var(--bew-theme-color);
  border-radius: var(--bew-radius-full);
  corner-shape: round;
}

@media (width < breakpoints.$grid-xl) {
  .notifications-overview__cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (width < breakpoints.$grid-md) {
  .notifications-overview__content {
    padding: var(--bew-space-5) var(--bew-space-4);
  }

  .notifications-overview__cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .notifications-overview__recent > div {
    grid-template-columns: 1fr;
  }
}
</style>
