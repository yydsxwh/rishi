import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { DaysConfig } from './config'
import type { LocationAudit, LocationGrant, LocationSnapshot } from './location-domain'

export type LocationPrefs = { pausedAll: boolean }

export type ResolveAudit = {
  id: string
  at: string
  actorUserId: string
  outcome: string
  matchedBy?: string
  maskedIdentifier?: string
}

export type LocationDb = {
  schemaVersion: 1
  grants: LocationGrant[]
  snapshots: LocationSnapshot[]
  audit: LocationAudit[]
  prefs: Record<string, LocationPrefs>
  resolveAudit: ResolveAudit[]
}

const tails = new Map<string, Promise<unknown>>()

function emptyDb(): LocationDb {
  return { schemaVersion: 1, grants: [], snapshots: [], audit: [], prefs: {}, resolveAudit: [] }
}

export function locationDbPath(config: DaysConfig): string {
  return join(config.dataDir, 'location', 'db.json')
}

async function readDb(config: DaysConfig): Promise<LocationDb> {
  try {
    const parsed = JSON.parse(await readFile(locationDbPath(config), 'utf8')) as Partial<LocationDb>
    return {
      schemaVersion: 1,
      grants: Array.isArray(parsed.grants) ? parsed.grants : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      prefs: parsed.prefs && typeof parsed.prefs === 'object' ? parsed.prefs : {},
      resolveAudit: Array.isArray(parsed.resolveAudit) ? parsed.resolveAudit : [],
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDb()
    throw error
  }
}

async function writeDb(config: DaysConfig, db: LocationDb): Promise<void> {
  const target = locationDbPath(config)
  await mkdir(join(config.dataDir, 'location'), { recursive: true })
  const temp = `${target}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(db))
  await rename(temp, target)
}

export function withLocationDb<T>(config: DaysConfig, mutate: (db: LocationDb) => T | Promise<T>): Promise<T> {
  const key = config.dataDir
  const prev = tails.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(async () => {
    const draft = structuredClone(await readDb(config))
    const result = await mutate(draft)
    await writeDb(config, draft)
    return result
  })
  tails.set(key, run.then(() => undefined, () => undefined))
  return run
}

export async function readLocationDb(config: DaysConfig): Promise<LocationDb> {
  return readDb(config)
}
