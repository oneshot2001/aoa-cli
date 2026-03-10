import { program } from './root.js'
import { VapixClient } from '../lib/vapix-client.js'
import { credentialStore } from '../lib/credential-store.js'
import Table from 'cli-table3'

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
    const format = program.opts().format as string

    try {
      const info = await client.getDeviceInfo()

      if (format === 'json') {
        console.log(JSON.stringify(info, null, 2))
        return
      }

      const table = new Table({ head: ['Property', 'Value'] })
      const fields: [string, string][] = [
        ['IP', ip],
        ['Model', info.ProdFullName ?? info.ProdNbr ?? 'unknown'],
        ['Serial', info.SerialNumber ?? 'unknown'],
        ['Firmware', info.Version ?? 'unknown'],
        ['SoC', info.Soc ?? 'unknown'],
        ['Architecture', info.Architecture ?? 'unknown'],
        ['Hardware ID', info.HardwareID ?? 'unknown'],
        ['Build Date', info.BuildDate ?? 'unknown'],
        ['Type', info.ProdType ?? 'unknown'],
      ]
      for (const [k, v] of fields) table.push([k, v])
      console.log(table.toString())
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
    const format = program.opts().format as string
    const creds = credentialStore.list()

    if (creds.length === 0) {
      console.log('No devices. Run: axctl auth add <ip>')
      return
    }

    if (format === 'json') {
      const results = await Promise.allSettled(
        creds.map(async (c) => {
          const client = new VapixClient(c.ip, c.username, c.password)
          const info = await client.getDeviceInfo()
          return { ip: c.ip, ...info }
        })
      )
      console.log(JSON.stringify(results.map(r => r.status === 'fulfilled' ? r.value : { error: 'unreachable' }), null, 2))
      return
    }

    const table = new Table({ head: ['IP', 'Model', 'Serial', 'Firmware', 'SoC', 'Status'] })
    await Promise.allSettled(
      creds.map(async (c) => {
        try {
          const client = new VapixClient(c.ip, c.username, c.password)
          const info = await client.getDeviceInfo()
          table.push([c.ip, info.ProdShortName ?? '?', info.SerialNumber ?? '?', info.Version ?? '?', info.Soc ?? '?', '✓'])
        } catch {
          table.push([c.ip, '—', '—', '—', '—', '✗ unreachable'])
        }
      })
    )
    console.log(table.toString())
  })
