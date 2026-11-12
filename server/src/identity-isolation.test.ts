import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { loadConfig } from './config'
import { resolveCaller } from './identity'
import { issueSession } from './session'
import { DEVICE_COOKIE, holdCookieName, rememberWebAccount } from './tab-device'
import { upsertUser } from './users'

const dirs: string[] = []
const servers: Server[] = []

after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

function request(cookie: string, tab = ''): IncomingMessage {
  return { headers: { cookie, 'x-yyds-tab': tab } } as IncomingMessage
}

async function tempConfig(extra: Record<string, string>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'rishi-iso-'))
  dirs.push(dataDir)
  return loadConfig({
    NODE_ENV: 'test',
    DAYS_SYNC_DATA_DIR: dataDir,
    RISHI_SESSION_SECRET: 'test-rishi-session-secret',
    RISHI_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
    DAYS_SYNC_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    ACCOUNT_ISSUER: '',
    ...extra,
  })
}

test('主站无响应时，已有 rishi session 的同步身份仍可用，且不会每次都空等', async () => {
  const hanging = createServer(() => {
    /* 连接挂起，模拟主站进程已死、对端不回包 */
  })
  servers.push(hanging)
  await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', resolve))
  const port = (hanging.address() as { port: number }).port
  const config = await tempConfig({
    DAYS_SYNC_SESSION_URL: `http://127.0.0.1:${port}/api/auth/session`,
  })
  const issued = issueSession(
    { sub: 'usr_keep', name: '在线', email: '', avatarUrl: '' },
    config,
  )
  const req = request(`rishi_session=${issued.token}`)

  const started = Date.now()
  const first = await resolveCaller(req, config)
  const firstMs = Date.now() - started
  assert.equal(first?.sub, 'usr_keep')
  assert.equal(first?.source, 'rishi')
  assert.ok(firstMs < 3_000, `first call took ${firstMs}ms`)

  const again = Date.now()
  const second = await resolveCaller(req, config)
  const secondMs = Date.now() - again
  assert.equal(second?.sub, 'usr_keep')
  assert.ok(secondMs < 200, `second call took ${secondMs}ms`)
})

test('关闭主站会话回源后，没有 rishi session 时直接未登录，不抛错', async () => {
  const config = await tempConfig({ DAYS_SYNC_SESSION_URL: 'off' })
  const started = Date.now()
  const caller = await resolveCaller(request(''), config)
  assert.equal(caller, null)
  assert.ok(Date.now() - started < 200)
})

test('主站确认过旧身份之后，不再为每次请求访问主站', async () => {
  let hits = 0
  const www = createServer((_req, res) => {
    hits += 1
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ user: { id: 'legacy-1', name: '旧' } }))
  })
  servers.push(www)
  await new Promise<void>((resolve) => www.listen(0, '127.0.0.1', resolve))
  const port = (www.address() as { port: number }).port
  const config = await tempConfig({
    DAYS_SYNC_SESSION_URL: `http://127.0.0.1:${port}/api/auth/session`,
  })
  await upsertUser(config, {
    iss: 'http://account.test',
    sub: 'usr_moved',
    aud: 'rishi',
    exp: 0,
    iat: 0,
    name: '迁',
  })
  const issued = issueSession(
    { sub: 'usr_moved', name: '迁', email: '', avatarUrl: '' },
    config,
  )
  const first = await resolveCaller(request(`rishi_session=${issued.token}; n=1`), config)
  const second = await resolveCaller(request(`rishi_session=${issued.token}; n=2`), config)
  assert.equal(first?.legacyId, 'legacy-1')
  assert.equal(second?.legacyId, 'legacy-1')
  assert.equal(hits, 1)
})

test('两个标签页各用各的账号，共享 rishi_session 不能换成后登录的人', async () => {
  const config = await tempConfig({})
  const alice = issueSession({ sub: 'usr_aliceone1', name: '甲', email: '', avatarUrl: '' }, config)
  const bob = issueSession({ sub: 'usr_bobtwo222', name: '乙', email: '', avatarUrl: '' }, config)
  const first = await rememberWebAccount(config, {
    deviceToken: undefined,
    session: alice.session,
    contextId: 'tabcontextaaaaaa01',
  })
  const second = await rememberWebAccount(config, {
    deviceToken: first.deviceToken,
    session: bob.session,
    contextId: 'tabcontextbbbbbb02',
  })
  assert.equal(second.setLegacyCookie, false)
  const cookie = [
    `${DEVICE_COOKIE}=${second.deviceToken}`,
    `${holdCookieName(alice.session.sid)}=${encodeURIComponent(alice.token)}`,
    `${holdCookieName(bob.session.sid)}=${encodeURIComponent(bob.token)}`,
    `rishi_session=${encodeURIComponent(bob.token)}`,
  ].join('; ')
  assert.equal((await resolveCaller(request(cookie, 'tabcontextaaaaaa01'), config))?.sub, 'usr_aliceone1')
  assert.equal((await resolveCaller(request(cookie, 'tabcontextbbbbbb02'), config))?.sub, 'usr_bobtwo222')
  assert.equal(await resolveCaller(request(cookie, ''), config), null)
})
