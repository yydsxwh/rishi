/** 位置守护的纯规则。和远程闹钟分开判断，服务端裁剪坐标，不信任客户端。 */

export type LocationGrantScope = 'TIME_RANGE' | 'PERMANENT' | 'ENTITY_BOUND'
export type LocationShareMode = 'LAST_KNOWN' | 'LIVE'
export type LocationPrecision = 'APPROXIMATE' | 'PRECISE'
export type LocationGrantStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED'
export type LocationSource = 'GPS' | 'NETWORK' | 'LAST_KNOWN'
export type LocationViewStatus = 'live' | 'last_known' | 'stale' | 'unavailable' | 'offline' | 'permission_off'

export type LocationGrant = {
  id: string
  ownerUserId: string
  ownerName: string
  granteeUserId: string
  granteeName: string
  granteeAccountName?: string
  granteeKkMasked?: string
  scope: LocationGrantScope
  validFrom?: string
  validUntil?: string
  entityType?: string
  entityId?: string
  entityTitle?: string
  entityStartsAt?: string
  entityEndsAt?: string
  leadHours?: number
  trailHours?: number
  entityActive: boolean
  mode: LocationShareMode
  precision: LocationPrecision
  status: LocationGrantStatus
  createdAt: string
  updatedAt: string
  revokedAt?: string
}

export type LocationSnapshot = {
  ownerUserId: string
  latitude: number
  longitude: number
  accuracyMeters?: number
  capturedAt: string
  receivedAt: string
  source: LocationSource
}

export type LocationAudit = {
  id: string
  at: string
  ownerUserId: string
  viewerUserId: string
  grantId?: string
  precision?: LocationPrecision
  capturedAt?: string
  summary: string
}

export const LIVE_FRESH_MS = 5 * 60 * 1000
export const LAST_KNOWN_FRESH_MS = 3 * 60 * 60 * 1000
export const OFFLINE_MS = 20 * 60 * 1000
const APPROX_DECIMALS = 2

export class LocationDenied extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus = 403,
    readonly detail = '',
  ) {
    super(code)
  }
}

export function locationStatusLabel(status: LocationViewStatus): string {
  if (status === 'live') return '实时'
  if (status === 'last_known') return '最近位置'
  if (status === 'stale') return '位置已过期'
  if (status === 'offline') return '手机离线'
  if (status === 'permission_off') return '定位权限关闭'
  return '不可用'
}

export function clipCoordinate(value: number, precision: LocationPrecision): number {
  if (!Number.isFinite(value)) return value
  const decimals = precision === 'PRECISE' ? 6 : APPROX_DECIMALS
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function clipAccuracy(accuracy: number | undefined, precision: LocationPrecision): number | undefined {
  if (accuracy == null || !Number.isFinite(accuracy)) return precision === 'APPROXIMATE' ? 1100 : undefined
  if (precision === 'APPROXIMATE') return Math.max(1100, Math.round(accuracy))
  return Math.round(accuracy)
}

export function grantWindowOpen(grant: LocationGrant, now: number): string | null {
  if (grant.status === 'REVOKED') return 'LOCATION_GRANT_REVOKED'
  if (grant.status === 'PAUSED') return 'LOCATION_NOT_AUTHORIZED'
  if (grant.status === 'EXPIRED' || (grant.scope === 'ENTITY_BOUND' && !grant.entityActive)) return 'LOCATION_GRANT_EXPIRED'
  if (grant.scope === 'PERMANENT') return null
  const from = grant.validFrom ? Date.parse(grant.validFrom) : Number.NEGATIVE_INFINITY
  const until = grant.validUntil ? Date.parse(grant.validUntil) : Number.POSITIVE_INFINITY
  if (now < from) return 'LOCATION_OUT_OF_SCOPE'
  if (now > until) return 'LOCATION_GRANT_EXPIRED'
  return null
}

export function classifyLocation(input: {
  snapshot?: LocationSnapshot | null
  mode: LocationShareMode
  pausedAll: boolean
  permission: 'granted' | 'denied' | 'unknown'
  deviceSeenAt?: string
  now: number
}): LocationViewStatus {
  if (input.pausedAll) return 'unavailable'
  if (input.permission === 'denied') return 'permission_off'
  if (!input.snapshot) return 'unavailable'
  const age = input.now - Date.parse(input.snapshot.capturedAt)
  if (!Number.isFinite(age) || age > LAST_KNOWN_FRESH_MS) return 'stale'
  const seen = input.deviceSeenAt ? input.now - Date.parse(input.deviceSeenAt) : Number.POSITIVE_INFINITY
  if (input.mode === 'LIVE' && seen > OFFLINE_MS && age > OFFLINE_MS) return 'offline'
  if (input.mode === 'LIVE' && age <= LIVE_FRESH_MS) return 'live'
  return 'last_known'
}

export function viewerCoordinates(snapshot: LocationSnapshot, precision: LocationPrecision): { latitude: number; longitude: number; accuracyMeters?: number } {
  return {
    latitude: clipCoordinate(snapshot.latitude, precision),
    longitude: clipCoordinate(snapshot.longitude, precision),
    accuracyMeters: clipAccuracy(snapshot.accuracyMeters, precision),
  }
}
