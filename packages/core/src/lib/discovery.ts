import { Bonjour } from 'bonjour-service'
import { createSocket } from 'dgram'
import type { AxisDevice } from '../types/device.js'
import { telemetry } from './telemetry.js'

// Internal type that carries discovery timing
interface DiscoveredDevice extends AxisDevice {
  foundAtMs: number   // elapsed ms from scan start when this device was found
  protocol: 'mdns' | 'ssdp'
}

// mDNS discovery — listens for _axis-video._tcp broadcasts
export function discoverMdns(timeoutMs: number, scanStart?: number): Promise<DiscoveredDevice[]> {
  const start = scanStart ?? performance.now()
  return new Promise((resolve) => {
    const bonjour = new Bonjour()
    const found = new Map<string, DiscoveredDevice>()

    const browser = bonjour.find({ type: 'axis-video' }, (service) => {
      const ip = service.addresses?.find((a) => a.includes('.')) ?? service.host
      if (!ip) return

      found.set(ip, {
        ip,
        model: service.txt?.['Model'] ?? service.name ?? 'unknown',
        serial: service.txt?.['Serial'] ?? 'unknown',
        firmwareVersion: service.txt?.['FW'] ?? 'unknown',
        macAddress: service.txt?.['hw'] ?? undefined,
        foundAtMs: performance.now() - start,
        protocol: 'mdns',
      })
    })

    setTimeout(() => {
      browser.stop()
      bonjour.destroy()
      resolve(Array.from(found.values()))
    }, timeoutMs)
  })
}

// SSDP/UPnP fallback — sends M-SEARCH and parses Axis device responses
export function discoverSsdp(timeoutMs: number, scanStart?: number): Promise<DiscoveredDevice[]> {
  const start = scanStart ?? performance.now()
  return new Promise((resolve) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: true })
    const found = new Map<string, DiscoveredDevice>()

    const msearch = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 239.255.255.250:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 3\r\n' +
      'ST: urn:axis-com:service:BasicService:1\r\n' +
      '\r\n'
    )

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString()
      // Only process Axis devices
      if (!text.toLowerCase().includes('axis')) return

      const ip = rinfo.address
      if (found.has(ip)) return

      // Parse USN or SERVER header for model info
      const server = text.match(/SERVER:\s*(.+)/i)?.[1]?.trim() ?? ''
      const usn = text.match(/USN:\s*(.+)/i)?.[1]?.trim() ?? ''

      found.set(ip, {
        ip,
        model: server.includes('AXIS') ? server.split('/')[0]?.trim() ?? 'unknown' : 'unknown',
        serial: 'unknown',
        firmwareVersion: 'unknown',
        foundAtMs: performance.now() - start,
        protocol: 'ssdp',
      })
    })

    socket.bind(0, () => {
      socket.addMembership('239.255.255.250')
      socket.send(msearch, 1900, '239.255.255.250')
    })

    setTimeout(() => {
      try { socket.close() } catch {}
      resolve(Array.from(found.values()))
    }, timeoutMs)
  })
}

// Run both discovery methods in parallel, merge results (IP deduped)
export async function discoverAll(timeoutMs = 5000): Promise<AxisDevice[]> {
  const scanId = crypto.randomUUID()
  const scanStart = performance.now()

  const [mdnsResults, ssdpResults] = await Promise.all([
    discoverMdns(timeoutMs, scanStart).catch(() => [] as DiscoveredDevice[]),
    discoverSsdp(timeoutMs, scanStart).catch(() => [] as DiscoveredDevice[]),
  ])

  // Record telemetry for each discovered device with per-device elapsed time
  for (const d of mdnsResults) {
    telemetry.recordDiscovery({
      device_ip: d.ip, device_mac: d.macAddress, model: d.model,
      serial: d.serial, firmware: d.firmwareVersion,
      protocol: 'mdns', responded: true, latency_ms: d.foundAtMs, scan_id: scanId,
    })
  }
  for (const d of ssdpResults) {
    if (!mdnsResults.some((m) => m.ip === d.ip)) {
      telemetry.recordDiscovery({
        device_ip: d.ip, device_mac: d.macAddress, model: d.model,
        serial: d.serial, firmware: d.firmwareVersion,
        protocol: 'ssdp', responded: true, latency_ms: d.foundAtMs, scan_id: scanId,
      })
    }
  }

  // mDNS results take precedence (more info in TXT records)
  const merged = new Map<string, AxisDevice>()
  for (const d of ssdpResults) merged.set(d.ip, d)
  for (const d of mdnsResults) merged.set(d.ip, d) // overwrite SSDP with richer mDNS data

  return Array.from(merged.values()).sort((a, b) => {
    const partsA = a.ip.split('.').map(Number)
    const partsB = b.ip.split('.').map(Number)
    for (let i = 0; i < 4; i++) {
      if ((partsA[i] ?? 0) !== (partsB[i] ?? 0)) return (partsA[i] ?? 0) - (partsB[i] ?? 0)
    }
    return 0
  })
}
