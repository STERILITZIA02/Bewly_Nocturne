<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChevronIcon from '~/components/ChevronIcon.vue'
import IconButton from '~/components/IconButton.vue'

import type { ParsedPrivateMessageContent } from './privateMessageRenderers'
import { privateMessageSearchText } from './privateMessageSearch'

const props = withDefaults(defineProps<{ messages?: { msgKey: string, content: ParsedPrivateMessageContent }[], external?: boolean, resultCount?: number, resultIndex?: number }>(), { messages: () => [], resultCount: 0, resultIndex: -1 })
const emit = defineEmits<{ locate: [key: string], clear: [], move: [direction: number] }>()
const { t } = useI18n()
const expanded = ref(false)
const query = ref('')
const selectedKey = ref('')
const input = ref<HTMLInputElement>()
const root = ref<HTMLElement>()
const index = computed(() => props.messages.map(message => ({ key: message.msgKey, text: privateMessageSearchText(message.content).normalize('NFKC').toLocaleLowerCase() })))
const matches = computed(() => {
  const text = query.value.normalize('NFKC').trim().toLocaleLowerCase()
  return text ? index.value.filter(item => item.text.includes(text)).map(item => item.key) : []
})
const selectedIndex = computed(() => matches.value.indexOf(selectedKey.value))
const matchCount = computed(() => props.external ? props.resultCount : matches.value.length)
const matchIndex = computed(() => props.external ? props.resultIndex : selectedIndex.value)
watch(query, () => {
  selectedKey.value = ''
  emit('clear')
})
watch(matches, (keys) => {
  if (selectedKey.value && !keys.includes(selectedKey.value)) {
    selectedKey.value = ''
    emit('clear')
  }
})
function move(direction: number, event?: KeyboardEvent) {
  if (event?.isComposing || !matchCount.value)
    return
  event?.preventDefault()
  if (props.external) {
    emit('move', direction)
    return
  }
  const start = selectedIndex.value < 0 ? direction > 0 ? -1 : 0 : selectedIndex.value
  selectedKey.value = matches.value[(start + direction + matches.value.length) % matches.value.length]
  emit('locate', selectedKey.value)
}
async function open() {
  expanded.value = true
  await nextTick()
  input.value?.focus({ preventScroll: true })
}
async function close() {
  expanded.value = false
  query.value = ''
  selectedKey.value = ''
  emit('clear')
  await nextTick()
  root.value?.querySelector('button')?.focus({ preventScroll: true })
}
</script>

<template>
  <div ref="root" class="conversation-find" :class="{ 'conversation-find--expanded': expanded && !external, 'conversation-find--external': external }" @keydown.esc.stop.prevent="close">
    <IconButton v-if="!expanded && !external" class="bew-icon-button--control" :label="t('library_tools.find_messages')" @click="open">
      <i i-mingcute:search-line />
    </IconButton>
    <template v-else>
      <input
        v-if="!external"
        ref="input" v-model="query" type="text" inputmode="search" :aria-label="t('library_tools.find_messages')"
        @keydown.enter="move($event.shiftKey ? -1 : 1, $event)"
      >
      <span class="conversation-find__count" role="status">{{ matchIndex + 1 }} / {{ matchCount }}</span>
      <IconButton class="conversation-find__move" :label="t('library_tools.previous_match')" :disabled="!matchCount" @click="move(-1)">
        <ChevronIcon direction="up" />
      </IconButton>
      <IconButton class="conversation-find__move" :label="t('library_tools.next_match')" :disabled="!matchCount" @click="move(1)">
        <ChevronIcon />
      </IconButton>
      <IconButton v-if="!external" class="bew-icon-button--control" :label="t('common.close')" @click="close">
        <i i-mingcute:close-line />
      </IconButton>
    </template>
  </div>
</template>

<style scoped>
.conversation-find {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bew-space-1);
  min-width: 0;
  max-width: 100%;
  pointer-events: auto;
}
.conversation-find--expanded {
  box-sizing: border-box;
  width: 480px;
  padding: var(--bew-space-1);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-content-alt-solid);
  box-shadow: var(--bew-shadow-1);
}
.conversation-find input {
  min-width: 0;
  flex: 1;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-content-alt-solid);
  color: var(--bew-text-1);
  font: inherit;
  font-size: var(--bew-font-size-control);
}
.conversation-find__count {
  flex: none;
  font-size: var(--bew-font-size-caption);
  color: var(--bew-text-2);
  font-variant-numeric: tabular-nums;
}
.conversation-find--external .conversation-find__count {
  padding-inline: var(--bew-space-2) var(--bew-space-1);
}
.conversation-find__move {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  color: var(--bew-message-icon-hover);
  background: var(--bew-fill-1);
  transition:
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
}
.conversation-find__move:hover:not(:disabled) {
  color: var(--bew-theme-foreground);
  background: var(--bew-fill-2);
}
.conversation-find__move:disabled {
  color: var(--bew-text-3);
  opacity: 1;
}
.conversation-find__move svg {
  width: var(--bew-icon-size-md);
  height: var(--bew-icon-size-md);
}
@media (prefers-reduced-motion: reduce) {
  .conversation-find__move {
    transition: none;
  }
}
</style>
