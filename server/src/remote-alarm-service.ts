import type { DaysConfig } from './config'
import { randomToken, sha256Hex } from './crypto'
import { log } from './http'
import { readUser } from './users'
import {
  type AlarmStatus,
  type AlarmGrantScope,
  type GrantPermissions,
  type OwnerPrefs,
  type RemoteAlarm,
  type RemoteAlarmGrant,
  OPEN_ALARM_STATUSES,
  RemoteAlarmDenied,
  assertRateLimit,
  assertTriggerAllowed,
  clampPrefs,
  cleanText,
  computeEntityWindow,
  defaultPrefs,
  deliveryAcceptance,
  deviceReady,
  grantBlockReason,
  isAccountSub,
  isTimeZone,
} from './remote-alarm-domain'
import { normalizeCapabilities, publicDeviceStatus } from './device-status'
import { choosePushProvider, isPushProvider, type PushRegion } from './push-domain'
import { wakeOwnerDevices } from './remote-alarm-push'
import { readLocationDb } from './location-store'
import { readAlarmDb, withAlarmDb, type AuditEvent, type DevicePlatform, type UserDevice } from './remote-alarm-store'
import { assertKnownAccount } from './account-resolve'

export type Actor = { sub: string; name: string }

type GrantInput = {
  granteeUserId?: string
  granteeName?: string
  scope?: AlarmGrantScope
  validFrom?: string
  validUntil?: string
  entityType?: string
  entityId?: string
  entityTitle?: string
  entityStartsAt?: string
  entityEndsAt?: string
  leadHours?: number
  trailHours?: number
  permissions?: Partial<GrantPermissions>
}

type AlarmInput = {
  ownerUserId?: string
  grantId?: string
  triggerAt?: string
  timezone?: string
  title?: string
  note?: string
  entityType?: string
  entityId?: string
  entityTitle?: string
  vibrate?: boolean
  sound?: boolean
  allowSnooze?: boolean
  clientNonce?: string
}

const SCOPES = new Set<AlarmGrantScope>(['TIME_RANGE', 'PERMANENT', 'ENTITY_BOUND'])

function deny(code: string, httpStatus = 403, detail = ''): never {
  throw new RemoteAlarmDenied(code, httpStatus, detail)
}

function prefsOf(map: Record<string, OwnerPrefs>, userId: string): OwnerPrefs {
  return map[userId] ? clampPrefs(map[userId]) : defaultPrefs()
}

function audit(db: { audit: AuditEvent[] }, event: Omit<AuditEvent, 'id' | 'at'> & { at?: string }): void {
  db.audit.push({ id: `al_${randomToken(9)}`, at: event.at || new Date().toISOString(), ...event })
}

function publicAlarm(alarm: RemoteAlarm) {
  return { ...alarm, requestHash: undefined, clientNonce: undefined, acceptance: deliveryAcceptance(alarm.status), deviceReady: deviceReady(alarm.status) }
}

function hashRequest(input: { ownerUserId: string; grantId: string; triggerAt: string; timezone: string; title: string; note: string }): string {
  return sha256Hex(JSON.stringify(input))
}

function hours(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 24 * 30) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '提前或延后小时数无效')
  return n
}

function applyEntity(grant: RemoteAlarmGrant, input: GrantInput, createdAt: string): void {
  grant.entityType = cleanText(input.entityType, 32) || undefined
  grant.entityId = cleanText(input.entityId, 80) || undefined
  grant.entityTitle = cleanText(input.entityTitle, 80) || undefined
  grant.entityStartsAt = input.entityStartsAt
  grant.entityEndsAt = input.entityEndsAt
  grant.leadHours = hours(input.leadHours)
  grant.trailHours = hours(input.trailHours) ?? 0
  if (!grant.entityType || !grant.entityId) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '请选择要跟随的事项')
  const window = computeEntityWindow({
    createdAt,
    entityStartsAt: grant.entityStartsAt,
    entityEndsAt: grant.entityEndsAt,
    leadHours: grant.leadHours,
    trailHours: grant.trailHours,
  })
  grant.validFrom = window.validFrom
  grant.validUntil = window.validUntil
}

function requireGrant(db: { grants: RemoteAlarmGrant[] }, id: string, ownerUserId: string): RemoteAlarmGrant {
  const grant = db.grants.find((item) => item.id === id && item.ownerUserId === ownerUserId)
  if (!grant) deny('REMOTE_ALARM_NOT_AUTHORIZED', 404, '找不到这条授权')
  return grant
}

function cancelOpen(db: { alarms: RemoteAlarm[]; audit: AuditEvent[] }, ownerUserId: string, actorUserId: string, grantId: string | undefined, nowIso: string, summary: string): number {
  let count = 0
  for (const alarm of db.alarms) {
    if (alarm.ownerUserId !== ownerUserId) continue
    if (grantId && alarm.grantId !== grantId) continue
    if (!OPEN_ALARM_STATUSES.includes(alarm.status)) continue
    if (Date.parse(alarm.triggerAt) <= Date.parse(nowIso)) continue
    alarm.status = 'CANCELLED'
    alarm.updatedAt = nowIso
    alarm.revision += 1
    count += 1
    audit(db, { action: 'alarm.cancelled', ownerUserId, actorUserId, grantId: alarm.grantId, alarmId: alarm.id, summary, at: nowIso })
  }
  return count
}

export async function createGrant(config: DaysConfig, actor: Actor, input: GrantInput, now = new Date()) {
  const granteeUserId = cleanText(input.granteeUserId, 84)
  if (!isAccountSub(granteeUserId) || granteeUserId === actor.sub) {
    deny('REMOTE_ALARM_NOT_AUTHORIZED', 400, '请选择另一个账号')
  }
  await assertKnownAccount(config, granteeUserId)
  if (!input.scope || !SCOPES.has(input.scope)) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '授权类型无效')
  const nowIso = now.toISOString()
  const grant = await withAlarmDb(config, (db) => {
    const row: RemoteAlarmGrant = {
      id: `rg_${randomToken(12)}`,
      ownerUserId: actor.sub,
      ownerName: cleanText(actor.name, 40) || '我',
      granteeUserId,
      granteeName: cleanText(input.granteeName, 40) || '好友',
      scope: input.scope as AlarmGrantScope,
      entityActive: true,
      status: 'ACTIVE',
      permissions: {
        createAlarm: input.permissions?.createAlarm !== false,
        modifyOwnAlarm: input.permissions?.modifyOwnAlarm !== false,
        cancelOwnAlarm: input.permissions?.cancelOwnAlarm !== false,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    if (row.scope === 'TIME_RANGE') {
      const from = Date.parse(String(input.validFrom || ''))
      const until = Date.parse(String(input.validUntil || ''))
      if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) {
        deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '请填写有效的起止时间')
      }
      row.validFrom = new Date(from).toISOString()
      row.validUntil = new Date(until).toISOString()
    } else if (row.scope === 'ENTITY_BOUND') {
      applyEntity(row, input, nowIso)
    }
    if (!row.permissions.createAlarm && !row.permissions.modifyOwnAlarm && !row.permissions.cancelOwnAlarm) {
      deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '至少保留一项权限')
    }
    db.grants.push(row)
    audit(db, {
      action: 'grant.created',
      ownerUserId: actor.sub,
      actorUserId: actor.sub,
      grantId: row.id,
      summary: `授权 ${row.granteeName}（${row.scope}）`,
      at: nowIso,
    })
    return row
  })
  return grant
}

export async function updateGrant(config: DaysConfig, actor: Actor, id: string, input: GrantInput & { status?: string; entityActive?: boolean; cancelFuture?: boolean }, now = new Date()) {
  const nowIso = now.toISOString()
  const result = await withAlarmDb(config, (db) => {
    const grant = requireGrant(db, id, actor.sub)
    if (grant.status === 'REVOKED') deny('REMOTE_ALARM_GRANT_REVOKED')
    if (input.status === 'PAUSED' || input.status === 'ACTIVE') {
      grant.status = input.status
      audit(db, {
        action: input.status === 'PAUSED' ? 'grant.paused' : 'grant.resumed',
        ownerUserId: actor.sub,
        actorUserId: actor.sub,
        grantId: grant.id,
        summary: input.status === 'PAUSED' ? '暂停授权' : '恢复授权',
        at: nowIso,
      })
    }
    if (input.granteeName) grant.granteeName = cleanText(input.granteeName, 40)
    if (input.permissions) {
      grant.permissions = {
        createAlarm: input.permissions.createAlarm ?? grant.permissions.createAlarm,
        modifyOwnAlarm: input.permissions.modifyOwnAlarm ?? grant.permissions.modifyOwnAlarm,
        cancelOwnAlarm: input.permissions.cancelOwnAlarm ?? grant.permissions.cancelOwnAlarm,
      }
    }
    if (grant.scope === 'TIME_RANGE' && (input.validFrom || input.validUntil)) {
      const from = Date.parse(input.validFrom || grant.validFrom || '')
      const until = Date.parse(input.validUntil || grant.validUntil || '')
      if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '起止时间无效')
      grant.validFrom = new Date(from).toISOString()
      grant.validUntil = new Date(until).toISOString()
    }
    if (grant.scope === 'ENTITY_BOUND' && (input.entityStartsAt || input.entityEndsAt || input.leadHours != null || input.trailHours != null || input.entityTitle || input.entityActive === false)) {
      grant.entityStartsAt = input.entityStartsAt || grant.entityStartsAt
      grant.entityEndsAt = input.entityEndsAt || grant.entityEndsAt
      if (input.leadHours != null) grant.leadHours = hours(input.leadHours)
      if (input.trailHours != null) grant.trailHours = hours(input.trailHours)
      if (input.entityTitle) grant.entityTitle = cleanText(input.entityTitle, 80)
      if (input.entityActive === false) grant.entityActive = false
      if (grant.entityActive) {
        const window = computeEntityWindow({
          createdAt: grant.createdAt,
          entityStartsAt: grant.entityStartsAt,
          entityEndsAt: grant.entityEndsAt,
          leadHours: grant.leadHours,
          trailHours: grant.trailHours,
        })
        grant.validFrom = window.validFrom
        grant.validUntil = window.validUntil
        if (grant.status === 'EXPIRED') grant.status = 'ACTIVE'
      } else {
        grant.status = 'EXPIRED'
        if (input.cancelFuture !== false) cancelOpen(db, actor.sub, actor.sub, grant.id, nowIso, '事项取消，未来闹钟已取消')
        audit(db, { action: 'grant.expired', ownerUserId: actor.sub, actorUserId: actor.sub, grantId: grant.id, summary: '绑定事项已取消', at: nowIso })
      }
    }
    grant.updatedAt = nowIso
    audit(db, { action: 'grant.updated', ownerUserId: actor.sub, actorUserId: actor.sub, grantId: grant.id, summary: '更新授权', at: nowIso })
    return grant
  })
  if (result.status === 'EXPIRED') void wakeOwnerDevices(config, actor.sub).catch(() => undefined)
  return result
}

export async function revokeGrant(config: DaysConfig, actor: Actor, id: string, cancelFuture: boolean, now = new Date()) {
  const nowIso = now.toISOString()
  const grant = await withAlarmDb(config, (db) => {
    const row = requireGrant(db, id, actor.sub)
    row.status = 'REVOKED'
    row.revokedAt = nowIso
    row.updatedAt = nowIso
    audit(db, { action: 'grant.revoked', ownerUserId: actor.sub, actorUserId: actor.sub, grantId: row.id, summary: cancelFuture ? '撤销授权并取消未来闹钟' : '撤销授权，保留已设置闹钟', at: nowIso })
    if (cancelFuture) cancelOpen(db, actor.sub, actor.sub, row.id, nowIso, '授权撤销，未来闹钟已取消')
    return row
  })
  if (cancelFuture) void wakeOwnerDevices(config, actor.sub).catch(() => undefined)
  return grant
}

export async function listGrants(config: DaysConfig, actor: Actor) {
  const db = await readAlarmDb(config)
  return {
    given: db.grants.filter((grant) => grant.ownerUserId === actor.sub),
    received: db.grants.filter((grant) => grant.granteeUserId === actor.sub).map(granteeView),
  }
}

function granteeView(grant: RemoteAlarmGrant) {
  return {
    id: grant.id,
    ownerUserId: grant.ownerUserId,
    ownerName: grant.ownerName,
    scope: grant.scope,
    status: grant.status,
    validFrom: grant.validFrom,
    validUntil: grant.validUntil,
    entityType: grant.entityType,
    entityTitle: grant.entityTitle,
    permissions: grant.permissions,
  }
}

export async function listAllowedTargets(config: DaysConfig, actor: Actor, now = new Date()) {
  const db = await readAlarmDb(config)
  const nowMs = now.getTime()
  return db.grants
    .filter((grant) => grant.granteeUserId === actor.sub)
    .map((grant) => {
      const reason = grantBlockReason(grant, nowMs, prefsOf(db.prefs, grant.ownerUserId))
      return {
        ...granteeView(grant),
        canCreate: reason == null && grant.permissions.createAlarm,
        blockReason: reason,
        device: publicDeviceStatus(db.devices.filter((device) => device.userId === grant.ownerUserId)),
      }
    })
    .filter((grant) => grant.status !== 'REVOKED')
}

export async function createAlarm(config: DaysConfig, actor: Actor, input: AlarmInput, now = new Date()) {
  const grantId = cleanText(input.grantId, 40)
  const ownerUserId = cleanText(input.ownerUserId, 84)
  const title = cleanText(input.title, 80)
  const note = cleanText(input.note, 500)
  const nonce = cleanText(input.clientNonce, 80)
  if (!grantId || !ownerUserId || !title || !nonce) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '缺少授权、标题或请求编号')
  const timezone = isTimeZone(String(input.timezone || '')) ? String(input.timezone) : ''
  if (!timezone) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '时区无效')
  const triggerMs = Date.parse(String(input.triggerAt || ''))
  if (!Number.isFinite(triggerMs)) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '闹钟时间无效')
  const triggerAt = new Date(triggerMs).toISOString()
  const nowMs = now.getTime()
  const requestHash = hashRequest({ ownerUserId, grantId, triggerAt, timezone, title, note })
  const created = await withAlarmDb(config, (db) => {
    const priorId = db.nonces[`${actor.sub}\n${nonce}`]
    if (priorId) {
      const prior = db.alarms.find((alarm) => alarm.id === priorId)
      if (!prior) deny('REMOTE_ALARM_OUT_OF_SCOPE', 409, '重复请求')
      if (prior.requestHash !== requestHash) deny('REMOTE_ALARM_OUT_OF_SCOPE', 409, '重复请求的内容不一致')
      return { alarm: prior, replay: true }
    }
    const grant = db.grants.find((item) => item.id === grantId)
    if (!grant || grant.granteeUserId !== actor.sub || grant.ownerUserId !== ownerUserId) {
      deny('REMOTE_ALARM_NOT_AUTHORIZED')
    }
    const prefs = prefsOf(db.prefs, grant.ownerUserId)
    const reason = grantBlockReason(grant, nowMs, prefs)
    if (reason) deny(reason, reason === 'REMOTE_ALARM_PAUSED' ? 403 : 403)
    if (!grant.permissions.createAlarm) deny('REMOTE_ALARM_NOT_AUTHORIZED')
    if (input.entityId && grant.scope === 'ENTITY_BOUND' && cleanText(input.entityId, 80) !== grant.entityId) {
      deny('REMOTE_ALARM_OUT_OF_SCOPE', 403, '不能关联授权以外的事项')
    }
    assertTriggerAllowed({ triggerAt, now: nowMs, grant, prefs })
    assertRateLimit(db.alarms, grant.ownerUserId, nowMs, prefs)
    const alarm: RemoteAlarm = {
      id: `ra_${randomToken(12)}`,
      ownerUserId: grant.ownerUserId,
      creatorUserId: actor.sub,
      creatorName: cleanText(actor.name, 40) || '好友',
      grantId: grant.id,
      triggerAt,
      timezone,
      title,
      note: note || undefined,
      entityType: grant.scope === 'ENTITY_BOUND' ? grant.entityType : cleanText(input.entityType, 32) || undefined,
      entityId: grant.scope === 'ENTITY_BOUND' ? grant.entityId : cleanText(input.entityId, 80) || undefined,
      entityTitle: cleanText(input.entityTitle, 80) || grant.entityTitle,
      vibrate: input.vibrate !== false,
      sound: input.sound !== false,
      allowSnooze: input.allowSnooze !== false,
      status: 'DELIVERY_PENDING',
      revision: 1,
      requestHash,
      clientNonce: nonce,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    }
    db.alarms.push(alarm)
    db.nonces[`${actor.sub}\n${nonce}`] = alarm.id
    audit(db, { action: 'alarm.created', ownerUserId: alarm.ownerUserId, actorUserId: actor.sub, grantId: grant.id, alarmId: alarm.id, summary: `${alarm.creatorName} 创建闹钟 ${alarm.title}`, at: alarm.createdAt })
    return { alarm, replay: false }
  })
  if (!created.replay) {
    void wakeOwnerDevices(config, created.alarm.ownerUserId).catch((error) => {
      log('warn', 'remote alarm wake failed', { reason: error instanceof Error ? error.message : 'error' })
    })
  }
  return publicAlarm(created.alarm)
}

export async function updateAlarm(config: DaysConfig, actor: Actor, id: string, input: AlarmInput, now = new Date()) {
  const nowMs = now.getTime()
  const nowIso = new Date(nowMs).toISOString()
  const alarm = await withAlarmDb(config, (db) => {
    const row = db.alarms.find((item) => item.id === id)
    if (!row) deny('REMOTE_ALARM_NOT_AUTHORIZED', 404, '找不到闹钟')
    if (!OPEN_ALARM_STATUSES.includes(row.status)) deny('REMOTE_ALARM_OUT_OF_SCOPE', 409, '闹钟已结束')
    const grant = db.grants.find((item) => item.id === row.grantId)
    if (!grant) deny('REMOTE_ALARM_NOT_AUTHORIZED')
    const isOwner = actor.sub === row.ownerUserId
    const isCreator = actor.sub === row.creatorUserId
    if (!isOwner && !isCreator) deny('REMOTE_ALARM_NOT_AUTHORIZED')
    if (isCreator && !isOwner) {
      if (!grant.permissions.modifyOwnAlarm) deny('REMOTE_ALARM_NOT_AUTHORIZED')
      const reason = grantBlockReason(grant, nowMs, prefsOf(db.prefs, row.ownerUserId))
      if (reason) deny(reason)
    }
    if (input.ownerUserId && cleanText(input.ownerUserId, 84) !== row.ownerUserId) deny('REMOTE_ALARM_NOT_AUTHORIZED')
    if (input.triggerAt || input.timezone) {
      const triggerMs = input.triggerAt ? Date.parse(input.triggerAt) : Date.parse(row.triggerAt)
      if (!Number.isFinite(triggerMs)) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '闹钟时间无效')
      const triggerAt = new Date(triggerMs).toISOString()
      const timezone = input.timezone || row.timezone
      if (!isTimeZone(timezone)) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '时区无效')
      assertTriggerAllowed({ triggerAt, now: nowMs, grant, prefs: prefsOf(db.prefs, row.ownerUserId) })
      row.triggerAt = triggerAt
      row.timezone = timezone
    }
    if (input.title) row.title = cleanText(input.title, 80)
    if (input.note != null) row.note = cleanText(input.note, 500) || undefined
    if (input.vibrate != null) row.vibrate = Boolean(input.vibrate)
    if (input.sound != null) row.sound = Boolean(input.sound)
    if (input.allowSnooze != null) row.allowSnooze = Boolean(input.allowSnooze)
    row.status = 'DELIVERY_PENDING'
    row.revision += 1
    row.updatedAt = nowIso
    audit(db, { action: 'alarm.updated', ownerUserId: row.ownerUserId, actorUserId: actor.sub, grantId: row.grantId, alarmId: row.id, summary: '修改闹钟', at: nowIso })
    return row
  })
  void wakeOwnerDevices(config, alarm.ownerUserId).catch(() => undefined)
  return publicAlarm(alarm)
}

export async function cancelAlarm(config: DaysConfig, actor: Actor, id: string, now = new Date()) {
  const nowIso = now.toISOString()
  const alarm = await withAlarmDb(config, (db) => {
    const row = db.alarms.find((item) => item.id === id)
    if (!row) deny('REMOTE_ALARM_NOT_AUTHORIZED', 404, '找不到闹钟')
    const grant = db.grants.find((item) => item.id === row.grantId)
    const isOwner = actor.sub === row.ownerUserId
    const isCreator = actor.sub === row.creatorUserId
    if (!isOwner && !(isCreator && grant?.permissions.cancelOwnAlarm)) deny('REMOTE_ALARM_NOT_AUTHORIZED')
    if (!OPEN_ALARM_STATUSES.includes(row.status) && row.status !== 'FAILED') {
      return row
    }
    row.status = 'CANCELLED'
    row.updatedAt = nowIso
    row.revision += 1
    audit(db, { action: 'alarm.cancelled', ownerUserId: row.ownerUserId, actorUserId: actor.sub, grantId: row.grantId, alarmId: row.id, summary: isOwner ? '本人取消闹钟' : '设置者取消闹钟', at: nowIso })
    return row
  })
  void wakeOwnerDevices(config, alarm.ownerUserId).catch(() => undefined)
  return publicAlarm(alarm)
}

export async function listAlarms(config: DaysConfig, actor: Actor, role: string) {
  const db = await readAlarmDb(config)
  const rows = db.alarms.filter((alarm) => {
    if (role === 'incoming') return alarm.ownerUserId === actor.sub
    if (role === 'outgoing') return alarm.creatorUserId === actor.sub
    return alarm.ownerUserId === actor.sub || alarm.creatorUserId === actor.sub
  })
  return rows.map(publicAlarm)
}

export async function reportAlarm(config: DaysConfig, actor: Actor, id: string, status: AlarmStatus, failureReason: string | undefined, now = new Date()) {
  const allowed: AlarmStatus[] = ['DELIVERED', 'DEVICE_SCHEDULED', 'FIRED', 'FAILED', 'MISSED']
  if (!allowed.includes(status)) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '状态无效')
  const nowIso = now.toISOString()
  return withAlarmDb(config, (db) => {
    const row = db.alarms.find((item) => item.id === id)
    if (!row || row.ownerUserId !== actor.sub) deny('REMOTE_ALARM_NOT_AUTHORIZED', 404, '只能由接收方手机回执')
    if (row.status === 'CANCELLED' || row.status === 'EXPIRED') {
      deny('REMOTE_ALARM_GRANT_REVOKED', 409, '闹钟已取消')
    }
    if (row.status === 'FIRED' && status !== 'FIRED') return publicAlarm(row)
    if (status === 'MISSED' || status === 'FAILED') row.failureReason = cleanText(failureReason, 160) || status
    if (status === 'DEVICE_SCHEDULED' && Date.parse(row.triggerAt) <= now.getTime()) {
      row.status = 'MISSED'
      row.failureReason = '触发时间已过，未注册响铃'
    } else {
      row.status = status
    }
    row.updatedAt = nowIso
    row.revision += 1
    const action = row.status === 'DEVICE_SCHEDULED' ? 'alarm.scheduled' : row.status === 'FIRED' ? 'alarm.fired' : row.status === 'FAILED' ? 'alarm.failed' : row.status === 'MISSED' ? 'alarm.missed' : 'alarm.delivered'
    audit(db, { action, ownerUserId: row.ownerUserId, actorUserId: actor.sub, grantId: row.grantId, alarmId: row.id, summary: action, at: nowIso })
    return publicAlarm(row)
  })
}

export async function getSettings(config: DaysConfig, actor: Actor) {
  const db = await readAlarmDb(config)
  return prefsOf(db.prefs, actor.sub)
}

export async function saveSettings(config: DaysConfig, actor: Actor, input: Partial<OwnerPrefs>) {
  return withAlarmDb(config, (db) => {
    const next = clampPrefs(input, prefsOf(db.prefs, actor.sub))
    db.prefs[actor.sub] = next
    audit(db, { action: 'settings.updated', ownerUserId: actor.sub, actorUserId: actor.sub, summary: '更新接收限制', at: new Date().toISOString() })
    return next
  })
}

export async function pauseAll(config: DaysConfig, actor: Actor, cancelFuture: boolean, now = new Date()) {
  const nowIso = now.toISOString()
  const result = await withAlarmDb(config, (db) => {
    const prefs = prefsOf(db.prefs, actor.sub)
    prefs.pausedAll = true
    db.prefs[actor.sub] = prefs
    const cancelled = cancelFuture ? cancelOpen(db, actor.sub, actor.sub, undefined, nowIso, '暂停全部好友远程闹钟') : 0
    audit(db, { action: 'pause_all', ownerUserId: actor.sub, actorUserId: actor.sub, summary: cancelFuture ? '暂停并取消未来闹钟' : '暂停新的远程闹钟', at: nowIso })
    return { prefs, cancelled }
  })
  if (cancelFuture) void wakeOwnerDevices(config, actor.sub).catch(() => undefined)
  return result
}

export async function resumeAll(config: DaysConfig, actor: Actor, now = new Date()) {
  return withAlarmDb(config, (db) => {
    const prefs = prefsOf(db.prefs, actor.sub)
    prefs.pausedAll = false
    db.prefs[actor.sub] = prefs
    audit(db, { action: 'resume_all', ownerUserId: actor.sub, actorUserId: actor.sub, summary: '恢复接收好友远程闹钟', at: now.toISOString() })
    return prefs
  })
}

export async function listAudit(config: DaysConfig, actor: Actor) {
  const db = await readAlarmDb(config)
  return db.audit.filter((event) => event.ownerUserId === actor.sub || event.actorUserId === actor.sub).slice(-200).reverse()
}

export async function registerDevice(config: DaysConfig, actor: Actor, input: { id?: string; platform?: string; pushToken?: string; pushProvider?: string; gmsAvailable?: boolean; region?: string; appVersion?: string; capabilities?: unknown }) {
  const platform: DevicePlatform | '' = input.platform === 'android' || input.platform === 'ios' || input.platform === 'web' ? input.platform : ''
  if (!platform) deny('REMOTE_ALARM_OUT_OF_SCOPE', 400, '设备平台无效')
  const capabilities = normalizeCapabilities(platform, input.capabilities)
  const nowIso = new Date().toISOString()
  const region: PushRegion = input.region === 'cn' || input.region === 'global' ? input.region : 'unknown'
  const hinted = typeof input.pushProvider === 'string' && isPushProvider(input.pushProvider) ? input.pushProvider : 'none'
  return withAlarmDb(config, (db) => {
    const token = cleanText(input.pushToken, 4096)
    const provider = choosePushProvider({
      platform,
      region,
      gms: input.gmsAvailable === true,
      tokens: token && hinted !== 'none' ? { [hinted]: token } : token ? { fcm: token } : {},
    })
    if (token) {
      for (const device of db.devices) {
        if (device.pushToken === token && device.userId !== actor.sub) {
          device.pushToken = ''
          device.enabled = false
        }
      }
    }
    const existing = db.devices.find((device) => device.userId === actor.sub && (device.id === input.id || (token && device.pushToken === token)))
    if (existing) {
      existing.platform = platform
      existing.pushToken = token
      existing.pushProvider = provider
      existing.gmsAvailable = input.gmsAvailable === true
      existing.region = region
      existing.appVersion = cleanText(input.appVersion, 40)
      existing.lastSeenAt = nowIso
      existing.enabled = true
      existing.capabilities = capabilities
      return publicDevice(existing)
    }
    const device: UserDevice = {
      id: `dv_${randomToken(10)}`,
      userId: actor.sub,
      platform,
      pushToken: token,
      pushProvider: provider,
      gmsAvailable: input.gmsAvailable === true,
      region,
      appVersion: cleanText(input.appVersion, 40),
      lastSeenAt: nowIso,
      enabled: true,
      capabilities,
    }
    db.devices.push(device)
    return publicDevice(device)
  })
}

function publicDevice(device: UserDevice) {
  return {
    id: device.id,
    platform: device.platform,
    appVersion: device.appVersion,
    lastSeenAt: device.lastSeenAt,
    enabled: device.enabled,
    hasToken: Boolean(device.pushToken),
    pushProvider: device.pushProvider || 'none',
    capabilities: publicDeviceStatus([device]),
  }
}

export async function deviceStatusFor(config: DaysConfig, actor: Actor, userId: string) {
  const target = cleanText(userId, 84)
  if (!isAccountSub(target)) deny('REMOTE_ALARM_NOT_AUTHORIZED', 400, '账号无效')
  const db = await readAlarmDb(config)
  if (target !== actor.sub) {
    const alarmOk = db.grants.some((grant) => grant.ownerUserId === target && grant.granteeUserId === actor.sub && grant.status !== 'REVOKED')
    const locationDb = await readLocationDb(config)
    const locationOk = locationDb.grants.some((grant) => grant.ownerUserId === target && grant.granteeUserId === actor.sub && grant.status !== 'REVOKED')
    if (!alarmOk && !locationOk) deny('REMOTE_ALARM_NOT_AUTHORIZED', 403, '对方没有向你公开设备状态')
  }
  return publicDeviceStatus(db.devices.filter((device) => device.userId === target))
}

export async function removeDevice(config: DaysConfig, actor: Actor, id: string) {
  return withAlarmDb(config, (db) => {
    const device = db.devices.find((item) => item.id === id && item.userId === actor.sub)
    if (!device) deny('REMOTE_ALARM_NOT_AUTHORIZED', 404, '找不到设备')
    device.enabled = false
    device.pushToken = ''
    return { id: device.id, enabled: false }
  })
}

export type ContactHit = { sub: string; name: string; kkNumber: number | null; username: string | null; avatar: string }

export async function searchContacts(config: DaysConfig, actor: Actor, query: string): Promise<{ users: ContactHit[]; directory: 'ok' | 'unconfigured' | 'unavailable' }> {
  const q = cleanText(query, 80)
  if (q.length < 1) return { users: [], directory: 'ok' }
  const users: ContactHit[] = []
  if (isAccountSub(q) && q !== actor.sub) {
    const known = await readUser(config, q)
    if (known) users.push({ sub: known.accountSub, name: known.displayName || '用户', kkNumber: null, username: null, avatar: known.avatarUrl || '' })
  }
  if (!config.accountDirectoryUrl || !config.accountInternalToken) {
    return { users, directory: users.length ? 'ok' : 'unconfigured' }
  }
  try {
    const url = new URL(config.accountDirectoryUrl)
    if (/^\d{1,12}$/.test(q)) url.searchParams.set('kkNumber', q)
    else if (q.startsWith('usr_')) url.searchParams.set('q', q)
    else url.searchParams.set('q', q)
    url.searchParams.set('limit', '8')
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${config.accountInternalToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return { users, directory: 'unavailable' }
    const body = (await response.json().catch(() => ({}))) as { users?: unknown }
    if (!Array.isArray(body.users)) return { users, directory: 'ok' }
    for (const raw of body.users) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      const sub = typeof row.sub === 'string' ? row.sub : ''
      if (!isAccountSub(sub) || sub === actor.sub || users.some((item) => item.sub === sub)) continue
      users.push({
        sub,
        name: typeof row.name === 'string' && row.name ? row.name.slice(0, 40) : '用户',
        kkNumber: typeof row.kk_number === 'number' ? row.kk_number : null,
        username: typeof row.username === 'string' ? row.username.slice(0, 40) : null,
        avatar: typeof row.avatar === 'string' ? row.avatar.slice(0, 300) : '',
      })
    }
    return { users: users.slice(0, 8), directory: 'ok' }
  } catch {
    return { users, directory: 'unavailable' }
  }
}
