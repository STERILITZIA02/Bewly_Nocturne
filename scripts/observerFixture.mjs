// JSDOM has no layout observers. Production code always has them, so tests get
// stand-ins: ResizeObserver never reports (JSDOM has no layout to change), and
// IntersectionObserver reports each observed target once as in view, as on a
// page whose content all fits. Tests that need other answers install their own.
class FixtureResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class FixtureIntersectionObserver {
  constructor(callback, options = {}) {
    this.callback = callback
    this.root = options.root ?? null
    this.rootMargin = options.rootMargin ?? '0px'
    this.thresholds = [options.threshold ?? 0].flat()
    this.targets = new Set()
  }

  observe(target) {
    this.targets.add(target)
    queueMicrotask(() => {
      if (!this.targets.has(target))
        return
      const rect = target.getBoundingClientRect()
      this.callback([{ target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: rect, intersectionRect: rect, rootBounds: null, time: 0 }], this)
    })
  }

  unobserve(target) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
  }

  takeRecords() {
    return []
  }
}

export function installObserverFixture(...targets) {
  for (const target of targets) {
    target.ResizeObserver ??= FixtureResizeObserver
    target.IntersectionObserver ??= FixtureIntersectionObserver
  }
}
