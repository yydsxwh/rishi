import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DaysConfig } from './config'
import type { OwnerPrefs, RemoteAlarm, RemoteAlarmGrant } from './remote-alarm-domain'

export type AuditEvent = {
  id: string
  at: string
  action: string
  ownerUserId: string
  actorUserId: string
  grantId?: string
  alarmId?: string
  summary: string
}

export type UserDevice = {
  id: string
  userId: string
  platform: 'android'
  pushToken: string
  appVersion: string
  lastSeenAt: string
  enabled: boolean
}

export type AlarmDb = {
  schemaVersion: 1
  grants: RemoteAlarmGrant[]
  alarms: RemoteAlarm[]
  devices: UserDevice[]
  audit: AuditEvent[]
  prefs: Record<string, OwnerPrefs>
  nonces: Record<string, string>
}

const tails = new Map<string, Promise<unknown>>()

function emptyDb(): AlarmDb {
  return { schemaVersion: 1, grants: [], alarms: [], devices: [], audit: [], prefs: {}, nonces: {} }
}

export function alarmDbPath(config: DaysConfig): string {
  return join(config.dataDir, 'remote-alarm', 'db.json')
}

async function readDb(config: DaysConfig): Promise<AlarmDb> {
  try {
    const parsed = JSON.parse(await readFile(alarmDbPath(config), 'utf8')) as Partial<AlarmDb>
    if (parsed.schemaVersion !== 1) throw new Error('REMOTE_ALARM_DB_VERSION')
    return {
      schemaVersion: 1,
      grants: Array.isArray(parsed.grants) ? parsed.grants : [],
      alarms: Array.isArray(parsed.alarms) ? parsed.alarms : [],
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      prefs: parsed.prefs && typeof parsed.prefs === 'object' ? parsed.prefs : {},
      nonces: parsed.nonces && typeof parsed.nonces === 'object' ? parsed.nonces : {},
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDb()
    throw error
  }
}

async function writeDb(config: DaysConfig, db: AlarmDb): Promise<void> {
  const target = alarmDbPath(config)
  await mkdir(join(config.dataDir, 'remote-alarm'), { recursive: true })
  const temp = `${target}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(db))
  await rename(temp, target)
}

/** 读改写串行。抛错时不落盘，避免写坏已有日历同步文件。 */
export function withAlarmDb<T>(config: DaysConfig, mutate: (db: AlarmDb) => T | Promise<T>): Promise<T> {
  const key = config.dataDir
  const prev = tails.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(async () => {
    const db = await readDb(config)
    const draft = structuredClone(db)
    const result = await mutate(draft)
    await writeDb(config, draft)
    return result
  })
  tails.set(key, run.then(() => undefined, () => undefined))
  return run
}

export async function readAlarmDb(config: DaysConfig): Promise<AlarmDb> {
  return readDb(config)
}
