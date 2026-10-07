import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveAccountIdentifier, resetResolveLimits } from './account-resolve'
import type { DaysConfig } from './config'
import { handleGeoRoutes } from './geo-proxy'
import { readBody, sendJson } from './http'
import { resolveCaller } from './identity'
import { listDirectContacts } from './kkchat-contacts'
import { LocationDenied } from './location-domain'
import {
  createLocationGrant,
  listLocationAudit,
  listLocationGrants,
  ownerSharingStatus,
  pauseLocationSharing,
  resumeLocationSharing,
  revokeLocationGrant,
  saveSnapshot,
  updateLocationGrant,
  viewLocation,
} from './location-service'
import { RemoteAlarmDenied } from './remote-alarm-domain'

export { resetResolveLimits }

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'HEAD') return {}
  const raw = await readBody(req, 64 * 1024)
  if (!raw.length) return {}
  const parsed = JSON.parse(raw.toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LocationDenied('LOCATION_OUT_OF_SCOPE', 400, '请求体无效')
  }
  return parsed as Record<string, unknown>
}

export async function handleGuardianRoutes(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig): Promise<boolean> {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const guarded = path.startsWith('/api/days/location') || path === '/api/days/account/resolve' || path === '/api/days/contacts/kkchat' || path.startsWith('/api/days/geo/')
  if (!guarded) return false
  if (path.startsWith('/api/days/geo/')) return handleGeoRoutes(req, res, url, config)
  try {
    const caller = await resolveCaller(req, config)
    if (!caller) {
      sendJson(res, 401, { error: 'unauthorized' })
      return true
    }
    const actor = { sub: caller.sub, name: caller.name || '我' }
    const body = await readJson(req)
    if (path === '/api/days/account/resolve' && req.method === 'POST') {
      const identifier = typeof body.identifier === 'string' ? body.identifier : ''
      sendJson(res, 200, { account: await resolveAccountIdentifier(config, actor.sub, identifier) })
      return true
    }
    if (path === '/api/days/contacts/kkchat' && req.method === 'GET') {
      sendJson(res, 200, await listDirectContacts(config, actor.sub))
      return true
    }
    const parts = path.split('/')
    const section = parts[4]
    const id = parts[5]
    if (section === 'grants' && !id && req.method === 'GET') {
      sendJson(res, 200, await listLocationGrants(config, actor))
      return true
    }
    if (section === 'grants' && !id && req.method === 'POST') {
      sendJson(res, 201, { grant: await createLocationGrant(config, actor, body) })
      return true
    }
    if (section === 'grants' && id && req.method === 'PATCH') {
      sendJson(res, 200, { grant: await updateLocationGrant(config, actor, id, body) })
      return true
    }
    if (section === 'grants' && id && req.method === 'DELETE') {
      sendJson(res, 200, { grant: await revokeLocationGrant(config, actor, id) })
      return true
    }
    if (section === 'snapshot' && req.method === 'PUT') {
      sendJson(res, 200, await saveSnapshot(config, actor, body))
      return true
    }
    if (section === 'pause' && req.method === 'POST') {
      sendJson(res, 200, await pauseLocationSharing(config, actor))
      return true
    }
    if (section === 'resume' && req.method === 'POST') {
      sendJson(res, 200, await resumeLocationSharing(config, actor))
      return true
    }
    if (section === 'audit' && req.method === 'GET') {
      sendJson(res, 200, { events: await listLocationAudit(config, actor) })
      return true
    }
    if (section === 'status' && req.method === 'GET') {
      sendJson(res, 200, await ownerSharingStatus(config, actor))
      return true
    }
    if (section === 'people' && id && req.method === 'GET') {
      const claimed = typeof body.ownerUserId === 'string' ? body.ownerUserId : url.searchParams.get('ownerUserId') || ''
      if (claimed && claimed !== id) {
        sendJson(res, 403, { error: 'LOCATION_NOT_AUTHORIZED', message: '不能改写要查看的账号' })
        return true
      }
      sendJson(res, 200, { location: await viewLocation(config, actor, id) })
      return true
    }
    sendJson(res, 404, { error: 'not_found' })
  } catch (error) {
    if (error instanceof LocationDenied || error instanceof RemoteAlarmDenied) {
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
