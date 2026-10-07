import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DaysConfig } from './config'

export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  })
  res.end(body)
}

export function sendText(res: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  })
  res.end(body)
}

export function redirect(res: ServerResponse, location: string, extraHeaders: Record<string, string> = {}) {
  res.writeHead(302, { location, 'cache-control': 'no-store', ...extraHeaders })
  res.end()
}

export function readCookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie || ''
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

export function cookieHeader(
  name: string,
  value: string,
  options: { maxAge?: number; secure?: boolean; path?: string; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' | 'None' },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`]
  if (options.httpOnly !== false) parts.push('HttpOnly')
  parts.push(`SameSite=${options.sameSite || 'Lax'}`)
  if (options.secure) parts.push('Secure')
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, options.maxAge)}`)
  return parts.join('; ')
}

export function clearCookie(name: string, options: { secure?: boolean; path?: string } = {}): string {
  return cookieHeader(name, '', { ...options, maxAge: 0 })
}

export function applyCors(req: IncomingMessage, res: ServerResponse, config: DaysConfig): boolean {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : ''
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-credentials', 'true')
    res.setHeader('vary', 'Origin')
    res.setHeader('access-control-allow-headers', 'authorization, content-type')
    res.setHeader('access-control-allow-methods', 'GET, PUT, POST, PATCH, DELETE, OPTIONS')
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return true
  }
  return false
}

export function requestOriginAllowed(req: IncomingMessage, config: DaysConfig): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  return config.allowedOrigins.includes(origin)
}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim()
}

export function log(level: string, message: string, extra: Record<string, unknown> = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), level, message, ...extra })}\n`)
}
