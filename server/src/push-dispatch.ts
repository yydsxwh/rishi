import { createHash } from 'node:crypto'
import http2 from 'node:http2'
import { importPKCS8, SignJWT } from 'jose'
import type { DaysConfig } from './config'
import { log } from './http'
import { readPushCredentials, rememberPushOutcome, type PushCredentials } from './push-config'
import { fallbackOrder, type PushProviderId } from './push-domain'
import { readAlarmDb, withAlarmDb, type UserDevice } from './remote-alarm-store'

const DATA = JSON.stringify({ type: 'remote_alarm_sync' })

/** 推送只叫醒设备去拉取。授权仍由后续接口重新判断。 */
export async function dispatchSync(config: DaysConfig, device: UserDevice): Promise<{ ok: boolean; provider: PushProviderId; reason: string }> {
  const credentials = readPushCredentials()
  const chosen = (device.pushProvider || (device.pushToken ? 'fcm' : 'none')) as PushProviderId
  const tokens: Partial<Record<string, string>> = {}
  if (device.pushToken && chosen !== 'none') tokens[chosen] = device.pushToken
  for (const provider of fallbackOrder(chosen, tokens)) {
    const sent = await send(config, credentials, provider, device.pushToken)
    rememberPushOutcome(provider, sent.ok)
    if (sent.ok) {
      await markPush(config, device.id)
      return { ok: true, provider, reason: '' }
    }
    if (sent.disable) await disableToken(config, device)
    log('warn', 'push provider failed', { provider, deviceId: device.id, reason: sent.reason })
  }
  return { ok: false, provider: chosen, reason: chosen === 'none' ? 'no_token' : 'push_failed' }
}

export async function dispatchToUser(config: DaysConfig, userId: string): Promise<{ pushed: number; skipped: string }> {
  const db = await readAlarmDb(config)
  const devices = db.devices.filter((device) => device.userId === userId && device.enabled && device.pushToken)
  if (!devices.length) return { pushed: 0, skipped: 'no_device' }
  let pushed = 0
  for (const device of devices) {
    const result = await dispatchSync(config, device)
    if (result.ok) pushed += 1
  }
  return { pushed, skipped: pushed ? '' : 'push_failed' }
}

async function send(config: DaysConfig, credentials: PushCredentials, provider: PushProviderId, token: string): Promise<{ ok: boolean; reason: string; disable?: boolean }> {
  if (!token) return { ok: false, reason: 'no_token' }
  if (provider === 'fcm') return sendFcm(config, token)
  if (provider === 'huawei') return sendHuawei(credentials, token)
  if (provider === 'xiaomi') return sendXiaomi(credentials, token)
  if (provider === 'oppo') return sendOppo(credentials, token)
  if (provider === 'vivo') return sendVivo(credentials, token)
  if (provider === 'honor') return sendHonor(credentials, token)
  if (provider === 'apns') return sendApns(credentials, token)
  return { ok: false, reason: 'not_configured' }
}

async function sendFcm(config: DaysConfig, token: string): Promise<{ ok: boolean; reason: string; disable?: boolean }> {
  if (!config.firebaseProjectId || !config.firebaseClientEmail || !config.firebasePrivateKey) return { ok: false, reason: 'not_configured' }
  try {
    const access = await firebaseAccess(config)
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.firebaseProjectId)}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token, data: { type: 'remote_alarm_sync' }, android: { priority: 'HIGH' } } }),
      signal: AbortSignal.timeout(8000),
    })
    if (response.status === 404 || response.status === 410) return { ok: false, reason: 'unregistered', disable: true }
    return { ok: response.ok, reason: response.ok ? '' : `http_${response.status}` }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

let firebaseToken: { value: string; exp: number } | null = null

async function firebaseAccess(config: DaysConfig): Promise<string> {
  if (firebaseToken && firebaseToken.exp > Date.now() + 60_000) return firebaseToken.value
  const key = await importPKCS8(config.firebasePrivateKey, 'RS256')
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.firebaseClientEmail)
    .setSubject(config.firebaseClientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('50m')
    .sign(key)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('fcm_token')
  const body = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('fcm_token')
  firebaseToken = { value: body.access_token, exp: Date.now() + (body.expires_in || 3000) * 1000 }
  return body.access_token
}

async function sendHuawei(credentials: PushCredentials, token: string): Promise<{ ok: boolean; reason: string }> {
  if (!credentials.huaweiAppId || !credentials.huaweiClientId || !credentials.huaweiClientSecret) return { ok: false, reason: 'not_configured' }
  const access = await oauthForm('https://oauth-login.cloud.huawei.com/oauth2/v3/token', {
    grant_type: 'client_credentials',
    client_id: credentials.huaweiClientId,
    client_secret: credentials.huaweiClientSecret,
  })
  if (!access) return { ok: false, reason: 'unavailable' }
  const response = await fetch(`https://push-api.cloud.huawei.com/v1/${encodeURIComponent(credentials.huaweiAppId)}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: { token: [token], data: DATA } }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const body = (await response?.json().catch(() => ({}))) as { code?: string }
  return { ok: body.code === '80000000', reason: body.code || 'unavailable' }
}

async function sendHonor(credentials: PushCredentials, token: string): Promise<{ ok: boolean; reason: string }> {
  if (!credentials.honorAppId || !credentials.honorClientId || !credentials.honorClientSecret) return { ok: false, reason: 'not_configured' }
  const access = await oauthForm('https://iam.developer.honor.com/auth/token', {
    grant_type: 'client_credentials',
    client_id: credentials.honorClientId,
    client_secret: credentials.honorClientSecret,
  })
  if (!access) return { ok: false, reason: 'unavailable' }
  const response = await fetch(`https://push-api.cloud.honor.com/api/v1/${encodeURIComponent(credentials.honorAppId)}/sendMessage`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ token: [token], data: DATA }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const body = (await response?.json().catch(() => ({}))) as { code?: number | string }
  return { ok: String(body.code) === '200', reason: String(body.code || 'unavailable') }
}

async function sendXiaomi(credentials: PushCredentials, token: string): Promise<{ ok: boolean; reason: string }> {
  if (!credentials.xiaomiAppSecret) return { ok: false, reason: 'not_configured' }
  const body = new URLSearchParams({
    registration_id: token,
    restricted_package_name: credentials.xiaomiPackageName,
    pass_through: '1',
    payload: DATA,
  })
  const response = await fetch('https://api.xmpush.xiaomi.com/v3/message/regid', {
    method: 'POST',
    headers: { authorization: `key=${credentials.xiaomiAppSecret}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const parsed = (await response?.json().catch(() => ({}))) as { code?: number }
  return { ok: parsed.code === 0, reason: String(parsed.code ?? 'unavailable') }
}

async function sendOppo(credentials: PushCredentials, token: string): Promise<{ ok: boolean; reason: string }> {
  if (!credentials.oppoAppKey || !credentials.oppoMasterSecret) return { ok: false, reason: 'not_configured' }
  const timestamp = String(Date.now())
  const sign = createHash('sha256').update(`${credentials.oppoAppKey}${timestamp}${credentials.oppoMasterSecret}`).digest('hex')
  const auth = await fetch('https://api.push.oppomobile.com/server/v1/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ app_key: credentials.oppoAppKey, timestamp, sign }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const authBody = (await auth?.json().catch(() => ({}))) as { code?: number; data?: { auth_token?: string } }
  if (!authBody.data?.auth_token) return { ok: false, reason: 'unavailable' }
  const message = JSON.stringify({ target_type: 2, target_value: token, notification: { title: '颗秒日事', content: '有一项同步' } })
  const response = await fetch('https://api.push.oppomobile.com/server/v1/message/notification/unicast', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ auth_token: authBody.data.auth_token, message }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const parsed = (await response?.json().catch(() => ({}))) as { code?: number }
  return { ok: parsed.code === 0, reason: String(parsed.code ?? 'unavailable') }
}

async function sendVivo(credentials: PushCredentials, token: string): Promise<{ ok: boolean; reason: string }> {
  if (!credentials.vivoAppId || !credentials.vivoAppKey || !credentials.vivoAppSecret) return { ok: false, reason: 'not_configured' }
  const timestamp = String(Date.now())
  const sign = createHash('md5').update(`${credentials.vivoAppId}${credentials.vivoAppKey}${timestamp}${credentials.vivoAppSecret}`).digest('hex')
  const auth = await fetch('https://api-push.vivo.com.cn/message/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appId: credentials.vivoAppId, appKey: credentials.vivoAppKey, timestamp, sign }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const authBody = (await auth?.json().catch(() => ({}))) as { result?: number; authToken?: string }
  if (!authBody.authToken) return { ok: false, reason: 'unavailable' }
  const response = await fetch('https://api-push.vivo.com.cn/message/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authToken: authBody.authToken },
    body: JSON.stringify({ regId: token, notifyType: 1, title: '颗秒日事', content: '有一项同步', skipType: 1, requestId: timestamp }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const parsed = (await response?.json().catch(() => ({}))) as { result?: number }
  return { ok: parsed.result === 0, reason: String(parsed.result ?? 'unavailable') }
}

async function sendApns(credentials: PushCredentials, token: string): Promise<{ ok: boolean; reason: string }> {
  if (!credentials.apnsTeamId || !credentials.apnsKeyId || !credentials.apnsBundleId || !credentials.apnsPrivateKey) return { ok: false, reason: 'not_configured' }
  try {
    const key = await importPKCS8(credentials.apnsPrivateKey, 'ES256')
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: credentials.apnsKeyId })
      .setIssuer(credentials.apnsTeamId)
      .setIssuedAt()
      .sign(key)
    const status = await apnsPost(token, jwt, credentials.apnsBundleId)
    return { ok: status === 200, reason: `http_${status}` }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

function apnsPost(token: string, jwt: string, bundleId: string): Promise<number> {
  return new Promise((resolve) => {
    const client = http2.connect('https://api.push.apple.com')
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'background',
      'apns-priority': '5',
    })
    req.on('response', (headers) => {
      resolve(Number(headers[':status'] || 0))
      client.close()
    })
    req.on('error', () => {
      resolve(0)
      client.close()
    })
    req.end(JSON.stringify({ aps: { 'content-available': 1 }, type: 'remote_alarm_sync' }))
  })
}

async function oauthForm(url: string, fields: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const body = (await response?.json().catch(() => ({}))) as { access_token?: string }
  return body.access_token || ''
}

async function markPush(config: DaysConfig, deviceId: string) {
  await withAlarmDb(config, (db) => {
    const row = db.devices.find((item) => item.id === deviceId)
    if (row?.capabilities) row.capabilities.push.lastPushAt = new Date().toISOString()
  })
}

async function disableToken(config: DaysConfig, device: UserDevice) {
  await withAlarmDb(config, (db) => {
    const row = db.devices.find((item) => item.id === device.id)
    if (!row) return
    row.pushToken = ''
    row.enabled = false
    if (row.capabilities) row.capabilities.push.ready = false
  })
}
