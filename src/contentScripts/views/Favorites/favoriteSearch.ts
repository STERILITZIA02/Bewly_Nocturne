const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim()
const textIndex = new WeakMap<object, { values: Array<string | undefined | null>, text: string }>()

/** Match all terms against the text actually supplied by the favorites APIs. */
export function matchesFavoriteQuery(query: string, ...values: Array<string | undefined | null>) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length)
    return true
  const text = values.map(value => normalize(value ?? '')).join(' ')
  return terms.every(term => text.includes(term))
}

/** Content changes invalidate only their own text; discarded rows are weakly held. */
export function filterFavoriteItems<T extends object>(items: T[], query: string, valuesOf: (item: T) => Array<string | undefined | null>): T[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length)
    return items
  return items.filter((item) => {
    const values = valuesOf(item)
    let cached = textIndex.get(item)
    if (!cached || values.length !== cached.values.length || values.some((value, index) => value !== cached!.values[index])) {
      cached = { values, text: values.map(value => normalize(value ?? '')).join(' ') }
      textIndex.set(item, cached)
    }
    return terms.every(term => cached.text.includes(term))
  })
}
