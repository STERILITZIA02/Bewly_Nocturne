<script lang="ts">
import { defineComponent, h, Teleport } from 'vue'

import { useSidebarHost } from '~/composables/useSidebarHost'
import { settings } from '~/logic'

import SidebarHeadingControl from './SidebarHeadingControl.vue'
import SidebarSearchControl from './SidebarSearchControl.vue'

export default defineComponent({
  props: { active: { type: Boolean, default: true } },
  setup(props) {
    const host = useSidebarHost()!
    let headingPresentation: Record<string, unknown> = {}
    return () => {
      const search = host.search.value
      const heading = host.heading.value
      const headingProps = heading?.props()
      if (headingProps) {
        // Retain only inert presentation during the out-in gap, never callbacks
        // or a component scope. A wheel need not remount between two wheel pages.
        const { title, contentId, modelValue, options, count, hideTitle } = headingProps
        headingPresentation = {
          title,
          contentId,
          modelValue,
          count,
          hideTitle,
          options: Array.isArray(options) ? options.map(({ value, label, badge, ariaLabel }) => ({ value, label, badge, ariaLabel })) : [],
        }
      }
      return h('div', {
        class: ['persistent-sidebar', { 'persistent-sidebar--solid': settings.value.disableFrostedGlass, 'persistent-sidebar--closed': !props.active }],
        'data-top-bar-scroll-ignore': '',
        'inert': !props.active || host.railPage.value !== host.page() ? true : undefined,
        'aria-hidden': !props.active ? 'true' : undefined,
      }, [
        h('div', { ref: host.rail, class: 'persistent-sidebar__content' }),
        h(Teleport, { to: heading?.target ?? 'body', disabled: !heading }, [
          h(SidebarHeadingControl, {
            title: '',
            contentId: '',
            ...(headingProps ?? headingPresentation),
            scope: heading ?? undefined,
            disabled: !heading || headingProps?.disabled === true,
            style: heading ? undefined : { display: 'none' },
            inert: heading ? undefined : true,
          }),
        ]),
        // One control survives page disposal; replace page state and callbacks
        // together, without retaining detached pages or their requests.
        h(Teleport, { to: search?.target ?? 'body', disabled: !search }, [
          h(SidebarSearchControl, {
            modelValue: '',
            label: '',
            ...(search?.props() ?? { modelValue: '', label: '' }),
            ref: host.searchControl,
            scope: search ?? undefined,
            style: search ? undefined : { display: 'none' },
            inert: search ? undefined : true,
          }, search?.slots),
        ]),
      ])
    }
  },
})
</script>

<style lang="scss">
@use "../styles/sidebarSurface";
.persistent-sidebar {
  @include sidebarSurface.surface;
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--bew-messages-sidebar-width);
  z-index: var(--bew-z-base-overlay);
  box-sizing: border-box;
  border-inline-end: 1px solid var(--bew-surface-border-color);
  overflow: hidden;
  transform: none;
  visibility: visible;
  transition:
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    visibility 0s;
}
.persistent-sidebar--closed {
  transform: translateX(-100%);
  visibility: hidden;
  pointer-events: none;
  transition:
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    visibility 0s var(--bew-duration-normal);
}
.persistent-sidebar--solid {
  @include sidebarSurface.solid;
}
.persistent-sidebar__content {
  height: 100%;
  min-width: 0;
}
@media (prefers-reduced-motion: reduce) {
  .persistent-sidebar {
    transition: none;
  }
}
</style>
