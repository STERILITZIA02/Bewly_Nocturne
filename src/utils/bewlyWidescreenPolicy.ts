export interface WidescreenMutationOrigin {
  insideRoot: boolean
  relevant: boolean
}

export function shouldScheduleWidescreenRefresh(origins: readonly WidescreenMutationOrigin[]): boolean {
  return origins.some(origin => !origin.insideRoot && origin.relevant)
}

export function shortenCommentDateText(value: string): string {
  return value.replace(/\b\d{4}-(\d{2})-(\d{2})\b/g, '$1-$2')
}
