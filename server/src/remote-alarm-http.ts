import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DaysConfig } from './config'
import { readBody, sendJson } from './http'
import { resolveCaller } from './identity'
import { RemoteAlarmDenied, type AlarmStatus } from './remote-alarm-domain'
import {
  cancelAlarm,
  createAlarm,
  createGrant,
  getSettings,
  listAlarms,
  listAllowedTargets,
  listAudit,
  listGrants,
  pauseAll,
  registerDevice,
  removeDevice,
  reportAlarm,
  resumeAll,
  revokeGrant,
  saveSettings,
  searchContacts,
  updateAlarm,
  updateGrant,
} from './remote-alarm-service'

const REPORT: Record<string, AlarmStatus> = {
  delivered: 'DELIVERED',
  'device-scheduled': 'DEVICE_SCHEDULED',
  fired: 'FIRED',
  failed: 'FAILED',
  missed: 'MISSED',
}

function normalize(path: string): string {
  if (path.startsWith('/api/remote-alarm')) return path.replace('/api/remote-alarm', '/api/days/remote-alarm')
  if (path === '/api/devices' || path.startsWith('/api/devices/')) return path.replace('/api/devices', '/api/days/devices')
  return path
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'HEAD') return {}
  const raw = await readBody(req, 64 * 1024)
  if (!raw.length) return {}
  const parsed = JSON.parse(raw.toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new RemoteAlarmDenied('REMOTE_ALARM_OUT_OF_SCOPE', 400, '请求体无效')
  return parsed as Record<string, unknown>
}

export async function handleRemoteAlarmRoutes(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig): Promise<boolean> {
  const path = normalize(url.pathname.replace(/\/+$/, '') || '/')
  const alarmApi = path.startsWith('/api/days/remote-alarm')
  const deviceApi = path === '/api/days/devices' || path.startsWith('/api/days/devices/')
  if (!alarmApi && !deviceApi) return false
  try {
    const caller = await resolveCaller(req, config)
    if (!caller) {
      sendJson(res, 401, { error: 'unauthorized' })
      return true
    }
    const actor = { sub: caller.sub, name: caller.name || '我' }
    const body = await readJson(req)
    const parts = path.split('/')
    // /api/days/remote-alarm/... or /api/days/devices/:id
    if (deviceApi) {
      const id = parts[4]
      if (!id && req.method === 'POST') {
        sendJson(res, 200, { device: await registerDevice(config, actor, body as { id?: string; platform?: string; pushToken?: string; appVersion?: string }) })
        return true
      }
      if (id && req.method === 'DELETE') {
        sendJson(res, 200, await removeDevice(config, actor, id))
        return true
      }
      sendJson(res, 405, { error: 'method_not_allowed' })
      return true
    }
    const section = parts[4]
    const id = parts[5]
    const action = parts[6]
    if (section === 'grants' && !id && req.method === 'GET') {
      sendJson(res, 200, await listGrants(config, actor))
      return true
    }
    if (section === 'grants' && !id && req.method === 'POST') {
      sendJson(res, 201, { grant: await createGrant(config, actor, body) })
      return true
    }
    if (section === 'grants' && id && req.method === 'PATCH') {
      sendJson(res, 200, { grant: await updateGrant(config, actor, id, body) })
      return true
    }
    if (section === 'grants' && id && req.method === 'DELETE') {
      const cancelFuture = body.cancelFuture !== false && url.searchParams.get('cancelFuture') !== '0'
      sendJson(res, 200, { grant: await revokeGrant(config, actor, id, cancelFuture) })
      return true
    }
    if (section === 'allowed-targets' && req.method === 'GET') {
      sendJson(res, 200, { targets: await listAllowedTargets(config, actor) })
      return true
    }
    if (section === 'contacts' && req.method === 'GET') {
      sendJson(res, 200, await searchContacts(config, actor, url.searchParams.get('q') || ''))
      return true
    }
    if (section === 'alarms' && !id && req.method === 'GET') {
      sendJson(res, 200, { alarms: await listAlarms(config, actor, url.searchParams.get('role') || 'all') })
      return true
    }
    if (section === 'alarms' && !id && req.method === 'POST') {
      sendJson(res, 201, { alarm: await createAlarm(config, actor, body) })
      return true
    }
    if (section === 'alarms' && id && !action && req.method === 'PATCH') {
      sendJson(res, 200, { alarm: await updateAlarm(config, actor, id, body) })
      return true
    }
    if (section === 'alarms' && id && !action && req.method === 'DELETE') {
      sendJson(res, 200, { alarm: await cancelAlarm(config, actor, id) })
      return true
    }
    if (section === 'alarms' && id && action && req.method === 'POST' && REPORT[action]) {
      sendJson(res, 200, { alarm: await reportAlarm(config, actor, id, REPORT[action], typeof body.reason === 'string' ? body.reason : undefined) })
      return true
    }
    if (section === 'audit' && req.method === 'GET') {
      sendJson(res, 200, { events: await listAudit(config, actor) })
      return true
    }
    if (section === 'settings' && req.method === 'GET') {
      sendJson(res, 200, { settings: await getSettings(config, actor) })
      return true
    }
    if (section === 'settings' && req.method === 'PUT') {
      sendJson(res, 200, { settings: await saveSettings(config, actor, body) })
      return true
    }
    if (section === 'pause' && req.method === 'POST') {
      sendJson(res, 200, await pauseAll(config, actor, body.cancelFuture === true))
      return true
    }
    if (section === 'resume' && req.method === 'POST') {
      sendJson(res, 200, { settings: await resumeAll(config, actor) })
      return true
    }
    sendJson(res, 404, { error: 'not_found' })
  } catch (error) {
    if (error instanceof RemoteAlarmDenied) {
      sendJson(res, error.httpStatus, { error: error.code, message: error.detail || error.code })
      return true
    }
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { error: 'bad_json' })
      return true
    }
    throw error
  }
  return true
}
