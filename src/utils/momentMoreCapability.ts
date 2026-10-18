import type { MomentDeleteParams, MomentMoreCapability } from '~/components/MomentCard/types'
import { ThreePointItemType } from '~/models/moment/moment'

const MOMENT_ID_PATTERN = /^[1-9]\d*$/

function readDeleteParams(momentId: string, value: unknown): MomentDeleteParams | undefined {
  if (!value || typeof value !== 'object')
    return
  const params = value as Record<string, unknown>
  const dynId = typeof params.dyn_id_str === 'string' ? params.dyn_id_str : ''
  const dynType = Number(params.dyn_type)
  const ridStr = typeof params.rid_str === 'string' ? params.rid_str : String(params.rid_str ?? '')
  if (dynId !== momentId || !MOMENT_ID_PATTERN.test(dynId) || !Number.isSafeInteger(dynType) || dynType <= 0 || !/^\d+$/.test(ridStr))
    return
  return { dyn_id_str: dynId, dyn_type: dynType, rid_str: ridStr }
}

export function resolveMomentMoreCapability(momentId: string, items: unknown): MomentMoreCapability | undefined {
  if (!Array.isArray(items))
    return
  const entries = items.filter((item): item is { type?: unknown, params?: unknown } => !!item && typeof item === 'object')
  const deleteItem = entries.find(item => item.type === ThreePointItemType.ThreePointDelete)
  const deleteParams = deleteItem ? readDeleteParams(momentId, deleteItem.params) : undefined
  return {
    canDelete: Boolean(deleteParams),
    canReport: entries.some(item => item.type === ThreePointItemType.ThreePointReport),
    ...(deleteParams ? { deleteParams } : {}),
  }
}
