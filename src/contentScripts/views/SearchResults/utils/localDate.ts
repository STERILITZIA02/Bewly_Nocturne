export interface LocalCalendarDate {
  year: number
  month: number
  day: number
}

const LOCAL_DATE_PATTERNS = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
] as const

export function parseLocalCalendarDate(value: string): LocalCalendarDate | null {
  const normalized = value.trim()
  const match = LOCAL_DATE_PATTERNS
    .map(pattern => normalized.match(pattern))
    .find((candidate): candidate is RegExpMatchArray => candidate !== null)
  if (!match)
    return null

  const year = Number(match[1])
  const monthNumber = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, monthNumber - 1, day)

  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthNumber - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return { year, month: monthNumber - 1, day }
}

export function toLocalDate(value: LocalCalendarDate): Date {
  return new Date(value.year, value.month, value.day)
}

export function formatLocalCalendarDate(value: LocalCalendarDate): string {
  return `${value.year}-${String(value.month + 1).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}
