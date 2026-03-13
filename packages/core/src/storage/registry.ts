/**
 * SQLite-based device registry using bun:sqlite (zero external deps).
 * Stores devices, fleets, fleet_members, profiles, and config.
 * Location: ~/.axctl/devices.db
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const AXCTL_DIR = join(homedir(), '.axctl')
const DB_PATH = join(AXCTL_DIR, 'devices.db')

let _db: Database | undefined

function getDb(): Database {
  if (_db) return _db

  if (!existsSync(AXCTL_DIR)) {
    mkdirSync(AXCTL_DIR, { recursive: true })
  }

  _db = new Database(DB_PATH)
  _db.exec('PRAGMA journal_mode=WAL')
  _db.exec('PRAGMA foreign_keys=ON')

  _db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      ip TEXT PRIMARY KEY,
      model TEXT,
      serial TEXT,
      firmware_version TEXT,
      mac_address TEXT,
      last_seen TEXT DEFAULT (datetime('now'))
    )
  `)

  _db.exec(`
    CREATE TABLE IF NOT EXISTS fleets (
      name TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  _db.exec(`
    CREATE TABLE IF NOT EXISTS fleet_members (
      fleet_name TEXT NOT NULL,
      ip TEXT NOT NULL,
      PRIMARY KEY (fleet_name, ip),
      FOREIGN KEY (fleet_name) REFERENCES fleets(name) ON DELETE CASCADE
    )
  `)

  _db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      name TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  _db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  return _db
}

// --- Device Registry ---

export interface DeviceRow {
  ip: string
  model: string | null
  serial: string | null
  firmware_version: string | null
  mac_address: string | null
  last_seen: string | null
}

export const deviceRegistry = {
  upsert(ip: string, model?: string, serial?: string, firmwareVersion?: string, macAddress?: string): void {
    const db = getDb()
    db.run(
      `INSERT INTO devices (ip, model, serial, firmware_version, mac_address, last_seen)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(ip) DO UPDATE SET
         model = COALESCE(excluded.model, model),
         serial = COALESCE(excluded.serial, serial),
         firmware_version = COALESCE(excluded.firmware_version, firmware_version),
         mac_address = COALESCE(excluded.mac_address, mac_address),
         last_seen = datetime('now')`,
      [ip, model ?? null, serial ?? null, firmwareVersion ?? null, macAddress ?? null]
    )
  },

  get(ip: string): DeviceRow | undefined {
    const db = getDb()
    return db.query('SELECT * FROM devices WHERE ip = ?').get(ip) as DeviceRow | undefined
  },

  list(): DeviceRow[] {
    const db = getDb()
    return db.query('SELECT * FROM devices ORDER BY last_seen DESC').all() as DeviceRow[]
  },

  remove(ip: string): boolean {
    const db = getDb()
    const result = db.run('DELETE FROM devices WHERE ip = ?', [ip])
    return result.changes > 0
  },
}

// --- Fleet Registry ---

export interface FleetRow {
  name: string
  ips: string[]
}

export const fleetRegistry = {
  create(name: string, ips: string[]): void {
    const db = getDb()
    db.run('INSERT OR REPLACE INTO fleets (name) VALUES (?)', [name])
    db.run('DELETE FROM fleet_members WHERE fleet_name = ?', [name])
    const insert = db.prepare('INSERT INTO fleet_members (fleet_name, ip) VALUES (?, ?)')
    for (const ip of ips) {
      insert.run(name, ip)
    }
  },

  get(name: string): FleetRow | undefined {
    const db = getDb()
    const fleet = db.query('SELECT name FROM fleets WHERE name = ?').get(name) as { name: string } | undefined
    if (!fleet) return undefined
    const members = db.query('SELECT ip FROM fleet_members WHERE fleet_name = ? ORDER BY ip').all(name) as Array<{ ip: string }>
    return { name: fleet.name, ips: members.map(m => m.ip) }
  },

  list(): FleetRow[] {
    const db = getDb()
    const fleets = db.query('SELECT name FROM fleets ORDER BY name').all() as Array<{ name: string }>
    return fleets.map(f => {
      const members = db.query('SELECT ip FROM fleet_members WHERE fleet_name = ? ORDER BY ip').all(f.name) as Array<{ ip: string }>
      return { name: f.name, ips: members.map(m => m.ip) }
    })
  },

  remove(name: string): boolean {
    const db = getDb()
    const result = db.run('DELETE FROM fleets WHERE name = ?', [name])
    return result.changes > 0
  },

  has(name: string): boolean {
    const db = getDb()
    const result = db.query('SELECT 1 FROM fleets WHERE name = ?').get(name)
    return result !== null
  },

  addDevices(name: string, ips: string[]): boolean {
    const db = getDb()
    if (!this.has(name)) return false
    const insert = db.prepare('INSERT OR IGNORE INTO fleet_members (fleet_name, ip) VALUES (?, ?)')
    for (const ip of ips) {
      insert.run(name, ip)
    }
    return true
  },

  removeDevices(name: string, ips: string[]): boolean {
    const db = getDb()
    if (!this.has(name)) return false
    const del = db.prepare('DELETE FROM fleet_members WHERE fleet_name = ? AND ip = ?')
    for (const ip of ips) {
      del.run(name, ip)
    }
    return true
  },
}

// --- Profile Registry ---

export interface ProfileData {
  name: string
  credentials: Record<string, { ip: string; username: string; password: string }>
  fleets: Record<string, { name: string; ips: string[] }>
  defaults: { format?: string; timeout?: number }
}

export const profileRegistry = {
  create(name: string): void {
    const db = getDb()
    const data: ProfileData = { name, credentials: {}, fleets: {}, defaults: {} }
    db.run('INSERT OR REPLACE INTO profiles (name, data) VALUES (?, ?)', [name, JSON.stringify(data)])
  },

  get(name: string): ProfileData | undefined {
    const db = getDb()
    const row = db.query('SELECT data FROM profiles WHERE name = ?').get(name) as { data: string } | undefined
    if (!row) return undefined
    return JSON.parse(row.data) as ProfileData
  },

  list(): ProfileData[] {
    const db = getDb()
    const rows = db.query('SELECT data FROM profiles ORDER BY name').all() as Array<{ data: string }>
    return rows.map(r => JSON.parse(r.data) as ProfileData)
  },

  update(name: string, data: ProfileData): void {
    const db = getDb()
    db.run('UPDATE profiles SET data = ? WHERE name = ?', [JSON.stringify(data), name])
  },

  remove(name: string): boolean {
    const db = getDb()
    const result = db.run('DELETE FROM profiles WHERE name = ?', [name])
    if (result.changes > 0) {
      const active = configRegistry.get('activeProfile')
      if (active === name) configRegistry.delete('activeProfile')
      return true
    }
    return false
  },

  has(name: string): boolean {
    const db = getDb()
    const result = db.query('SELECT 1 FROM profiles WHERE name = ?').get(name)
    return result !== null
  },
}

// --- Config Registry ---

export const configRegistry = {
  get(key: string): string | undefined {
    const db = getDb()
    const row = db.query('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  },

  set(key: string, value: string): void {
    const db = getDb()
    db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value])
  },

  delete(key: string): boolean {
    const db = getDb()
    const result = db.run('DELETE FROM config WHERE key = ?', [key])
    return result.changes > 0
  },
}

/** Get the database path (useful for Raycast/Swift consumers) */
export function getDbPath(): string {
  return DB_PATH
}

/** Close the database connection (for clean shutdown) */
export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = undefined
  }
}
