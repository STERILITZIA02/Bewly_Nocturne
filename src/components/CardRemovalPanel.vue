<script setup lang="ts">
import Button from '~/components/Button.vue'
import type { CardRemoval } from '~/composables/useCardRemoval'
import { getDeepActiveElement } from '~/utils/dialogFocus'

const props = defineProps<{ state: CardRemoval, kind: 'watchLater' | 'favorite' }>()
const root = ref<HTMLElement>()
const previous = getDeepActiveElement(document)
const busy = computed(() => ['removing', 'restoring'].includes(props.state.phase))
function cancel() {
  const card = root.value?.parentElement
  props.state.cancel()
  void nextTick(() => {
    if (previous instanceof HTMLElement && previous.isConnected && !previous.closest('[inert]'))
      previous.focus({ preventScroll: true })
    else card?.querySelector<HTMLElement>('a[href], button')?.focus({ preventScroll: true })
  })
}
onMounted(() => {
  if (!props.state.claimFocus())
    return
  void nextTick(() => root.value?.focus({ preventScroll: true }))
})
</script>

<template>
  <section
    ref="root" class="card-removal" tabindex="-1" :aria-busy="busy" @click.stop
    @auxclick.stop.prevent @keydown.esc.stop.prevent="cancel"
  >
    <p role="status">
      {{ $t(`card_removal.${state.phase === 'confirm' ? kind : state.phase}`) }}
    </p>
    <p v-if="state.failed" class="bew-help">
      {{ $t(state.phase === 'verify' ? 'card_removal.verify_failed' : 'common.operation_failed') }}
    </p>
    <div class="card-removal__actions">
      <Button type="secondary" :disabled="busy" @click="cancel">
        {{ $t(state.phase === 'confirm' ? 'common.operation.cancel' : 'common.close') }}
      </Button>
      <Button v-if="state.phase !== 'removed' || state.restorable" type="secondary" :disabled="busy" @click="state.run">
        {{ $t(`card_removal.${state.phase === 'removed' || state.phase === 'restoring' ? 'restore' : state.phase === 'verify' ? 'reconcile' : 'confirm'}`) }}
      </Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.card-removal {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3);
  border-radius: var(--bew-surface-radius);
  background: var(--bew-elevated-solid);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-align: center;
  p {
    margin: 0;
  }
}
.card-removal__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--bew-space-2);
}
</style>
