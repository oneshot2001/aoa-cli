import { readFileSync, writeFileSync } from 'fs'
import { program } from './root.js'
import { AoaClient, SCENARIO_TYPES, OBJECT_CLASSES } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

function getClient(ip: string): AoaClient {
  const cred = credentialStore.get(ip)
  if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
  return new AoaClient(ip, cred.username, cred.password)
}

const aoa = program
  .command('aoa')
  .description('AXIS Object Analytics — manage scenarios and stream events')

// ---- READ ------------------------------------------------------------------

aoa
  .command('list <ip>')
  .description('list configured scenarios')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const scenarios = await client.getScenarios()
      if (scenarios.length === 0) {
        console.log('No scenarios. Create one: axctl aoa create <ip> <name> <type>')
        return
      }
      const rows = scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        objects: s.objectClassifications.map((o) => o.type).join(', '),
        trigger: s.triggers.map((t) => t.type).join(', '),
        devices: s.devices.map((d) => d.id).join(', '),
      }))
      console.log(formatOutput(rows, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

aoa
  .command('devices <ip>')
  .description('list analytics devices (virtual cameras/channels)')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const devices = await client.getDevices()
      if (!devices.length) { console.log('No analytics devices.'); return }
      console.log(formatOutput(devices.map((d) => ({ id: d.id, type: d.type, active: d.isActive ? 'yes' : 'no', rotation: d.rotation })), fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

aoa
  .command('capabilities <ip>')
  .description('show camera analytics capabilities')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const caps = await client.getCapabilities() as {
        scenarios?: { supportedScenarios?: string[]; maxNbrScenariosPerCamera?: number }
        objectClassifications?: { type: string }[]
      }
      const row = {
        supportedTypes: caps.scenarios?.supportedScenarios?.join(', ') ?? 'unknown',
        maxScenarios: caps.scenarios?.maxNbrScenariosPerCamera ?? '?',
        objectClasses: caps.objectClassifications?.map((o) => o.type).join(', ') ?? 'unknown',
      }
      console.log(formatOutput(row, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- WRITE -----------------------------------------------------------------

aoa
  .command('create <ip> <name> <type>')
  .description(`create a scenario. Types: ${SCENARIO_TYPES.join(', ')}`)
  .option('-o, --objects <classes>', `object classes: ${OBJECT_CLASSES.join(', ')}`, 'human,vehicle')
  .option('-d, --device <id>', 'analytics device ID', '1')
  .action(async (ip: string, name: string, type: string, opts: { objects: string; device: string }) => {
    if (!SCENARIO_TYPES.includes(type as typeof SCENARIO_TYPES[number])) {
      console.error(`Unknown type "${type}". Valid: ${SCENARIO_TYPES.join(', ')}`)
      process.exit(1)
    }
    const objects = opts.objects.split(',').map((s) => s.trim()).filter(Boolean)
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would create scenario "${name}" (type: ${type}) on ${ip}`)
      console.log(`  Objects: ${objects.join(', ')}`)
      console.log(`  Device: ${opts.device}`)
      return
    }
    const client = getClient(ip)
    const fmt = program.opts().format as string
    try {
      const scenario = await client.addScenario(name, type, parseInt(opts.device), objects)
      console.log(`✓ Scenario created (id=${scenario.id})`)
      console.log(formatOutput({ id: scenario.id, name: scenario.name, type: scenario.type, trigger: scenario.triggers[0]?.type ?? '?', objects: objects.join(', ') }, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

aoa
  .command('remove <ip> <id>')
  .description('delete a scenario by ID')
  .action(async (ip: string, idStr: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would remove scenario ${idStr} from ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.removeScenario(parseInt(idStr))
      console.log(`✓ Scenario ${idStr} removed`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

aoa
  .command('rename <ip> <id> <newName>')
  .description('rename a scenario')
  .action(async (ip: string, idStr: string, newName: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would rename scenario ${idStr} to "${newName}" on ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.updateScenarioName(parseInt(idStr), newName)
      console.log(`✓ Scenario ${idStr} renamed to "${newName}"`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- DATA & ACTIONS --------------------------------------------------------

aoa
  .command('alarm <ip> <id>')
  .description('fire a 3-second test alarm on a scenario')
  .action(async (ip: string, idStr: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would fire test alarm on scenario ${idStr} on ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.sendAlarmEvent(parseInt(idStr))
      console.log(`✓ Test alarm fired on scenario ${idStr} (lasts 3s) — check: axctl events stream ${ip} --count 2`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

aoa
  .command('counts <ip> <id>')
  .description('get accumulated crossing counts (crosslinecounting scenarios)')
  .action(async (ip: string, idStr: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const counts = await client.getAccumulatedCounts(parseInt(idStr))
      console.log(formatOutput(counts as unknown as Record<string, unknown>, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

aoa
  .command('occupancy <ip> <id>')
  .description('get current occupancy (occupancyInArea scenarios)')
  .action(async (ip: string, idStr: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const occ = await client.getOccupancy(parseInt(idStr))
      console.log(formatOutput(occ as unknown as Record<string, unknown>, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

aoa
  .command('reset <ip> <id>')
  .description('reset accumulated counts for a crosslinecounting scenario')
  .action(async (ip: string, idStr: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would reset accumulated counts for scenario ${idStr} on ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.resetAccumulatedCounts(parseInt(idStr))
      console.log(`✓ Counts reset for scenario ${idStr}`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- EXPORT / IMPORT -------------------------------------------------------

aoa
  .command('export <ip>')
  .description('export full AOA configuration to JSON')
  .option('-o, --output <file>', 'output file (default: stdout)')
  .action(async (ip: string, opts: { output?: string }) => {
    const client = getClient(ip)
    try {
      const config = await client.exportConfiguration()
      const json = JSON.stringify(config, null, 2)
      if (opts.output) {
        writeFileSync(opts.output, json + '\n')
        console.log(`✓ AOA config exported to ${opts.output} (${config.scenarios.length} scenarios)`)
      } else {
        console.log(json)
      }
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

aoa
  .command('import <ip> <file>')
  .description('import AOA configuration from JSON file')
  .action(async (ip: string, file: string) => {
    try {
      const raw = readFileSync(file, 'utf-8')
      const config = JSON.parse(raw) as import('../lib/aoa-client.js').AoaConfiguration
      if (program.opts().dryRun) {
        console.log(`[dry-run] Would import ${config.scenarios.length} scenario${config.scenarios.length === 1 ? '' : 's'} to ${ip}`)
        for (const s of config.scenarios) {
          console.log(`  - ${s.name} (${s.type})`)
        }
        return
      }
      const client = getClient(ip)
      await client.importConfiguration(config)
      console.log(`✓ AOA config imported to ${ip} (${config.scenarios.length} scenarios)`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })
