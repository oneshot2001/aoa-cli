import { program } from './root.js'
import { credentialStore } from '../lib/credential-store.js'
import { fleetStore } from '../lib/fleet-store.js'
import { discoverAll } from '../lib/discovery.js'
import Table from 'cli-table3'

const fleet = program
  .command('fleet')
  .description('manage named groups of cameras')

fleet
  .command('create <name>')
  .description('create a fleet from a device list or discovery')
  .option('-d, --devices <ips>', 'comma-separated IPs (e.g. 192.168.1.33,192.168.1.34)')
  .option('--from-discover', 'populate from last discovery scan (5s scan)')
  .action(async (name: string, opts: { devices?: string; fromDiscover?: boolean }) => {
    let ips: string[] = []

    if (opts.devices) {
      ips = opts.devices.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (opts.fromDiscover) {
      process.stderr.write('Scanning for devices (5s)...\n')
      const found = await discoverAll(5000)
      ips = found.map((d) => d.ip)
      if (ips.length === 0) { console.error('No devices found.'); process.exit(1) }
      console.log(`Found: ${ips.join(', ')}`)
    } else {
      console.error('Specify --devices <ips> or --from-discover')
      process.exit(1)
    }

    fleetStore.create(name, ips)
    console.log(`✓ Fleet "${name}" created with ${ips.length} device${ips.length === 1 ? '' : 's'}: ${ips.join(', ')}`)
  })

fleet
  .command('list')
  .description('list all fleets')
  .action(() => {
    const fleets = fleetStore.list()
    if (fleets.length === 0) { console.log('No fleets. Use: axctl fleet create <name> --devices <ips>'); return }
    const table = new Table({ head: ['Name', 'Devices', 'IPs'] })
    for (const f of fleets) {
      table.push([f.name, f.ips.length.toString(), f.ips.join(', ')])
    }
    console.log(table.toString())
  })

fleet
  .command('show <name>')
  .description('show fleet members')
  .action((name: string) => {
    const f = fleetStore.get(name)
    if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }
    const table = new Table({ head: ['IP', 'Credentials'] })
    for (const ip of f.ips) {
      const hasCreds = credentialStore.has(ip)
      table.push([ip, hasCreds ? '✓ stored' : '✗ none — run axctl auth add ' + ip])
    }
    console.log(`Fleet: ${f.name} (${f.ips.length} devices)`)
    console.log(table.toString())
  })

fleet
  .command('delete <name>')
  .description('remove a fleet')
  .action((name: string) => {
    if (fleetStore.remove(name)) {
      console.log(`✓ Fleet "${name}" deleted`)
    } else {
      console.error(`Fleet "${name}" not found`)
      process.exit(1)
    }
  })
