<script setup lang="ts">
// `bare` leaves the surface to the host. The others are the shared small
// buttons: `plain` a bare glyph that fills on hover, `filled` a neutral fill,
// `floating` a solid button over embedded content, `overlay` the image
// viewer's dark media room. `size` fixes the box and its glyph; without it the
// host sizes both.
withDefaults(defineProps<{
  label: string
  shape?: 'circle' | 'pill' | 'smooth-rect'
  variant?: 'bare' | 'plain' | 'filled' | 'floating' | 'overlay'
  size?: 'sm' | 'md' | 'lg' | 'control'
}>(), {
  shape: 'circle',
  variant: 'bare',
})
</script>

<template>
  <button
    type="button"
    class="bew-icon-button"
    :class="[`bew-shape-${shape}`, `bew-icon-button--${variant}`, size && `bew-icon-button--${size}`]"
    :aria-label="label"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
@use "../styles/hoverState";

// Hosts nest the corner in their card's: `--bew-icon-button-radius` is the
// card's radius minus the button's inset (see modalWindow.header), and
// `--bew-icon-button-size` overrides the size step.
.bew-icon-button {
  appearance: none;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  box-sizing: border-box;
  padding: 0;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
  @include hoverState.transition((color, background-color, transform));

  &:active:not(:disabled) {
    transform: scale(var(--bew-control-press-scale));
  }

  &:disabled {
    cursor: not-allowed;
    opacity: var(--bew-disabled-opacity);
  }

  &:focus-visible {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: var(--bew-space-0-5);
  }

  :deep(svg) {
    display: block;
    color: currentColor;
  }
}

.bew-icon-button--plain,
.bew-icon-button--floating,
.bew-icon-button--filled {
  &.bew-shape-smooth-rect {
    border-radius: var(--bew-icon-button-radius, var(--bew-interactive-radius));
  }
}

.bew-icon-button--plain {
  color: var(--bew-text-2);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      color: var(--bew-text-1);
      background: var(--bew-hover-bg);
    }
  }

  &:active:not(:disabled) {
    background: var(--bew-pressed-bg);
  }
}

.bew-icon-button--filled {
  background: var(--bew-content-alt-solid);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: var(--bew-content-alt-solid-hover);
    }
  }
}

.bew-icon-button--floating {
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: var(--bew-elevated-solid-hover);
    }
  }
}

.bew-icon-button--overlay {
  color: var(--bew-on-overlay-color);
  background: var(--bew-overlay-background);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: var(--bew-overlay-background-hover);
    }
  }
}

// Size steps pair the box with its glyph.
.bew-icon-button--sm {
  --bew-icon-button-glyph: var(--bew-icon-size-xs);
  width: var(--bew-icon-button-size, var(--bew-icon-button-size-sm));
  height: var(--bew-icon-button-size, var(--bew-icon-button-size-sm));
}

.bew-icon-button--md {
  --bew-icon-button-glyph: var(--bew-icon-size-sm);
  width: var(--bew-icon-button-size, var(--bew-icon-button-size-md));
  height: var(--bew-icon-button-size, var(--bew-icon-button-size-md));
}

.bew-icon-button--lg {
  --bew-icon-button-glyph: var(--bew-icon-size-md);
  width: var(--bew-icon-button-size, var(--bew-icon-button-size-lg));
  height: var(--bew-icon-button-size, var(--bew-icon-button-size-lg));
}

.bew-icon-button--control {
  --bew-icon-button-glyph: var(--bew-control-icon-size);
  width: var(--bew-icon-button-size, var(--bew-control-height));
  height: var(--bew-icon-button-size, var(--bew-control-height));
}

.bew-icon-button:is(.bew-icon-button--sm, .bew-icon-button--md, .bew-icon-button--lg, .bew-icon-button--control)
  :slotted(:is(i, span, svg)) {
  display: block;
  width: var(--bew-icon-button-glyph);
  height: var(--bew-icon-button-glyph);
}

@media (prefers-reduced-motion: reduce) {
  .bew-icon-button {
    transition-property: color, background-color;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}
</style>
