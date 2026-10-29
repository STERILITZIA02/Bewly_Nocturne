<script setup lang="ts">
import bilibiliBrandLogoUrl from '~/assets/branding/bilibili-brand-logo.png'
import { useSidebarHost } from '~/composables/useSidebarHost'
import { settings } from '~/logic'
import { vLayoutEditable } from '~/logic/layoutEdit'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const props = defineProps<{
  forceWhiteIcon: boolean
  placeholder?: boolean
  floating?: boolean
}>()

const { getTopBarLogoHref, handleClickTopBarLogo } = useTopBarInteraction()

// The floating TV icon is where the persistent rail folds to: on rail pages the
// icon sits on the rail at the same spot, elsewhere the folded rail is this circle.
const sidebarHost = useSidebarHost()
const logoRoot = useTemplateRef<HTMLElement>('logoRoot')
const dock = computed(() => props.floating && !props.placeholder && settings.value.topBarLogoStyle !== 'brand')
const showCircle = computed(() => dock.value && !sidebarHost?.railOpen.value && !sidebarHost?.morphing.value)
if (sidebarHost) {
  watch([dock, logoRoot], ([docking, element]) => {
    sidebarHost.logo.value = docking ? element : null
  }, { immediate: true, flush: 'post' })
  onScopeDispose(() => {
    if (sidebarHost.logo.value === logoRoot.value)
      sidebarHost.logo.value = null
  })
}
</script>

<template>
  <div
    ref="logoRoot"
    flex="inline xl:1 items-center gap-2"
    pos="relative"
    z-1
    class="top-bar-logo"
    :class="{ 'top-bar-logo--brand': settings.topBarLogoStyle === 'brand', 'top-bar-logo--floating': floating }"
  >
    <span v-if="showCircle" class="logo-circle" aria-hidden="true" />
    <span v-if="placeholder" class="logo-placeholder" aria-hidden="true" />
    <a
      v-else
      v-layout-editable="floating ? 'topbar-logo' : ''"
      :href="getTopBarLogoHref()"
      target="_top"
      class="group logo"
      :class="settings.topBarLogoStyle === 'brand'
        ? { 'logo--brand': true, 'logo--white': forceWhiteIcon }
        : 'logo--icon'"
      :aria-label="$t('dock.home')"
      grid="~ place-items-center"
      @click="handleClickTopBarLogo"
    >
      <span
        v-if="settings.topBarLogoStyle === 'brand'"
        class="logo__brand"
        :style="{
          maskImage: `url(${bilibiliBrandLogoUrl})`,
          WebkitMaskImage: `url(${bilibiliBrandLogoUrl})`,
        }"
        aria-hidden="true"
      />
      <!-- viewBox is the artwork's own square bounds (centered on 512, 512), so the mark sits at the geometric center. -->
      <svg
        v-else
        class="logo__icon"
        viewBox="210 210 604 604"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M450.803484 456.506027l-120.670435 23.103715 10.333298 45.288107 119.454151-23.102578-9.117014-45.289244z m65.04448 120.060586c-29.483236 63.220622-55.926329 15.502222-55.926328 15.502223l-19.754098 12.768142s38.90176 53.192249 75.986489 12.764729c43.770311 40.42752 77.203911-13.068516 77.203911-13.068516l-17.934791-11.55072c0.001138-0.304924-31.305956 44.983182-59.575183-16.415858z m59.57632-74.773617L695.182222 524.895573l10.029511-45.288106-120.364373-23.103716-9.423076 45.289245z m237.784178-88.926436c-1.905778-84.362809-75.487004-100.540871-75.487004-100.540871s-57.408853-0.316302-131.944676-0.95232l54.237867-52.332089s8.562916-10.784996-6.026809-22.834062c-14.592-12.051342-15.543182-6.660551-20.615396-3.487289-4.441884 3.169849-69.462471 66.920676-80.878933 78.340551-29.494613 0-60.2624-0.319716-90.075591-0.319716h10.466418s-77.705671-76.754489-82.781298-80.241777c-5.075627-3.488427-5.709369-8.56064-20.616533 3.487289-14.589724 12.05248-6.026809 22.8352-6.026809 22.8352l55.504213 53.919288c-60.261262 0-112.280462 0.319716-136.383147 1.268623-78.025387 22.521173-71.99744 100.859449-71.99744 100.859449s0.950044 168.100978 0 253.103217c8.562916 85.00224 73.899804 98.636231 73.899805 98.636231s26.007324 0.63488 45.357511 0.63488c1.900089 5.391929 3.486151 32.034133 33.302756 32.034134 29.495751 0 33.30048-32.034133 33.30048-32.034134s217.263218-0.950044 235.340231-0.950044c0.953458 9.196658 5.394204 33.619058 35.207395 33.303893 29.494613-0.636018 31.714418-35.20512 31.714418-35.20512s10.151253-0.95232 40.280747 0c70.413653-13.005938 74.534684-95.468658 74.534684-95.468657s-1.265209-169.689316-0.312889-254.056676zM752.628622 681.8304c0 13.319964-10.467556 24.102684-23.471218 24.102684H300.980907c-13.003662 0-23.47008-10.78272-23.47008-24.102684V397.961671c0-13.32224 10.467556-24.106098 23.47008-24.106098h428.176497c13.003662 0 23.471218 10.783858 23.471218 24.106098v283.868729z" />
      </svg>
    </a>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/breakpoints";
@use "../../../styles/sidebarSurface";

.logo {
  box-sizing: border-box;
  width: var(--bew-top-bar-primary-control-height);
  height: var(--bew-top-bar-primary-control-height);
  padding: 0;
  border: 0;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-round);
  transition:
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);

  // Only the icon reacts to hover; the circle behind it is the folded rail.
  &--icon {
    position: relative;
    background: transparent;
    color: var(--bew-text-1);

    &:hover {
      color: var(--bew-brand-accent);
    }
  }

  &__icon {
    display: block;
    width: var(--bew-icon-size-lg);
    height: var(--bew-icon-size-lg);
    fill: currentColor;
  }

  &--brand {
    display: inline-flex;
    width: auto;
    padding-inline: var(--bew-space-2);
    corner-shape: var(--bew-corner-shape);
    background: transparent;
    color: var(--bew-theme-foreground);

    &:hover {
      background: var(--bew-theme-color);
      color: var(--bew-on-theme-color);
    }
  }

  &--white {
    color: white;
  }

  &--brand.logo--white {
    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }

  &__brand {
    width: var(--bew-top-bar-brand-logo-width);
    height: var(--bew-top-bar-brand-logo-height);
    flex: none;
    background: currentColor;
    mask-position: center;
    mask-repeat: no-repeat;
    mask-size: contain;
    -webkit-mask-position: center;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: contain;
  }
}

.top-bar-logo {
  min-width: 0;
  flex: 0 1 auto;
}

.logo-placeholder {
  width: var(--bew-top-bar-primary-control-height);
  height: var(--bew-top-bar-primary-control-height);
}

.top-bar-logo--floating {
  position: fixed;
  top: var(--bew-home-logo-block-start);
  left: var(--bew-home-logo-inline-start);
  // Stay above the reserved header slot on pages whose controls share the rail layer.
  z-index: var(--bew-z-home-logo);
}

// Same material and border as the rail it stands for; the material tokens turn
// opaque and unblurred when frosted glass is disabled.
.logo-circle {
  @include sidebarSurface.floating(round);
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.top-bar-logo--brand .logo-placeholder {
  width: calc(var(--bew-top-bar-brand-logo-width) + var(--bew-space-2) * 2);
}

@media (max-width: breakpoints.$mobile-max) {
  .top-bar-logo--brand .logo-placeholder {
    width: var(--bew-top-bar-primary-control-height);
  }
  .logo--brand {
    width: var(--bew-top-bar-primary-control-height);
    padding-inline: var(--bew-space-2);
    overflow: hidden;
    justify-content: flex-start;

    .logo__brand {
      width: var(--bew-top-bar-brand-logo-compact-size);
      height: var(--bew-top-bar-brand-logo-compact-size);
      mask-position: left center;
      mask-size: auto var(--bew-top-bar-brand-logo-compact-size);
      -webkit-mask-position: left center;
      -webkit-mask-size: auto var(--bew-top-bar-brand-logo-compact-size);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .logo {
    transition: none;
  }
}
</style>
