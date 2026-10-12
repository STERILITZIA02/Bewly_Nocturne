/** Match all terms against the text actually supplied by the favorites APIs. */
export function matchesFavoriteQuery(query: string, ...values: Array<string | undefined | null>) {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim()
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  const text = values.map(value => normalize(value ?? '')).join(' ')
  return terms.every(term => text.includes(term))
}
