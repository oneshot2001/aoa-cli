import { program } from './root.js'
import { discoverAll } from '../lib/discovery.js'
import { VapixClient } from '../lib/vapix-client.js'
import { credentialStore } from '../lib/credential-store.js'
import Table from 'cli-table3'

program
  .command('discover')
  .description('find Axis cameras on the local network (mDNS + SSDP)')
  .option('-t, --timeout <seconds>', 'scan duration', '5')
  .option('--enrich', 'fetch full device info for discovered cameras (requires stored credentials)')
  .action(async (opts: { timeout: string; enrich?: boolean }) => {
    const timeoutMs = parseInt(opts.timeout) * 1000
    const format = program.opts().format as string

    process.stderr.write(`Scanning for Axis cameras (${opts.timeout}s)...\n`)

    const devices = await discoverAll(timeoutMs)

    if (devices.length === 0) {
      console.log('No Axis cameras found.')
      return
    }

    // Optionally enrich with VAPIX data for devices we have credentials for
    if (opts.enrich) {
      await Promise.allSettled(
        devices.map(async (d, i) => {
          const cred = credentialStore.get(d.ip)
          if (!cred) return
          try {
            const client = new VapixClient(d.ip, cred.username, cred.password)
            const info = await client.getDeviceInfo()
            devices[i] = {
              ...d,
              model: info.ProdFullName ?? d.model,
              serial: info.SerialNumber ?? d.serial,
              firmwareVersion: info.Version ?? d.firmwareVersion,
            }
          } catch {}
        })
      )
    }

    if (format === 'json') {
      console.log(JSON.stringify(devices, null, 2))
      return
    }

    if (format === 'jsonl') {
      for (const d of devices) console.log(JSON.stringify(d))
      return
    }

    const table = new Table({
      head: ['IP', 'Model', 'Serial', 'Firmware', 'MAC'],
    })
    for (const d of devices) {
      table.push([d.ip, d.model, d.serial, d.firmwareVersion, d.macAddress ?? '—'])
    }

    console.log(table.toString())
    console.log(`\nFound ${devices.length} camera${devices.length === 1 ? '' : 's'}`)
  })
