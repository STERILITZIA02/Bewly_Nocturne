/** Model one OS preference source, including cached MediaQueryList objects. */
export function installMediaQueryFixture(window) {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  let factory = descriptor?.value
  const queries = new Map()
  const factories = new WeakMap()
  function queryList(query) {
    if (!queries.has(query)) {
      const list = new window.EventTarget()
      Object.defineProperties(list, {
        media: { value: query },
        matches: { get: () => Boolean(factory?.call(window, query)?.matches) },
      })
      list.onchange = null
      list.addListener = listener => list.addEventListener('change', listener)
      list.removeListener = listener => list.removeEventListener('change', listener)
      queries.set(query, list)
    }
    return queries.get(query)
  }
  function method() {
    const read = query => queryList(query)
    factories.set(read, factory)
    return read
  }
  let current = method()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    get: () => current,
    set(value) {
      const previous = new Map([...queries].map(([query, list]) => [query, list.matches]))
      factory = factories.has(value) ? factories.get(value) : value
      current = method()
      for (const [query, list] of queries) {
        if (list.matches === previous.get(query))
          continue
        const event = new window.Event('change')
        Object.assign(event, { matches: list.matches, media: query })
        list.dispatchEvent(event)
        list.onchange?.(event)
      }
    },
  })
  return () => {
    if (descriptor)
      Object.defineProperty(window, 'matchMedia', descriptor)
    else delete window.matchMedia
    queries.clear()
  }
}
