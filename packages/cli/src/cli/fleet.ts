import { readFileSync } from 'fs'
import { spawn } from 'child_process'
import { program } from './root.js'
import { credentialStore } from '@axctl/core'
import { fleetStore } from '@axctl/core'
import { discoverAll } from '@axctl/core'
import { formatOutput } from '@axctl/core'
import { fleetExec } from '@axctl/core'
import { VapixClient } from '@axctl/core'
import { AoaClient } from '@axctl/core'
import { streamEvents, aoaTopics } from '@axctl/core'
import { streamMqttEvents, mqttAoaTopics } from '@axctl/core'

const fleet = program
  .command('fleet')
  .description('manage named groups of cameras')

// ---- CRUD ------------------------------------------------------------------

fleet
  .command('create <name>')
  .description('create a fleet from a device list or discovery')
  .option('-d, --devices <ips>', 'comma-separated IPs (e.g. 192.168.1.33,192.168.1.34)')
  .option('--from-discover', 'populate from live discovery scan')
  .option('-t, --timeout <ms>', 'discovery scan timeout in ms', '5000')
  .option('--model <pattern>', 'filter discovered devices by model (substring match)')
  .option('--min-firmware <version>', 'filter discovered devices by minimum firmware version')
  .option('--no-dedup', 'skip deduplication against existing fleets')
  .action(async (name: string, opts: { devices?: string; fromDiscover?: boolean; timeout: string; model?: string; minFirmware?: string; dedup?: boolean }) => {
    if (fleetStore.has(name)) {
      console.error(`Fleet "${name}" already exists. Delete it first: axctl fleet delete ${name}`)
      process.exit(1)
    }

    let ips: string[] = []

    if (opts.devices) {
      ips = opts.devices.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (opts.fromDiscover) {
      const timeout = parseInt(opts.timeout)
      process.stderr.write(`Scanning for devices (${timeout / 1000}s)...\n`)
      let found = await discoverAll(timeout)

      if (found.length === 0) { console.error('No devices found.'); process.exit(1) }
      process.stderr.write(`Found ${found.length} device(s)\n`)

      // Filter by model
      if (opts.model) {
        const pattern = opts.model.toLowerCase()
        const before = found.length
        found = found.filter((d) => d.model.toLowerCase().includes(pattern))
        if (found.length < before) {
          process.stderr.write(`  Filtered by model "${opts.model}": ${found.length} of ${before}\n`)
        }
      }

      // Filter by minimum firmware
      if (opts.minFirmware) {
        const minParts = opts.minFirmware.split('.').map(Number)
        const before = found.length
        found = found.filter((d) => {
          const fwParts = d.firmwareVersion.split('.').map(Number)
          for (let i = 0; i < Math.max(minParts.length, fwParts.length); i++) {
            const a = fwParts[i] ?? 0
            const b = minParts[i] ?? 0
            if (a > b) return true
            if (a < b) return false
          }
          return true // equal
        })
        if (found.length < before) {
          process.stderr.write(`  Filtered by firmware ≥ ${opts.minFirmware}: ${found.length} of ${before}\n`)
        }
      }

      if (found.length === 0) { console.error('No devices match filters.'); process.exit(1) }
      ips = found.map((d) => d.ip)
    } else {
      console.error('Specify --devices <ips> or --from-discover')
      process.exit(1)
    }

    // Deduplicate against existing fleets
    if (opts.dedup !== false) {
      const existingFleets = fleetStore.list()
      const existingIps = new Set(existingFleets.flatMap((f) => f.ips))
      const dupes = ips.filter((ip) => existingIps.has(ip))
      if (dupes.length > 0) {
        process.stderr.write(`  Note: ${dupes.length} device(s) already in other fleets: ${dupes.join(', ')}\n`)
      }
    }

    if (program.opts().dryRun) {
      console.log(`[dry-run] Would create fleet "${name}" with ${ips.length} device${ips.length === 1 ? '' : 's'}: ${ips.join(', ')}`)
      return
    }

    fleetStore.create(name, ips)
    console.log(`✓ Fleet "${name}" created with ${ips.length} device${ips.length === 1 ? '' : 's'}: ${ips.join(', ')}`)
  })

fleet
  .command('list')
  .description('list all fleets')
  .action(() => {
    const fmt = program.opts().format as string
    const fleets = fleetStore.list()
    if (fleets.length === 0) { console.log('No fleets. Use: axctl fleet create <name> --devices <ips>'); return }
    const rows = fleets.map((f) => ({ name: f.name, devices: f.ips.length, ips: f.ips.join(', ') }))
    console.log(formatOutput(rows, fmt))
  })

fleet
  .command('show <name>')
  .description('show fleet members')
  .action((name: string) => {
    const fmt = program.opts().format as string
    const f = fleetStore.get(name)
    if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }
    const rows = f.ips.map((ip) => ({
      ip,
      credentials: credentialStore.has(ip) ? 'stored' : 'none — run: axctl auth add ' + ip,
    }))
    if (fmt === 'table') console.log(`Fleet: ${f.name} (${f.ips.length} devices)`)
    console.log(formatOutput(rows, fmt))
  })

fleet
  .command('delete <name>')
  .description('remove a fleet')
  .action((name: string) => {
    if (program.opts().dryRun) {
      if (!fleetStore.has(name)) {
        console.error(`Fleet "${name}" not found`)
        process.exit(1)
      }
      const f = fleetStore.get(name)!
      console.log(`[dry-run] Would delete fleet "${name}" (${f.ips.length} device${f.ips.length === 1 ? '' : 's'})`)
      return
    }
    if (fleetStore.remove(name)) {
      console.log(`✓ Fleet "${name}" deleted`)
    } else {
      console.error(`Fleet "${name}" not found`)
      process.exit(1)
    }
  })

// ---- PARALLEL OPS ----------------------------------------------------------

fleet
  .command('ping <name>')
  .description('check reachability of all cameras in a fleet')
  .action(async (name: string) => {
    const fmt = program.opts().format as string
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new VapixClient(ip, user, pass)
      const start = Date.now()
      const online = await client.ping()
      return { online, ms: Date.now() - start }
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, status: 'error', ms: '-', detail: r.error }
      const d = r.result!
      return { ip: r.ip, status: d.online ? 'online' : 'offline', ms: d.online ? d.ms : '-', detail: '' }
    })
    console.log(formatOutput(rows, fmt))
  })

fleet
  .command('status <name>')
  .description('get model/firmware/serial for all cameras in a fleet')
  .action(async (name: string) => {
    const fmt = program.opts().format as string
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new VapixClient(ip, user, pass)
      return client.getDeviceInfo()
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, model: 'error', firmware: '-', serial: '-', detail: r.error }
      const d = r.result!
      return { ip: r.ip, model: d.ProdShortName ?? d.Model ?? '?', firmware: d.Version ?? '?', serial: d.ProdSerialNumber ?? '?', detail: '' }
    })
    console.log(formatOutput(rows, fmt))
  })

// ---- FLEET HEALTH CHECK ----------------------------------------------------

fleet
  .command('health <name>')
  .description('check fleet health: connectivity, firmware, AOA status')
  .option('-i, --interval <seconds>', 'repeat every N seconds (0 = once)', '0')
  .option('--webhook <url>', 'POST health report as JSON to this URL')
  .option('--min-firmware <version>', 'flag cameras below this firmware version')
  .action(async (name: string, opts: { interval: string; webhook?: string; minFirmware?: string }) => {
    const fmt = program.opts().format as string
    const interval = parseInt(opts.interval) * 1000

    const runCheck = async () => {
      const results = await fleetExec(name, async (ip, user, pass) => {
        const vapix = new VapixClient(ip, user, pass)
        const start = Date.now()

        let online = false
        let info: Record<string, string> = {}
        let aoaStatus = 'unknown'

        try {
          online = await vapix.ping()
          if (online) {
            info = await vapix.getDeviceInfo()
            // Check AOA status
            try {
              const aoa = new AoaClient(ip, user, pass)
              const scenarios = await aoa.getScenarios()
              aoaStatus = `${scenarios.length} scenarios`
            } catch {
              aoaStatus = 'not available'
            }
          }
        } catch {
          online = false
        }

        return {
          online,
          ms: Date.now() - start,
          model: info.ProdShortName ?? info.Model ?? '-',
          firmware: info.Version ?? '-',
          serial: info.ProdSerialNumber ?? '-',
          aoaStatus,
        }
      })

      // Build report rows
      const rows = results.map((r) => {
        if (r.error) {
          return { ip: r.ip, status: '✗ error', ms: '-', model: '-', firmware: '-', aoa: '-', flags: r.error }
        }
        const d = r.result!
        const flags: string[] = []

        if (!d.online) flags.push('offline')

        // Check firmware version
        if (opts.minFirmware && d.firmware !== '-') {
          const minParts = opts.minFirmware.split('.').map(Number)
          const fwParts = d.firmware.split('.').map(Number)
          let below = false
          for (let i = 0; i < Math.max(minParts.length, fwParts.length); i++) {
            const a = fwParts[i] ?? 0
            const b = minParts[i] ?? 0
            if (a < b) { below = true; break }
            if (a > b) break
          }
          if (below) flags.push(`fw < ${opts.minFirmware}`)
        }

        return {
          ip: r.ip,
          status: d.online ? '✓ online' : '✗ offline',
          ms: d.online ? d.ms : '-',
          model: d.model,
          firmware: d.firmware,
          aoa: d.aoaStatus,
          flags: flags.join(', ') || '-',
        }
      })

      // Determine exit health
      const offline = rows.filter((r) => r.status.includes('offline') || r.status.includes('error')).length
      const total = rows.length

      if (fmt === 'table' && interval > 0) {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
        process.stderr.write(`\n─── Health check at ${now} ───\n`)
      }

      console.log(formatOutput(rows, fmt))

      if (fmt === 'table') {
        const healthy = total - offline
        process.stderr.write(`\n${healthy}/${total} healthy`)
        if (offline > 0) process.stderr.write(` (${offline} degraded)`)
        process.stderr.write('\n')
      }

      // Webhook
      if (opts.webhook) {
        if (program.opts().dryRun) {
          console.log(`[dry-run] Would POST health report to ${opts.webhook}`)
        } else {
          const report = { timestamp: new Date().toISOString(), fleet: name, total, healthy: total - offline, degraded: offline, devices: rows }
          fetch(opts.webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report),
          }).catch((err) => {
            process.stderr.write(`Webhook error: ${(err as Error).message}\n`)
          })
        }
      }

      // Return exit code indicator
      if (offline === total) return 2
      if (offline > 0) return 1
      return 0
    }

    if (interval > 0) {
      // Continuous monitoring mode
      process.stderr.write(`Monitoring fleet "${name}" every ${opts.interval}s (Ctrl+C to stop)...\n`)

      const sigHandler = () => { process.exit(0) }
      process.on('SIGINT', sigHandler)

      while (true) {
        await runCheck()
        await new Promise((resolve) => setTimeout(resolve, interval))
      }
    } else {
      // Single check
      const code = await runCheck()
      if (code > 0) process.exit(code)
    }
  })

// ---- FLEET AOA SUBGROUP ----------------------------------------------------

const fleetAoa = fleet
  .command('aoa')
  .description('run AOA operations across an entire fleet')

fleetAoa
  .command('list <name>')
  .description('list AOA scenarios across all cameras in a fleet')
  .action(async (name: string) => {
    const fmt = program.opts().format as string
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AoaClient(ip, user, pass)
      return client.getScenarios()
    })

    const rows: Record<string, unknown>[] = []
    for (const r of results) {
      if (r.error) {
        rows.push({ ip: r.ip, id: '-', name: 'error', type: '-', objects: r.error })
        continue
      }
      if (!r.result || r.result.length === 0) {
        rows.push({ ip: r.ip, id: '-', name: '(no scenarios)', type: '-', objects: '-' })
        continue
      }
      for (const s of r.result) {
        rows.push({
          ip: r.ip,
          id: s.id,
          name: s.name,
          type: s.type,
          objects: s.objectClassifications.map((o) => o.type).join(', '),
          trigger: s.triggers[0]?.type ?? '?',
        })
      }
    }
    console.log(formatOutput(rows, fmt))
  })

fleetAoa
  .command('counts <name> <scenarioId>')
  .description('get accumulated crossing counts across all cameras (crosslinecounting scenarios)')
  .action(async (name: string, idStr: string) => {
    const fmt = program.opts().format as string
    const id = parseInt(idStr)
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AoaClient(ip, user, pass)
      return client.getAccumulatedCounts(id)
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, total: 'error', human: '-', vehicle: '-', detail: r.error }
      const d = r.result!
      return {
        ip: r.ip,
        total: d.total ?? 0,
        human: d.totalHuman ?? '-',
        car: d.totalCar ?? '-',
        truck: d.totalTruck ?? '-',
        bus: d.totalBus ?? '-',
        resetTime: d.resetTime ?? '-',
      }
    })
    console.log(formatOutput(rows, fmt))
  })

fleetAoa
  .command('create <name> <scenarioName> <type>')
  .description('create the same scenario on all cameras in a fleet')
  .option('-o, --objects <classes>', 'object classes (human,vehicle)', 'human,vehicle')
  .option('-d, --device <id>', 'analytics device ID', '1')
  .action(async (name: string, scenarioName: string, type: string, opts: { objects: string; device: string }) => {
    const objects = opts.objects.split(',').map((s) => s.trim()).filter(Boolean)
    const deviceId = parseInt(opts.device)
    if (program.opts().dryRun) {
      const f = fleetStore.get(name)
      if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }
      console.log(`[dry-run] Would create scenario "${scenarioName}" (type: ${type}) on ${f.ips.length} device${f.ips.length === 1 ? '' : 's'} in fleet "${name}"`)
      console.log(`  Objects: ${objects.join(', ')}`)
      console.log(`  Device: ${deviceId}`)
      for (const ip of f.ips) console.log(`  - ${ip}`)
      return
    }
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AoaClient(ip, user, pass)
      return client.addScenario(scenarioName, type, deviceId, objects)
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, status: 'error', id: '-', detail: r.error }
      return { ip: r.ip, status: '✓ created', id: r.result!.id, detail: '' }
    })
    console.log(formatOutput(rows, 'table'))
  })

fleetAoa
  .command('push <name> <file>')
  .description('push AOA configuration from JSON file to all cameras in a fleet')
  .action(async (name: string, file: string) => {
    let config: import('../lib/aoa-client.js').AoaConfiguration
    try {
      config = JSON.parse(readFileSync(file, 'utf-8'))
    } catch (e) {
      console.error(`Failed to read ${file}: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }

    if (program.opts().dryRun) {
      const f = fleetStore.get(name)
      if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }
      console.log(`[dry-run] Would push ${config.scenarios.length} scenario${config.scenarios.length === 1 ? '' : 's'} from ${file} to ${f.ips.length} device${f.ips.length === 1 ? '' : 's'} in fleet "${name}"`)
      for (const s of config.scenarios) console.log(`  - ${s.name} (${s.type})`)
      console.log(`  Targets: ${f.ips.join(', ')}`)
      return
    }

    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AoaClient(ip, user, pass)
      await client.importConfiguration(config)
      return { scenarios: config.scenarios.length }
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, status: 'error', scenarios: '-', detail: r.error }
      return { ip: r.ip, status: '✓ imported', scenarios: r.result!.scenarios, detail: '' }
    })
    console.log(formatOutput(rows, 'table'))
  })

// ---- FLEET EVENTS SUBGROUP -------------------------------------------------

const fleetEvents = fleet
  .command('events')
  .description('stream events across an entire fleet')

fleetEvents
  .command('stream <name>')
  .description('stream AOA events from all cameras in a fleet')
  .option('-s, --scenario <ids>', 'comma-separated scenario IDs (default: all)')
  .option('-c, --count <n>', 'stop after N total events', '0')
  .option('--active-only', 'only show trigger-start events (active=true)', false)
  .option('--webhook <url>', 'POST each event as JSON to this URL')
  .option('--exec <command>', 'pipe each event as JSON to this shell command via stdin')
  .action(async (name: string, opts: { scenario?: string; count: string; activeOnly: boolean; webhook?: string; exec?: string }) => {
    const f = fleetStore.get(name)
    if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }

    const fmt = program.opts().format as string
    const maxCount = parseInt(opts.count)
    let received = 0

    const topicFilters = opts.scenario
      ? aoaTopics(opts.scenario.split(',').map((s) => parseInt(s.trim())))
      : undefined // default = all ObjectAnalytics

    const ac = new AbortController()

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      process.stderr.write('\nStopping streams...\n')
      ac.abort()
    })

    // Resolve credentials for each camera
    const targets: { ip: string; username: string; password: string }[] = []
    for (const ip of f.ips) {
      const cred = credentialStore.get(ip)
      if (!cred) {
        process.stderr.write(`⚠ No credentials for ${ip} — skipping (run: axctl auth add ${ip})\n`)
        continue
      }
      targets.push({ ip, username: cred.username, password: cred.password })
    }

    if (targets.length === 0) {
      console.error('No cameras with credentials. Run: axctl auth add <ip>')
      process.exit(1)
    }

    if (fmt === 'table') {
      process.stderr.write(`Streaming events from ${targets.length} camera${targets.length === 1 ? '' : 's'} in fleet "${name}" (Ctrl+C to stop)...\n\n`)
      process.stderr.write('IP               TIME                       SCENARIO  TYPE          OBJECT  CLASS     ACTIVE\n')
      process.stderr.write('─'.repeat(95) + '\n')
    }

    let csvHeaderPrinted = false

    const streams = targets.map((t) =>
      streamEvents(t.ip, t.username, t.password, {
        topicFilters,
        signal: ac.signal,
        onEvent: (event) => {
          if (opts.activeOnly && !event.active) return
          if (ac.signal.aborted) return

          received++

          if (fmt === 'json') {
            console.log(JSON.stringify({ ip: t.ip, ...event }, null, 2))
          } else if (fmt === 'jsonl') {
            console.log(JSON.stringify({ ip: t.ip, ...event }))
          } else if (fmt === 'csv') {
            if (!csvHeaderPrinted) {
              console.log('ip,timestamp,triggerTime,scenarioId,scenarioType,objectId,classTypes,active')
              csvHeaderPrinted = true
            }
            console.log(`${t.ip},${event.timestamp},${event.triggerTime},${event.scenarioId},${event.scenarioType},${event.objectId},${event.classTypes},${event.active}`)
          } else {
            // table: rolling output with ip column
            const time = new Date(event.timestamp).toISOString().replace('T', ' ').substring(0, 23)
            const active = event.active ? '▶ yes' : '◼ no '
            console.log(
              `${t.ip.padEnd(15)}  ${time}  ${String(event.scenarioId).padEnd(8)}  ${event.scenarioType.padEnd(12)}  ${event.objectId.padEnd(6)}  ${event.classTypes.padEnd(8)}  ${active}`
            )
          }

          // Webhook: POST event as JSON
          if (opts.webhook) {
            fetch(opts.webhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ip: t.ip, ...event }),
            }).catch((err) => {
              process.stderr.write(`Webhook error: ${(err as Error).message}\n`)
            })
          }

          // Exec: pipe event JSON to shell command
          if (opts.exec) {
            try {
              const child = spawn('sh', ['-c', opts.exec], { stdio: ['pipe', 'inherit', 'inherit'] })
              child.stdin.write(JSON.stringify({ ip: t.ip, ...event }) + '\n')
              child.stdin.end()
            } catch (err) {
              process.stderr.write(`Exec error: ${(err as Error).message}\n`)
            }
          }

          if (maxCount > 0 && received >= maxCount) {
            process.stderr.write(`\nReceived ${received} events. Done.\n`)
            ac.abort()
          }
        },
        onError: (err) => {
          process.stderr.write(`[${t.ip}] Stream error: ${err.message}\n`)
        },
      })
    )

    try {
      await Promise.allSettled(streams)
    } catch {
      // streams resolved via allSettled, nothing to catch
    }

    if (fmt === 'table') {
      process.stderr.write(`\nTotal events: ${received}\n`)
    }
  })

fleetEvents
  .command('mqtt <name>')
  .description('stream AOA events via MQTT from all cameras in a fleet (AXIS OS 12.2+)')
  .option('-s, --scenario <ids>', 'comma-separated scenario IDs (default: all)')
  .option('-c, --count <n>', 'stop after N total events', '0')
  .option('--active-only', 'only show trigger-start events (active=true)', false)
  .action(async (name: string, opts: { scenario?: string; count: string; activeOnly: boolean }) => {
    const f = fleetStore.get(name)
    if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }

    const fmt = program.opts().format as string
    const maxCount = parseInt(opts.count)
    let received = 0

    const topicFilters = opts.scenario
      ? mqttAoaTopics(opts.scenario.split(',').map((s) => parseInt(s.trim())))
      : undefined // default = all ObjectAnalytics

    const ac = new AbortController()

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      process.stderr.write('\nStopping MQTT streams...\n')
      ac.abort()
    })

    // Resolve credentials for each camera
    const targets: { ip: string; username: string; password: string }[] = []
    for (const ip of f.ips) {
      const cred = credentialStore.get(ip)
      if (!cred) {
        process.stderr.write(`⚠ No credentials for ${ip} — skipping (run: axctl auth add ${ip})\n`)
        continue
      }
      targets.push({ ip, username: cred.username, password: cred.password })
    }

    if (targets.length === 0) {
      console.error('No cameras with credentials. Run: axctl auth add <ip>')
      process.exit(1)
    }

    if (fmt === 'table') {
      process.stderr.write(`Streaming MQTT events from ${targets.length} camera${targets.length === 1 ? '' : 's'} in fleet "${name}" (Ctrl+C to stop)...\n\n`)
      process.stderr.write('IP               TIME                       SCENARIO  TYPE          OBJECT  CLASS     ACTIVE\n')
      process.stderr.write('─'.repeat(95) + '\n')
    }

    let csvHeaderPrinted = false

    const streams = targets.map((t) =>
      streamMqttEvents(t.ip, t.username, t.password, {
        topicFilters,
        signal: ac.signal,
        onEvent: (event) => {
          if (opts.activeOnly && !event.active) return
          if (ac.signal.aborted) return

          received++

          if (fmt === 'json') {
            console.log(JSON.stringify({ ip: t.ip, ...event }, null, 2))
          } else if (fmt === 'jsonl') {
            console.log(JSON.stringify({ ip: t.ip, ...event }))
          } else if (fmt === 'csv') {
            if (!csvHeaderPrinted) {
              console.log('ip,timestamp,triggerTime,scenarioId,scenarioType,objectId,classTypes,active')
              csvHeaderPrinted = true
            }
            console.log(`${t.ip},${event.timestamp},${event.triggerTime},${event.scenarioId},${event.scenarioType},${event.objectId},${event.classTypes},${event.active}`)
          } else {
            // table: rolling output with ip column
            const time = new Date(event.timestamp).toISOString().replace('T', ' ').substring(0, 23)
            const active = event.active ? '▶ yes' : '◼ no '
            console.log(
              `${t.ip.padEnd(15)}  ${time}  ${String(event.scenarioId).padEnd(8)}  ${event.scenarioType.padEnd(12)}  ${event.objectId.padEnd(6)}  ${event.classTypes.padEnd(8)}  ${active}`
            )
          }

          if (maxCount > 0 && received >= maxCount) {
            process.stderr.write(`\nReceived ${received} events. Done.\n`)
            ac.abort()
          }
        },
        onError: (err) => {
          process.stderr.write(`[${t.ip}] MQTT error: ${err.message}\n`)
        },
      })
    )

    try {
      await Promise.allSettled(streams)
    } catch {
      // streams resolved via allSettled, nothing to catch
    }

    if (fmt === 'table') {
      process.stderr.write(`\nTotal events: ${received}\n`)
    }
  })
