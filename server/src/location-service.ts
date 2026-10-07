import type { DaysConfig } from './config'
import { randomToken } from './crypto'
import { assertKnownAccount } from './account-resolve'
import {
  type LocationGrant,
  type LocationGrantScope,
  type LocationPrecision,
  type LocationShareMode,
  type LocationSnapshot,
  type LocationAudit,
  type LocationSource,
  type LocationViewStatus,
  LocationDenied,
  classifyLocation,
  grantWindowOpen,
  locationStatusLabel,
  viewerCoordinates,
} from './location-domain'
import { readLocationDb, withLocationDb } from './location-store'
import { computeEntityWindow, cleanText, isAccountSub } from './remote-alarm-domain'
import { readAlarmDb } from './remote-alarm-store'
import { publicDeviceStatus } from './device-status'

export type Actor = { sub: string; name: string }

const SCOPES = new Set<LocationGrantScope>(['TIME_RANGE', 'PERMANENT', 'ENTITY_BOUND'])
const MODES = new Set<LocationShareMode>(['LAST_KNOWN', 'LIVE'])
const PRECISIONS = new Set<LocationPrecision>(['APPROXIMATE', 'PRECISE'])
const SOURCES = new Set<LocationSource>(['GPS', 'NETWORK', 'LAST_KNOWN'])
const viewHits = new Map<string, number[]>()

function deny(code: string, httpStatus = 403, detail = ''): never {
  throw new LocationDenied(code, httpStatus, detail)
}

function audit(db: { audit: LocationAudit[] }, event: Omit<LocationAudit, 'id' | 'at'> & { at?: string }) {
  db.audit.push({ id: `la_${randomToken(9)}`, at: event.at || new Date().toISOString(), ...event })
  if (db.audit.length > 500) db.audit.splice(0, db.audit.length - 500)
}

function hours(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 24 * 30) deny('LOCATION_OUT_OF_SCOPE', 400, '提前或延后小时数无效')
  return n
}

function publicGrant(grant: LocationGrant) {
  return {
    id: grant.id,
    ownerUserId: grant.ownerUserId,
    ownerName: grant.ownerName,
    granteeUserId: grant.granteeUserId,
    granteeName: grant.granteeName,
    granteeAccountName: grant.granteeAccountName,
    granteeKkMasked: grant.granteeKkMasked,
    scope: grant.scope,
    status: grant.status,
    validFrom: grant.validFrom,
    validUntil: grant.validUntil,
    entityType: grant.entityType,
    entityId: grant.entityId,
    entityTitle: grant.entityTitle,
    mode: grant.mode,
    precision: grant.precision,
  }
}

export async function createLocationGrant(config: DaysConfig, actor: Actor, input: Record<string, unknown>, now = new Date()) {
  const granteeUserId = cleanText(input.granteeUserId, 84)
  if (!isAccountSub(granteeUserId) || granteeUserId === actor.sub) deny('LOCATION_NOT_AUTHORIZED', 400, '请选择另一个账号')
  const scope = input.scope as LocationGrantScope
  if (!SCOPES.has(scope)) deny('LOCATION_OUT_OF_SCOPE', 400, '授权类型无效')
  const mode: LocationShareMode = MODES.has(input.mode as LocationShareMode) ? (input.mode as LocationShareMode) : 'LAST_KNOWN'
  const precision: LocationPrecision = PRECISIONS.has(input.precision as LocationPrecision) ? (input.precision as LocationPrecision) : 'APPROXIMATE'
  await assertKnownAccount(config, granteeUserId)
  const nowIso = now.toISOString()
  return withLocationDb(config, (db) => {
    const existing = db.grants.find((grant) => grant.ownerUserId === actor.sub && grant.granteeUserId === granteeUserId && (grant.status === 'ACTIVE' || grant.status === 'PAUSED'))
    const row: LocationGrant = existing || {
      id: `lg_${randomToken(12)}`,
      ownerUserId: actor.sub,
      ownerName: cleanText(actor.name, 40) || '我',
      granteeUserId,
      granteeName: cleanText(input.granteeName, 40) || '联系人',
      entityActive: true,
      mode,
      precision,
      scope,
      status: 'ACTIVE',
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    row.granteeName = cleanText(input.granteeName, 40) || row.granteeName
    row.granteeAccountName = cleanText(input.granteeAccountName, 40) || row.granteeAccountName
    row.granteeKkMasked = cleanText(input.granteeKkMasked, 20) || row.granteeKkMasked
    row.scope = scope
    row.mode = mode
    row.precision = precision
    row.entityActive = true
    if (row.status === 'PAUSED') row.status = 'PAUSED'
    else row.status = 'ACTIVE'
    if (scope === 'TIME_RANGE') {
      const from = Date.parse(String(input.validFrom || ''))
      const until = Date.parse(String(input.validUntil || ''))
      if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) deny('LOCATION_OUT_OF_SCOPE', 400, '请填写有效的起止时间')
      row.validFrom = new Date(from).toISOString()
      row.validUntil = new Date(until).toISOString()
      row.entityType = undefined
      row.entityId = undefined
    } else if (scope === 'ENTITY_BOUND') {
      row.entityType = cleanText(input.entityType, 32) || undefined
      row.entityId = cleanText(input.entityId, 80) || undefined
      row.entityTitle = cleanText(input.entityTitle, 80) || undefined
      row.entityStartsAt = typeof input.entityStartsAt === 'string' ? input.entityStartsAt : undefined
      row.entityEndsAt = typeof input.entityEndsAt === 'string' ? input.entityEndsAt : undefined
      row.leadHours = hours(input.leadHours)
      row.trailHours = hours(input.trailHours) ?? 0
      if (!row.entityType || !row.entityId) deny('LOCATION_OUT_OF_SCOPE', 400, '请选择要跟随的事项')
      let window: { validFrom: string; validUntil: string }
      try {
        window = computeEntityWindow({
          createdAt: row.createdAt,
          entityStartsAt: row.entityStartsAt,
          entityEndsAt: row.entityEndsAt,
          leadHours: row.leadHours,
          trailHours: row.trailHours,
        })
      } catch {
        deny('LOCATION_OUT_OF_SCOPE', 400, '事项时间无效')
      }
      row.validFrom = window.validFrom
      row.validUntil = window.validUntil
    } else {
      row.validFrom = undefined
      row.validUntil = undefined
    }
    row.updatedAt = nowIso
    if (!existing) db.grants.push(row)
    audit(db, {
      ownerUserId: actor.sub,
      viewerUserId: actor.sub,
      grantId: row.id,
      summary: `${existing ? '更新' : '授权'} ${row.granteeName} 查看位置（${row.scope} / ${row.mode} / ${row.precision}）`,
      at: nowIso,
    })
    return publicGrant(row)
  })
}

export async function updateLocationGrant(config: DaysConfig, actor: Actor, id: string, input: Record<string, unknown>, now = new Date()) {
  const nowIso = now.toISOString()
  return withLocationDb(config, (db) => {
    const grant = db.grants.find((item) => item.id === id && item.ownerUserId === actor.sub)
    if (!grant) deny('LOCATION_NOT_AUTHORIZED', 404, '找不到这条位置授权')
    if (grant.status === 'REVOKED') deny('LOCATION_GRANT_REVOKED')
    if (input.status === 'PAUSED' || input.status === 'ACTIVE') grant.status = input.status
    if (input.mode === 'LAST_KNOWN' || input.mode === 'LIVE') grant.mode = input.mode
    if (input.precision === 'APPROXIMATE' || input.precision === 'PRECISE') grant.precision = input.precision
    if (grant.scope === 'TIME_RANGE' && (input.validFrom || input.validUntil)) {
      const from = Date.parse(String(input.validFrom || grant.validFrom || ''))
      const until = Date.parse(String(input.validUntil || grant.validUntil || ''))
      if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) deny('LOCATION_OUT_OF_SCOPE', 400, '起止时间无效')
      grant.validFrom = new Date(from).toISOString()
      grant.validUntil = new Date(until).toISOString()
    }
    if (grant.scope === 'ENTITY_BOUND' && input.entityActive === false) {
      grant.entityActive = false
      grant.status = 'EXPIRED'
      audit(db, { ownerUserId: actor.sub, viewerUserId: actor.sub, grantId: grant.id, summary: '绑定事项已取消，位置授权失效', at: nowIso })
    }
    grant.updatedAt = nowIso
    if (input.status === 'PAUSED' || input.status === 'ACTIVE') {
      audit(db, { ownerUserId: actor.sub, viewerUserId: actor.sub, grantId: grant.id, summary: input.status === 'PAUSED' ? '暂停位置授权' : '恢复位置授权', at: nowIso })
    }
    return publicGrant(grant)
  })
}

export async function revokeLocationGrant(config: DaysConfig, actor: Actor, id: string, now = new Date()) {
  const nowIso = now.toISOString()
  return withLocationDb(config, (db) => {
    const grant = db.grants.find((item) => item.id === id && item.ownerUserId === actor.sub)
    if (!grant) deny('LOCATION_NOT_AUTHORIZED', 404, '找不到这条位置授权')
    grant.status = 'REVOKED'
    grant.revokedAt = nowIso
    grant.updatedAt = nowIso
    audit(db, { ownerUserId: actor.sub, viewerUserId: actor.sub, grantId: grant.id, summary: '撤销位置授权', at: nowIso })
    return publicGrant(grant)
  })
}

export async function listLocationGrants(config: DaysConfig, actor: Actor) {
  const db = await readLocationDb(config)
  return {
    given: db.grants.filter((grant) => grant.ownerUserId === actor.sub).map(publicGrant),
    received: db.grants.filter((grant) => grant.granteeUserId === actor.sub && grant.status !== 'REVOKED').map(publicGrant),
  }
}

export async function pauseLocationSharing(config: DaysConfig, actor: Actor, now = new Date()) {
  return withLocationDb(config, (db) => {
    db.prefs[actor.sub] = { pausedAll: true }
    audit(db, { ownerUserId: actor.sub, viewerUserId: actor.sub, summary: '暂停全部位置共享', at: now.toISOString() })
    return { pausedAll: true }
  })
}

export async function resumeLocationSharing(config: DaysConfig, actor: Actor, now = new Date()) {
  return withLocationDb(config, (db) => {
    db.prefs[actor.sub] = { pausedAll: false }
    audit(db, { ownerUserId: actor.sub, viewerUserId: actor.sub, summary: '恢复位置共享', at: now.toISOString() })
    return { pausedAll: false }
  })
}

export async function saveSnapshot(config: DaysConfig, actor: Actor, input: Record<string, unknown>, now = new Date()) {
  if (input.ownerUserId && cleanText(input.ownerUserId, 84) !== actor.sub) {
    deny('LOCATION_NOT_AUTHORIZED', 403, '不能替别人上传位置')
  }
  const latitude = Number(input.latitude)
  const longitude = Number(input.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    deny('LOCATION_OUT_OF_SCOPE', 400, '坐标无效')
  }
  const capturedMs = Date.parse(String(input.capturedAt || ''))
  if (!Number.isFinite(capturedMs) || capturedMs > now.getTime() + 10 * 60 * 1000) deny('LOCATION_OUT_OF_SCOPE', 400, '定位时间无效')
  const source = SOURCES.has(input.source as LocationSource) ? (input.source as LocationSource) : 'GPS'
  const accuracy = input.accuracyMeters == null ? undefined : Number(input.accuracyMeters)
  const nowIso = now.toISOString()
  return withLocationDb(config, (db) => {
    if (db.prefs[actor.sub]?.pausedAll) deny('LOCATION_PAUSED', 403, '位置共享已暂停')
    const snapshot: LocationSnapshot = {
      ownerUserId: actor.sub,
      latitude,
      longitude,
      accuracyMeters: accuracy != null && Number.isFinite(accuracy) ? accuracy : undefined,
      capturedAt: new Date(capturedMs).toISOString(),
      receivedAt: nowIso,
      source,
    }
    db.snapshots = db.snapshots.filter((item) => item.ownerUserId !== actor.sub)
    db.snapshots.push(snapshot)
    return { saved: true, capturedAt: snapshot.capturedAt }
  })
}

function allowView(viewer: string, owner: string, now: number): boolean {
  const key = `${viewer}\n${owner}`
  const fresh = (viewHits.get(key) || []).filter((at) => now - at < 60_000)
  if (fresh.length >= 30) {
    viewHits.set(key, fresh)
    return false
  }
  fresh.push(now)
  viewHits.set(key, fresh)
  return true
}

export function resetLocationViewLimits(): void {
  viewHits.clear()
}

export type LocationViewResult = {
  status: LocationViewStatus
  statusLabel: string
  sharing?: boolean
  advice?: string
  mode?: LocationShareMode
  precision?: LocationPrecision
  capturedAt?: string
  latitude?: number
  longitude?: number
  accuracyMeters?: number
  source?: LocationSource
  entityTitle?: string
}

export async function viewLocation(config: DaysConfig, actor: Actor, ownerUserId: string, now = new Date()): Promise<LocationViewResult> {
  const owner = cleanText(ownerUserId, 84)
  if (inputLooksSpoofed(actor.sub, owner)) deny('LOCATION_NOT_AUTHORIZED')
  if (!allowView(actor.sub, owner, now.getTime())) deny('LOCATION_RATE_LIMITED', 429, '查看太频繁')
  const db = await readLocationDb(config)
  const grant = db.grants.find((item) => item.ownerUserId === owner && item.granteeUserId === actor.sub && item.status !== 'REVOKED')
  if (!grant) deny('LOCATION_NOT_AUTHORIZED', 403, '对方没有授权你查看位置')
  const reason = grantWindowOpen(grant, now.getTime())
  if (reason) deny(reason, 403, '现在不在位置授权有效期内')
  if (db.prefs[owner]?.pausedAll) {
    return { status: 'unavailable', statusLabel: locationStatusLabel('unavailable'), sharing: false, advice: '对方已暂停位置共享' }
  }
  const alarmDb = await readAlarmDb(config)
  const device = publicDeviceStatus(alarmDb.devices.filter((item) => item.userId === owner))
  const snapshot = db.snapshots.find((item) => item.ownerUserId === owner) || null
  const permission = device.location.foregroundPermission
  const status = classifyLocation({
    snapshot,
    mode: grant.mode,
    pausedAll: false,
    permission,
    deviceSeenAt: device.lastSeenAt,
    now: now.getTime(),
  })
  const base = {
    status,
    statusLabel: locationStatusLabel(status),
    mode: grant.mode,
    precision: grant.precision,
    sharing: status === 'live' || status === 'last_known',
    capturedAt: snapshot?.capturedAt,
    device,
    advice: status === 'live' || status === 'last_known' ? '' : '建议直接电话联系对方',
    entityTitle: grant.scope === 'ENTITY_BOUND' ? grant.entityTitle : undefined,
  }
  if (!snapshot || status === 'permission_off' || status === 'unavailable') {
    await withLocationDb(config, (draft) => {
      audit(draft, {
        ownerUserId: owner,
        viewerUserId: actor.sub,
        grantId: grant.id,
        precision: grant.precision,
        capturedAt: snapshot?.capturedAt,
        summary: `${actor.name} 查看了位置，但当前${locationStatusLabel(status)}`,
      })
    })
    return base
  }
  const coords = viewerCoordinates(snapshot, grant.precision)
  await withLocationDb(config, (draft) => {
    audit(draft, {
      ownerUserId: owner,
      viewerUserId: actor.sub,
      grantId: grant.id,
      precision: grant.precision,
      capturedAt: snapshot.capturedAt,
      summary: `${actor.name} 查看了你的${grant.precision === 'PRECISE' ? '精确' : '模糊'}位置`,
    })
  })
  return { ...base, ...coords, source: snapshot.source }
}

function inputLooksSpoofed(actor: string, owner: string): boolean {
  return !isAccountSub(owner) || owner === actor
}

export async function listLocationAudit(config: DaysConfig, actor: Actor) {
  const db = await readLocationDb(config)
  return db.audit.filter((event) => event.ownerUserId === actor.sub).slice(-200).reverse()
}

export async function ownerSharingStatus(config: DaysConfig, actor: Actor, now = new Date()) {
  const db = await readLocationDb(config)
  const active = db.grants.filter((grant) => grant.ownerUserId === actor.sub && grantWindowOpen(grant, now.getTime()) == null)
  return {
    pausedAll: Boolean(db.prefs[actor.sub]?.pausedAll),
    liveRequired: active.some((grant) => grant.mode === 'LIVE'),
    activeGrantCount: active.length,
  }
}
