/** Strict date-input parsing in the user's local calendar, including DST days. */
export function parseLocalCalendarDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match)
    return
  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day)
    return date
}
