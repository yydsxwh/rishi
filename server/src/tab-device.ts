/**
 * 日事 Web 的多账号设备。Android 走 Bearer，不进这里。
 * 设备账本是 data 目录里的 JSON，不放进浏览器可读存储。
 */

import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { DaysConfig } from './config'
import { readCookies } from './http'
import { readSessionToken, type RishiSession } from './session'
import {
  DEVICE_COOKIE,
  holdCookieName,
  isTabContextId,
  planAddAccount,
  multiAccountTabsEnabled,
  resolveAccess,
  type AccountRecord,
  type BrokerState,
} from './tab-decision'

type DeviceFile = {
  explicitPick: boolean
  accounts: Array<{ holdId: string; sub: string; name: string; active: boolean }>
  tabs: Array<{ contextId: string; holdId: string; revoked: boolean }>
}

function emptyDevice(): DeviceFile {
  return { explicitPick: false, accounts: [], tabs: [] }
}

function devicePath(config: DaysConfig, token: string) {
  return join(config.dataDir, 'devices', `${createHash('sha256').update(token).digest('hex')}.json`)
}

async function readDevice(config: DaysConfig, token: string): Promise<DeviceFile | null> {
  try {
    return JSON.parse(await readFile(devicePath(config, token), 'utf8')) as DeviceFile
  } catch {
    return null
  }
}

async function writeDevice(config: DaysConfig, token: string, device: DeviceFile) {
  const path = devicePath(config, token)
  await mkdir(join(config.dataDir, 'devices'), { recursive: true })
  await writeFile(path, JSON.stringify(device))
}

function toState(device: DeviceFile): BrokerState {
  const accounts: AccountRecord[] = device.accounts.map((account) => ({
    sessionId: account.holdId,
    userId: account.sub,
    active: account.active,
    grantedRoles: [],
    defaultRole: null,
    pendingReview: false,
    authTimeSec: null,
    display: {
      name: account.name,
      kkNumber: null,
      emailMasked: '',
      phoneMasked: '',
      avatarUrl: '',
      subHint: account.sub,
    },
  }))
  return {
    explicitPick: device.explicitPick,
    defaultSessionId: null,
    accounts,
    tabs: device.tabs.filter((tab) => !tab.revoked).map((tab) => ({
      contextId: tab.contextId,
      sessionId: tab.holdId,
      activeRole: '',
      revoked: false,
    })),
  }
}

export async function rememberWebAccount(
  config: DaysConfig,
  input: { deviceToken: string | undefined; session: RishiSession; contextId?: string | null },
): Promise<{ deviceToken: string; setLegacyCookie: boolean }> {
  const deviceToken = input.deviceToken || randomBytes(32).toString('base64url')
  const device = (await readDevice(config, deviceToken)) || emptyDevice()
  const others = device.accounts.filter((account) => account.sub !== input.session.sub)
  device.accounts = [...others, { holdId: input.session.sid, sub: input.session.sub, name: input.session.name, active: true }]
  device.explicitPick = device.accounts.filter((account) => account.active).length > 1
  if (isTabContextId(input.contextId)) {
    const plan = planAddAccount(toState({ ...device, accounts: others.map((account) => ({ ...account })) }), {
      contextId: input.contextId,
      account: toState(device).accounts.find((account) => account.sessionId === input.session.sid) as AccountRecord,
    })
    for (const mutation of plan.mutations) {
      if (mutation.op !== 'bind') continue
      device.tabs = device.tabs.filter((tab) => tab.contextId !== mutation.contextId)
      device.tabs.push({ contextId: mutation.contextId, holdId: mutation.sessionId, revoked: false })
    }
  }
  await writeDevice(config, deviceToken, device)
  return { deviceToken, setLegacyCookie: !device.explicitPick }
}

export async function sessionForWebTab(req: IncomingMessage, config: DaysConfig): Promise<RishiSession | null | 'ambiguous'> {
  if (!multiAccountTabsEnabled()) return null
  const cookies = readCookies(req)
  const deviceToken = cookies[DEVICE_COOKIE]
  if (!deviceToken) return null
  const device = await readDevice(config, deviceToken)
  if (!device) return null
  const tab = String(req.headers['x-yyds-tab'] || '')
  const decision = resolveAccess(toState(device), { tabHeader: tab || null })
  if (decision.kind === 'ambiguous') return 'ambiguous'
  if (decision.kind !== 'ready') return null
  const token = cookies[holdCookieName(decision.account.sessionId)] || (!device.explicitPick ? cookies.rishi_session : '')
  const session = readSessionToken(token, config)
  if (!session || session.sub !== decision.account.userId) return null
  return session
}

export async function saveOidcAttempt(config: DaysConfig, state: string, sealed: string) {
  const dir = join(config.dataDir, 'oidc-attempts')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, `${createHash('sha256').update(state).digest('hex')}.json`),
    JSON.stringify({ sealed, exp: Date.now() + 10 * 60 * 1000 }),
  )
}

export async function takeOidcAttempt(config: DaysConfig, state: string): Promise<string | null> {
  const path = join(config.dataDir, 'oidc-attempts', `${createHash('sha256').update(state).digest('hex')}.json`)
  try {
    const body = JSON.parse(await readFile(path, 'utf8')) as { sealed?: string; exp?: number }
    await writeFile(path, JSON.stringify({ sealed: '', exp: 0 }))
    if (!body.sealed || (body.exp || 0) < Date.now()) return null
    return body.sealed
  } catch {
    return null
  }
}

export async function savePendingLogin(
  config: DaysConfig,
  input: { token: string; session: RishiSession; returnTo: string },
) {
  const id = randomBytes(18).toString('base64url')
  const dir = join(config.dataDir, 'pending-logins')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, `${createHash('sha256').update(id).digest('hex')}.json`),
    JSON.stringify({ ...input, exp: Date.now() + 2 * 60 * 1000 }),
  )
  return id
}

export async function takePendingLogin(config: DaysConfig, id: string) {
  if (!id || id.length > 80) return null
  const path = join(config.dataDir, 'pending-logins', `${createHash('sha256').update(id).digest('hex')}.json`)
  try {
    const body = JSON.parse(await readFile(path, 'utf8')) as {
      token?: string
      session?: RishiSession
      returnTo?: string
      exp?: number
    }
    await writeFile(path, JSON.stringify({ exp: 0 }))
    if (!body.token || !body.session?.sub || (body.exp || 0) < Date.now()) return null
    return { token: body.token, session: body.session, returnTo: body.returnTo || '/' }
  } catch {
    return null
  }
}

export { DEVICE_COOKIE, holdCookieName }
