<script setup lang="ts">
import { getExtensionAssetUrl } from '~/utils/messaging'

const props = defineProps<{
  description?: string
  textOnly?: boolean
  fill?: boolean
  actionLabel?: string
}>()
const emit = defineEmits<{ action: [] }>()

const emptyImg = getExtensionAssetUrl('/assets/empty.png')
</script>

<template>
  <div class="bew-empty" :class="{ 'bew-empty--text': textOnly, 'bew-empty--fill': fill }" flex="~ col gap-4" justify="center" items="center">
    <img v-if="!textOnly && emptyImg" :src="emptyImg" alt="" w="200px" h="auto">
    <span v-if="props.description" text="$bew-text-3">{{ props.description }}</span>
    <button v-if="actionLabel" type="button" class="bew-empty__action" @click="emit('action')">
      {{ actionLabel }}
    </button>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.bew-empty--text {
  text-align: center;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}
.bew-empty--fill {
  flex: 1;
  align-self: stretch;
  min-height: var(--bew-space-12);
  margin: 0;
}
.bew-empty__action {
  min-height: var(--bew-control-item-height);
  padding: var(--bew-space-1) var(--bew-space-2);
  border: 0;
  background: transparent;
  color: var(--bew-text-2);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: var(--bew-space-1);
  &:hover {
    color: var(--bew-theme-foreground);
  }
}
</style>
