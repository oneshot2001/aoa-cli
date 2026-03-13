import { program } from './root.js'
import { VapixClient } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

const devices = program
  .command('devices')
  .description('device management')

// axctl devices info <ip>
devices
  .command('info <ip>')
  .description('show detailed device info')
  .action(async (ip: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    const client = new VapixClient(ip, cred.username, cred.password)
    const fmt = program.opts().format as string

    try {
      const info = await client.getDeviceInfo()
      const row = {
        ip,
        model: info.ProdFullName ?? info.ProdNbr ?? 'unknown',
        serial: info.SerialNumber ?? 'unknown',
        firmware: info.Version ?? 'unknown',
        soc: info.Soc ?? 'unknown',
        architecture: info.Architecture ?? 'unknown',
        hardwareId: info.HardwareID ?? 'unknown',
        buildDate: info.BuildDate ?? 'unknown',
        type: info.ProdType ?? 'unknown',
      }
      console.log(formatOutput(row, fmt))
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }
  })

// axctl devices ping <ip>
devices
  .command('ping <ip>')
  .description('check device connectivity')
  .action(async (ip: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    const client = new VapixClient(ip, cred.username, cred.password)
    const start = Date.now()
    const alive = await client.ping()
    const ms = Date.now() - start

    if (alive) {
      console.log(`✓ ${ip} — reachable (${ms}ms)`)
    } else {
      console.log(`✗ ${ip} — unreachable`)
      process.exit(1)
    }
  })

// axctl devices list
devices
  .command('list')
  .description('list all devices with stored credentials')
  .action(async () => {
    const fmt = program.opts().format as string
    const creds = credentialStore.list()

    if (creds.length === 0) {
      console.log('No devices. Run: axctl auth add <ip>')
      return
    }

    const results = await Promise.allSettled(
      creds.map(async (c) => {
        try {
          const client = new VapixClient(c.ip, c.username, c.password)
          const info = await client.getDeviceInfo()
          return {
            ip: c.ip,
            model: info.ProdShortName ?? '?',
            serial: info.SerialNumber ?? '?',
            firmware: info.Version ?? '?',
            soc: info.Soc ?? '?',
            status: 'online',
          }
        } catch {
          return { ip: c.ip, model: '—', serial: '—', firmware: '—', soc: '—', status: 'unreachable' }
        }
      })
    )

    const rows = results.map((r) => (r.status === 'fulfilled' ? r.value : { ip: '?', model: '—', serial: '—', firmware: '—', soc: '—', status: 'error' }))
    console.log(formatOutput(rows, fmt))
  })
