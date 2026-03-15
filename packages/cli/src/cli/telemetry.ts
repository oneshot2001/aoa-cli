import { statSync } from 'fs'
import { program } from './root.js'
import { telemetry } from 'axctl-core'
import { credentialStore } from 'axctl-core'

const SPARK_CHARS = '▁▂▃▄▅▆▇█'

function sparkline(values: number[]): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  return values.map((v) => SPARK_CHARS[Math.min(Math.floor((v / max) * 7), 7)]).join('')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

const telem = program
  .command('telemetry')
  .description('local telemetry management')

telem
  .command('stats')
  .description('show telemetry collection statistics')
  .action(() => {
    const db = telemetry.getDb()
    const dbPath = telemetry.getDbPath()

    if (!db || !dbPath) {
      console.log('Telemetry is disabled or not yet initialized.')
      console.log('Enable: remove AXCTL_NO_TELEMETRY env var and --no-telemetry flag')
      return
    }

    // DB file info
    let sizeStr = '?'
    try {
      const stats = statSync(dbPath)
      sizeStr = formatBytes(stats.size)
    } catch { /* best effort */ }

    console.log(`Database: ${dbPath} (${sizeStr})`)
    console.log('')

    // Per-table stats with sparklines
    const tables = [
      { name: 'vapix_calls', label: 'VAPIX calls' },
      { name: 'events', label: 'Events' },
      { name: 'discoveries', label: 'Discoveries' },
      { name: 'health_checks', label: 'Health checks' },
      { name: 'config_snapshots', label: 'Config snapshots' },
    ]

    for (const { name, label } of tables) {
      const countRow = db.query(`SELECT COUNT(*) as c FROM ${name}`).get() as { c: number }
      const minRow = db.query(`SELECT MIN(ts) as t FROM ${name}`).get() as { t: string | null }
      const maxRow = db.query(`SELECT MAX(ts) as t FROM ${name}`).get() as { t: string | null }

      if (countRow.c === 0) {
        console.log(`  ${label.padEnd(18)} ${String(0).padStart(6)} rows`)
        continue
      }

      // 7-day sparkline
      const dailyCounts = db.query(
        `SELECT date(ts) as d, COUNT(*) as c FROM ${name}
         WHERE ts >= datetime('now', '-7 days')
         GROUP BY date(ts) ORDER BY d`
      ).all() as { d: string; c: number }[]

      // Fill in missing days
      const last7: number[] = []
      const now = new Date()
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        const match = dailyCounts.find((r) => r.d === dateStr)
        last7.push(match?.c ?? 0)
      }

      const avg = Math.round(last7.reduce((a, b) => a + b, 0) / 7)
      const spark = sparkline(last7)
      const range = minRow.t && maxRow.t
        ? `${minRow.t.split('T')[0] ?? minRow.t.substring(0, 10)} → ${maxRow.t.split('T')[0] ?? maxRow.t.substring(0, 10)}`
        : ''

      console.log(`  ${label.padEnd(18)} ${String(countRow.c).padStart(6)} rows  ${spark} (avg ${avg}/day)  ${range}`)
    }

    // Fleet coverage: devices with telemetry vs registered devices
    console.log('')
    const creds = credentialStore.list()
    if (creds.length > 0) {
      const telemetryIps = new Set<string>()
      for (const table of ['vapix_calls', 'discoveries', 'health_checks']) {
        const rows = db.query(`SELECT DISTINCT device_ip FROM ${table}`).all() as { device_ip: string }[]
        for (const r of rows) telemetryIps.add(r.device_ip)
      }
      const registeredIps = new Set(creds.map((c) => c.ip))
      const covered = [...registeredIps].filter((ip) => telemetryIps.has(ip)).length
      console.log(`  Fleet coverage: ${covered} of ${registeredIps.size} registered devices have telemetry data`)
    }

    // Schema version
    const vRow = db.query('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | null
    if (vRow) {
      console.log(`  Schema version: ${vRow.version}`)
    }
  })
