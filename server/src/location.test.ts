import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resetResolveLimits, resolveAccountIdentifier } from './account-resolve'
import { loadConfig, type DaysConfig } from './config'
import { createDaysServer } from './index'
import { LocationDenied, clipCoordinate } from './location-domain'
import {
  createLocationGrant,
  pauseLocationSharing,
  resetLocationViewLimits,
  revokeLocationGrant,
  saveSnapshot,
  updateLocationGrant,
  viewLocation,
} from './location-service'
import { locationDbPath } from './location-store'
import { RemoteAlarmDenied } from './remote-alarm-domain'
import { createAlarm, createGrant, registerDevice } from './remote-alarm-service'
import { issueSession, persistSession } from './session'

const NOW = new Date('2026-10-08T02:00:00.000Z')
const SUB = 'usr_0123456789ABCDEFGHJKMNPQRS'
const owner = { sub: 'usr_owner1', name: '文华' }
const alice = { sub: 'usr_alice1', name: '张三' }
const bob = { sub: 'usr_bobbbb', name: '李四' }
const cara = { sub: 'usr_caraaa', name: '王五' }

async function config(extra: NodeJS.ProcessEnv = {}): Promise<{ config: DaysConfig; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'rishi-loc-'))
  return {
    config: loadConfig({
      DAYS_SYNC_DATA_DIR: dir,
      RISHI_SESSION_SECRET: 'test-secret-test-secret-test-secret',
      RISHI_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
      ACCOUNT_DIRECTORY_URL: '',
      ACCOUNT_RESOLVE_URL: '',
      GEO_UPSTREAM_URL: 'off',
      ...extra,
    }),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    if (error instanceof LocationDenied || error instanceof RemoteAlarmDenied) return error.code
    throw error
  }
  assert.fail('expected denial')
}

const precise = {
  latitude: 23.129991,
  longitude: 113.264449,
  accuracyMeters: 15,
  capturedAt: '2026-10-08T01:58:00.000Z',
  source: 'GPS',
}

test('未授权、只有闹钟授权都不能看位置；只有位置授权不能设闹钟', async () => {
  const ctx = await config()
  try {
    assert.equal(await codeOf(() => viewLocation(ctx.config, alice, owner.sub, NOW)), 'LOCATION_NOT_AUTHORIZED')
    await createGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT' }, NOW)
    assert.equal(await codeOf(() => viewLocation(ctx.config, alice, owner.sub, NOW)), 'LOCATION_NOT_AUTHORIZED')
    const located = await createLocationGrant(ctx.config, owner, { granteeUserId: bob.sub, granteeName: bob.name, scope: 'PERMANENT', precision: 'PRECISE' }, NOW)
    assert.equal(await codeOf(() => createAlarm(ctx.config, bob, {
      ownerUserId: owner.sub,
      grantId: located.id,
      triggerAt: '2026-10-08T04:30:00.000Z',
      timezone: 'Asia/Shanghai',
      title: '起床',
      clientNonce: 'loc-only',
    }, NOW)), 'REMOTE_ALARM_NOT_AUTHORIZED')
  } finally {
    await ctx.cleanup()
  }
})

test('两项授权互相独立，时间段、永久、暂停、撤销和事项取消各自生效', async () => {
  const ctx = await config()
  try {
    const alarm = await createGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT' }, NOW)
    const location = await createLocationGrant(ctx.config, owner, {
      granteeUserId: alice.sub,
      scope: 'PERMANENT',
      mode: 'LIVE',
      precision: 'PRECISE',
    }, NOW)
    await saveSnapshot(ctx.config, owner, precise, NOW)
    const seen = await viewLocation(ctx.config, alice, owner.sub, NOW)
    assert.equal(seen.status, 'live')
    const created = await createAlarm(ctx.config, alice, {
      ownerUserId: owner.sub,
      grantId: alarm.id,
      triggerAt: '2026-10-08T04:30:00.000Z',
      timezone: 'Asia/Shanghai',
      title: '起床',
      clientNonce: 'both',
    }, NOW)
    assert.equal(created.status, 'DELIVERY_PENDING')
    assert.notEqual(alarm.id, location.id)

    const future = await createLocationGrant(ctx.config, owner, {
      granteeUserId: bob.sub,
      scope: 'TIME_RANGE',
      validFrom: '2026-10-09T00:00:00.000Z',
      validUntil: '2026-10-09T06:00:00.000Z',
    }, NOW)
    assert.equal(await codeOf(() => viewLocation(ctx.config, bob, owner.sub, NOW)), 'LOCATION_OUT_OF_SCOPE')
    await updateLocationGrant(ctx.config, owner, future.id, {
      validFrom: '2026-10-01T00:00:00.000Z',
      validUntil: '2026-10-02T00:00:00.000Z',
    }, NOW)
    assert.equal(await codeOf(() => viewLocation(ctx.config, bob, owner.sub, NOW)), 'LOCATION_GRANT_EXPIRED')

    await updateLocationGrant(ctx.config, owner, location.id, { status: 'PAUSED' }, NOW)
    assert.equal(await codeOf(() => viewLocation(ctx.config, alice, owner.sub, NOW)), 'LOCATION_NOT_AUTHORIZED')
    await updateLocationGrant(ctx.config, owner, location.id, { status: 'ACTIVE' }, NOW)
    await revokeLocationGrant(ctx.config, owner, location.id, NOW)
    assert.equal(await codeOf(() => viewLocation(ctx.config, alice, owner.sub, NOW)), 'LOCATION_NOT_AUTHORIZED')

    const bound = await createLocationGrant(ctx.config, owner, {
      granteeUserId: cara.sub,
      scope: 'ENTITY_BOUND',
      entityType: 'event',
      entityId: 'dinner',
      entityTitle: '聚餐',
      entityStartsAt: '2026-10-08T04:00:00.000Z',
      entityEndsAt: '2026-10-08T06:00:00.000Z',
      leadHours: 3,
      trailHours: 1,
      mode: 'LAST_KNOWN',
      precision: 'APPROXIMATE',
    }, NOW)
    await viewLocation(ctx.config, cara, owner.sub, NOW)
    await updateLocationGrant(ctx.config, owner, bound.id, { entityActive: false }, NOW)
    assert.equal(await codeOf(() => viewLocation(ctx.config, cara, owner.sub, NOW)), 'LOCATION_GRANT_EXPIRED')
  } finally {
    await ctx.cleanup()
  }
})

test('模糊坐标由服务端裁剪，精确坐标保留，过期位置不会标成实时', async () => {
  const ctx = await config()
  try {
    assert.equal(clipCoordinate(23.129991, 'APPROXIMATE'), 23.13)
    assert.equal(clipCoordinate(113.264449, 'APPROXIMATE'), 113.26)
    await createLocationGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT', precision: 'APPROXIMATE' }, NOW)
    await createLocationGrant(ctx.config, owner, { granteeUserId: bob.sub, scope: 'PERMANENT', precision: 'PRECISE', mode: 'LIVE' }, NOW)
    await saveSnapshot(ctx.config, owner, precise, NOW)
    const fuzzy = await viewLocation(ctx.config, alice, owner.sub, NOW)
    assert.equal(fuzzy.latitude, 23.13)
    assert.equal(fuzzy.longitude, 113.26)
    assert.equal(fuzzy.accuracyMeters, 1100)
    const exact = await viewLocation(ctx.config, bob, owner.sub, NOW)
    assert.equal(exact.latitude, 23.129991)
    assert.equal(exact.longitude, 113.264449)
    await saveSnapshot(ctx.config, owner, { ...precise, capturedAt: '2026-10-07T20:00:00.000Z' }, NOW)
    const stale = await viewLocation(ctx.config, bob, owner.sub, NOW)
    assert.equal(stale.status, 'stale')
    assert.equal(stale.statusLabel, '位置已过期')
    assert.notEqual(stale.statusLabel, '实时')
  } finally {
    await ctx.cleanup()
  }
})

test('查看审计不记录经纬度，上传不能改写 owner', async () => {
  const ctx = await config()
  try {
    await createLocationGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT', precision: 'PRECISE' }, NOW)
    await saveSnapshot(ctx.config, owner, precise, NOW)
    await viewLocation(ctx.config, alice, owner.sub, NOW)
    const db = JSON.parse(await readFile(locationDbPath(ctx.config), 'utf8')) as { audit: { summary: string }[]; grants: { granteeUserId: string }[] }
    const auditJson = JSON.stringify(db.audit)
    assert.equal(auditJson.includes('23.129991'), false)
    assert.equal(auditJson.includes('113.264449'), false)
    assert.match(auditJson, /查看了你的精确位置/)
    assert.equal(db.grants[0]?.granteeUserId, alice.sub)
    assert.equal(await codeOf(() => saveSnapshot(ctx.config, alice, { ...precise, ownerUserId: owner.sub }, NOW)), 'LOCATION_NOT_AUTHORIZED')
    await pauseLocationSharing(ctx.config, owner, NOW)
    const paused = await viewLocation(ctx.config, alice, owner.sub, NOW)
    assert.equal(paused.status, 'unavailable')
    assert.equal(paused.latitude, undefined)
  } finally {
    await ctx.cleanup()
  }
})

test('定位权限关闭时不返回坐标，iPhone 不报告系统闹钟已支持', async () => {
  const ctx = await config()
  try {
    await createLocationGrant(ctx.config, owner, { granteeUserId: alice.sub, scope: 'PERMANENT', precision: 'PRECISE', mode: 'LIVE' }, NOW)
    await saveSnapshot(ctx.config, owner, precise, NOW)
    await registerDevice(ctx.config, owner, {
      platform: 'android',
      appVersion: '2.5.0',
      capabilities: { location: { foregroundPermission: 'denied', precise: false } },
    })
    const closed = await viewLocation(ctx.config, alice, owner.sub, NOW)
    assert.equal(closed.status, 'permission_off')
    assert.equal(closed.latitude, undefined)
    const ios = await registerDevice(ctx.config, alice, {
      platform: 'ios',
      capabilities: { remoteAlarm: { supported: true } },
    })
    assert.equal(ios.capabilities.nativeAlarm, 'NOT_VERIFIED')
    assert.equal(ios.capabilities.remoteAlarm.supported, false)
  } finally {
    await ctx.cleanup()
  }
})

test('解析账号后必须确认才授权，同一个人不会变成两套身份', async () => {
  resetResolveLimits()
  resetLocationViewLimits()
  const account = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { identifier?: string }
      const id = body.identifier || ''
      const known: Record<string, string> = {
        wenhua_01: 'ACCOUNT',
        '10086': 'KK_NUMBER',
        'abc@example.com': 'EMAIL',
        '13800138000': 'PHONE',
        [SUB]: 'USER_SUB',
      }
      const matchedBy = known[id]
      if (!matchedBy) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: '没有找到可授权的账号，请核对输入内容' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        userSub: SUB,
        displayName: '张三',
        avatarUrl: '',
        matchedBy,
        maskedIdentifier: matchedBy === 'PHONE' ? '138****8000' : matchedBy === 'EMAIL' ? 'a***@example.com' : '12***',
        accountName: 'zhangsan',
        kkNumberMasked: '12***',
      }))
    })
  })
  await listen(account)
  const port = (account.address() as AddressInfo).port
  const ctx = await config({
    ACCOUNT_RESOLVE_URL: `http://127.0.0.1:${port}/api/internal/users/resolve-identifier`,
    ACCOUNT_INTERNAL_TOKEN: 'internal-test-token',
  })
  const server = createDaysServer(ctx.config)
  await listen(server)
  const api = (server.address() as AddressInfo).port
  try {
    const session = issueSession({ sub: owner.sub, name: owner.name, email: '', avatarUrl: '' }, ctx.config)
    await persistSession(ctx.config, session.session)
    const headers = { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' }
    const email = await fetch(`http://127.0.0.1:${api}/api/days/account/resolve`, { method: 'POST', headers, body: JSON.stringify({ identifier: 'abc@example.com' }) })
    const phone = await fetch(`http://127.0.0.1:${api}/api/days/account/resolve`, { method: 'POST', headers, body: JSON.stringify({ identifier: '13800138000' }) })
    const accountName = await fetch(`http://127.0.0.1:${api}/api/days/account/resolve`, { method: 'POST', headers, body: JSON.stringify({ identifier: 'wenhua_01' }) })
    const kk = await fetch(`http://127.0.0.1:${api}/api/days/account/resolve`, { method: 'POST', headers, body: JSON.stringify({ identifier: '10086' }) })
    const direct = await fetch(`http://127.0.0.1:${api}/api/days/account/resolve`, { method: 'POST', headers, body: JSON.stringify({ identifier: SUB }) })
    const emailBody = (await email.json()) as { account: { userSub: string } }
    const phoneBody = (await phone.json()) as { account: { userSub: string; maskedIdentifier: string } }
    assert.equal(email.status, 200)
    assert.equal(emailBody.account.userSub, SUB)
    assert.equal(phoneBody.account.userSub, SUB)
    assert.equal((await accountName.json() as { account: { userSub: string } }).account.userSub, SUB)
    assert.equal((await kk.json() as { account: { userSub: string } }).account.userSub, SUB)
    assert.equal((await direct.json() as { account: { userSub: string } }).account.userSub, SUB)
    assert.equal(phoneBody.account.maskedIdentifier.includes('13800138000'), false)
    const missing = await fetch(`http://127.0.0.1:${api}/api/days/account/resolve`, { method: 'POST', headers, body: JSON.stringify({ identifier: 'nobody@example.com' }) })
    assert.equal(missing.status, 404)
    const grantsBefore = await fetch(`http://127.0.0.1:${api}/api/days/location/grants`, { headers })
    assert.equal(((await grantsBefore.json()) as { given: unknown[] }).given.length, 0)
    const granted = await fetch(`http://127.0.0.1:${api}/api/days/location/grants`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ granteeUserId: SUB, granteeName: '张三', scope: 'PERMANENT', precision: 'APPROXIMATE' }),
    })
    assert.equal(granted.status, 201)
    await fetch(`http://127.0.0.1:${api}/api/days/location/grants`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ granteeUserId: SUB, granteeName: '张三', scope: 'TIME_RANGE', validFrom: '2026-10-08T00:00:00.000Z', validUntil: '2026-10-08T06:00:00.000Z' }),
    })
    const stored = JSON.parse(await readFile(locationDbPath(ctx.config), 'utf8')) as { grants: { granteeUserId: string }[] }
    assert.equal(stored.grants.length, 1)
    assert.equal(stored.grants[0]?.granteeUserId, SUB)
    assert.equal(JSON.stringify(stored.grants).includes('abc@example.com'), false)
    assert.equal(JSON.stringify(stored.grants).includes('13800138000'), false)
    const stranger = await resolveAccountIdentifier(ctx.config, 'usr_other1', 'nobody-2')
    assert.fail(`expected miss, got ${stranger.userSub}`)
  } catch (error) {
    if (!(error instanceof RemoteAlarmDenied)) throw error
    assert.equal(error.code, 'ACCOUNT_NOT_FOUND')
  } finally {
    server.close()
    account.close()
    await ctx.cleanup()
  }
})

test('连续解析失败会被限流', async () => {
  resetResolveLimits()
  const account = createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: '没有找到可授权的账号，请核对输入内容' }))
  })
  await listen(account)
  const ctx = await config({
    ACCOUNT_RESOLVE_URL: `http://127.0.0.1:${(account.address() as AddressInfo).port}/resolve`,
    ACCOUNT_INTERNAL_TOKEN: 'internal-test-token',
  })
  try {
    for (let i = 0; i < 10; i += 1) {
      assert.equal(await codeOf(() => resolveAccountIdentifier(ctx.config, 'usr_ratelimit1', `missing-${i}`)), 'ACCOUNT_NOT_FOUND')
    }
    assert.equal(await codeOf(() => resolveAccountIdentifier(ctx.config, 'usr_ratelimit1', 'missing-last')), 'ACCOUNT_RATE_LIMITED')
  } finally {
    account.close()
    await ctx.cleanup()
  }
})

function listen(server: Server) {
  return new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
}
