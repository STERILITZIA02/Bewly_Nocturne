/** Split selector lists without splitting :is(), :not() or attribute values. */
export function splitCssSelectors(value: string): string[] {
  const selectors: string[] = []
  let depth = 0
  let start = 0
  let quote = ''
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '\\') {
      index++
      continue
    }
    if (quote) {
      if (char === quote)
        quote = ''
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
    }
    else if (char === '(' || char === '[') {
      depth++
    }
    else if (char === ')' || char === ']') {
      depth--
    }
    else if (char === ',' && depth === 0) {
      selectors.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  selectors.push(value.slice(start).trim())
  return selectors.filter(Boolean)
}
