import { program } from './root.js'
import { SystemClient } from '@axctl/core'
import { VapixClient } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

const system = program
  .command('system')
  .description('system and network settings')

// axctl system info <ip>
system
  .command('info <ip>')
  .description('comprehensive system info (device + time + network)')
  .action(async (ip: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    const fmt = program.opts().format as string
    const vapix = new VapixClient(ip, cred.username, cred.password)
    const sys = new SystemClient(ip, cred.username, cred.password)

    try {
      const [device, time, net] = await Promise.all([
        vapix.getDeviceInfo(),
        sys.getDateTime(),
        sys.getNetworkInfo(),
      ])

      const row = {
        ip,
        model: device.ProdFullName ?? device.ProdNbr ?? 'unknown',
        serial: device.SerialNumber ?? 'unknown',
        firmware: device.Version ?? 'unknown',
        soc: device.Soc ?? 'unknown',
        architecture: device.Architecture ?? 'unknown',
        dateTime: time.dateTime,
        timeZone: time.timeZone,
        utcOffset: time.utcOffset,
        ntpSources: time.ntpSources.join(', ') || 'none',
        dstEnabled: String(time.dstEnabled),
        ipAddress: net.ipAddress,
        subnetMask: net.subnetMask,
        gateway: net.gateway,
        hostname: net.hostname,
        dnsServers: net.dnsServers.join(', ') || 'none',
        macAddress: net.macAddress,
        dhcpEnabled: String(net.dhcpEnabled),
      }
      console.log(formatOutput(row, fmt))
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }
  })

// axctl system time <ip>
system
  .command('time <ip>')
  .description('NTP status, timezone, and current time')
  .action(async (ip: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    const fmt = program.opts().format as string
    const sys = new SystemClient(ip, cred.username, cred.password)

    try {
      const time = await sys.getDateTime()
      const row = {
        ip,
        dateTime: time.dateTime,
        timeZone: time.timeZone,
        utcOffset: time.utcOffset,
        ntpSources: time.ntpSources.join(', ') || 'none',
        dstEnabled: String(time.dstEnabled),
      }
      console.log(formatOutput(row, fmt))
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }
  })

// axctl system network <ip>
system
  .command('network <ip>')
  .description('IP, subnet, gateway, DNS, MAC, DHCP status')
  .action(async (ip: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    const fmt = program.opts().format as string
    const sys = new SystemClient(ip, cred.username, cred.password)

    try {
      const net = await sys.getNetworkInfo()
      const row = {
        ip,
        ipAddress: net.ipAddress,
        subnetMask: net.subnetMask,
        gateway: net.gateway,
        hostname: net.hostname,
        dnsServers: net.dnsServers.join(', ') || 'none',
        macAddress: net.macAddress,
        dhcpEnabled: String(net.dhcpEnabled),
      }
      console.log(formatOutput(row, fmt))
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }
  })

// axctl system users <ip>
system
  .command('users <ip>')
  .description('list device users (read-only)')
  .action(async (ip: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    const fmt = program.opts().format as string
    const sys = new SystemClient(ip, cred.username, cred.password)

    try {
      const users = await sys.getUsers()
      const rows = users.map((u) => ({ ip, user: u }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }
  })
