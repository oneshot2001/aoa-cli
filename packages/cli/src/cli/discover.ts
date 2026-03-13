import { program } from './root.js'
import { discoverAll } from '@axctl/core'
import { VapixClient } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

program
  .command('discover')
  .description('find Axis cameras on the local network (mDNS + SSDP)')
  .option('-t, --timeout <seconds>', 'scan duration', '5')
  .option('--enrich', 'fetch full device info for discovered cameras (requires stored credentials)')
  .action(async (opts: { timeout: string; enrich?: boolean }) => {
    const timeoutMs = parseInt(opts.timeout) * 1000
    const fmt = program.opts().format as string

    process.stderr.write(`Scanning for Axis cameras (${opts.timeout}s)...\n`)

    const devices = await discoverAll(timeoutMs)

    if (devices.length === 0) {
      console.log('No Axis cameras found.')
      return
    }

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

    const rows = devices.map((d) => ({
      ip: d.ip,
      model: d.model,
      serial: d.serial,
      firmware: d.firmwareVersion,
      mac: d.macAddress ?? '—',
    }))

    console.log(formatOutput(rows, fmt))
    if (fmt === 'table') {
      process.stderr.write(`\nFound ${devices.length} camera${devices.length === 1 ? '' : 's'}\n`)
    }
  })
