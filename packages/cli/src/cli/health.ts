import { readFileSync, writeFileSync } from 'fs'
import { program } from './root.js'
import { AihaClient } from 'axctl-core'
import { credentialStore } from 'axctl-core'
import { formatOutput } from 'axctl-core'
import { fleetExec } from 'axctl-core'
import type { ImageHealthConfiguration, ImageHealthDetectionType } from 'axctl-core'
import { IMAGE_HEALTH_DETECTION_TYPES } from 'axctl-core'

function getClient(ip: string): AihaClient {
  const cred = credentialStore.get(ip)
  if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
  return new AihaClient(ip, cred.username, cred.password)
}

const health = program
  .command('health')
  .description('AXIS Image Health Analytics — monitor and configure image quality detection')

// ---- STATUS ----------------------------------------------------------------

health
  .command('status <ip>')
  .description('show AIHA running state, scene suitability, and active alerts')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const status = await client.getStatus()
      const row: Record<string, unknown> = {
        ip,
        running: status.running ? 'yes' : 'no',
        version: status.version ?? '—',
        scene: status.sceneSuitable ? 'suitable' : 'unsuitable',
      }
      for (const type of IMAGE_HEALTH_DETECTION_TYPES) {
        const alert = status.alerts.find((a) => a.type === type)
        row[type] = alert ? (alert.active ? 'ALERT' : 'OK') : '—'
      }
      console.log(formatOutput(row, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- SHOW (full config) ----------------------------------------------------

health
  .command('show <ip>')
  .description('show full detection configuration (sensitivity, validation period, enabled)')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const config = await client.getConfiguration()
      const rows = IMAGE_HEALTH_DETECTION_TYPES.map((type) => {
        const d = config[type]
        return {
          detection: type,
          enabled: d.enabled ? 'yes' : 'no',
          sensitivity: d.sensitivity,
          validationPeriod: `${d.validationPeriod}s`,
        }
      })
      console.log(formatOutput(rows, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- SET -------------------------------------------------------------------

health
  .command('set <ip>')
  .description('modify detection settings')
  .option('--blocked-enabled <bool>', 'enable/disable blocked detection')
  .option('--blocked-sensitivity <n>', 'blocked sensitivity (0-100)')
  .option('--blocked-validation <seconds>', 'blocked validation period')
  .option('--redirected-enabled <bool>', 'enable/disable redirected detection')
  .option('--redirected-sensitivity <n>', 'redirected sensitivity (0-100)')
  .option('--redirected-validation <seconds>', 'redirected validation period')
  .option('--blurred-enabled <bool>', 'enable/disable blurred detection')
  .option('--blurred-sensitivity <n>', 'blurred sensitivity (0-100)')
  .option('--blurred-validation <seconds>', 'blurred validation period')
  .option('--underexposed-enabled <bool>', 'enable/disable underexposed detection')
  .option('--underexposed-sensitivity <n>', 'underexposed sensitivity (0-100)')
  .option('--underexposed-validation <seconds>', 'underexposed validation period')
  .action(async (ip: string, opts: Record<string, string | undefined>) => {
    const client = getClient(ip)
    const fmt = program.opts().format as string

    try {
      const config = await client.getConfiguration()
      let changed = false

      for (const type of IMAGE_HEALTH_DETECTION_TYPES) {
        const enabledKey = `${type}Enabled`
        const sensitivityKey = `${type}Sensitivity`
        const validationKey = `${type}Validation`

        if (opts[enabledKey] !== undefined) {
          config[type].enabled = opts[enabledKey] === 'true'
          changed = true
        }
        if (opts[sensitivityKey] !== undefined) {
          const val = parseInt(opts[sensitivityKey]!)
          if (val < 0 || val > 100) { console.error(`Sensitivity must be 0-100, got ${val}`); process.exit(1) }
          config[type].sensitivity = val
          changed = true
        }
        if (opts[validationKey] !== undefined) {
          config[type].validationPeriod = parseInt(opts[validationKey]!)
          changed = true
        }
      }

      if (!changed) {
        console.error('No changes specified. Use --blocked-sensitivity, --redirected-enabled, etc.')
        process.exit(1)
      }

      if (program.opts().dryRun) {
        console.log(`[dry-run] Would update AIHA config on ${ip}:`)
        for (const type of IMAGE_HEALTH_DETECTION_TYPES) {
          const d = config[type]
          console.log(`  ${type}: enabled=${d.enabled} sensitivity=${d.sensitivity} validation=${d.validationPeriod}s`)
        }
        return
      }

      await client.setConfiguration(config)
      console.log(`✓ AIHA config updated on ${ip}`)

      // Show the new config
      const rows = IMAGE_HEALTH_DETECTION_TYPES.map((type) => ({
        detection: type,
        enabled: config[type].enabled ? 'yes' : 'no',
        sensitivity: config[type].sensitivity,
        validationPeriod: `${config[type].validationPeriod}s`,
      }))
      console.log(formatOutput(rows, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- RESTART ---------------------------------------------------------------

health
  .command('restart <ip>')
  .description('restart AIHA to force scene relearn')
  .action(async (ip: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would restart Image Health Analytics on ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.restart()
      console.log(`✓ Image Health Analytics restarted on ${ip} (scene relearn in progress)`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- EXPORT ----------------------------------------------------------------

health
  .command('export <ip>')
  .description('export AIHA configuration to YAML/JSON')
  .option('-o, --output <file>', 'output file (default: stdout)')
  .action(async (ip: string, opts: { output?: string }) => {
    const client = getClient(ip)
    const fmt = program.opts().format as string
    try {
      const config = await client.getConfiguration()
      const output = { image_health: config }
      let text: string

      if (fmt === 'yaml') {
        const yaml = await import('js-yaml')
        text = yaml.dump(output, { indent: 2 })
      } else {
        text = JSON.stringify(output, null, 2)
      }

      if (opts.output) {
        writeFileSync(opts.output, text + '\n')
        console.log(`✓ AIHA config exported to ${opts.output}`)
      } else {
        console.log(text)
      }
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- IMPORT ----------------------------------------------------------------

health
  .command('import <ip> <file>')
  .description('import AIHA configuration from YAML/JSON file')
  .action(async (ip: string, file: string) => {
    try {
      const raw = readFileSync(file, 'utf-8')
      let parsed: { image_health?: ImageHealthConfiguration }

      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const yaml = await import('js-yaml')
        parsed = yaml.load(raw) as typeof parsed
      } else {
        parsed = JSON.parse(raw) as typeof parsed
      }

      const config = parsed?.image_health
      if (!config) {
        console.error(`Invalid config file: expected top-level "image_health" key`)
        process.exit(1)
      }

      // Validate
      for (const type of IMAGE_HEALTH_DETECTION_TYPES) {
        if (!config[type]) {
          console.error(`Missing detection type "${type}" in config file`)
          process.exit(1)
        }
      }

      if (program.opts().dryRun) {
        console.log(`[dry-run] Would import AIHA config to ${ip}:`)
        for (const type of IMAGE_HEALTH_DETECTION_TYPES) {
          const d = config[type]
          console.log(`  ${type}: enabled=${d.enabled} sensitivity=${d.sensitivity} validation=${d.validationPeriod}s`)
        }
        return
      }

      const client = getClient(ip)
      await client.setConfiguration(config)
      console.log(`✓ AIHA config imported to ${ip}`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- FLEET STATUS ----------------------------------------------------------

health
  .command('fleet <name>')
  .description('fleet-wide health dashboard — AOA + image health status')
  .action(async (name: string) => {
    const fmt = program.opts().format as string
    const results = await fleetExec(name, async (ip, user, pass) => {
      const aiha = new AihaClient(ip, user, pass)
      const [status, config] = await Promise.allSettled([
        aiha.getStatus(),
        aiha.getConfiguration(),
      ])

      return {
        status: status.status === 'fulfilled' ? status.value : null,
        config: config.status === 'fulfilled' ? config.value : null,
      }
    })

    const rows = results.map((r) => {
      if (r.error) {
        return {
          ip: r.ip, running: 'error', scene: '—',
          blocked: '—', redirected: '—', blurred: '—', underexposed: '—',
          detail: r.error,
        }
      }
      const { status, config } = r.result!
      if (!status) {
        return {
          ip: r.ip, running: '—', scene: '—',
          blocked: '—', redirected: '—', blurred: '—', underexposed: '—',
          detail: 'AIHA not available',
        }
      }

      const alertFor = (type: ImageHealthDetectionType) => {
        if (!config || !config[type].enabled) return '—'
        const alert = status.alerts.find((a) => a.type === type)
        return alert ? (alert.active ? 'ALERT' : 'OK') : 'OK'
      }

      return {
        ip: r.ip,
        running: status.running ? 'yes' : 'no',
        scene: status.sceneSuitable ? 'suitable' : 'unsuitable',
        blocked: alertFor('blocked'),
        redirected: alertFor('redirected'),
        blurred: alertFor('blurred'),
        underexposed: alertFor('underexposed'),
        detail: '',
      }
    })

    console.log(formatOutput(rows, fmt))

    if (fmt === 'table') {
      const alerts = rows.filter((r) =>
        r.blocked === 'ALERT' || r.redirected === 'ALERT' ||
        r.blurred === 'ALERT' || r.underexposed === 'ALERT'
      ).length
      const total = rows.length
      const healthy = rows.filter((r) => r.running === 'yes' && r.scene === 'suitable').length
      process.stderr.write(`\n${healthy}/${total} healthy`)
      if (alerts > 0) process.stderr.write(` (${alerts} with alerts)`)
      process.stderr.write('\n')
    }
  })

// ---- FLEET RESTART ---------------------------------------------------------

health
  .command('fleet-restart <name>')
  .description('restart AIHA on all cameras in a fleet (forces scene relearn)')
  .action(async (name: string) => {
    if (program.opts().dryRun) {
      const { fleetStore } = await import('axctl-core')
      const f = fleetStore.get(name)
      if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }
      console.log(`[dry-run] Would restart Image Health Analytics on ${f.ips.length} camera(s) in fleet "${name}"`)
      return
    }

    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AihaClient(ip, user, pass)
      await client.restart()
      return 'restarted'
    })

    const rows = results.map((r) => ({
      ip: r.ip,
      status: r.error ? 'error' : '✓ restarted',
      detail: r.error ?? '',
    }))
    console.log(formatOutput(rows, 'table'))
  })

// ---- FLEET IMPORT ----------------------------------------------------------

health
  .command('fleet-import <name> <file>')
  .description('push AIHA configuration to all cameras in a fleet')
  .action(async (name: string, file: string) => {
    let config: ImageHealthConfiguration
    try {
      const raw = readFileSync(file, 'utf-8')
      let parsed: { image_health?: ImageHealthConfiguration }

      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const yaml = await import('js-yaml')
        parsed = yaml.load(raw) as typeof parsed
      } else {
        parsed = JSON.parse(raw) as typeof parsed
      }
      config = parsed?.image_health!
      if (!config) throw new Error('Missing "image_health" key')
    } catch (e) {
      console.error(`Failed to read ${file}: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }

    if (program.opts().dryRun) {
      const { fleetStore } = await import('axctl-core')
      const f = fleetStore.get(name)
      if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }
      console.log(`[dry-run] Would push AIHA config from ${file} to ${f.ips.length} camera(s) in fleet "${name}"`)
      return
    }

    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AihaClient(ip, user, pass)
      await client.setConfiguration(config)
      return 'imported'
    })

    const rows = results.map((r) => ({
      ip: r.ip,
      status: r.error ? 'error' : '✓ imported',
      detail: r.error ?? '',
    }))
    console.log(formatOutput(rows, 'table'))
  })
