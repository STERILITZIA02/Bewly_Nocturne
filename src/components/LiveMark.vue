<template>
  <!-- The one overlay a cover carries for a live room (covers show no stats);
       hosts only position it. The pulse is a status, not a loading spinner. -->
  <span class="bew-live-mark">
    LIVE
    <span class="bew-live-mark__pulse i-svg-spinners:pulse-3" aria-hidden="true" />
  </span>
</template>

<style scoped>
.bew-live-mark {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-1);
  background: var(--bew-selected-bg);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  font-weight: var(--bew-font-weight-regular);
  white-space: nowrap;
}

.bew-live-mark__pulse {
  width: var(--bew-icon-size-xs);
  height: var(--bew-icon-size-xs);
}
</style>
