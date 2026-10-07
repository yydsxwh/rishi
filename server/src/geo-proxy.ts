import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DaysConfig } from './config'
import { log, sendJson } from './http'
import { resolveCaller } from './identity'

const tiles = new Map<string, number[]>()

function allowTile(key: string, now: number): boolean {
  const fresh = (tiles.get(key) || []).filter((at) => now - at < 60_000)
  if (fresh.length >= 240) {
    tiles.set(key, fresh)
    return false
  }
  fresh.push(now)
  tiles.set(key, fresh)
  return true
}

/** 只转发到配置好的地图源，不接受客户端指定的上游地址。 */
export async function handleGeoRoutes(req: IncomingMessage, res: ServerResponse, url: URL, config: DaysConfig): Promise<boolean> {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const tile = path.match(/^\/api\/days\/geo\/tile\/(\d+)\/(\d+)\/(\d+)(?:\.png)?$/)
  const reverse = path === '/api/days/geo/reverse'
  if (!tile && !reverse) return false
  const caller = await resolveCaller(req, config)
  if (!caller) {
    sendJson(res, 401, { error: 'unauthorized' })
    return true
  }
  if (!config.geoUpstream) {
    sendJson(res, 503, { error: 'geo_unconfigured' })
    return true
  }
  if (!allowTile(caller.sub, Date.now())) {
    sendJson(res, 429, { error: 'rate_limited' })
    return true
  }
  if (tile) {
    const z = Number(tile[1])
    const x = Number(tile[2])
    const y = Number(tile[3])
    if (z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
      sendJson(res, 400, { error: 'bad_tile' })
      return true
    }
    const upstream = `${config.geoUpstream}/api/geo/tile/${z}/${x}/${y}`
    const response = await fetch(upstream, { signal: AbortSignal.timeout(8000) }).catch(() => null)
    if (!response?.ok) {
      log('warn', 'geo tile failed', { status: response?.status || 0 })
      sendJson(res, 502, { error: 'geo_unavailable' })
      return true
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600' })
    res.end(bytes)
    return true
  }
  const lat = Number(url.searchParams.get('lat'))
  const lng = Number(url.searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    sendJson(res, 400, { error: 'bad_coordinates' })
    return true
  }
  const upstream = new URL(`${config.geoUpstream}/api/geo/reverse`)
  upstream.searchParams.set('lat', String(lat))
  upstream.searchParams.set('lng', String(lng))
  const response = await fetch(upstream, { signal: AbortSignal.timeout(8000) }).catch(() => null)
  if (!response?.ok) {
    log('warn', 'geo reverse failed', { status: response?.status || 0 })
    sendJson(res, 502, { error: 'geo_unavailable' })
    return true
  }
  const body = await response.json().catch(() => ({}))
  sendJson(res, 200, body)
  return true
}
