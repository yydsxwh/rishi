import { importPKCS8, SignJWT } from 'jose'
import type { DaysConfig } from './config'
import { fcmConfigured } from './config'
import { log } from './http'
import { readAlarmDb, withAlarmDb, type UserDevice } from './remote-alarm-store'

let cachedToken: { value: string; exp: number } | null = null

async function accessToken(config: DaysConfig): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value
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
  if (!response.ok) throw new Error(`FCM_TOKEN_${response.status}`)
  const body = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('FCM_TOKEN_EMPTY')
  cachedToken = { value: body.access_token, exp: Date.now() + (body.expires_in || 3000) * 1000 }
  return body.access_token
}

/** 只唤醒设备去拉授权过的闹钟，payload 里不放授权结论。 */
export async function wakeOwnerDevices(config: DaysConfig, ownerUserId: string): Promise<{ pushed: number; skipped: string }> {
  if (!fcmConfigured(config)) return { pushed: 0, skipped: 'fcm_unconfigured' }
  const db = await readAlarmDb(config)
  const devices = db.devices.filter((device) => device.userId === ownerUserId && device.enabled && device.pushToken && device.platform === 'android')
  if (!devices.length) return { pushed: 0, skipped: 'no_device' }
  let token = ''
  try {
    token = await accessToken(config)
  } catch (error) {
    log('warn', 'remote alarm push token failed', { reason: error instanceof Error ? error.message : 'error' })
    return { pushed: 0, skipped: 'fcm_token_failed' }
  }
  let pushed = 0
  for (const device of devices) {
    if (await sendData(config, token, device)) pushed += 1
  }
  return { pushed, skipped: pushed ? '' : 'fcm_send_failed' }
}

async function sendData(config: DaysConfig, token: string, device: UserDevice): Promise<boolean> {
  try {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.firebaseProjectId)}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: device.pushToken,
          data: { type: 'remote_alarm_sync' },
          android: { priority: 'HIGH' },
        },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 404 || response.status === 410 || detail.includes('UNREGISTERED')) {
        await withAlarmDb(config, (db) => {
          for (const row of db.devices) {
            if (row.pushToken === device.pushToken) {
              row.pushToken = ''
              row.enabled = false
              if (row.capabilities) row.capabilities.push.ready = false
            }
          }
        })
      }
      log('warn', 'remote alarm push failed', { deviceId: device.id, status: response.status })
      return false
    }
    await withAlarmDb(config, (db) => {
      const row = db.devices.find((item) => item.id === device.id)
      if (row?.capabilities) row.capabilities.push.lastPushAt = new Date().toISOString()
    })
    return true
  } catch (error) {
    log('warn', 'remote alarm push failed', { deviceId: device.id, reason: error instanceof Error ? error.message : 'error' })
    return false
  }
}
