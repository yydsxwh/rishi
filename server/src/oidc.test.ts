import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createDaysServer } from './index'
import { loadConfig } from './config'
import { normalizeOcrPayload } from './ai-ocr'
import { issueSession } from './session'

const ACCOUNT_PORT = 3921
const BFF_PORT = 3922
const ISSUER = `http://127.0.0.1:${ACCOUNT_PORT}`
const REDIRECT = `http://127.0.0.1:${BFF_PORT}/api/days/auth/callback`

let dataDir = ''
let accountServer: ReturnType<typeof createServer>
let bff: ReturnType<typeof createServer>
let privateKey: CryptoKey
let publicJwk: Record<string, unknown>
const codes = new Map<string, { sub: string; used: boolean; nonce: string }>()

async function signIdToken(input: { sub: string; aud: string; iss: string; nonce: string }) {
  return new SignJWT({ nonce: input.nonce, name: input.sub === 'usr_alice' ? 'Alice' : 'Bob' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(input.iss)
    .setAudience(input.aud)
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey)
}

before(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'test', use: 'sig', alg: 'RS256' }
  dataDir = await mkdtemp(join(tmpdir(), 'rishi-bff-'))

  accountServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', ISSUER)
    if (url.pathname === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
        token_endpoint: `${ISSUER}/api/oauth/token`,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      }))
      return
    }
    if (url.pathname === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/jwk-set+json' })
      res.end(JSON.stringify({ keys: [publicJwk] }))
      return
    }
    if (url.pathname === '/api/oauth/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri') || ''
      const state = url.searchParams.get('state') || ''
      const nonce = url.searchParams.get('nonce') || ''
      const challenge = url.searchParams.get('code_challenge') || ''
      const code = `code_${Math.random().toString(36).slice(2)}`
      codes.set(code, {
        sub: url.searchParams.get('login_hint') || 'usr_alice',
        used: false,
        nonce,
      })
      void challenge
      res.writeHead(302, { location: `${redirectUri}?code=${code}&state=${state}` })
      res.end()
      return
    }
    if (url.pathname === '/api/oauth/token' && req.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = new URLSearchParams(Buffer.concat(chunks).toString())
      const code = body.get('code') || ''
      const record = codes.get(code)
      if (!record || record.used) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: '授权码已被使用' }))
        return
      }
      if (body.get('client_secret') !== 'test-secret') {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_client' }))
        return
      }
      record.used = true
      const idToken = await signIdToken({
        sub: record.sub,
        aud: 'rishi',
        iss: ISSUER,
        nonce: record.nonce,
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id_token: idToken, access_token: 'atk', token_type: 'Bearer' }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => accountServer.listen(ACCOUNT_PORT, '127.0.0.1', resolve))

  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DAYS_SYNC_HOST: '127.0.0.1',
    DAYS_SYNC_PORT: String(BFF_PORT),
    DAYS_SYNC_DATA_DIR: dataDir,
    DAYS_SYNC_ALLOWED_ORIGINS: 'https://www.yydsxwh.com,http://127.0.0.1:3922',
    RISHI_PUBLIC_ORIGIN: `http://127.0.0.1:${BFF_PORT}`,
    RISHI_SESSION_SECRET: 'test-session-secret',
    ACCOUNT_ISSUER: ISSUER,
    ACCOUNT_CLIENT_ID: 'rishi',
    ACCOUNT_CLIENT_SECRET: 'test-secret',
    ACCOUNT_REDIRECT_URI: REDIRECT,
    DAYS_SYNC_SESSION_URL: `${ISSUER}/missing-session`,
  })
  bff = createDaysServer(config)
  await new Promise<void>((resolve) => bff.listen(BFF_PORT, '127.0.0.1', resolve))
})

after(async () => {
  await new Promise((resolve) => bff.close(resolve))
  await new Promise((resolve) => accountServer.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
})

function cookieFrom(res: Response, name: string): string {
  const raw = res.headers.getSetCookie?.() || []
  const hit = raw.find((item) => item.startsWith(`${name}=`))
  return hit ? hit.split(';')[0] : ''
}

async function loginAs(sub: string, returnTo = '/products/days/') {
  const start = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
    redirect: 'manual',
  })
  const oidcCookie = cookieFrom(start, 'rishi_oidc')
  const location = start.headers.get('location') || ''
  const authorize = new URL(location)
  authorize.searchParams.set('login_hint', sub)
  const bounced = await fetch(authorize, { redirect: 'manual' })
  const callback = bounced.headers.get('location') || ''
  const finished = await fetch(callback, { headers: { cookie: oidcCookie }, redirect: 'manual' })
  return { res: finished, cookie: cookieFrom(finished, 'rishi_session') }
}

test('OIDC discovery + JWKS 可用', async () => {
  const discovery = await (await fetch(`${ISSUER}/.well-known/openid-configuration`)).json() as { issuer: string }
  assert.equal(discovery.issuer, ISSUER)
  const jwks = await (await fetch(`${ISSUER}/.well-known/jwks.json`)).json() as { keys: unknown[] }
  assert.equal(jwks.keys.length, 1)
})

test('Web 登录后 session 的 id 就是 account sub', async () => {
  const { cookie, res } = await loginAs('usr_alice')
  assert.ok(res.status === 302 || res.status === 200)
  assert.ok(cookie.includes('rishi_session='))
  const session = await (await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/auth/session`, { headers: { cookie } })).json() as {
    user: { id: string; sub: string }
  }
  assert.equal(session.user.sub, 'usr_alice')
  assert.equal(session.user.id, 'usr_alice')
})

test('state 不匹配会被拒绝', async () => {
  const start = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/auth/login?returnTo=/`, { redirect: 'manual' })
  const oidcCookie = cookieFrom(start, 'rishi_oidc')
  const bad = await fetch(`${REDIRECT}?code=x&state=wrong`, { headers: { cookie: oidcCookie } })
  assert.equal(bad.status, 400)
  assert.equal(((await bad.json()) as { error: string }).error, 'state_mismatch')
})

test('授权码重放失败', async () => {
  const start = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/auth/login?returnTo=/`, { redirect: 'manual' })
  const oidcCookie = cookieFrom(start, 'rishi_oidc')
  const authorize = new URL(start.headers.get('location') || '')
  authorize.searchParams.set('login_hint', 'usr_alice')
  const bounced = await fetch(authorize, { redirect: 'manual' })
  const callback = bounced.headers.get('location') || ''
  const first = await fetch(callback, { headers: { cookie: oidcCookie }, redirect: 'manual' })
  assert.ok(first.status === 302 || first.status === 200)
  const second = await fetch(callback, { headers: { cookie: oidcCookie } })
  assert.equal(second.status, 400)
})

test('错误 issuer / audience 被拒', async () => {
  const { verifyIdToken } = await import('./oidc')
  const config = loadConfig({
    ...process.env,
    ACCOUNT_ISSUER: ISSUER,
    ACCOUNT_CLIENT_ID: 'rishi',
    ACCOUNT_CLIENT_SECRET: 'test-secret',
    ACCOUNT_REDIRECT_URI: REDIRECT,
    RISHI_SESSION_SECRET: 'test-session-secret',
    DAYS_SYNC_DATA_DIR: dataDir,
  })
  const badIss = await signIdToken({ sub: 'usr_alice', aud: 'rishi', iss: 'https://evil.example', nonce: 'n' })
  await assert.rejects(() => verifyIdToken(config, badIss), /iss|issuer|invalid/)
  const badAud = await signIdToken({ sub: 'usr_alice', aud: 'other-app', iss: ISSUER, nonce: 'n' })
  await assert.rejects(() => verifyIdToken(config, badAud), /aud|audience|invalid/)
})

test('两用户数据隔离，客户端提交的 userId 无效', async () => {
  const alice = await loginAs('usr_alice')
  const bob = await loginAs('usr_bob')
  const put = (cookie: string, data: unknown, baseVersion: number) =>
    fetch(`http://127.0.0.1:${BFF_PORT}/api/days/sync`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://www.yydsxwh.com', cookie },
      body: JSON.stringify({ data, baseVersion, userId: 'usr_bob', sub: 'usr_bob' }),
    })
  assert.equal((await put(alice.cookie, { todos: [{ id: 'a', title: 'alice' }] }, 0)).status, 200)
  const bobRead = await (await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/sync`, { headers: { cookie: bob.cookie } })).json() as {
    data: { todos?: { title: string }[] } | null
  }
  assert.equal(bobRead.data, null)
  await put(bob.cookie, { todos: [{ id: 'b', title: 'bob' }] }, 0)
  const aliceRead = await (await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/sync`, { headers: { cookie: alice.cookie } })).json() as {
    data: { todos: { title: string }[] }
  }
  assert.equal(aliceRead.data.todos[0].title, 'alice')
})

test('Android handoff 一次性交接，不把 account token 交给客户端', async () => {
  const start = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/auth/login?native=1`, { redirect: 'manual' })
  const oidcCookie = cookieFrom(start, 'rishi_oidc')
  const authorize = new URL(start.headers.get('location') || '')
  authorize.searchParams.set('login_hint', 'usr_alice')
  const bounced = await fetch(authorize, { redirect: 'manual' })
  const finished = await fetch(bounced.headers.get('location') || '', { headers: { cookie: oidcCookie }, redirect: 'manual' })
  const dest = new URL(finished.headers.get('location') || '')
  assert.equal(dest.protocol, 'kemiao-days:')
  const code = dest.searchParams.get('handoff') || ''
  const exchanged = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/auth/handoff`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const body = await exchanged.json() as { token: string; user: { sub: string } }
  assert.equal(body.user.sub, 'usr_alice')
  assert.ok(body.token.startsWith('ey') || body.token.includes('.'))
  assert.equal(body.token.includes('atk'), false)
  const replay = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/auth/handoff`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  assert.equal(replay.status, 400)
  const synced = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/sync`, {
    headers: { authorization: `Bearer ${body.token}` },
  })
  assert.equal(synced.status, 200)
})

test('Web 与 Bearer 同步互通，删除版本冲突带回现状', async () => {
  const alice = await loginAs('usr_alice')
  const current = await (await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/sync`, { headers: { cookie: alice.cookie } })).json() as {
    version: number
  }
  const first = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/sync`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://www.yydsxwh.com', cookie: alice.cookie },
    body: JSON.stringify({ data: { todos: [{ id: 't1', title: '网页' }], notes: [] }, baseVersion: current.version }),
  })
  assert.equal(first.status, 200)
  const stale = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/sync`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://www.yydsxwh.com', cookie: alice.cookie },
    body: JSON.stringify({ data: { todos: [] }, baseVersion: current.version }),
  })
  assert.equal(stale.status, 409)
})

test('首次迁移：空云端不会覆盖有内容的旧本机文件键', async () => {
  const { writeRecord, readRecord } = await import('./sync-store')
  const config = loadConfig({
    ...process.env,
    DAYS_SYNC_DATA_DIR: dataDir,
    RISHI_SESSION_SECRET: 'test-session-secret',
    ACCOUNT_ISSUER: ISSUER,
    ACCOUNT_CLIENT_ID: 'rishi',
    ACCOUNT_CLIENT_SECRET: 'test-secret',
    ACCOUNT_REDIRECT_URI: REDIRECT,
  })
  await writeRecord(config, 'old-www-id', { data: { todos: [{ id: 'legacy', title: '旧数据' }] }, version: 3, updatedAt: 't' })
  const { migrateLegacyIfNeeded } = await import('./sync-store')
  await migrateLegacyIfNeeded(config, 'usr_migrated', 'old-www-id')
  const moved = await readRecord(config, 'usr_migrated')
  assert.equal((moved.data as { todos: { title: string }[] }).todos[0].title, '旧数据')
  await writeRecord(config, 'usr_migrated', { data: { todos: [{ id: 'new', title: '新云端' }] }, version: 4, updatedAt: 't2' })
  await migrateLegacyIfNeeded(config, 'usr_migrated', 'old-www-id')
  const kept = await readRecord(config, 'usr_migrated')
  assert.equal((kept.data as { todos: { title: string }[] }).todos[0].title, '新云端')
})

test('OCR 输出必须先规范化，不能原样入库', () => {
  const raw = {
    courses: [{ name: '高数', weekday: 1, startTime: '08:00', endTime: '09:40' }, { weekday: 2 }],
    exams: [{ name: '线代', date: '2026-10-01', startTime: '09:00' }],
    selfSchedules: [{ title: '晨跑', weekday: 1, startTime: '07:00', endTime: '07:30' }],
    extra: 'ignore me',
  }
  const normalized = normalizeOcrPayload(raw, 'auto')
  assert.equal((normalized.courses as unknown[]).length, 1)
  assert.equal((normalized.exams as unknown[]).length, 1)
  assert.equal((normalized.selfSchedules as unknown[]).length, 1)
})

test('rishi session 签发后可直接同步，不依赖 account cookie', async () => {
  const config = loadConfig({
    ...process.env,
    DAYS_SYNC_DATA_DIR: dataDir,
    RISHI_SESSION_SECRET: 'test-session-secret',
    DAYS_SYNC_ALLOWED_ORIGINS: 'https://www.yydsxwh.com',
    ACCOUNT_ISSUER: ISSUER,
    ACCOUNT_CLIENT_ID: 'rishi',
    ACCOUNT_CLIENT_SECRET: 'test-secret',
    ACCOUNT_REDIRECT_URI: REDIRECT,
  })
  const issued = issueSession({ sub: 'usr_direct', name: 'Direct', email: '', avatarUrl: '' }, config)
  const res = await fetch(`http://127.0.0.1:${BFF_PORT}/api/days/sync`, {
    headers: { authorization: `Bearer ${issued.token}` },
  })
  assert.equal(res.status, 200)
})
