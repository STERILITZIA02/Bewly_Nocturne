export interface CssVariableReader {
  getPropertyValue: (name: string) => string
}

export function resolveCanvasCssColor(
  style: CssVariableReader,
  property: string,
  fallback: string,
): string {
  const value = style.getPropertyValue(property).trim()
  return value && !value.includes('var(') ? value : fallback
}
