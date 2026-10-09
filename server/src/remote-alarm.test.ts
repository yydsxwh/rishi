import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createDaysServer } from './index'
import { loadConfig, type DaysConfig } from './config'
import { RemoteAlarmDenied } from './remote-alarm-domain'
import { issueSession, persistSession } from './session'
import {
  cancelAlarm,
  createAlarm,
  createGrant,
  listPending,
  pauseAll,
  registerDevice,
  reportAlarm,
  resetPendingRateForTests,
  revokeGrant,
  updateAlarm,
  updateGrant,
  type Actor,
} from './remote-alarm-service'

const NOW = new Date('2026-10-08T02:00:00.000Z')
const LATER = '2026-10-08T04:30:00.000Z'
const owner: Actor = { sub: 'usr_owner1', name: '业主' }
const alice: Actor = { sub: 'usr_alice1', name: '好友甲' }
const bob: Actor = { sub: 'usr_bobbbb', name: '好友乙' }

async function config(): Promise<{ config: DaysConfig; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'rishi-alarm-'))
  return {
    config: loadConfig({
      DAYS_SYNC_DATA_DIR: dir,
      RISHI_SESSION_SECRET: 'test-secret-test-secret-test-secret',
      RISHI_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
      ACCOUNT_DIRECTORY_URL: '',
    }),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}

function alarmBody(grantId: string, ownerUserId: string, nonce: string, triggerAt = LATER) {
  return {
    ownerUserId,
    grantId,
    triggerAt,
    timezone: 'Asia/Shanghai',
    title: '起床啦',
    note: '中午一起吃饭',
    clientNonce: nonce,
  }
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    assert.ok(error instanceof RemoteAlarmDenied)
    return error.code
  }
  assert.fail('expected denial')
}

test('未授权好友无法创建远程闹钟', async () => {
  const ctx = await config()
  try {
    assert.equal(
      await codeOf(() => createAlarm(ctx.config, alice, alarmBody('rg_missing', owner.sub, 'n1'), NOW)),
      'REMOTE_ALARM_NOT_AUTHORIZED',
    )
  } finally {
    await ctx.cleanup()
  }
})

test('时间授权未开始、过期、撤销都不能创建，永久授权可以', async () => {
  const ctx = await config()
  try {
    const future = await createGrant(ctx.config, owner, {
      granteeUserId: alice.sub,
      granteeName: alice.name,
      scope: 'TIME_RANGE',
      validFrom: '2026-10-09T00:00:00.000Z',
      validUntil: '2026-10-09T12:00:00.000Z',
    }, NOW)
    assert.equal(await codeOf(() => createAlarm(ctx.config, alice, alarmBody(future.id, owner.sub, 'future'), NOW)), 'REMOTE_ALARM_OUT_OF_SCOPE')

    const expired = await createGrant(ctx.config, owner, {
      granteeUserId: alice.sub,
      scope: 'TIME_RANGE',
      validFrom: '2026-10-01T00:00:00.000Z',
      validUntil: '2026-10-02T00:00:00.000Z',
    }, NOW)
    assert.equal(await codeOf(() => createAlarm(ctx.config, alice, alarmBody(expired.id, owner.sub, 'expired'), NOW)), 'REMOTE_ALARM_GRANT_EXPIRED')

    const revoked = await createGrant(ctx.config, owner, {
      granteeUserId: alice.sub,
      scope: 'PERMANENT',
    }, NOW)
    await revokeGrant(ctx.config, owner, revoked.id, true, NOW)
    assert.equal(await codeOf(() => createAlarm(ctx.config, alice, alarmBody(revoked.id, owner.sub, 'revoked'), NOW)), 'REMOTE_ALARM_GRANT_REVOKED')

    const permanent = await createGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT' }, NOW)
    const alarm = await createAlarm(ctx.config, alice, alarmBody(permanent.id, owner.sub, 'ok'), NOW)
    assert.equal(alarm.status, 'DELIVERY_PENDING')
    assert.equal(alarm.deviceReady, false)
    assert.equal(alarm.acceptance, 'sent')
  } finally {
    await ctx.cleanup()
  }
})

test('跟随事项在有效期内可创建，事项取消后不可创建', async () => {
  const ctx = await config()
  try {
    const grant = await createGrant(ctx.config, owner, {
      granteeUserId: alice.sub,
      scope: 'ENTITY_BOUND',
      entityType: 'todo',
      entityId: 'todo_lunch',
      entityTitle: '中午吃饭',
      entityStartsAt: '2026-10-08T04:00:00.000Z',
      entityEndsAt: '2026-10-08T05:00:00.000Z',
      leadHours: 20,
      trailHours: 2,
    }, NOW)
    const alarm = await createAlarm(ctx.config, alice, alarmBody(grant.id, owner.sub, 'entity', '2026-10-08T03:30:00.000Z'), NOW)
    assert.equal(alarm.entityTitle, '中午吃饭')
    await updateGrant(ctx.config, owner, grant.id, { entityActive: false, cancelFuture: true }, NOW)
    assert.equal(await codeOf(() => createAlarm(ctx.config, alice, alarmBody(grant.id, owner.sub, 'after'), NOW)), 'REMOTE_ALARM_GRANT_EXPIRED')
    const incoming = await cancelAlarm(ctx.config, owner, alarm.id, NOW)
    assert.equal(incoming.status, 'CANCELLED')
  } finally {
    await ctx.cleanup()
  }
})

test('甲不能改乙的闹钟，本人可以取消自己的远程闹钟', async () => {
  const ctx = await config()
  try {
    const grantA = await createGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT' }, NOW)
    const grantB = await createGrant(ctx.config, owner, { granteeUserId: bob.sub, scope: 'PERMANENT' }, NOW)
    const alarm = await createAlarm(ctx.config, alice, alarmBody(grantA.id, owner.sub, 'by-a'), NOW)
    assert.equal(
      await codeOf(() => updateAlarm(ctx.config, bob, alarm.id, { title: '被改掉', grantId: grantB.id }, NOW)),
      'REMOTE_ALARM_NOT_AUTHORIZED',
    )
    const cancelled = await cancelAlarm(ctx.config, owner, alarm.id, NOW)
    assert.equal(cancelled.status, 'CANCELLED')
  } finally {
    await ctx.cleanup()
  }
})

test('接收上限生效，总开关关闭后不能再设', async () => {
  const ctx = await config()
  try {
    const grant = await createGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT' }, NOW)
    for (let i = 0; i < 3; i += 1) {
      await createAlarm(ctx.config, alice, alarmBody(grant.id, owner.sub, `rate-${i}`, `2026-10-08T0${3 + i}:00:00.000Z`), NOW)
    }
    assert.equal(await codeOf(() => createAlarm(ctx.config, alice, alarmBody(grant.id, owner.sub, 'rate-4', '2026-10-08T08:00:00.000Z'), NOW)), 'REMOTE_ALARM_RATE_LIMITED')
    const other = await config()
    try {
      const quiet = await createGrant(other.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT' }, NOW)
      await pauseAll(other.config, owner, false, NOW)
      assert.equal(await codeOf(() => createAlarm(other.config, alice, alarmBody(quiet.id, owner.sub, 'paused'), NOW)), 'REMOTE_ALARM_PAUSED')
    } finally {
      await other.cleanup()
    }
  } finally {
    await ctx.cleanup()
  }
})

test('HTTP 未登录拒绝，登录后创建仍只表示已发送', async () => {
  const ctx = await config()
  const server = createDaysServer(ctx.config)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port
  try {
    const anon = await fetch(`http://127.0.0.1:${port}/api/days/remote-alarm/grants`)
    assert.equal(anon.status, 401)
    const issued = issueSession({ sub: owner.sub, name: owner.name, email: '', avatarUrl: '' }, ctx.config)
    await persistSession(ctx.config, issued.session)
    const grantRes = await fetch(`http://127.0.0.1:${port}/api/days/remote-alarm/grants`, {
      method: 'POST',
      headers: { authorization: `Bearer ${issued.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ granteeUserId: alice.sub, granteeName: alice.name, scope: 'PERMANENT' }),
    })
    assert.equal(grantRes.status, 201)
    const aliceSession = issueSession({ sub: alice.sub, name: alice.name, email: '', avatarUrl: '' }, ctx.config)
    await persistSession(ctx.config, aliceSession.session)
    const grantId = ((await grantRes.json()) as { grant: { id: string } }).grant.id
    const alarmRes = await fetch(`http://127.0.0.1:${port}/api/remote-alarm/alarms`, {
      method: 'POST',
      headers: { authorization: `Bearer ${aliceSession.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...alarmBody(grantId, owner.sub, 'http-1'), triggerAt: '2027-01-08T04:30:09.000Z' }),
    })
    assert.equal(alarmRes.status, 201)
    const payload = (await alarmRes.json()) as { alarm: { status: string; deviceReady: boolean; acceptance: string; triggerAt: string } }
    assert.equal(payload.alarm.status, 'DELIVERY_PENDING')
    assert.equal(payload.alarm.triggerAt, '2027-01-08T04:30:09.000Z')
    assert.equal(payload.alarm.deviceReady, false)
    assert.equal(payload.alarm.acceptance, 'sent')
    const pendingAnon = await fetch(`http://127.0.0.1:${port}/api/days/remote-alarm/pending`)
    assert.equal(pendingAnon.status, 401)
    const pending = await fetch(`http://127.0.0.1:${port}/api/days/remote-alarm/pending`, {
      headers: { authorization: `Bearer ${issued.token}` },
    })
    assert.equal(pending.status, 200)
    const pendingBody = (await pending.json()) as { alarms: { id: string; status: string }[]; device: { registered: boolean } }
    assert.equal(pendingBody.alarms.length, 1)
    assert.equal(pendingBody.alarms[0].status, 'DELIVERY_PENDING')
    assert.equal(pendingBody.device.registered, false)
  } finally {
    server.close()
    await ctx.cleanup()
  }
})

test('pending 只给出仍可登记的闹钟，回执后不再返回，重复请求保持同一条', async () => {
  resetPendingRateForTests()
  const ctx = await config()
  try {
    const grant = await createGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT' }, NOW)
    const first = await createAlarm(ctx.config, alice, alarmBody(grant.id, owner.sub, 'same'), NOW)
    const replay = await createAlarm(ctx.config, alice, alarmBody(grant.id, owner.sub, 'same'), NOW)
    assert.equal(replay.id, first.id)
    await registerDevice(ctx.config, owner, { platform: 'android', appVersion: '2.6.1', capabilities: { remoteAlarm: { exactAlarmPermission: 'granted', notificationPermission: 'granted' } } })
    const waiting = await listPending(ctx.config, owner, NOW)
    assert.equal(waiting.alarms.length, 1)
    assert.equal(waiting.device.registered, true)
    assert.equal(waiting.device.exactAlarmPermission, 'granted')
    const stranger = await listPending(ctx.config, bob, NOW)
    assert.equal(stranger.alarms.length, 0)

    const scheduled = await reportAlarm(ctx.config, owner, first.id, 'DEVICE_SCHEDULED', undefined, NOW)
    assert.equal(scheduled.status, 'DEVICE_SCHEDULED')
    assert.equal(scheduled.deviceReady, true)
    const again = await reportAlarm(ctx.config, owner, first.id, 'DEVICE_SCHEDULED', undefined, NOW)
    assert.equal(again.revision, scheduled.revision)
    const done = await listPending(ctx.config, owner, NOW)
    assert.equal(done.alarms.length, 0)

    const pausedGrant = await createGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT' }, NOW)
    const held = await createAlarm(ctx.config, alice, alarmBody(pausedGrant.id, owner.sub, 'hold', '2026-10-08T05:00:00.000Z'), NOW)
    await updateGrant(ctx.config, owner, pausedGrant.id, { status: 'PAUSED' }, NOW)
    assert.equal((await listPending(ctx.config, owner, NOW)).alarms.some((alarm) => alarm.id === held.id), false)
    assert.equal(await codeOf(() => reportAlarm(ctx.config, owner, held.id, 'DEVICE_SCHEDULED', undefined, NOW)), 'REMOTE_ALARM_NOT_AUTHORIZED')

    const ranged = await createGrant(ctx.config, owner, {
      granteeUserId: alice.sub,
      scope: 'TIME_RANGE',
      validFrom: '2026-10-08T00:00:00.000Z',
      validUntil: '2026-10-08T06:00:00.000Z',
    }, NOW)
    const expiring = await createAlarm(ctx.config, alice, alarmBody(ranged.id, owner.sub, 'expiring', '2026-10-08T05:30:00.000Z'), NOW)
    const later = new Date('2026-10-08T07:00:00.000Z')
    assert.equal((await listPending(ctx.config, owner, later)).alarms.some((alarm) => alarm.id === expiring.id), false)

    const bound = await createGrant(ctx.config, owner, {
      granteeUserId: alice.sub,
      scope: 'ENTITY_BOUND',
      entityType: 'exam',
      entityId: 'exam_1',
      entityTitle: '期末',
      entityStartsAt: '2026-10-08T04:00:00.000Z',
      entityEndsAt: '2026-10-08T05:00:00.000Z',
      leadHours: 1,
      trailHours: 0,
    }, NOW)
    const inside = new Date('2026-10-08T03:10:00.000Z')
    await createAlarm(ctx.config, alice, alarmBody(bound.id, owner.sub, 'bound', '2026-10-08T03:30:00.000Z'), inside)
    const outside = new Date('2026-10-08T06:30:00.000Z')
    const outsidePending = await listPending(ctx.config, owner, outside)
    assert.equal(outsidePending.alarms.some((alarm) => alarm.grantId === bound.id), false)

    await revokeGrant(ctx.config, owner, grant.id, false, NOW)
    assert.equal(await codeOf(() => reportAlarm(ctx.config, owner, first.id, 'DELIVERED', undefined, NOW)), 'REMOTE_ALARM_GRANT_REVOKED')
  } finally {
    await ctx.cleanup()
  }
})

test('pending 拉取有频率上限', async () => {
  resetPendingRateForTests()
  const ctx = await config()
  const limited: Actor = { sub: 'usr_rateown', name: '限流' }
  try {
    for (let i = 0; i < 40; i += 1) await listPending(ctx.config, limited, NOW)
    assert.equal(await codeOf(() => listPending(ctx.config, limited, NOW)), 'REMOTE_ALARM_RATE_LIMITED')
  } finally {
    await ctx.cleanup()
  }
})
