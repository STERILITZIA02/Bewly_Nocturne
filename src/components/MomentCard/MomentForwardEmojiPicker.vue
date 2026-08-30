<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type { MomentForwardEmote } from './momentForwardContent'
import { loadMomentForwardEmotes } from './useMomentForwardComposer'

const props = defineProps<{
  accountId: number | string
  pickerLabel: string
  retryLabel: string
  errorLabel: string
}>()

const emit = defineEmits<{
  select: [emote: MomentForwardEmote]
  close: []
}>()

const packages = ref<Awaited<ReturnType<typeof loadMomentForwardEmotes>>>([])
const activePackageIndex = ref(0)
const loading = ref(true)
const error = ref('')
const failedImages = ref(new Set<string>())
const activePackage = computed(() => packages.value[activePackageIndex.value])

function markImageFailed(url: string) {
  failedImages.value = new Set(failedImages.value).add(url)
}

async function loadEmotes() {
  loading.value = true
  error.value = ''
  try {
    packages.value = await loadMomentForwardEmotes(props.accountId, props.errorLabel)
    activePackageIndex.value = 0
  }
  catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
  }
  finally {
    loading.value = false
  }
}

onMounted(loadEmotes)
</script>

<template>
  <section
    class="moment-forward-emoji-picker"
    role="dialog"
    :aria-label="pickerLabel"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <div v-if="loading" class="moment-forward-picker__state" role="status">
      <span i-tabler-loader-2 class="bew-spinner" aria-hidden="true" />
    </div>
    <div v-else-if="error" class="moment-forward-picker__state moment-forward-picker__state--error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="loadEmotes">
        {{ retryLabel }}
      </button>
    </div>
    <template v-else>
      <div class="moment-forward-emoji-picker__categories" role="tablist">
        <button
          v-for="(emotePackage, index) in packages"
          :key="String(emotePackage.id)"
          type="button"
          role="tab"
          :aria-selected="activePackageIndex === index"
          :title="emotePackage.name"
          @click="activePackageIndex = index"
        >
          <img v-if="emotePackage.iconUrl" :src="emotePackage.iconUrl" alt="" loading="lazy">
          <span v-else>{{ emotePackage.name.slice(0, 1) }}</span>
        </button>
      </div>
      <div class="moment-forward-emoji-picker__grid" role="tabpanel">
        <button
          v-for="emote in activePackage?.emotes || []"
          :key="String(emote.id)"
          type="button"
          :title="emote.text"
          :aria-label="emote.text"
          @click="emit('select', emote)"
        >
          <img
            v-if="!failedImages.has(emote.url)"
            :src="emote.url"
            alt=""
            loading="lazy"
            decoding="async"
            @error="markImageFailed(emote.url)"
          >
          <span v-else>{{ emote.text }}</span>
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.moment-forward-emoji-picker {
  display: flex;
  width: min(var(--bew-moment-forward-picker-width), calc(100cqw - var(--bew-space-8)));
  max-height: var(--bew-moment-forward-picker-max-height);
  flex-direction: column;
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-popover-radius);
  background: var(--bew-popover-surface-background-solid);
  box-shadow: var(--bew-popover-surface-shadow);
  corner-shape: var(--bew-corner-shape);
}
.moment-forward-emoji-picker__categories {
  display: flex;
  gap: var(--bew-space-1);
  padding: var(--bew-space-2);
  overflow-x: auto;
  border-bottom: 1px solid var(--bew-border-color);
}
.moment-forward-emoji-picker__categories button,
.moment-forward-emoji-picker__grid button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
}
.moment-forward-emoji-picker__categories button {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
}
.moment-forward-emoji-picker__categories button[aria-selected="true"] {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
}
.moment-forward-emoji-picker__categories img,
.moment-forward-emoji-picker__grid img {
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
  object-fit: contain;
}
.moment-forward-emoji-picker__grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--bew-space-1);
  padding: var(--bew-space-2);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.moment-forward-emoji-picker__grid button {
  min-width: var(--bew-control-height-lg);
  min-height: var(--bew-control-height-lg);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.moment-forward-emoji-picker__categories button:hover,
.moment-forward-emoji-picker__grid button:hover {
  background: var(--bew-fill-1);
}
.moment-forward-emoji-picker button:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 1px;
}
.moment-forward-picker__state {
  display: flex;
  min-height: var(--bew-moment-forward-picker-state-min-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}
.moment-forward-picker__state--error {
  flex-direction: column;
  color: var(--bew-error-color);
}
.moment-forward-picker__state button {
  min-height: var(--bew-control-height-sm);
  padding: 0 var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
}
</style>
