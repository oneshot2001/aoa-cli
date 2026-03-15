/**
 * Local telemetry collector — instruments axctl operations for future Bayesian inference.
 * All data stays on-machine in ~/.axctl/telemetry.db. Zero network calls.
 * Respects AXCTL_NO_TELEMETRY=1 env var or --no-telemetry flag for opt-out.
 *
 * Architecture:
 *   Lazy proxy → first record*() call → try init DB → success: real collector
 *                                                   → failure: permanent no-op + stderr warning
 *   Event buffer: splice AFTER commit (no data loss on tx failure)
 *   Timer: unref'd (doesn't keep process alive)
 *   Prune: deferred 10s after first use (doesn't block startup)
 *   Size cap: stops recording events if DB exceeds 500MB
 */
import { Database } from 'bun:sqlite'
import { chmodSync, existsSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ---- Types ------------------------------------------------------------------

export interface VapixCallEntry {
  device_ip: string
  endpoint: string
  method: 'GET' | 'POST'
  status_code: number
  latency_ms: number
  response_bytes: number
  auth_retries: number
  error?: string
}

export interface EventEntry {
  device_ip: string
  scenario_name: string
  event_type: string
  object_class: string
  confidence: number | null
  timestamp: string
}

export interface DiscoveryEntry {
  device_ip: string
  device_mac?: string
  model?: string
  serial?: string
  firmware?: string
  protocol: 'mdns' | 'ssdp' | 'manual'
  responded: boolean
  latency_ms: number
  scan_id: string
}

export interface HealthCheckEntry {
  device_ip: string
  reachable: boolean
  latency_ms: number
  uptime_seconds?: number
  active_scenarios?: number
  firmware?: string
  error?: string
}

export interface ConfigSnapshotEntry {
  device_ip: string
  scenario_count: number
  scenario_hash: string
  scenario_names: string[]
}

export interface TelemetryCollector {
  recordVapixCall(entry: VapixCallEntry): void
  recordEvent(entry: EventEntry): void
  recordDiscovery(entry: DiscoveryEntry): void
  recordHealthCheck(entry: HealthCheckEntry): void
  recordConfigSnapshot(entry: ConfigSnapshotEntry): void
  flush(): void
  /** DB file path (for stats command). Returns undefined if not initialized or disabled. */
  getDbPath(): string | undefined
  /** Direct DB access for stats queries. Returns undefined if not initialized or disabled. */
  getDb(): Database | undefined
}

// ---- Schema -----------------------------------------------------------------

const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vapix_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  device_ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms REAL NOT NULL,
  response_bytes INTEGER,
  auth_retries INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  device_ip TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  object_class TEXT NOT NULL,
  confidence REAL,
  camera_ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  scan_id TEXT NOT NULL,
  device_ip TEXT NOT NULL,
  device_mac TEXT,
  model TEXT,
  serial TEXT,
  firmware TEXT,
  protocol TEXT NOT NULL,
  responded INTEGER NOT NULL,
  latency_ms REAL
);

CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  device_ip TEXT NOT NULL,
  reachable INTEGER NOT NULL,
  latency_ms REAL,
  uptime_seconds INTEGER,
  active_scenarios INTEGER,
  firmware TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS config_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  device_ip TEXT NOT NULL,
  scenario_count INTEGER NOT NULL,
  scenario_hash TEXT NOT NULL,
  scenario_names TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vapix_device_ts ON vapix_calls(device_ip, ts);
CREATE INDEX IF NOT EXISTS idx_events_device_scenario ON events(device_ip, scenario_name, ts);
CREATE INDEX IF NOT EXISTS idx_events_device_class ON events(device_ip, object_class, ts);
CREATE INDEX IF NOT EXISTS idx_discoveries_scan ON discoveries(scan_id);
CREATE INDEX IF NOT EXISTS idx_discoveries_device ON discoveries(device_ip, ts);
CREATE INDEX IF NOT EXISTS idx_health_device_ts ON health_checks(device_ip, ts);
CREATE INDEX IF NOT EXISTS idx_config_device_ts ON config_snapshots(device_ip, ts);
`

// ---- Debug logging ----------------------------------------------------------

let _debug = false

export function setTelemetryDebug(enabled: boolean): void {
  _debug = enabled
}

function debugLog(msg: string): void {
  if (_debug) process.stderr.write(`[telem] ${msg}\n`)
}

// ---- Implementation ---------------------------------------------------------

const MAX_DB_SIZE_BYTES = 500 * 1024 * 1024 // 500MB

class TelemetryCollectorImpl implements TelemetryCollector {
  private db: Database
  private dbPath: string
  private eventBuffer: EventEntry[] = []
  private readonly FLUSH_THRESHOLD = 100
  private readonly FLUSH_INTERVAL_MS = 5000
  private flushTimer: Timer | null = null
  private sizeExceeded = false

  constructor(dbPath: string) {
    this.dbPath = dbPath
    const dir = join(dbPath, '..')
    const isNew = !existsSync(dbPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new Database(dbPath)
    this.db.exec('PRAGMA journal_mode=WAL')
    this.db.exec('PRAGMA synchronous=NORMAL')
    this.db.exec(SCHEMA)

    // Set schema version if not present
    const row = this.db.query('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | null
    if (!row) {
      this.db.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION])
    }

    // chmod 600 on creation
    try { chmodSync(dbPath, 0o600) } catch { /* best effort */ }

    // First-run message
    if (isNew) {
      process.stderr.write('axctl: Telemetry enabled — learning your fleet behavior locally.\n')
      process.stderr.write('       Disable: AXCTL_NO_TELEMETRY=1 or --no-telemetry\n')
    }

    // Deferred prune — runs 10s after first use, not blocking startup
    const pruneTimer = setTimeout(() => this.prune(), 10_000)
    if (typeof pruneTimer === 'object' && 'unref' in pruneTimer) pruneTimer.unref()

    // Flush timer — unref'd so it doesn't keep the process alive
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS)
    if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) this.flushTimer.unref()
  }

  getDbPath(): string | undefined { return this.dbPath }
  getDb(): Database | undefined { return this.db }

  recordVapixCall(entry: VapixCallEntry): void {
    debugLog(`VAPIX ${entry.method} ${entry.endpoint} ${entry.status_code} ${Math.round(entry.latency_ms)}ms`)
    try {
      this.db.run(
        `INSERT INTO vapix_calls (device_ip, endpoint, method, status_code,
         latency_ms, response_bytes, auth_retries, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.device_ip, entry.endpoint, entry.method, entry.status_code,
         entry.latency_ms, entry.response_bytes, entry.auth_retries, entry.error ?? null]
      )
    } catch { /* telemetry must never break the app */ }
  }

  recordEvent(entry: EventEntry): void {
    if (this.sizeExceeded) return
    debugLog(`EVENT ${entry.device_ip} ${entry.scenario_name} ${entry.event_type} ${entry.object_class}`)
    this.eventBuffer.push(entry)
    if (this.eventBuffer.length >= this.FLUSH_THRESHOLD) {
      this.flush()
    }
  }

  recordDiscovery(entry: DiscoveryEntry): void {
    debugLog(`DISCOVER ${entry.device_ip} via ${entry.protocol} ${Math.round(entry.latency_ms)}ms`)
    try {
      this.db.run(
        `INSERT INTO discoveries (scan_id, device_ip, device_mac, model, serial,
         firmware, protocol, responded, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.scan_id, entry.device_ip, entry.device_mac ?? null, entry.model ?? null,
         entry.serial ?? null, entry.firmware ?? null, entry.protocol,
         entry.responded ? 1 : 0, entry.latency_ms]
      )
    } catch { /* telemetry must never break the app */ }
  }

  recordHealthCheck(entry: HealthCheckEntry): void {
    debugLog(`HEALTH ${entry.device_ip} ${entry.reachable ? 'up' : 'down'} ${Math.round(entry.latency_ms)}ms`)
    try {
      this.db.run(
        `INSERT INTO health_checks (device_ip, reachable, latency_ms,
         uptime_seconds, active_scenarios, firmware, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entry.device_ip, entry.reachable ? 1 : 0, entry.latency_ms,
         entry.uptime_seconds ?? null, entry.active_scenarios ?? null,
         entry.firmware ?? null, entry.error ?? null]
      )
    } catch { /* telemetry must never break the app */ }
  }

  recordConfigSnapshot(entry: ConfigSnapshotEntry): void {
    debugLog(`CONFIG ${entry.device_ip} ${entry.scenario_count} scenarios hash=${entry.scenario_hash.substring(0, 8)}`)
    try {
      this.db.run(
        `INSERT INTO config_snapshots (device_ip, scenario_count, scenario_hash, scenario_names)
         VALUES (?, ?, ?, ?)`,
        [entry.device_ip, entry.scenario_count, entry.scenario_hash,
         JSON.stringify(entry.scenario_names)]
      )
    } catch { /* telemetry must never break the app */ }
  }

  flush(): void {
    if (this.eventBuffer.length === 0) return
    try {
      const stmt = this.db.prepare(
        `INSERT INTO events (device_ip, scenario_name, event_type,
         object_class, confidence, camera_ts) VALUES (?, ?, ?, ?, ?, ?)`
      )
      const tx = this.db.transaction(() => {
        for (const e of this.eventBuffer) {
          stmt.run(e.device_ip, e.scenario_name, e.event_type,
                   e.object_class, e.confidence, e.timestamp)
        }
      })
      tx()
      // Splice AFTER successful commit — failed tx leaves buffer intact for retry
      this.eventBuffer.length = 0
    } catch { /* telemetry must never break the app */ }
  }

  private prune(): void {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      for (const table of ['vapix_calls', 'events', 'discoveries', 'health_checks', 'config_snapshots']) {
        this.db.run(`DELETE FROM ${table} WHERE ts < ?`, [cutoff])
      }
    } catch { /* telemetry must never break the app */ }

    // Check DB size cap
    this.checkSizeCap()
  }

  private checkSizeCap(): void {
    try {
      const stats = statSync(this.dbPath)
      if (stats.size > MAX_DB_SIZE_BYTES) {
        this.sizeExceeded = true
        debugLog(`DB size ${Math.round(stats.size / 1024 / 1024)}MB exceeds 500MB cap — event recording paused`)
      }
    } catch { /* best effort */ }
  }
}

// ---- No-op implementation ---------------------------------------------------

const noOp: TelemetryCollector = {
  recordVapixCall() {},
  recordEvent() {},
  recordDiscovery() {},
  recordHealthCheck() {},
  recordConfigSnapshot() {},
  flush() {},
  getDbPath() { return undefined },
  getDb() { return undefined },
}

// ---- Lazy proxy (defers construction until first use) -----------------------

const AXCTL_DIR = join(homedir(), '.axctl')
const TELEMETRY_DB = join(AXCTL_DIR, 'telemetry.db')

function createLazyProxy(): TelemetryCollector {
  let inner: TelemetryCollector | null = null
  let initialized = false

  function getInner(): TelemetryCollector {
    if (initialized) return inner!
    initialized = true
    if (process.env.AXCTL_NO_TELEMETRY === '1') {
      inner = noOp
      return inner
    }
    try {
      inner = new TelemetryCollectorImpl(TELEMETRY_DB)
    } catch (err) {
      process.stderr.write(`axctl: Telemetry DB unavailable (${(err as Error).message}), collection disabled.\n`)
      inner = noOp
    }
    return inner
  }

  return {
    recordVapixCall(entry) { getInner().recordVapixCall(entry) },
    recordEvent(entry) { getInner().recordEvent(entry) },
    recordDiscovery(entry) { getInner().recordDiscovery(entry) },
    recordHealthCheck(entry) { getInner().recordHealthCheck(entry) },
    recordConfigSnapshot(entry) { getInner().recordConfigSnapshot(entry) },
    flush() { if (initialized && inner) inner.flush() },
    getDbPath() { return initialized ? inner?.getDbPath() : TELEMETRY_DB },
    getDb() { return initialized ? inner?.getDb() : undefined },
  }
}

export const telemetry: TelemetryCollector = createLazyProxy()
