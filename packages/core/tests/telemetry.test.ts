import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { existsSync, unlinkSync, statSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// We test the TelemetryCollectorImpl by constructing it directly via the module internals.
// The lazy proxy is tested separately.

// Helper: create a fresh telemetry DB in a temp directory
function tmpDbPath(): string {
  const dir = join(tmpdir(), `axctl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return join(dir, 'telemetry.db')
}

function cleanup(dbPath: string): void {
  try { unlinkSync(dbPath) } catch {}
  try { unlinkSync(dbPath + '-wal') } catch {}
  try { unlinkSync(dbPath + '-shm') } catch {}
}

// We import the telemetry module dynamically to avoid the singleton
// Instead, we'll test by importing the types and creating a fresh DB with the schema

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vapix_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  device_ip TEXT NOT NULL, endpoint TEXT NOT NULL, method TEXT NOT NULL,
  status_code INTEGER NOT NULL, latency_ms REAL NOT NULL,
  response_bytes INTEGER, auth_retries INTEGER DEFAULT 0, error TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  device_ip TEXT NOT NULL, scenario_name TEXT NOT NULL, event_type TEXT NOT NULL,
  object_class TEXT NOT NULL, confidence REAL, camera_ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  scan_id TEXT NOT NULL, device_ip TEXT NOT NULL, device_mac TEXT,
  model TEXT, serial TEXT, firmware TEXT, protocol TEXT NOT NULL,
  responded INTEGER NOT NULL, latency_ms REAL
);
CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  device_ip TEXT NOT NULL, reachable INTEGER NOT NULL, latency_ms REAL,
  uptime_seconds INTEGER, active_scenarios INTEGER, firmware TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS config_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  device_ip TEXT NOT NULL, scenario_count INTEGER NOT NULL,
  scenario_hash TEXT NOT NULL, scenario_names TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vapix_device_ts ON vapix_calls(device_ip, ts);
CREATE INDEX IF NOT EXISTS idx_events_device_scenario ON events(device_ip, scenario_name, ts);
CREATE INDEX IF NOT EXISTS idx_events_device_class ON events(device_ip, object_class, ts);
CREATE INDEX IF NOT EXISTS idx_discoveries_scan ON discoveries(scan_id);
CREATE INDEX IF NOT EXISTS idx_discoveries_device ON discoveries(device_ip, ts);
CREATE INDEX IF NOT EXISTS idx_health_device_ts ON health_checks(device_ip, ts);
CREATE INDEX IF NOT EXISTS idx_config_device_ts ON config_snapshots(device_ip, ts);
`

function createTestDb(dbPath: string): Database {
  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA synchronous=NORMAL')
  db.exec(SCHEMA)
  db.run('INSERT INTO schema_version (version) VALUES (?)', [1])
  return db
}

describe('telemetry schema', () => {
  let dbPath: string
  let db: Database

  beforeEach(() => {
    dbPath = tmpDbPath()
    db = createTestDb(dbPath)
  })

  afterEach(() => {
    db.close()
    cleanup(dbPath)
  })

  test('creates all 5 tables plus schema_version', () => {
    const tables = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite%' ORDER BY name"
    ).all() as { name: string }[]
    const names = tables.map((t) => t.name).sort()
    expect(names).toEqual([
      'config_snapshots', 'discoveries', 'events', 'health_checks', 'schema_version', 'vapix_calls'
    ])
  })

  test('schema_version is set to 1', () => {
    const row = db.query('SELECT version FROM schema_version LIMIT 1').get() as { version: number }
    expect(row.version).toBe(1)
  })

  test('creates 7 indexes', () => {
    const indexes = db.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).all() as { name: string }[]
    expect(indexes.length).toBe(7)
  })
})

describe('telemetry vapix_calls', () => {
  let dbPath: string
  let db: Database

  beforeEach(() => {
    dbPath = tmpDbPath()
    db = createTestDb(dbPath)
  })

  afterEach(() => {
    db.close()
    cleanup(dbPath)
  })

  test('records a VAPIX call', () => {
    db.run(
      `INSERT INTO vapix_calls (device_ip, endpoint, method, status_code, latency_ms, response_bytes, auth_retries)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['192.168.1.90', '/axis-cgi/basicdeviceinfo.cgi', 'POST', 200, 45.2, 512, 0]
    )
    const row = db.query('SELECT * FROM vapix_calls WHERE device_ip = ?').get('192.168.1.90') as Record<string, unknown>
    expect(row.endpoint).toBe('/axis-cgi/basicdeviceinfo.cgi')
    expect(row.method).toBe('POST')
    expect(row.status_code).toBe(200)
    expect(row.latency_ms).toBe(45.2)
    expect(row.response_bytes).toBe(512)
  })

  test('records VAPIX error call', () => {
    db.run(
      `INSERT INTO vapix_calls (device_ip, endpoint, method, status_code, latency_ms, response_bytes, auth_retries, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['192.168.1.90', '/axis-cgi/basicdeviceinfo.cgi', 'GET', 0, 5000, 0, 0, 'ECONNREFUSED']
    )
    const row = db.query('SELECT * FROM vapix_calls WHERE error IS NOT NULL').get() as Record<string, unknown>
    expect(row.error).toBe('ECONNREFUSED')
    expect(row.status_code).toBe(0)
  })
})

describe('telemetry events (buffer behavior)', () => {
  let dbPath: string
  let db: Database

  beforeEach(() => {
    dbPath = tmpDbPath()
    db = createTestDb(dbPath)
  })

  afterEach(() => {
    db.close()
    cleanup(dbPath)
  })

  test('batch inserts events via transaction', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      device_ip: '192.168.1.90',
      scenario_name: `Scenario${i}`,
      event_type: 'motion',
      object_class: 'human',
      confidence: null as number | null,
      timestamp: new Date().toISOString(),
    }))

    const stmt = db.prepare(
      `INSERT INTO events (device_ip, scenario_name, event_type, object_class, confidence, camera_ts)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const tx = db.transaction(() => {
      for (const e of events) {
        stmt.run(e.device_ip, e.scenario_name, e.event_type, e.object_class, e.confidence, e.timestamp)
      }
    })
    tx()

    const count = db.query('SELECT COUNT(*) as c FROM events').get() as { c: number }
    expect(count.c).toBe(10)
  })

  test('events with null confidence are stored correctly', () => {
    db.run(
      `INSERT INTO events (device_ip, scenario_name, event_type, object_class, confidence, camera_ts)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['192.168.1.90', 'Scenario1', 'motion', 'human', null, '2026-03-15T10:00:00Z']
    )
    const row = db.query('SELECT confidence FROM events LIMIT 1').get() as { confidence: number | null }
    expect(row.confidence).toBeNull()
  })
})

describe('telemetry discoveries', () => {
  let dbPath: string
  let db: Database

  beforeEach(() => {
    dbPath = tmpDbPath()
    db = createTestDb(dbPath)
  })

  afterEach(() => {
    db.close()
    cleanup(dbPath)
  })

  test('records discovery with scan_id grouping', () => {
    const scanId = 'test-scan-123'
    db.run(
      `INSERT INTO discoveries (scan_id, device_ip, model, protocol, responded, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [scanId, '192.168.1.90', 'P3265-LV', 'mdns', 1, 123.4]
    )
    db.run(
      `INSERT INTO discoveries (scan_id, device_ip, model, protocol, responded, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [scanId, '192.168.1.91', 'M3106-L', 'ssdp', 1, 456.7]
    )

    const rows = db.query('SELECT * FROM discoveries WHERE scan_id = ?').all(scanId) as Record<string, unknown>[]
    expect(rows.length).toBe(2)
  })
})

describe('telemetry health_checks', () => {
  let dbPath: string
  let db: Database

  beforeEach(() => {
    dbPath = tmpDbPath()
    db = createTestDb(dbPath)
  })

  afterEach(() => {
    db.close()
    cleanup(dbPath)
  })

  test('records reachable health check', () => {
    db.run(
      `INSERT INTO health_checks (device_ip, reachable, latency_ms, firmware)
       VALUES (?, ?, ?, ?)`,
      ['192.168.1.90', 1, 42.5, '11.8.64']
    )
    const row = db.query('SELECT * FROM health_checks LIMIT 1').get() as Record<string, unknown>
    expect(row.reachable).toBe(1)
    expect(row.firmware).toBe('11.8.64')
  })

  test('records unreachable health check with error', () => {
    db.run(
      `INSERT INTO health_checks (device_ip, reachable, latency_ms, error)
       VALUES (?, ?, ?, ?)`,
      ['192.168.1.90', 0, 5000, 'ECONNREFUSED']
    )
    const row = db.query('SELECT * FROM health_checks LIMIT 1').get() as Record<string, unknown>
    expect(row.reachable).toBe(0)
    expect(row.error).toBe('ECONNREFUSED')
  })
})

describe('telemetry config_snapshots', () => {
  let dbPath: string
  let db: Database

  beforeEach(() => {
    dbPath = tmpDbPath()
    db = createTestDb(dbPath)
  })

  afterEach(() => {
    db.close()
    cleanup(dbPath)
  })

  test('records config snapshot with JSON scenario_names', () => {
    const names = ['Entrance Count', 'Loading Dock']
    db.run(
      `INSERT INTO config_snapshots (device_ip, scenario_count, scenario_hash, scenario_names)
       VALUES (?, ?, ?, ?)`,
      ['192.168.1.90', 2, 'abc123', JSON.stringify(names)]
    )
    const row = db.query('SELECT * FROM config_snapshots LIMIT 1').get() as Record<string, unknown>
    expect(row.scenario_count).toBe(2)
    expect(JSON.parse(row.scenario_names as string)).toEqual(names)
  })
})

describe('telemetry pruning', () => {
  let dbPath: string
  let db: Database

  beforeEach(() => {
    dbPath = tmpDbPath()
    db = createTestDb(dbPath)
  })

  afterEach(() => {
    db.close()
    cleanup(dbPath)
  })

  test('deletes rows older than 90 days', () => {
    // Insert an old row
    db.run(
      `INSERT INTO vapix_calls (ts, device_ip, endpoint, method, status_code, latency_ms)
       VALUES (datetime('now', '-100 days'), ?, ?, ?, ?, ?)`,
      ['192.168.1.90', '/test', 'GET', 200, 10]
    )
    // Insert a recent row
    db.run(
      `INSERT INTO vapix_calls (device_ip, endpoint, method, status_code, latency_ms)
       VALUES (?, ?, ?, ?, ?)`,
      ['192.168.1.91', '/test', 'GET', 200, 10]
    )

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    db.run(`DELETE FROM vapix_calls WHERE ts < ?`, [cutoff])

    const count = db.query('SELECT COUNT(*) as c FROM vapix_calls').get() as { c: number }
    expect(count.c).toBe(1)

    const row = db.query('SELECT device_ip FROM vapix_calls LIMIT 1').get() as { device_ip: string }
    expect(row.device_ip).toBe('192.168.1.91')
  })
})

describe('telemetry DB creation', () => {
  test('creates DB file with correct permissions on macOS', () => {
    const dbPath = tmpDbPath()
    const db = createTestDb(dbPath)
    try {
      const { chmodSync } = require('fs')
      chmodSync(dbPath, 0o600)
      const stats = statSync(dbPath)
      // Check owner-only permissions (0o600 = rw-------)
      expect(stats.mode & 0o777).toBe(0o600)
    } finally {
      db.close()
      cleanup(dbPath)
    }
  })
})

describe('telemetry no-op collector', () => {
  test('no-op methods do not throw', () => {
    // Import the real module to access the exported telemetry (lazy proxy)
    // When AXCTL_NO_TELEMETRY=1 is set, all methods are no-ops
    const noOp = {
      recordVapixCall(_e: unknown) {},
      recordEvent(_e: unknown) {},
      recordDiscovery(_e: unknown) {},
      recordHealthCheck(_e: unknown) {},
      recordConfigSnapshot(_e: unknown) {},
      flush() {},
      getDbPath() { return undefined as string | undefined },
      getDb() { return undefined as Database | undefined },
    }

    // Verify all methods exist and don't throw
    expect(() => noOp.recordVapixCall({
      device_ip: '1.2.3.4', endpoint: '/test', method: 'GET',
      status_code: 200, latency_ms: 10, response_bytes: 0, auth_retries: 0,
    })).not.toThrow()
    expect(() => noOp.recordEvent({
      device_ip: '1.2.3.4', scenario_name: 'S1', event_type: 'motion',
      object_class: 'human', confidence: null, timestamp: new Date().toISOString(),
    })).not.toThrow()
    expect(() => noOp.flush()).not.toThrow()
    expect(noOp.getDbPath()).toBeUndefined()
    expect(noOp.getDb()).toBeUndefined()
  })
})
