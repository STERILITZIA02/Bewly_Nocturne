export type SelectOptionValue = boolean | null | number | string | undefined

export function createSelectOptionKey(value: SelectOptionValue, index: number): string {
  let normalizedValue: string
  if (typeof value === 'number') {
    normalizedValue = Number.isNaN(value)
      ? 'NaN'
      : Object.is(value, -0) ? '-0' : String(value)
  }
  else {
    normalizedValue = String(value)
  }

  return `${typeof value}:${normalizedValue}:${index}`
}
