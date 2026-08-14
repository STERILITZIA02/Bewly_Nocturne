<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import ConversationListItem from './ConversationListItem.vue'
import type { DisplayPrivateSession, PrivateSessionFilter } from './privateSession'
import { filterPrivateSessions } from './privateSession'

const props = defineProps<{
  items: DisplayPrivateSession[]
  selectedTalkerId: string
}>()

const emit = defineEmits<{
  (event: 'select', session: DisplayPrivateSession): void
}>()

const { t } = useI18n()
const filter = ref<PrivateSessionFilter>('all')
const query = ref('')
const filters: PrivateSessionFilter[] = ['all', 'unread', 'pinned']

const filteredItems = computed(() => filterPrivateSessions(props.items, {
  filter: filter.value,
  query: query.value,
}))
</script>

<template>
  <section class="conversation-list" :aria-label="t('notifications.whisper.list_aria')">
    <div class="conversation-list__tools">
      <div class="conversation-list__search">
        <i i-mingcute:search-line aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          :aria-label="t('notifications.whisper.search_aria')"
          :placeholder="t('notifications.whisper.search_placeholder')"
        >
        <Tooltip v-if="query" :content="t('notifications.whisper.clear_search')" placement="bottom">
          <IconButton
            class="conversation-list__clear"
            shape="circle"
            :label="t('notifications.whisper.clear_search')"
            @click="query = ''"
          >
            <i i-mingcute:close-line />
          </IconButton>
        </Tooltip>
      </div>

      <div class="bew-segment-control bew-segment-control--static conversation-list__filters">
        <button
          v-for="filterId in filters"
          :key="filterId"
          type="button"
          class="bew-segment-control__item"
          :data-active="filter === filterId ? 'true' : undefined"
          :aria-pressed="filter === filterId"
          @click="filter = filterId"
        >
          {{ t(`notifications.whisper.filters.${filterId}`) }}
        </button>
      </div>
    </div>

    <div v-if="filteredItems.length" class="conversation-list__items">
      <ConversationListItem
        v-for="session in filteredItems"
        :key="session.key"
        :session="session"
        :selected="selectedTalkerId === session.talkerId"
        @select="emit('select', $event)"
      />
    </div>
    <div v-else class="conversation-list__empty">
      <Empty :description="items.length ? t('notifications.whisper.empty_filtered') : t('notifications.whisper.empty')" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.conversation-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.conversation-list__tools {
  display: grid;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3);
  border-bottom: 1px solid var(--bew-border-color);
}

.conversation-list__search {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  min-width: 0;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-3);
  background: var(--bew-fill-1);
  border: 1px solid transparent;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.conversation-list__search:focus-within {
  border-color: var(--bew-theme-focus-ring);
}

.conversation-list__search input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  color: var(--bew-text-1);
  font: inherit;
  background: transparent;
  border: 0;
  outline: none;
}

.conversation-list__clear {
  width: var(--bew-control-height-sm);
  height: var(--bew-control-height-sm);
}

.conversation-list__filters {
  width: 100%;
}

.conversation-list__filters .bew-segment-control__item {
  flex: 1 1 0;
  min-width: 0;
}

.conversation-list__items {
  min-height: 0;
  padding: var(--bew-space-1);
  overflow: auto;
  overscroll-behavior: contain;
}

.conversation-list__empty {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  min-height: 0;
  padding: var(--bew-space-4);
  overflow: auto;
}
</style>
