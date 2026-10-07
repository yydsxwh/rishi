/** 好友远程闹钟的纯规则。服务端以这里的结果为准，不信任客户端自称的权限。 */

export type AlarmGrantScope = 'TIME_RANGE' | 'PERMANENT' | 'ENTITY_BOUND'
export type GrantStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED'
export type AlarmStatus =
  | 'CREATED'
  | 'DELIVERY_PENDING'
  | 'DELIVERED'
  | 'DEVICE_SCHEDULED'
  | 'FIRED'
  | 'CANCELLED'
  | 'FAILED'
  | 'MISSED'
  | 'EXPIRED'

export type GrantPermissions = {
  createAlarm: boolean
  modifyOwnAlarm: boolean
  cancelOwnAlarm: boolean
}

export type RemoteAlarmGrant = {
  id: string
  ownerUserId: string
  ownerName: string
  granteeUserId: string
  granteeName: string
  scope: AlarmGrantScope
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
  status: GrantStatus
  permissions: GrantPermissions
  createdAt: string
  updatedAt: string
  revokedAt?: string
}

export type RemoteAlarm = {
  id: string
  ownerUserId: string
  creatorUserId: string
  creatorName: string
  grantId: string
  triggerAt: string
  timezone: string
  title: string
  note?: string
  entityType?: string
  entityId?: string
  entityTitle?: string
  vibrate: boolean
  sound: boolean
  allowSnooze: boolean
  status: AlarmStatus
  revision: number
  requestHash: string
  clientNonce: string
  createdAt: string
  updatedAt: string
  failureReason?: string
}

export type OwnerPrefs = {
  pausedAll: boolean
  maxPerHour: number
  maxPerDay: number
  allowNight: boolean
  timezone: string
}

export const DEFAULT_PERMISSIONS: GrantPermissions = {
  createAlarm: true,
  modifyOwnAlarm: true,
  cancelOwnAlarm: true,
}

export const OPEN_ALARM_STATUSES: AlarmStatus[] = ['CREATED', 'DELIVERY_PENDING', 'DELIVERED', 'DEVICE_SCHEDULED']

export class RemoteAlarmDenied extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus = 403,
    readonly detail = '',
  ) {
    super(code)
  }
}

const USER_ID = /^usr_[A-Za-z0-9_-]{4,80}$/
const MIN_LEAD_MS = 30_000
const MAX_AHEAD_MS = 400 * 24 * 60 * 60 * 1000

export function defaultPrefs(): OwnerPrefs {
  return { pausedAll: false, maxPerHour: 3, maxPerDay: 10, allowNight: true, timezone: 'Asia/Shanghai' }
}

export function clampPrefs(input: Partial<OwnerPrefs>, base: OwnerPrefs = defaultPrefs()): OwnerPrefs {
  const hour = Number(input.maxPerHour ?? base.maxPerHour)
  const day = Number(input.maxPerDay ?? base.maxPerDay)
  const timezone = typeof input.timezone === 'string' && isTimeZone(input.timezone) ? input.timezone : base.timezone
  return {
    pausedAll: input.pausedAll ?? base.pausedAll,
    maxPerHour: Number.isFinite(hour) ? Math.min(20, Math.max(1, Math.floor(hour))) : base.maxPerHour,
    maxPerDay: Number.isFinite(day) ? Math.min(50, Math.max(1, Math.floor(day))) : base.maxPerDay,
    allowNight: input.allowNight ?? base.allowNight,
    timezone,
  }
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function isAccountSub(value: string): boolean {
  return USER_ID.test(value)
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return Array.from(value).map((char) => (char.charCodeAt(0) < 32 ? ' ' : char)).join('').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function localHour(instantIso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantIso))
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  return Number.isFinite(hour) ? hour : 0
}

export function isNightHour(hour: number): boolean {
  return hour >= 22 || hour < 7
}

/** 省略 leadHours 表示授权从创建时立即生效；填写则从事项开始前提前相应小时。 */
export function computeEntityWindow(input: {
  createdAt: string
  entityStartsAt?: string
  entityEndsAt?: string
  leadHours?: number
  trailHours?: number
}): { validFrom: string; validUntil: string } {
  const created = Date.parse(input.createdAt)
  const start = input.entityStartsAt ? Date.parse(input.entityStartsAt) : created
  const end = input.entityEndsAt ? Date.parse(input.entityEndsAt) : start
  if (!Number.isFinite(created) || !Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RemoteAlarmDenied('REMOTE_ALARM_OUT_OF_SCOPE', 400, '事项时间无效')
  }
  const lead = input.leadHours
  const trail = input.trailHours ?? 0
  const from = lead == null ? created : start - lead * 3_600_000
  const until = end + trail * 3_600_000
  if (until < from) throw new RemoteAlarmDenied('REMOTE_ALARM_OUT_OF_SCOPE', 400, '授权结束早于开始')
  return { validFrom: new Date(from).toISOString(), validUntil: new Date(until).toISOString() }
}

export function grantBlockReason(grant: RemoteAlarmGrant, now: number, prefs: OwnerPrefs): string | null {
  if (prefs.pausedAll) return 'REMOTE_ALARM_PAUSED'
  if (grant.status === 'REVOKED') return 'REMOTE_ALARM_GRANT_REVOKED'
  if (grant.status === 'PAUSED') return 'REMOTE_ALARM_NOT_AUTHORIZED'
  if (grant.status === 'EXPIRED' || (grant.scope === 'ENTITY_BOUND' && !grant.entityActive)) {
    return 'REMOTE_ALARM_GRANT_EXPIRED'
  }
  if (grant.scope === 'PERMANENT') return null
  const from = grant.validFrom ? Date.parse(grant.validFrom) : Number.NEGATIVE_INFINITY
  const until = grant.validUntil ? Date.parse(grant.validUntil) : Number.POSITIVE_INFINITY
  if (now < from) return 'REMOTE_ALARM_OUT_OF_SCOPE'
  if (now > until) return 'REMOTE_ALARM_GRANT_EXPIRED'
  return null
}

export function assertTriggerAllowed(input: {
  triggerAt: string
  now: number
  grant: RemoteAlarmGrant
  prefs: OwnerPrefs
}): void {
  const trigger = Date.parse(input.triggerAt)
  if (!Number.isFinite(trigger)) throw new RemoteAlarmDenied('REMOTE_ALARM_OUT_OF_SCOPE', 400, '闹钟时间无效')
  if (trigger <= input.now + MIN_LEAD_MS) {
    throw new RemoteAlarmDenied('REMOTE_ALARM_OUT_OF_SCOPE', 400, '不能设置过去或过于接近的时间')
  }
  if (trigger > input.now + MAX_AHEAD_MS) {
    throw new RemoteAlarmDenied('REMOTE_ALARM_OUT_OF_SCOPE', 400, '闹钟时间太远')
  }
  if (input.grant.scope !== 'PERMANENT' && input.grant.validUntil && trigger > Date.parse(input.grant.validUntil)) {
    throw new RemoteAlarmDenied('REMOTE_ALARM_OUT_OF_SCOPE', 400, '闹钟时间超出授权有效期')
  }
  if (!input.prefs.allowNight && isNightHour(localHour(input.triggerAt, input.prefs.timezone))) {
    throw new RemoteAlarmDenied('REMOTE_ALARM_OUT_OF_SCOPE', 403, '对方关闭了夜间远程闹钟')
  }
}

export function assertRateLimit(alarms: RemoteAlarm[], ownerUserId: string, now: number, prefs: OwnerPrefs): void {
  const hourAgo = now - 3_600_000
  const dayAgo = now - 86_400_000
  let hour = 0
  let day = 0
  for (const alarm of alarms) {
    if (alarm.ownerUserId !== ownerUserId) continue
    const created = Date.parse(alarm.createdAt)
    if (created >= hourAgo) hour += 1
    if (created >= dayAgo) day += 1
  }
  if (hour >= prefs.maxPerHour || day >= prefs.maxPerDay) {
    throw new RemoteAlarmDenied('REMOTE_ALARM_RATE_LIMITED', 429, '已达到对方设置的远程闹钟数量上限')
  }
}

export function deliveryAcceptance(status: AlarmStatus): 'sent' | 'scheduled' | 'done' | 'closed' {
  if (status === 'DEVICE_SCHEDULED') return 'scheduled'
  if (status === 'FIRED') return 'done'
  if (status === 'CANCELLED' || status === 'FAILED' || status === 'MISSED' || status === 'EXPIRED') return 'closed'
  return 'sent'
}

/** 只有手机回执 DEVICE_SCHEDULED 之后才算设到对方手机。 */
export function deviceReady(status: AlarmStatus): boolean {
  return status === 'DEVICE_SCHEDULED' || status === 'FIRED'
}
