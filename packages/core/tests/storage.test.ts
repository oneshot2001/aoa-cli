import { describe, test, expect, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

function createTestDb(): Database {
  const db = new Database(':memory:')
  db.run('PRAGMA foreign_keys=ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      ip TEXT PRIMARY KEY,
      model TEXT,
      serial TEXT,
      firmware_version TEXT,
      mac_address TEXT,
      last_seen TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS fleets (
      name TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS fleet_members (
      fleet_name TEXT NOT NULL,
      ip TEXT NOT NULL,
      PRIMARY KEY (fleet_name, ip),
      FOREIGN KEY (fleet_name) REFERENCES fleets(name) ON DELETE CASCADE
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      name TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  return db
}

describe('SQLite Registry', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  describe('devices', () => {
    test('upsert and get a device', () => {
      db.run(`INSERT INTO devices (ip, model, serial) VALUES (?, ?, ?)`, ['192.168.1.1', 'Q6135', 'ABCD1234'])
      const row = db.query('SELECT * FROM devices WHERE ip = ?').get('192.168.1.1') as { ip: string; model: string; serial: string }
      expect(row.ip).toBe('192.168.1.1')
      expect(row.model).toBe('Q6135')
      expect(row.serial).toBe('ABCD1234')
    })

    test('upsert updates existing device', () => {
      db.run(`INSERT INTO devices (ip, model) VALUES (?, ?)`, ['10.0.0.1', 'M3077'])
      db.run(
        `INSERT INTO devices (ip, model, serial) VALUES (?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET model = COALESCE(excluded.model, model), serial = COALESCE(excluded.serial, serial)`,
        ['10.0.0.1', 'M3077-V', 'XYZ789']
      )
      const row = db.query('SELECT * FROM devices WHERE ip = ?').get('10.0.0.1') as { model: string; serial: string }
      expect(row.model).toBe('M3077-V')
      expect(row.serial).toBe('XYZ789')
    })

    test('list returns all devices', () => {
      db.run(`INSERT INTO devices (ip, model) VALUES (?, ?)`, ['10.0.0.1', 'Q6135'])
      db.run(`INSERT INTO devices (ip, model) VALUES (?, ?)`, ['10.0.0.2', 'P3245'])
      const rows = db.query('SELECT * FROM devices').all()
      expect(rows).toHaveLength(2)
    })

    test('delete removes device', () => {
      db.run(`INSERT INTO devices (ip, model) VALUES (?, ?)`, ['10.0.0.1', 'Q6135'])
      const result = db.run('DELETE FROM devices WHERE ip = ?', ['10.0.0.1'])
      expect(result.changes).toBe(1)
      const row = db.query('SELECT * FROM devices WHERE ip = ?').get('10.0.0.1')
      expect(row).toBeNull()
    })
  })

  describe('fleets', () => {
    test('create fleet with members', () => {
      db.run('INSERT INTO fleets (name) VALUES (?)', ['lab'])
      db.run('INSERT INTO fleet_members (fleet_name, ip) VALUES (?, ?)', ['lab', '10.0.0.1'])
      db.run('INSERT INTO fleet_members (fleet_name, ip) VALUES (?, ?)', ['lab', '10.0.0.2'])
      const members = db.query('SELECT ip FROM fleet_members WHERE fleet_name = ?').all('lab') as Array<{ ip: string }>
      expect(members).toHaveLength(2)
    })

    test('cascade delete removes members', () => {
      db.run('INSERT INTO fleets (name) VALUES (?)', ['temp'])
      db.run('INSERT INTO fleet_members (fleet_name, ip) VALUES (?, ?)', ['temp', '10.0.0.1'])
      db.run('DELETE FROM fleets WHERE name = ?', ['temp'])
      const members = db.query('SELECT * FROM fleet_members WHERE fleet_name = ?').all('temp')
      expect(members).toHaveLength(0)
    })

    test('add devices — duplicates ignored', () => {
      db.run('INSERT INTO fleets (name) VALUES (?)', ['prod'])
      db.run('INSERT INTO fleet_members (fleet_name, ip) VALUES (?, ?)', ['prod', '10.0.0.1'])
      db.run('INSERT OR IGNORE INTO fleet_members (fleet_name, ip) VALUES (?, ?)', ['prod', '10.0.0.2'])
      db.run('INSERT OR IGNORE INTO fleet_members (fleet_name, ip) VALUES (?, ?)', ['prod', '10.0.0.1'])
      const members = db.query('SELECT ip FROM fleet_members WHERE fleet_name = ?').all('prod') as Array<{ ip: string }>
      expect(members).toHaveLength(2)
    })

    test('remove devices from fleet', () => {
      db.run('INSERT INTO fleets (name) VALUES (?)', ['lab'])
      db.run('INSERT INTO fleet_members (fleet_name, ip) VALUES (?, ?)', ['lab', '10.0.0.1'])
      db.run('INSERT INTO fleet_members (fleet_name, ip) VALUES (?, ?)', ['lab', '10.0.0.2'])
      db.run('DELETE FROM fleet_members WHERE fleet_name = ? AND ip = ?', ['lab', '10.0.0.1'])
      const members = db.query('SELECT ip FROM fleet_members WHERE fleet_name = ?').all('lab') as Array<{ ip: string }>
      expect(members).toHaveLength(1)
      expect(members[0]!.ip).toBe('10.0.0.2')
    })
  })

  describe('profiles', () => {
    test('create and get profile', () => {
      const data = JSON.stringify({ name: 'office', credentials: {}, fleets: {}, defaults: {} })
      db.run('INSERT INTO profiles (name, data) VALUES (?, ?)', ['office', data])
      const row = db.query('SELECT data FROM profiles WHERE name = ?').get('office') as { data: string }
      expect(JSON.parse(row.data).name).toBe('office')
    })

    test('update profile data', () => {
      const data = JSON.stringify({ name: 'test', credentials: {}, fleets: {}, defaults: {} })
      db.run('INSERT INTO profiles (name, data) VALUES (?, ?)', ['test', data])
      const updated = JSON.stringify({ name: 'test', credentials: {}, fleets: {}, defaults: { format: 'json' } })
      db.run('UPDATE profiles SET data = ? WHERE name = ?', [updated, 'test'])
      const row = db.query('SELECT data FROM profiles WHERE name = ?').get('test') as { data: string }
      expect(JSON.parse(row.data).defaults.format).toBe('json')
    })
  })

  describe('config', () => {
    test('set and get config value', () => {
      db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['activeProfile', 'office'])
      const row = db.query('SELECT value FROM config WHERE key = ?').get('activeProfile') as { value: string }
      expect(row.value).toBe('office')
    })

    test('delete config value', () => {
      db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['key1', 'val1'])
      db.run('DELETE FROM config WHERE key = ?', ['key1'])
      const row = db.query('SELECT value FROM config WHERE key = ?').get('key1')
      expect(row).toBeNull()
    })
  })
})
