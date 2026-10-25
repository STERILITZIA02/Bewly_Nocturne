<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { MomentPromotion } from '~/utils/momentPromotion'

defineProps<{ promotion: MomentPromotion }>()
const { t } = useI18n()
</script>

<template>
  <span
    class="moment-promotion-badge" :title="t(`moments.promotion_reason_${promotion.reason}`)"
    :aria-label="`${t(`moments.promotion_${promotion.kind}`)}：${t(`moments.promotion_reason_${promotion.reason}`)}`"
  ><i i-tabler:ad aria-hidden="true" />{{ t(`moments.promotion_${promotion.kind}`) }}</span>
</template>

<style scoped lang="scss">
.moment-promotion-badge {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  background: var(--bew-fill-1);
  color: var(--bew-warning-foreground);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  i {
    font-size: var(--bew-icon-size-sm);
  }
}
</style>
