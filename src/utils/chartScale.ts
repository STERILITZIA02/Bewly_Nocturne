/** Bounded, honest units for compact count charts. No mark is invented for zero. */
export function chartUnit(maximum: number, limit = 20): number {
  if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isFinite(limit) || limit <= 0)
    return 1
  const target = Math.max(1, maximum) / limit
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, target)))
  return [1, 2, 5, 10].map(step => step * magnitude).find(step => step >= target) ?? magnitude * 10
}

export function chartRungs(value: number | null, unit: number, limit = 20): number[] {
  if (value === null || !Number.isFinite(value) || value <= 0 || !Number.isFinite(unit) || unit <= 0 || !Number.isFinite(limit) || limit <= 0)
    return []
  const units = value / unit
  return Array.from({ length: Math.min(limit, Math.ceil(units)) }, (_, index) => Math.min(1, units - index))
}
