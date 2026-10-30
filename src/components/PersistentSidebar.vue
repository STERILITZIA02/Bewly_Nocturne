<script lang="ts">
import { defineComponent, h, nextTick, onScopeDispose, shallowRef, Teleport, watch } from 'vue'

import { useSidebarHost } from '~/composables/useSidebarHost'
import { settings } from '~/logic'
import { holdMotion, PAGE_MOTION } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'

import SidebarHeadingControl from './SidebarHeadingControl.vue'
import SidebarSearchControl from './SidebarSearchControl.vue'

interface Frame { left: number, top: number, width: number, height: number, radius: number }

function readFrame(element: HTMLElement): Frame {
  const style = getComputedStyle(element)
  return {
    left: Number.parseFloat(style.left),
    top: Number.parseFloat(style.top),
    width: Number.parseFloat(style.width),
    height: Number.parseFloat(style.height),
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
  }
}

function keyframe(frame: Frame, offset?: number): Keyframe {
  return {
    ...(offset === undefined ? {} : { offset }),
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    borderRadius: `${frame.radius}px`,
    easing: 'cubic-bezier(0.33, 0, 0.2, 1)',
  }
}

/** A drop centred on the circle: `widthScale` / `heightScale` squash or stretch it. */
function drop(circle: Frame, widthScale: number, heightScale: number, lift = 0): Frame {
  const width = circle.width * widthScale
  const height = circle.height * heightScale
  return {
    left: circle.left + (circle.width - width) / 2,
    top: circle.top + (circle.height - height) / 2 - lift * circle.height,
    width,
    height,
    radius: Math.min(width, height) / 2,
  }
}

/** A capsule hanging from the circle, the rail's body still draining into it. */
function column(circle: Frame, rail: Frame, widthScale: number): Frame {
  const width = circle.width * widthScale
  return {
    left: circle.left + (circle.width - width) / 2,
    top: circle.top,
    width,
    height: Math.max(circle.height * 3, rail.height * 0.45),
    radius: width / 2,
  }
}

export default defineComponent({
  props: { active: { type: Boolean, default: true }, wide: { type: Boolean, default: false } },
  setup(props) {
    const host = useSidebarHost()!
    const surface = shallowRef<HTMLElement | null>(null)
    // Closed into the logo circle; without a logo the rail slides off-screen instead.
    const docked = shallowRef(false)
    let running: Animation[] = []
    let resizing: Animation | undefined
    let generation = 0
    let releaseMotion = () => {}

    function stop() {
      running.forEach(animation => animation.cancel())
      running = []
      releaseMotion()
      releaseMotion = () => {}
    }

    // Rail <-> logo circle, like a liquid: the rail narrows into a column that
    // drains up into the drop, which settles with a squash (and the reverse).
    async function morph(open: boolean) {
      const run = ++generation
      const target = surface.value
      const content = host.rail.value
      const from = running.length && target ? readFrame(target) : null
      const fromOpacity = running.length && content ? Number(getComputedStyle(content).opacity) : null
      stop()
      resizing?.cancel()
      host.railOpen.value = open
      const logo = host.logo.value
      if (!logo || !target?.animate || !content || prefersReducedMotion()) {
        docked.value = !open && Boolean(logo)
        host.morphing.value = false
        return
      }
      docked.value = !open
      host.morphing.value = true
      // Claim motion priority now, in the same flush as the navigation, so the
      // incoming page mounts (and starts loading) only after the morph.
      const duration = getMotionDuration(getComputedStyle(target), '--bew-sidebar-morph-duration', 300)
      releaseMotion = holdMotion(duration, PAGE_MOTION)
      await nextTick()
      if (run !== generation)
        return
      const shell = target.parentElement!.getBoundingClientRect()
      const circleRect = logo.getBoundingClientRect()
      const rail: Frame = { left: -1, top: -1, width: shell.width + 1, height: shell.height + 2, radius: 0 }
      const circle: Frame = { left: circleRect.left - shell.left, top: circleRect.top - shell.top, width: circleRect.width, height: circleRect.height, radius: circleRect.width / 2 }
      const timing: KeyframeAnimationOptions = { duration, easing: 'linear', fill: 'both' }
      const shape = open
        ? [keyframe(from ?? circle), keyframe(drop(circle, 1.1, 0.9), 0.16), keyframe(column(circle, rail, 0.9), 0.45), keyframe({ ...rail, radius: circle.width / 2 }, 0.78), keyframe(rail)]
        : [keyframe(from ?? rail), keyframe(column(circle, rail, 1.2), 0.4), keyframe(drop(circle, 0.88, 1.3, 0.04), 0.7), keyframe(drop(circle, 1.08, 0.92), 0.86), keyframe(circle)]
      const opacity = fromOpacity ?? (open ? 0 : 1)
      const main = target.animate(shape, timing)
      running = [
        main,
        content.animate(open ? [{ opacity }, { opacity: 0, offset: 0.7 }, { opacity: 1 }] : [{ opacity }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], timing),
        // The circle's contact shadow; the rail itself casts none.
        target.animate(open ? [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { ...timing, pseudoElement: '::after' }),
      ]
      const finish = () => {
        if (run !== generation)
          return
        host.morphing.value = false
        stop()
      }
      void main.finished.then(finish, () => {})
    }

    host.railOpen.value = props.active
    // Synchronous: the motion hold must exist before the page transition checks for it.
    watch(() => props.active, open => void morph(open), { flush: 'sync' })

    // The rail width steps between page kinds while the page content is swapped
    // out, so nothing re-lays out frame by frame; only the glass, still on screen,
    // glides from its last laid-out width, scaled on the compositor.
    let laidOutWidth = 0
    const widthObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(([entry]) => {
          laidOutWidth = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
        })
    watch(surface, (element, previous) => {
      if (previous)
        widthObserver?.unobserve(previous)
      if (element)
        widthObserver?.observe(element)
    })
    watch(() => props.wide, async () => {
      resizing?.cancel()
      resizing = undefined
      const before = laidOutWidth
      await nextTick()
      const target = surface.value
      if (!target?.animate || !before || !props.active || docked.value || host.morphing.value || prefersReducedMotion())
        return
      const after = target.offsetWidth
      if (!after || Math.abs(after - before) < 1)
        return
      const style = getComputedStyle(target)
      resizing = target.animate([{ transform: `scaleX(${before / after})` }, { transform: 'none' }], {
        duration: getMotionDuration(style, '--bew-duration-normal'),
        easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out',
      })
    })

    onScopeDispose(() => {
      generation++
      stop()
      resizing?.cancel()
      widthObserver?.disconnect()
      host.morphing.value = false
    })

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
        class: ['persistent-sidebar', {
          'persistent-sidebar--solid': settings.value.disableFrostedGlass,
          'persistent-sidebar--closed': !props.active,
          'persistent-sidebar--docked': !props.active && docked.value,
          'persistent-sidebar--morphing': host.morphing.value,
        }],
        'inert': !props.active || host.railPage.value !== host.page() ? true : undefined,
        'aria-hidden': !props.active ? 'true' : undefined,
      }, [
        h('div', { ref: surface, class: 'persistent-sidebar__surface', 'aria-hidden': 'true' }),
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
  @include sidebarSurface.selected-context;
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--bew-messages-sidebar-width);
  z-index: var(--bew-z-base-overlay);
  box-sizing: border-box;
  transform: none;
  visibility: visible;
  transition:
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    visibility 0s;
}
// The glass is its own layer behind the content, so it can fold into the logo
// circle while the content fades, and content blur layers are not inside it.
.persistent-sidebar__surface {
  @include sidebarSurface.material;
  position: absolute;
  top: -1px;
  left: -1px;
  width: calc(100% + 1px);
  height: calc(100% + 2px);
  box-sizing: border-box;
  // The same glass edge as every frosted surface (user-specified).
  border: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
  // A width change between page kinds scales the glass from the screen edge.
  transform-origin: left center;
  pointer-events: none;

  &::after {
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    box-shadow: var(--bew-shadow-1);
    opacity: 0;
    content: "";
  }
}
.persistent-sidebar--closed {
  transform: translateX(-100%);
  visibility: hidden;
  pointer-events: none;
  transition:
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    visibility 0s var(--bew-duration-normal);
}
// Folded into the logo, whose own circle now shows the same material.
.persistent-sidebar--docked {
  transform: none;
  transition: none;
}
.persistent-sidebar--morphing {
  transform: none;
  visibility: visible;
  pointer-events: none;
  transition: none;
}
.persistent-sidebar--solid .persistent-sidebar__surface {
  @include sidebarSurface.solid;
}
.persistent-sidebar__content {
  position: relative;
  height: 100%;
  min-width: 0;
}
@media (prefers-reduced-motion: reduce) {
  .persistent-sidebar {
    transition: none;
  }
}
</style>
